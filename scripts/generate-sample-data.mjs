import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSampleSalesRecords, sampleQuestions } from "../server/analytics/sampleData.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "sample-data");
const rows = createSampleSalesRecords();
const headers = Object.keys(rows[0] ?? {});
const quote = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = [headers.join(","), ...rows.map(row => headers.map(header => quote(row[header])).join(","))].join("\n") + "\n";

await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, "sales-orders.csv"), csv, "utf8");
await writeFile(path.join(destination, "example-questions.json"), `${JSON.stringify(sampleQuestions, null, 2)}\n`, "utf8");
console.log(`Wrote ${rows.length} sales orders and ${sampleQuestions.length} example questions to sample-data/.`);
