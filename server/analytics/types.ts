export type RawRecord = Record<string, string | number | null>;

export type ColumnProfile = {
  name: string;
  type: "number" | "date" | "boolean" | "string";
  nonNullCount: number;
  missingCount: number;
  uniqueCount: number;
  sampleValues: string[];
  numeric?: { min: number; max: number; mean: number; sum: number };
  date?: { min: string; max: string };
  categories?: Array<{ value: string; count: number }>;
};

export type DatasetProfile = {
  rowCount: number;
  columnCount: number;
  encoding: string;
  sourceFormat: "csv" | "xlsx";
  dataQualityScore: number;
  columns: ColumnProfile[];
  dateRange: { min: string; max: string } | null;
  preview: RawRecord[];
};

export type ParsedDataset = {
  records: RawRecord[];
  profile: DatasetProfile;
  schema: ColumnProfile[];
  normalizedCsv: string;
};

export type VisualizationPayload = {
  type: "line" | "bar" | "area" | "pie" | "donut" | "scatter" | "histogram" | "kpi" | "table";
  title: string;
  description: string;
  data: Array<Record<string, unknown>>;
  xKey?: string;
  yKeys?: string[];
  valueKey?: string;
  nameKey?: string;
  formatter?: "currency" | "number" | "percent";
};

export type AnalysisDetails = {
  stages: Array<{ stage: string; detail: string; status: "complete" | "blocked" | "skipped" }>;
  generatedSql: string;
  toolsUsed: string[];
  columnsUsed: string[];
  execution: { rowCount: number; elapsedMs: number; preview: Array<Record<string, unknown>> };
};

export type AnalysisOutput = {
  answer: string;
  result: Array<Record<string, unknown>>;
  visualization: VisualizationPayload | null;
  details: AnalysisDetails;
  safeSql: string | null;
  metrics: { totalMs: number; sqlMs: number; retryCount: number; modelUsed: string | null };
};
