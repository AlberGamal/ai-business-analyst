import { parse } from "csv-parse/sync";
import chardet from "chardet";
import iconv from "iconv-lite";
import ExcelJS from "exceljs";
import { ColumnProfile, DatasetProfile, ParsedDataset, RawRecord } from "./types";

const MAX_ROWS = 50_000;
const MAX_COLUMNS = 80;

function normalizeHeader(value: unknown, index: number) {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  return cleaned || `column_${index + 1}`;
}

function stringifyCell(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim() || null;
}

function normalizeExcelCell(value: ExcelJS.CellValue | undefined): unknown {
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  if ("result" in value && value.result !== undefined) return value.result;
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) return value.richText.map(part => part.text).join("");
  if ("hyperlink" in value && typeof value.text === "string") return value.text;
  return String(value);
}

async function parseXlsxBuffer(buffer: Buffer): Promise<ParsedDataset> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The XLSX file does not contain a worksheet.");
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, row => {
    const values: unknown[] = [];
    for (let index = 1; index <= Math.max(sheet.columnCount, row.cellCount); index += 1) values.push(normalizeExcelCell(row.getCell(index).value));
    rows.push(values);
  });
  return profileRecords(normalizeRecords(rows), "xlsx", "xlsx");
}

function normalizeRecords(rows: unknown[][]): RawRecord[] {
  if (rows.length < 2) throw new Error("The dataset must include a header row and at least one data row.");
  const headers = rows[0].map(normalizeHeader);
  if (headers.length > MAX_COLUMNS) throw new Error(`The dataset contains more than the ${MAX_COLUMNS}-column limit.`);
  const seen = new Map<string, number>();
  const uniqueHeaders = headers.map(header => {
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header}_${count + 1}`;
  });

  const records = rows.slice(1).filter(row => row.some(value => stringifyCell(value) !== null)).map(row => {
    const record: RawRecord = {};
    uniqueHeaders.forEach((header, index) => {
      record[header] = stringifyCell(row[index]);
    });
    return record;
  });
  if (!records.length) throw new Error("The dataset has no non-empty data rows.");
  if (records.length > MAX_ROWS) throw new Error(`The dataset contains more than the ${MAX_ROWS.toLocaleString()}-row limit.`);
  return records;
}

function looksLikeNumber(value: string) {
  return /^[-+]?\d{1,3}(?:,?\d{3})*(?:\.\d+)?%?$/.test(value.replace(/\$/g, ""));
}

function toNumber(value: string) {
  const normalized = value.replace(/[,$%]/g, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function looksLikeDate(value: string) {
  if (!/[\-/]/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > Date.UTC(1990, 0, 1) && time < Date.UTC(2100, 0, 1);
}

function inferColumn(name: string, records: RawRecord[]): ColumnProfile {
  const values = records.map(record => record[name]).filter((value): value is string | number => value !== null && value !== undefined).map(String);
  const missingCount = records.length - values.length;
  const numericValues = values.map(toNumber).filter((value): value is number => value !== null);
  const dateValues = values.filter(looksLikeDate).map(value => new Date(value).toISOString().slice(0, 10));
  const booleanValues = values.filter(value => /^(true|false|yes|no|0|1)$/i.test(value));
  let type: ColumnProfile["type"] = "string";
  if (values.length && numericValues.length / values.length >= 0.9 && values.every(looksLikeNumber)) type = "number";
  else if (values.length && dateValues.length / values.length >= 0.8) type = "date";
  else if (values.length && booleanValues.length / values.length >= 0.95) type = "boolean";
  const unique = Array.from(new Set(values));
  const profile: ColumnProfile = {
    name,
    type,
    nonNullCount: values.length,
    missingCount,
    uniqueCount: unique.length,
    sampleValues: unique.slice(0, 5),
  };
  if (type === "number") {
    const sum = numericValues.reduce((total, value) => total + value, 0);
    profile.numeric = { min: Math.min(...numericValues), max: Math.max(...numericValues), sum, mean: sum / numericValues.length };
  }
  if (type === "date") profile.date = { min: [...dateValues].sort()[0], max: [...dateValues].sort().at(-1)! };
  if (type === "string" || type === "boolean") {
    const distribution = new Map<string, number>();
    values.forEach(value => distribution.set(value, (distribution.get(value) ?? 0) + 1));
    profile.categories = Array.from(distribution.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ value, count }));
  }
  return profile;
}

function toCsv(records: RawRecord[]) {
  const columns = Object.keys(records[0] ?? {});
  const encode = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map(encode).join(","), ...records.map(row => columns.map(column => encode(row[column])).join(","))].join("\n");
}

export function profileRecords(records: RawRecord[], encoding: string, sourceFormat: "csv" | "xlsx"): ParsedDataset {
  const columns = Object.keys(records[0] ?? {});
  const schema = columns.map(column => inferColumn(column, records));
  const dateColumns = schema.filter(column => column.type === "date" && column.date);
  const allDateValues = dateColumns.flatMap(column => [column.date!.min, column.date!.max]).sort();
  const totalCells = records.length * Math.max(1, columns.length);
  const missingCells = schema.reduce((sum, column) => sum + column.missingCount, 0);
  const profile: DatasetProfile = {
    rowCount: records.length,
    columnCount: columns.length,
    encoding,
    sourceFormat,
    dataQualityScore: Math.max(0, Math.round((1 - missingCells / totalCells) * 100)),
    columns: schema,
    dateRange: allDateValues.length ? { min: allDateValues[0], max: allDateValues.at(-1)! } : null,
    preview: records.slice(0, 25),
  };
  return { records, profile, schema, normalizedCsv: toCsv(records) };
}

export async function parseDatasetBuffer(buffer: Buffer, filename: string): Promise<ParsedDataset> {
  const extension = filename.toLowerCase().split(".").at(-1);
  if (extension === "xlsx") {
    return parseXlsxBuffer(buffer);
  }
  if (extension !== "csv") throw new Error("Only CSV and XLSX files are supported.");
  const detected = chardet.detect(buffer) || "UTF-8";
  const asciiOnly = !Array.from(buffer).some(byte => byte > 0x7f);
  const encoding = asciiOnly || /utf-?8/i.test(detected) ? "utf8" : /iso-8859|windows-1252/i.test(detected) ? "latin1" : "utf8";
  const text = iconv.decode(buffer, encoding).replace(/^\uFEFF/, "");
  const rows = parse(text, { skip_empty_lines: true, relax_column_count: true, bom: true }) as unknown[][];
  return profileRecords(normalizeRecords(rows), encoding, "csv");
}
