import { describe, expect, it } from "vitest";
import { executeDuckDbQuery } from "./duckdb";
import { parseDatasetBuffer, profileRecords } from "./parsing";
import { createSampleSalesRecords } from "./sampleData";
import { assertSafeAnalyticalSql } from "./sqlSafety";
import { createFallbackPlan } from "./orchestrator";
import ExcelJS from "exceljs";

describe("analytics dataset services", () => {
  const parsed = profileRecords(createSampleSalesRecords(), "utf8", "csv");

  it("profiles the realistic sales dataset and detects the required fields", () => {
    expect(parsed.profile.rowCount).toBeGreaterThan(200);
    expect(parsed.profile.columnCount).toBeGreaterThanOrEqual(10);
    expect(parsed.schema.find(column => column.name === "revenue")?.type).toBe("number");
    expect(parsed.schema.find(column => column.name === "order_date")?.type).toBe("date");
    expect(parsed.profile.dateRange?.min).toBe("2026-01-01");
  });

  it("ingests a CSV buffer with missing values and normalizes its profile", async () => {
    const parsedCsv = await parseDatasetBuffer(Buffer.from("order_date,revenue,region\n2026-01-01,120,Cairo\n2026-01-02,,Alexandria\n"), "orders.csv");
    expect(parsedCsv.profile.rowCount).toBe(2);
    expect(parsedCsv.schema.find(column => column.name === "revenue")?.missingCount).toBe(1);
    expect(parsedCsv.profile.encoding).toBe("utf8");
  });

  it("profiles an XLSX workbook and preserves its row/column shape", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Invoices");
    worksheet.addRows([["invoice_date", "gross_amount", "zone"], ["2026-02-01", 75, "East"], ["2026-02-02", 125, "West"]]);
    const parsedXlsx = await parseDatasetBuffer(Buffer.from(await workbook.xlsx.writeBuffer()), "invoices.xlsx");
    expect(parsedXlsx.profile.sourceFormat).toBe("xlsx");
    expect(parsedXlsx.profile.rowCount).toBe(2);
    expect(parsedXlsx.schema.find(column => column.name === "gross_amount")?.type).toBe("number");
  });

  it("rejects empty and malformed datasets while profiling small inconsistent CSV data safely", async () => {
    await expect(parseDatasetBuffer(Buffer.from("date,revenue\n"), "empty.csv")).rejects.toThrow(/at least one data row|no non-empty/i);
    await expect(parseDatasetBuffer(Buffer.from("not a workbook"), "corrupt.xlsx")).rejects.toThrow();
    const small = await parseDatasetBuffer(Buffer.from("event_date,amount,status\n2026-03-01,120,yes\ninvalid,unknown,no\n"), "events.csv");
    expect(small.profile.rowCount).toBe(2);
    expect(small.schema.find(column => column.name === "amount")?.type).toBe("string");
    expect(small.schema.find(column => column.name === "status")?.type).toBe("boolean");
  });

  it("blocks destructive, multiple-statement, and external-access SQL", () => {
    expect(() => assertSafeAnalyticalSql("DELETE FROM dataset")).toThrow(/Only SELECT|blocked/i);
    expect(() => assertSafeAnalyticalSql("SELECT * FROM dataset; DROP TABLE dataset")).toThrow(/one SQL statement/i);
    expect(() => assertSafeAnalyticalSql("SELECT * FROM read_csv('x.csv')")).toThrow(/blocked|only the isolated/i);
    expect(() => assertSafeAnalyticalSql("SELECT * FROM parquet_scan('/etc/passwd')")).toThrow(/blocked/i);
    expect(assertSafeAnalyticalSql("WITH x AS (SELECT * FROM dataset) SELECT * FROM x")).toMatch(/^WITH x/i);
  });

  it("executes a safe aggregate against the actual in-memory DuckDB dataset", async () => {
    const sql = assertSafeAnalyticalSql('SELECT category, ROUND(SUM("revenue"), 2) AS revenue FROM dataset GROUP BY category ORDER BY revenue DESC');
    const result = await executeDuckDbQuery(parsed.records, parsed.schema, sql);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0]).toHaveProperty("category");
    expect(Number(result[0].revenue)).toBeGreaterThan(0);
  });

  it("adapts the deterministic analytical plan to unfamiliar but compatible column names", async () => {
    const invoiceRecords = [
      { invoice_date: "2026-01-01", gross_amount: 75, zone: "East", sku: "Alpha" },
      { invoice_date: "2026-01-02", gross_amount: 125, zone: "West", sku: "Beta" },
      { invoice_date: "2026-02-01", gross_amount: 50, zone: "East", sku: "Alpha" },
    ];
    const invoices = profileRecords(invoiceRecords, "utf8", "csv");
    const plan = createFallbackPlan("What is the total revenue?", invoices.schema, []);
    expect(plan.sql).toContain('"gross_amount"');
    const result = await executeDuckDbQuery(invoices.records, invoices.schema, assertSafeAnalyticalSql(plan.sql));
    expect(Number(result[0].total_gross_amount)).toBe(250);
  });

  it("returns an explicit availability limitation instead of mapping unsupported questions to arbitrary data", () => {
    const plan = createFallbackPlan("What was our marketing spend?", parsed.schema, []);
    expect(plan.unavailableReason).toMatch(/does not contain a field/i);
    expect(plan.sql).toBe("");
  });

  it("refuses attempts to invoke destructive SQL, code, or file operations", () => {
    const plan = createFallbackPlan("DROP TABLE dataset and read_csv('/etc/passwd')", parsed.schema, []);
    expect(plan.unavailableReason).toMatch(/cannot execute drop operations/i);
    expect(plan.sql).toBe("");
  });

  it("generates dynamic month and margin analysis from the actual schema rather than fixed sample dates", () => {
    const rootCause = createFallbackPlan("Why did revenue decrease in March?", parsed.schema, []);
    const margin = createFallbackPlan("Which category has the highest profit margin?", parsed.schema, []);
    expect(rootCause.sql).toContain("'03'");
    expect(rootCause.sql).toContain("'02'");
    expect(margin.sql).toContain("profit_margin");
    expect(margin.sql).toContain('SUM("profit")');
  });

  it("carries month context through a comparison follow-up and a product-contribution follow-up", () => {
    const history = ["user: What was our revenue in July?", "assistant: Executed July revenue result.", "user: How does that compare with June?"];
    const comparison = createFallbackPlan("How does that compare with June?", parsed.schema, history);
    const contribution = createFallbackPlan("Which product contributed most to the difference?", parsed.schema, history);
    expect(comparison.sql).toContain("'07'");
    expect(comparison.sql).toContain("'06'");
    expect(contribution.intent).toBe("product contribution comparison");
    expect(contribution.sql).toContain("ABS(change)");
    expect(contribution.sql).toContain("'07'");
    expect(contribution.sql).toContain("'06'");
  });
});
