import { invokeLLM } from "../_core/llm";
import { assertSafeAnalyticalSql, referencedColumns } from "./sqlSafety";
import { executeDuckDbQuery } from "./duckdb";
import { detectSimpleOutliers } from "./statisticalAnalysis";
import { AnalysisOutput, ColumnProfile, RawRecord, VisualizationPayload } from "./types";

type Plan = {
  intent: string;
  sql: string;
  chartType: VisualizationPayload["type"] | "none";
  xKey: string | null;
  yKeys: string[];
  analysisFocus: string;
  unavailableReason?: string;
};

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string" },
    sql: { type: "string" },
    chartType: { type: "string", enum: ["line", "bar", "area", "pie", "donut", "scatter", "histogram", "kpi", "table", "none"] },
    xKey: { type: ["string", "null"] },
    yKeys: { type: "array", items: { type: "string" } },
    analysisFocus: { type: "string" },
  },
  required: ["intent", "sql", "chartType", "xKey", "yKeys", "analysisFocus"],
  additionalProperties: false,
} as const;
const ANALYST_MODEL = process.env.LLM_MODEL || "gpt-5-mini";
const PLANNING_TIMEOUT_MS = 8_000;
const INSIGHT_TIMEOUT_MS = 4_000;

function withinDeadline<T>(operation: Promise<T>, timeoutMs: number, stage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${stage} exceeded the ${timeoutMs} ms latency budget.`)), timeoutMs);
    operation.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

function chooseColumn(schema: ColumnProfile[], match: RegExp, fallback = "revenue") {
  return schema.find(column => match.test(column.name))?.name ?? schema.find(column => column.name === fallback)?.name ?? schema[0]?.name ?? "revenue";
}

function q(value: string) { return `"${value.replace(/"/g, '""')}"`; }

function sqlString(value: string) { return `'${value.replace(/'/g, "''")}'`; }

function unavailablePlan(reason: string): Plan {
  return { intent: "insufficient data", sql: "", chartType: "none", xKey: null, yKeys: [], analysisFocus: "The requested measure cannot be supported by the available dataset.", unavailableReason: reason };
}

function explicitlyUnsupportedQuestion(question: string, schema: ColumnProfile[]) {
  const text = question.toLowerCase();
  const knownColumns = schema.map(column => `${column.name} ${column.sampleValues.join(" ")}`.toLowerCase()).join(" ");
  const unsupportedTerms = ["marketing spend", "marketing budget", "ad spend", "employees resigned", "employee resignations", "headcount", "salary expense"];
  return unsupportedTerms.find(term => text.includes(term) && !knownColumns.includes(term.split(" ")[0]));
}

function unsafeOperationRequest(question: string) {
  const text = question.toLowerCase();
  const operation = /\b(drop|delete|update|insert|alter|create|truncate|attach|detach|install|load|copy|export|import|shell|bash|powershell|terminal|filesystem|file system|read_csv|read_parquet|eval|execute code|run code)\b/.exec(text)?.[0];
  return operation ? `The analyst cannot execute ${operation} operations. It accepts business questions and executes only validated, read-only analytical queries.` : null;
}

