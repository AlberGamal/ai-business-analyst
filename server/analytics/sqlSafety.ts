import { ColumnProfile } from "./types";

const BLOCKED = /\b(drop|delete|update|insert|alter|create|replace|merge|truncate|grant|revoke|attach|detach|install|load|copy|export|import|call|pragma|vacuum|checkpoint)\b/i;
const BLOCKED_PATHS = /\b(read_csv|read_csv_auto|read_parquet|read_json|read_ndjson|read_blob|read_text|csv_scan|parquet_scan|json_scan|delta_scan|iceberg_scan|glob|httpfs|http_get|sqlite_scan|postgres_scan|mysql_scan|duckdb_secrets|query_table|getenv|current_setting)\b/i;

export function assertSafeAnalyticalSql(sql: string): string {
  const normalized = sql.trim().replace(/;\s*$/, "");
  if (!normalized) throw new Error("The analysis plan did not contain SQL.");
  if (/--|\/\*/.test(normalized)) throw new Error("SQL comments are not permitted in analytical queries.");
  if (normalized.includes(";")) throw new Error("Only one SQL statement may be executed.");
  if (!/^(select|with)\b/i.test(normalized)) throw new Error("Only SELECT or CTE-based analytical queries are permitted.");
  if (BLOCKED.test(normalized) || BLOCKED_PATHS.test(normalized)) throw new Error("The SQL safety layer blocked a destructive or external-access operation.");
  if (!/\bfrom\s+(["`]?dataset["`]?)\b/i.test(normalized)) {
    throw new Error("Analytical SQL may query only the isolated dataset table.");
  }
  return /\blimit\s+\d+/i.test(normalized) ? normalized : `${normalized} LIMIT 500`;
}

export function referencedColumns(sql: string, schema: ColumnProfile[]): string[] {
  const text = sql.toLowerCase();
  return schema
    .map(column => column.name)
    .filter(name => new RegExp(`(^|[^a-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toLowerCase()}([^a-z0-9_]|$)`, "i").test(text));
}
