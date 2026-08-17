import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing local development or external identity-provider sessions. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const datasets = mysqlTable(
  "datasets",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
    sourceKind: mysqlEnum("sourceKind", ["upload", "sample"]).default("upload").notNull(),
    fileKey: varchar("fileKey", { length: 512 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }).notNull(),
    bytes: int("bytes").notNull(),
    status: mysqlEnum("status", ["ready", "failed", "processing"]).default("processing").notNull(),
    rowCount: int("rowCount").default(0).notNull(),
    columnCount: int("columnCount").default(0).notNull(),
    profile: json("profile"),
    schema: json("schema"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("datasets_user_created_idx").on(table.userId, table.createdAt)],
);

export const conversations = mysqlTable(
  "conversations",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    datasetId: int("datasetId").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("conversations_user_dataset_idx").on(table.userId, table.datasetId)],
);

export const analysisRuns = mysqlTable(
  "analysisRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    datasetId: int("datasetId").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    conversationId: int("conversationId").references(() => conversations.id, { onDelete: "set null" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    generatedSql: text("generatedSql"),
    safeSql: text("safeSql"),
    status: mysqlEnum("status", ["succeeded", "failed", "blocked"]).notNull(),
    toolsUsed: json("toolsUsed"),
    columnsUsed: json("columnsUsed"),
    result: json("result"),
    visualization: json("visualization"),
    analysisDetails: json("analysisDetails"),
    metrics: json("metrics"),
    durationMs: int("durationMs").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("analysis_runs_user_created_idx").on(table.userId, table.createdAt),
    index("analysis_runs_dataset_idx").on(table.datasetId),
  ],
);

export const conversationMessages = mysqlTable(
  "conversationMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    analysisRunId: int("analysisRunId").references(() => analysisRuns.id, { onDelete: "set null" }),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("messages_conversation_created_idx").on(table.conversationId, table.createdAt)],
);

export const savedInsights = mysqlTable(
  "savedInsights",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    analysisRunId: int("analysisRunId").notNull().references(() => analysisRuns.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("saved_insights_user_created_idx").on(table.userId, table.createdAt)],
);

export const analysisEvents = mysqlTable(
  "analysisEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    datasetId: int("datasetId").references(() => datasets.id, { onDelete: "cascade" }),
    analysisRunId: int("analysisRunId").references(() => analysisRuns.id, { onDelete: "cascade" }),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    durationMs: int("durationMs").default(0).notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("analysis_events_user_created_idx").on(table.userId, table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Dataset = typeof datasets.$inferSelect;
export type AnalysisRun = typeof analysisRuns.$inferSelect;
