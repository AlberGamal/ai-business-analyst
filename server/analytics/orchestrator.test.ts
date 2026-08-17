import { describe, expect, it, vi } from "vitest";
import { analyzeQuestion } from "./orchestrator";
import { profileRecords } from "./parsing";

const sample = profileRecords([
  { order_date: "2026-01-01", revenue: 100, profit: 30, category: "Software", region: "North" },
  { order_date: "2026-02-01", revenue: 80, profit: 20, category: "Hardware", region: "South" },
  { order_date: "2026-02-02", revenue: 120, profit: 45, category: "Software", region: "North" },
], "utf8", "csv");

describe("analysis orchestration recovery", () => {
  it("falls back to schema-derived execution when the planning model is unavailable", async () => {
    const llmInvoke = vi.fn(async () => { throw new Error("provider unavailable"); });
    const output = await analyzeQuestion({ question: "What is the total revenue?", records: sample.records, schema: sample.schema, history: [], llmInvoke: llmInvoke as any });
    expect(output.metrics.retryCount).toBe(1);
    expect(output.safeSql).toContain('SUM("revenue")');
    expect(Number(output.result[0].total_revenue)).toBe(300);
    expect(output.answer).toMatch(/executed aggregate metric query/i);
  });

  it("falls back within the configured latency budget when the planning model stalls", async () => {
    const llmInvoke = vi.fn(() => new Promise(() => undefined));
    const started = Date.now();
    const output = await analyzeQuestion({ question: "What is the total revenue?", records: sample.records, schema: sample.schema, history: [], llmInvoke: llmInvoke as any, llmTimeoutMs: 10 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(output.metrics.retryCount).toBe(1);
    expect(Number(output.result[0].total_revenue)).toBe(300);
  });

  it("blocks an unsafe model plan and executes exactly one validated deterministic recovery", async () => {
    const llmInvoke = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ intent: "unsafe", sql: "DROP TABLE dataset", chartType: "none", xKey: null, yKeys: [], analysisFocus: "unsafe" }) } }] } as any)
      .mockRejectedValueOnce(new Error("skip optional narrative"));
    const output = await analyzeQuestion({ question: "What is the total revenue?", records: sample.records, schema: sample.schema, history: [], llmInvoke: llmInvoke as any });
    expect(output.metrics.retryCount).toBe(1);
    expect(output.safeSql).toMatch(/^SELECT/i);
    expect(output.safeSql).not.toMatch(/drop/i);
    expect(Number(output.result[0].total_revenue)).toBe(300);
    expect(output.details.stages.some(stage => stage.stage === "Deterministic Recovery")).toBe(true);
  });

  it("returns a grounded limitation for a request whose measure is absent from the dataset", async () => {
    const llmInvoke = vi.fn(async () => { throw new Error("provider unavailable"); });
    const output = await analyzeQuestion({ question: "What was our marketing spend?", records: sample.records, schema: sample.schema, history: [], llmInvoke: llmInvoke as any });
    expect(output.result).toEqual([]);
    expect(output.safeSql).toBeNull();
    expect(output.answer).toMatch(/insufficient to answer/i);
  });
});
