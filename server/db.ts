import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  analysisEvents,
  analysisRuns,
  conversationMessages,
  conversations,
  datasets,
  InsertUser,
  savedInsights,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to initialize the database client.");
      _db = null;
    }
  }
  return _db;
}

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("The application database is unavailable. Please retry shortly.");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  (["name", "email", "loginMethod"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (ENV.localAuthEmail && user.openId === `local:${ENV.localAuthEmail}`) { values.role = ENV.localAuthRole; updateSet.role = ENV.localAuthRole; }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listDatasets(userId: number) {
  const db = await requireDb();
  return db.select().from(datasets).where(eq(datasets.userId, userId)).orderBy(desc(datasets.createdAt));
}

export async function getDatasetForUser(userId: number, datasetId: number) {
  const db = await requireDb();
  const result = await db.select().from(datasets).where(and(eq(datasets.id, datasetId), eq(datasets.userId, userId))).limit(1);
  return result[0];
}

export async function createDataset(input: typeof datasets.$inferInsert) {
  const db = await requireDb();
  const response = await db.insert(datasets).values(input);
  return Number((response as any)[0]?.insertId);
}

export async function deleteDatasetForUser(userId: number, datasetId: number) {
  const db = await requireDb();
  await db.delete(datasets).where(and(eq(datasets.id, datasetId), eq(datasets.userId, userId)));
}

export async function createConversation(input: typeof conversations.$inferInsert) {
  const db = await requireDb();
  const response = await db.insert(conversations).values(input);
  return Number((response as any)[0]?.insertId);
}

export async function listConversations(userId: number, datasetId: number) {
  const db = await requireDb();
  return db.select().from(conversations).where(and(eq(conversations.userId, userId), eq(conversations.datasetId, datasetId))).orderBy(desc(conversations.updatedAt));
}

export async function conversationForUser(userId: number, conversationId: number) {
  const db = await requireDb();
  const result = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
  return result[0];
}

export async function listMessages(conversationId: number) {
  const db = await requireDb();
  return db.select().from(conversationMessages).where(eq(conversationMessages.conversationId, conversationId)).orderBy(conversationMessages.createdAt);
}

export async function addMessage(input: typeof conversationMessages.$inferInsert) {
  const db = await requireDb();
  await db.insert(conversationMessages).values(input);
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
}

export async function createAnalysisRun(input: typeof analysisRuns.$inferInsert) {
  const db = await requireDb();
  const response = await db.insert(analysisRuns).values(input);
  return Number((response as any)[0]?.insertId);
}

export async function listAnalysisRuns(userId: number, datasetId?: number) {
  const db = await requireDb();
  const where = datasetId ? and(eq(analysisRuns.userId, userId), eq(analysisRuns.datasetId, datasetId)) : eq(analysisRuns.userId, userId);
  return db.select().from(analysisRuns).where(where).orderBy(desc(analysisRuns.createdAt)).limit(100);
}

export async function getAnalysisRunForUser(userId: number, runId: number) {
  const db = await requireDb();
  const result = await db.select().from(analysisRuns).where(and(eq(analysisRuns.id, runId), eq(analysisRuns.userId, userId))).limit(1);
  return result[0];
}

export async function createInsight(input: typeof savedInsights.$inferInsert) {
  const db = await requireDb();
  const response = await db.insert(savedInsights).values(input);
  return Number((response as any)[0]?.insertId);
}

export async function listInsights(userId: number) {
  const db = await requireDb();
  return db.select({ insight: savedInsights, analysis: analysisRuns }).from(savedInsights).leftJoin(analysisRuns, eq(savedInsights.analysisRunId, analysisRuns.id)).where(eq(savedInsights.userId, userId)).orderBy(desc(savedInsights.createdAt));
}

export async function deleteInsightForUser(userId: number, insightId: number) {
  const db = await requireDb();
  await db.delete(savedInsights).where(and(eq(savedInsights.id, insightId), eq(savedInsights.userId, userId)));
}

export async function recordAnalysisEvent(input: typeof analysisEvents.$inferInsert) {
  const db = await requireDb();
  await db.insert(analysisEvents).values(input);
}

export async function getOverview(userId: number) {
  const db = await requireDb();
  const [datasetCount] = await db.select({ count: sql<number>`count(*)` }).from(datasets).where(eq(datasets.userId, userId));
  const [analysisCount] = await db.select({ count: sql<number>`count(*)` }).from(analysisRuns).where(eq(analysisRuns.userId, userId));
  const [latestDataset] = await db.select().from(datasets).where(eq(datasets.userId, userId)).orderBy(desc(datasets.createdAt)).limit(1);
  const recent = await db.select().from(analysisRuns).where(eq(analysisRuns.userId, userId)).orderBy(desc(analysisRuns.createdAt)).limit(5);
  return { datasetCount: Number(datasetCount?.count ?? 0), analysisCount: Number(analysisCount?.count ?? 0), latestDataset, recent };
}

export async function getOperationalHealth() {
  const db = await requireDb();
  const events = await db.select().from(analysisEvents).orderBy(desc(analysisEvents.createdAt)).limit(250);
  const successful = events.filter(event => event.eventType === "analysis_succeeded");
  const failures = events.filter(event => event.eventType === "analysis_failed").length;
  const retries = events.filter(event => event.eventType === "analysis_retry").length;
  const durations = successful.map(event => event.durationMs).filter(Number.isFinite);
  const metadata = successful.map(event => (event.metadata || {}) as { sqlMs?: number; tools?: string[] });
  const sqlDurations = metadata.map(event => Number(event.sqlMs || 0)).filter(value => value > 0);
  const toolUsage = metadata.flatMap(event => event.tools || []).reduce<Record<string, number>>((counts, tool) => ({ ...counts, [tool]: (counts[tool] || 0) + 1 }), {});
  return {
    totalEvents: events.length,
    successfulAnalyses: successful.length,
    averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    averageSqlMs: sqlDurations.length ? Math.round(sqlDurations.reduce((sum, value) => sum + value, 0) / sqlDurations.length) : 0,
    failures,
    retries,
    toolUsage,
  };
}
