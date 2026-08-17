import { performance } from "node:perf_hooks";
import { profileRecords } from "../server/analytics/parsing.ts";
import { createFallbackPlan } from "../server/analytics/orchestrator.ts";
import { executeDuckDbQuery } from "../server/analytics/duckdb.ts";
import { createSampleSalesRecords } from "../server/analytics/sampleData.ts";
import { assertSafeAnalyticalSql } from "../server/analytics/sqlSafety.ts";

const started = performance.now();
const parsed = profileRecords(createSampleSalesRecords(), "utf8", "csv");
const profileMs = performance.now() - started;
const questions = [
  "What is our total revenue?",
  "Show monthly revenue for 2026.",
  "Which product category has the highest profit margin?",
  "Compare January and February.",
  "Why did revenue decrease in July?",
];
const results = [];
for (const question of questions) {
  const queryStarted = performance.now();
  const plan = createFallbackPlan(question, parsed.schema, []);
  if (plan.unavailableReason) throw new Error(`Unexpected unavailable plan: ${plan.unavailableReason}`);
  const rows = await executeDuckDbQuery(parsed.records, parsed.schema, assertSafeAnalyticalSql(plan.sql));
  results.push({ question, rowCount: rows.length, elapsedMs: Number((performance.now() - queryStarted).toFixed(2)) });
}
console.log(JSON.stringify({ profileMs: Number(profileMs.toFixed(2)), rowCount: parsed.profile.rowCount, results, memoryMB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2)) }, null, 2));