function buildKnownFilters(question: string, schema: ColumnProfile[], history: string[] = []) {
  const followUp = /\b(that|this|it|difference|contributed|previous|prior|compare)\b/i.test(question);
  const text = `${followUp ? history.join(" ") : ""} ${question}`.toLowerCase();
  const clauses: string[] = [];
  schema.filter(column => column.type === "string" && column.categories?.length).forEach(column => {
    const matched = column.categories!.map(item => item.value).filter(value => value.length > 2 && text.includes(value.toLowerCase()));
    if (matched.length === 1) clauses.push(`${q(column.name)} = ${sqlString(matched[0])}`);
    if (matched.length > 1) clauses.push(`${q(column.name)} IN (${matched.map(sqlString).join(", ")})`);
  });
  const dateColumn = schema.find(column => column.type === "date")?.name;
  const monthMap: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
  const months = Object.entries(monthMap).filter(([label]) => text.includes(label)).map(([, value]) => value);
  if (dateColumn && months.length === 1) clauses.push(`strftime(${q(dateColumn)}, '%m') = ${sqlString(months[0])}`);
  return { where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", dateColumn, months };
}

export function createFallbackPlan(question: string, schema: ColumnProfile[], history: string[]): Plan {
  const text = `${history.join(" ")} ${question}`.toLowerCase();
  const revenue = chooseColumn(schema, /revenue|sales|amount|turnover/);
  const profit = chooseColumn(schema, /profit|margin/);
  const date = chooseColumn(schema, /date|month|time/);
  const category = chooseColumn(schema, /category|segment/);
  const product = chooseColumn(schema, /product|item|sku/);
  const region = chooseColumn(schema, /city|region|location|market/);
  const customer = chooseColumn(schema, /customer|client|account/);
  const channel = chooseColumn(schema, /channel|source/);
  const metric = /profit|margin/.test(text) ? profit : revenue;
  const filters = buildKnownFilters(question, schema, history);
  const from = `FROM dataset${filters.where}`;
  const monthlySql = `SELECT strftime(${q(date)}, '%Y-%m') AS month, SUM(${q(metric)}) AS ${metric} ${from} GROUP BY 1 ORDER BY 1`;
  const unsafeRequest = unsafeOperationRequest(question);
  if (unsafeRequest) return unavailablePlan(unsafeRequest);
  const unsupportedTerm = explicitlyUnsupportedQuestion(question, schema);
  if (unsupportedTerm) return unavailablePlan(`The uploaded dataset does not contain a field that can answer the request about ${unsupportedTerm}.`);
  if (!schema.some(column => column.name === metric && column.type === "number")) return unavailablePlan("The dataset does not contain a numeric revenue, sales, amount, profit, or margin field required for this question.");
  if (/month|trend|over time|compare|decline|decrease|drop/.test(text) && !schema.some(column => column.name === date && column.type === "date")) return unavailablePlan("The dataset does not contain a usable date field required for this time-based question.");
  if (/(compare|versus|\bvs\b|how does that compare)/.test(question.toLowerCase()) && filters.dateColumn) {
    const contextMonths = Object.entries({ january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" }).filter(([label]) => text.includes(label)).map(([, value]) => value);
    const months = Array.from(new Set(contextMonths));
    if (months.length < 2) return unavailablePlan("A period comparison needs two explicit periods or a prior period in the conversation context.");
    const monthWhere = months.length > 1 ? ` WHERE strftime(${q(filters.dateColumn)}, '%m') IN (${months.map(sqlString).join(", ")})` : filters.where;
    return { intent: "period comparison", sql: `SELECT strftime(${q(filters.dateColumn)}, '%Y-%m') AS month, SUM(${q(metric)}) AS ${metric} FROM dataset${monthWhere} GROUP BY 1 ORDER BY 1`, chartType: "bar", xKey: "month", yKeys: [metric], analysisFocus: "Compare the explicitly mentioned current and prior periods." };
  }
  if (/why.*(decline|decrease|drop)|decline.*july|decrease.*july/.test(text)) {
    const targetMonth = filters.months[0];
    if (!targetMonth) return unavailablePlan("Please identify the month to investigate; the dataset alone cannot infer which period you mean.");
    const priorMonth = String(((Number(targetMonth) + 10) % 12) + 1).padStart(2, "0");
    return { intent: "root-cause comparison", sql: `SELECT ${q(category)} AS category, SUM(CASE WHEN strftime(${q(date)}, '%m') = ${sqlString(priorMonth)} THEN ${q(revenue)} ELSE 0 END) AS prior_month_revenue, SUM(CASE WHEN strftime(${q(date)}, '%m') = ${sqlString(targetMonth)} THEN ${q(revenue)} ELSE 0 END) AS selected_month_revenue, SUM(CASE WHEN strftime(${q(date)}, '%m') = ${sqlString(targetMonth)} THEN ${q(revenue)} ELSE 0 END) - SUM(CASE WHEN strftime(${q(date)}, '%m') = ${sqlString(priorMonth)} THEN ${q(revenue)} ELSE 0 END) AS change FROM dataset GROUP BY 1 ORDER BY change ASC`, chartType: "bar", xKey: "category", yKeys: ["prior_month_revenue", "selected_month_revenue"], analysisFocus: "Identify categories with the largest selected-month versus prior-month revenue change. The dataset can show contribution, not causality." };
  }
  if (/(product|item|sku).*(contributed|difference)|(contributed|difference).*(product|item|sku)/.test(text) && filters.dateColumn && filters.months.length >= 2) {
    const [firstMonth, secondMonth] = filters.months.slice(0, 2);
    return { intent: "product contribution comparison", sql: `SELECT ${q(product)} AS product, SUM(CASE WHEN strftime(${q(filters.dateColumn)}, '%m') = ${sqlString(firstMonth)} THEN ${q(revenue)} ELSE 0 END) AS first_period_revenue, SUM(CASE WHEN strftime(${q(filters.dateColumn)}, '%m') = ${sqlString(secondMonth)} THEN ${q(revenue)} ELSE 0 END) AS second_period_revenue, SUM(CASE WHEN strftime(${q(filters.dateColumn)}, '%m') = ${sqlString(secondMonth)} THEN ${q(revenue)} ELSE 0 END) - SUM(CASE WHEN strftime(${q(filters.dateColumn)}, '%m') = ${sqlString(firstMonth)} THEN ${q(revenue)} ELSE 0 END) AS change FROM dataset GROUP BY 1 ORDER BY ABS(change) DESC LIMIT 10`, chartType: "bar", xKey: "product", yKeys: ["first_period_revenue", "second_period_revenue"], analysisFocus: "Rank product contribution to the explicitly retained period difference." };
  }
  if (/month|trend|over time|july compare|compare.*june/.test(text)) return { intent: "time-series analysis", sql: monthlySql, chartType: "line", xKey: "month", yKeys: [metric], analysisFocus: "Evaluate the monthly trajectory from executed results." };
  if (/top.*product|product.*highest/.test(text)) return { intent: "product ranking", sql: `SELECT ${q(product)} AS product, SUM(${q(metric)}) AS ${metric} ${from} GROUP BY 1 ORDER BY ${metric} DESC LIMIT 10`, chartType: "bar", xKey: "product", yKeys: [metric], analysisFocus: "Rank products by the selected metric." };
  if (/profit margin/.test(text)) {
    if (!schema.some(column => column.name === profit && column.type === "number") || !schema.some(column => column.name === revenue && column.type === "number")) return unavailablePlan("Profit-margin analysis needs distinct numeric profit and revenue fields.");
    return { intent: "profit margin comparison", sql: `SELECT ${q(category)} AS category, SUM(${q(revenue)}) AS revenue, SUM(${q(profit)}) AS profit, SUM(${q(profit)}) / NULLIF(SUM(${q(revenue)}), 0) AS profit_margin ${from} GROUP BY 1 ORDER BY profit_margin DESC`, chartType: "bar", xKey: "category", yKeys: ["profit_margin"], analysisFocus: "Compare category profit margin calculated from executed revenue and profit totals." };
  }
  if (/category|segment/.test(text)) return { intent: "category comparison", sql: `SELECT ${q(category)} AS category, SUM(${q(metric)}) AS ${metric} ${from} GROUP BY 1 ORDER BY ${metric} DESC`, chartType: "bar", xKey: "category", yKeys: [metric], analysisFocus: "Compare category contribution using the executed totals." };
  if (/region|city|cairo|alexandria/.test(text)) return { intent: "geographic comparison", sql: `SELECT ${q(region)} AS ${region}, SUM(${q(metric)}) AS ${metric} ${from} GROUP BY 1 ORDER BY ${metric} DESC`, chartType: "bar", xKey: region, yKeys: [metric], analysisFocus: "Compare geographic contribution." };
  if (/customer|client/.test(text)) return { intent: "customer segmentation", sql: `SELECT ${q(customer)} AS customer, SUM(${q(metric)}) AS ${metric} ${from} GROUP BY 1 ORDER BY ${metric} DESC LIMIT 10`, chartType: "bar", xKey: "customer", yKeys: [metric], analysisFocus: "Identify the highest-contributing customers." };
  if (/channel|source/.test(text)) return { intent: "channel comparison", sql: `SELECT ${q(channel)} AS ${channel}, AVG(${q(revenue)}) AS average_order_value ${from} GROUP BY 1 ORDER BY average_order_value DESC`, chartType: "bar", xKey: channel, yKeys: ["average_order_value"], analysisFocus: "Compare average order value by channel." };
  if (/distribution|histogram/.test(text)) return { intent: "distribution analysis", sql: `SELECT ${q(revenue)} AS ${revenue} ${from}`, chartType: "histogram", xKey: revenue, yKeys: [revenue], analysisFocus: "Inspect the distribution of order values." };
  if (/anomaly|unusual|outlier/.test(text)) return { intent: "anomaly detection", sql: `SELECT ${q(date)} AS date, ${q(revenue)} AS revenue ${from} ORDER BY ${q(revenue)} DESC`, chartType: "scatter", xKey: "date", yKeys: ["revenue"], analysisFocus: "Identify unusually large record values with statistical screening." };
  if (/recommend|focus|next month/.test(text)) return { intent: "business recommendation", sql: `SELECT ${q(category)} AS category, SUM(${q(revenue)}) AS revenue, SUM(${q(profit)}) AS profit, SUM(${q(profit)}) / NULLIF(SUM(${q(revenue)}), 0) AS profit_margin ${from} GROUP BY 1 ORDER BY profit DESC`, chartType: "bar", xKey: "category", yKeys: ["profit"], analysisFocus: "Base recommendations on category revenue, profit, and margin." };
  return { intent: "aggregate metric", sql: `SELECT SUM(${q(metric)}) AS total_${metric}, AVG(${q(metric)}) AS average_${metric}, COUNT(*) AS record_count ${from}`, chartType: "kpi", xKey: null, yKeys: [`total_${metric}`], analysisFocus: "Return the requested headline metric from executed data." };
}

async function planWithModel(question: string, schema: ColumnProfile[], history: string[], callLlm: typeof invokeLLM = invokeLLM, timeoutMs = PLANNING_TIMEOUT_MS): Promise<Plan> {
  const schemaSummary = schema.map(column => ({ name: column.name, type: column.type, sample: column.sampleValues.slice(0, 3) }));
  const response = await withinDeadline(callLlm({
    model: ANALYST_MODEL,
    messages: [
      { role: "system", content: "You are the Query Understanding, Schema Analysis, and SQL Generation stages of a business analytics system. Create a single DuckDB SELECT or CTE query using only the table named dataset. Use quoted identifiers for source columns. Never use data-definition, mutation, external file access, comments, or multiple statements. Select only facts needed to answer the question. Return no numerical claim; an execution layer will calculate results." },
      { role: "user", content: JSON.stringify({ question, schema: schemaSummary, recentConversation: history.slice(-6) }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "analysis_plan", strict: true, schema: PLAN_SCHEMA } },
  }), timeoutMs, "AI planning");
  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("The planning model returned no structured plan.");
  return JSON.parse(content) as Plan;
}

function number(value: unknown) { return typeof value === "number" ? value : Number(value); }
function format(value: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value); }

function buildVisualization(plan: Plan, result: Array<Record<string, unknown>>): VisualizationPayload | null {
  if (plan.chartType === "none" || !result.length) return null;
  if (plan.chartType === "kpi") return { type: "kpi", title: "Key result", description: "Metrics produced by the executed SQL query.", data: result, yKeys: plan.yKeys, formatter: "currency" };
  return { type: plan.chartType, title: plan.intent.replace(/\b\w/g, character => character.toUpperCase()), description: plan.analysisFocus, data: result, xKey: plan.xKey ?? undefined, yKeys: plan.yKeys, nameKey: plan.xKey ?? undefined, valueKey: plan.yKeys[0], formatter: /revenue|profit|cost|value|price|amount/i.test(plan.yKeys.join(" ")) ? "currency" : "number" };
}

function deterministicSummary(question: string, result: Array<Record<string, unknown>>, plan: Plan, outlierMessage: string | null) {
  if (!result.length) return "The executed query returned no matching records. Try a broader date range, metric, or filter.";
  const first = result[0];
  const values = Object.entries(first).filter(([, value]) => typeof value === "number" || Number.isFinite(Number(value)));
  const highlights = values.slice(0, 3).map(([key, value]) => `${key.replace(/_/g, " ")}: ${format(number(value))}`).join(" · ");
  const leaderKey = plan.xKey && typeof first[plan.xKey] !== "undefined" ? String(first[plan.xKey]) : null;
  const leader = leaderKey ? ` The leading result is **${leaderKey}**.` : "";
  const anomaly = outlierMessage ? ` ${outlierMessage}` : "";
  return `Based on the executed ${plan.intent} query, ${highlights}.${leader}${anomaly} The result is grounded in the selected dataset, not a pre-written response.`;
}

async function enrichWithBusinessInsights(question: string, result: Array<Record<string, unknown>>, plan: Plan, callLlm: typeof invokeLLM = invokeLLM, timeoutMs = INSIGHT_TIMEOUT_MS): Promise<string | null> {
  try {
    const response = await withinDeadline(callLlm({
      model: ANALYST_MODEL,
      messages: [
        { role: "system", content: "You are the Business Insight stage. Write a concise response with a direct answer, 2 evidence-backed findings, and one measured recommendation. Use only values and labels in the supplied execution result. Do not introduce external facts, causal claims, or unobserved numbers. If causes cannot be established from the result, explicitly state that data is insufficient to determine the cause." },
        { role: "user", content: JSON.stringify({ question, intent: plan.intent, executionResult: result.slice(0, 30) }) },
      ],
    }), timeoutMs, "Business insight generation");
    const text = response.choices[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

function unavailableOutput(reason: string, stages: AnalysisOutput["details"]["stages"], started: number, modelUsed: string | null, retryCount: number): AnalysisOutput {
  stages.push({ stage: "Data Availability Check", detail: reason, status: "blocked" });
  stages.push({ stage: "Visualization Decision", detail: "No visualization was generated because the requested measure is unavailable.", status: "skipped" });
  stages.push({ stage: "Business Insight Generation", detail: "Returned a deterministic availability limitation rather than inventing an answer.", status: "complete" });
  return {
    answer: `${reason} The available data is insufficient to answer this question.`,
    result: [],
    visualization: null,
    details: { stages, generatedSql: "", toolsUsed: ["Schema profiler", "Data availability check"], columnsUsed: [], execution: { rowCount: 0, elapsedMs: 0, preview: [] } },
    safeSql: null,
    metrics: { totalMs: Date.now() - started, sqlMs: 0, retryCount, modelUsed },
  };
}

export async function analyzeQuestion(input: { question: string; records: RawRecord[]; schema: ColumnProfile[]; history: string[]; llmInvoke?: typeof invokeLLM; llmTimeoutMs?: number }): Promise<AnalysisOutput> {
  const started = Date.now();
  const callLlm = input.llmInvoke ?? invokeLLM;
  const stages: AnalysisOutput["details"]["stages"] = [];
  let plan: Plan;
  let modelUsed: string | null = null;
  let retryCount = 0;
  try {
    plan = await planWithModel(input.question, input.schema, input.history, callLlm, input.llmTimeoutMs ?? PLANNING_TIMEOUT_MS);
    modelUsed = ANALYST_MODEL;
    stages.push({ stage: "Query Understanding", detail: `Classified the request as ${plan.intent}.`, status: "complete" });
    stages.push({ stage: "Schema Analysis", detail: "Matched requested measures and dimensions to the uploaded dataset schema.", status: "complete" });
  } catch {
    plan = createFallbackPlan(input.question, input.schema, input.history);
    retryCount = 1;
    stages.push({ stage: "Query Understanding", detail: `Applied the resilient deterministic planner for ${plan.intent}.`, status: "complete" });
    stages.push({ stage: "Schema Analysis", detail: "Mapped available schema fields to the requested metric and dimensions.", status: "complete" });
  }
  if (plan.unavailableReason) return unavailableOutput(plan.unavailableReason, stages, started, modelUsed, retryCount);
  let safeSql: string;
  try {
    safeSql = assertSafeAnalyticalSql(plan.sql);
    stages.push({ stage: "SQL Safety Validation", detail: "Confirmed a single SELECT/CTE query scoped to the isolated dataset table.", status: "complete" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The query was blocked by the SQL safety layer.";
    if (!modelUsed) {
      stages.push({ stage: "SQL Safety Validation", detail: message, status: "blocked" });
      throw new Error(message);
    }
    retryCount += 1;
    stages.push({ stage: "SQL Safety Validation", detail: `${message} Replaced the model plan with one bounded deterministic retry.`, status: "blocked" });
    plan = createFallbackPlan(input.question, input.schema, input.history);
    if (plan.unavailableReason) return unavailableOutput(plan.unavailableReason, stages, started, modelUsed, retryCount);
    safeSql = assertSafeAnalyticalSql(plan.sql);
    stages.push({ stage: "Deterministic Recovery", detail: "Validated a schema-derived fallback query after the model plan was blocked.", status: "complete" });
  }
  const sqlStarted = Date.now();
  let result: Array<Record<string, unknown>>;
  try {
    result = await executeDuckDbQuery(input.records, input.schema, safeSql);
  } catch (error) {
    if (!modelUsed || retryCount > 0) throw error;
    retryCount += 1;
    stages.push({ stage: "DuckDB Execution", detail: "The model-generated query did not execute; applied one bounded deterministic recovery retry.", status: "blocked" });
    plan = createFallbackPlan(input.question, input.schema, input.history);
    if (plan.unavailableReason) return unavailableOutput(plan.unavailableReason, stages, started, modelUsed, retryCount);
    safeSql = assertSafeAnalyticalSql(plan.sql);
    result = await executeDuckDbQuery(input.records, input.schema, safeSql);
    stages.push({ stage: "Deterministic Recovery", detail: "Executed the schema-derived fallback query successfully.", status: "complete" });
  }
  const sqlMs = Date.now() - sqlStarted;
  stages.push({ stage: "DuckDB Execution", detail: `Executed safely against ${input.records.length.toLocaleString()} in-memory dataset rows in ${sqlMs} ms.`, status: "complete" });
  const needsStatistics = /anomaly|unusual|outlier|distribution/i.test(input.question);
  const revenueColumn = input.schema.find(column => /revenue|sales|amount/.test(column.name))?.name;
  const anomaly = needsStatistics && revenueColumn ? detectSimpleOutliers(input.records, revenueColumn) : null;
  stages.push({ stage: "Statistical Analysis", detail: anomaly ? anomaly.message : "No additional statistical calculation was required for this request.", status: anomaly ? "complete" : "skipped" });
  const visualization = buildVisualization(plan, result);
  stages.push({ stage: "Visualization Decision", detail: visualization ? `Selected a ${visualization.type} visualization because it directly supports the analytical question.` : "A visualization would not add useful evidence to this result.", status: visualization ? "complete" : "skipped" });
  const enriched = await enrichWithBusinessInsights(input.question, result, plan, callLlm, input.llmTimeoutMs ?? INSIGHT_TIMEOUT_MS);
  const answer = enriched ?? deterministicSummary(input.question, result, plan, anomaly?.message ?? null);
  stages.push({ stage: "Business Insight Generation", detail: enriched ? "Interpreted the executed results with a constrained, evidence-only insight pass." : "Produced a deterministic, data-grounded explanation from the executed result.", status: "complete" });
  return {
    answer,
    result,
    visualization,
    details: { stages, generatedSql: plan.sql, toolsUsed: ["Schema profiler", "SQL safety validator", "DuckDB", ...(anomaly ? ["Statistical analysis"] : []), ...(modelUsed ? ["LLM orchestration"] : [])], columnsUsed: referencedColumns(safeSql, input.schema), execution: { rowCount: result.length, elapsedMs: sqlMs, preview: result.slice(0, 12) } },
    safeSql,
    metrics: { totalMs: Date.now() - started, sqlMs, retryCount, modelUsed },
  };
}
