import { DuckDBInstance } from "@duckdb/node-api";
import { ColumnProfile, RawRecord } from "./types";

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function toLiteral(value: unknown, column: ColumnProfile) {
  if (value === null || value === undefined || value === "") return "NULL";
  const text = String(value);
  if (column.type === "number") {
    const numeric = Number(text.replace(/[,$%]/g, ""));
    return Number.isFinite(numeric) ? String(numeric) : "NULL";
  }
  if (column.type === "date") {
    const date = new Date(text);
    return Number.isFinite(date.getTime()) ? `DATE '${date.toISOString().slice(0, 10)}'` : "NULL";
  }
  if (column.type === "boolean") return /^(true|yes|1)$/i.test(text) ? "TRUE" : "FALSE";
  return `'${text.replace(/'/g, "''")}'`;
}

export async function executeDuckDbQuery(records: RawRecord[], schema: ColumnProfile[], sql: string) {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  const columnDefinitions = schema.map(column => `${quoteIdentifier(column.name)} ${column.type === "number" ? "DOUBLE" : column.type === "date" ? "DATE" : column.type === "boolean" ? "BOOLEAN" : "VARCHAR"}`).join(", ");
  try {
    await connection.run(`CREATE TABLE dataset (${columnDefinitions})`);
    const columns = schema.map(column => quoteIdentifier(column.name)).join(", ");
    for (let start = 0; start < records.length; start += 250) {
      const values = records.slice(start, start + 250).map(record => `(${schema.map(column => toLiteral(record[column.name], column)).join(", ")})`).join(", ");
      await connection.run(`INSERT INTO dataset (${columns}) VALUES ${values}`);
    }
    const reader = await connection.runAndReadAll(sql);
    return reader.getRowObjectsJS() as Array<Record<string, unknown>>;
  } finally {
    await (connection as any).disconnect?.();
    await (instance as any).close?.();
  }
}
