import { TRPCError } from "@trpc/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { analyzeQuestion } from "./analytics/orchestrator";
import { parseDatasetBuffer, profileRecords } from "./analytics/parsing";
import { createSampleSalesRecords, sampleQuestions } from "./analytics/sampleData";
import * as db from "./db";
import { storagePut, storageRead } from "./storage";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const datasetInput = z.object({ datasetId: z.number().int().positive() });
const ALLOWED_DATASET_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

export function responseId(value: number | bigint) {
  return Number(value);
}

async function getParsedDataset(userId: number, datasetId: number) {
  const dataset = await db.getDatasetForUser(userId, datasetId);
  if (!dataset) throw new TRPCError({ code: "NOT_FOUND", message: "Dataset not found or not available to this user." });
  try {
    const buffer = await storageRead(dataset.fileKey);
    return { dataset, parsed: await parseDatasetBuffer(buffer, dataset.originalFilename) };
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The dataset source file could not be retrieved." });
  }
}

function compactFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "dataset.csv";
}

function passwordsMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(options => options.ctx.user),
    localLogin: publicProcedure.input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(256) })).mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      if (!ENV.localAuthEmail || !ENV.localAuthPassword) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Local authentication is not configured. Set LOCAL_AUTH_EMAIL and LOCAL_AUTH_PASSWORD." });
      }
      if (email !== ENV.localAuthEmail || !passwordsMatch(input.password, ENV.localAuthPassword)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "The supplied local development credentials are not valid." });
      }
      const openId = `local:${email}`;
      await db.upsertUser({ openId, email, name: ENV.localAuthName, loginMethod: "local", role: ENV.localAuthRole, lastSignedIn: new Date() });
      const token = await sdk.createSessionToken(openId, { name: ENV.localAuthName });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  datasets: router({
    list: protectedProcedure.query(({ ctx }) => db.listDatasets(ctx.user.id)),
    get: protectedProcedure.input(datasetInput).query(async ({ ctx, input }) => {
      const dataset = await db.getDatasetForUser(ctx.user.id, input.datasetId);
      if (!dataset) throw new TRPCError({ code: "NOT_FOUND", message: "Dataset not found." });
      return dataset;
    }),
    upload: protectedProcedure.input(z.object({ filename: z.string().min(1).max(255), mimeType: z.string().max(128), base64: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      const extension = input.filename.toLowerCase().split(".").at(-1);
      if (extension !== "csv" && extension !== "xlsx") throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a CSV or XLSX file." });
      if (input.mimeType && !ALLOWED_DATASET_MIME_TYPES.has(input.mimeType.toLowerCase())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The file MIME type is not valid for a CSV or XLSX dataset." });
      }
      const buffer = Buffer.from(input.base64, "base64");
      if (!buffer.length) throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file is empty." });
      if (buffer.length > MAX_FILE_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Files must be 4 MB or smaller in this version." });
      let parsed;
      try { parsed = await parseDatasetBuffer(buffer, input.filename); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "The file could not be parsed." }); }
      const stored = await storagePut(`${ctx.user.id}/datasets/${Date.now()}-${compactFilename(input.filename)}`, buffer, input.mimeType || "application/octet-stream");
      const datasetId = await db.createDataset({ userId: ctx.user.id, name: input.filename.replace(/\.[^.]+$/, ""), originalFilename: input.filename, sourceKind: "upload", fileKey: stored.key, storageUrl: stored.url, mimeType: input.mimeType || "application/octet-stream", bytes: buffer.length, status: "ready", rowCount: parsed.profile.rowCount, columnCount: parsed.profile.columnCount, profile: parsed.profile as any, schema: parsed.schema as any });
      await db.recordAnalysisEvent({ userId: ctx.user.id, datasetId, eventType: "dataset_uploaded", durationMs: 0, metadata: { rowCount: parsed.profile.rowCount, columnCount: parsed.profile.columnCount } as any });
      return { datasetId, profile: parsed.profile };
    }),
    ensureSample: protectedProcedure.mutation(async ({ ctx }) => {
      const existing = (await db.listDatasets(ctx.user.id)).find(dataset => dataset.sourceKind === "sample");
      if (existing) return { datasetId: responseId(existing.id), existing: true };
      const records = createSampleSalesRecords();
      const parsed = profileRecords(records, "utf8", "csv");
      const buffer = Buffer.from(parsed.normalizedCsv, "utf8");
      const stored = await storagePut(`${ctx.user.id}/datasets/sample-sales-orders.csv`, buffer, "text/csv");
      const datasetId = await db.createDataset({ userId: ctx.user.id, name: "2026 Sales Orders", originalFilename: "sample-sales-orders.csv", sourceKind: "sample", fileKey: stored.key, storageUrl: stored.url, mimeType: "text/csv", bytes: buffer.length, status: "ready", rowCount: parsed.profile.rowCount, columnCount: parsed.profile.columnCount, profile: parsed.profile as any, schema: parsed.schema as any });
      await db.recordAnalysisEvent({ userId: ctx.user.id, datasetId, eventType: "sample_dataset_created", durationMs: 0, metadata: { questions: sampleQuestions.length } as any });
      return { datasetId, existing: false };
    }),
    delete: protectedProcedure.input(datasetInput).mutation(async ({ ctx, input }) => {
      await db.deleteDatasetForUser(ctx.user.id, input.datasetId);
      return { success: true };
    }),
  }),
  conversations: router({
    list: protectedProcedure.input(datasetInput).query(({ ctx, input }) => db.listConversations(ctx.user.id, input.datasetId)),
    getMessages: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const conversation = await db.conversationForUser(ctx.user.id, input.conversationId);
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      return db.listMessages(input.conversationId);
    }),
    create: protectedProcedure.input(z.object({ datasetId: z.number().int().positive(), title: z.string().min(1).max(255) })).mutation(async ({ ctx, input }) => {
      const dataset = await db.getDatasetForUser(ctx.user.id, input.datasetId);
      if (!dataset) throw new TRPCError({ code: "NOT_FOUND", message: "Dataset not found." });
      return { conversationId: await db.createConversation({ userId: ctx.user.id, datasetId: input.datasetId, title: input.title }) };
    }),
  }),
  analysis: router({
    ask: protectedProcedure.input(z.object({ datasetId: z.number().int().positive(), question: z.string().trim().min(3).max(1000), conversationId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const started = Date.now();
      const { dataset, parsed } = await getParsedDataset(ctx.user.id, input.datasetId);
      let conversationId = input.conversationId;
      if (conversationId) {
        const conversation = await db.conversationForUser(ctx.user.id, conversationId);
        if (!conversation || conversation.datasetId !== input.datasetId) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found for this dataset." });
      } else {
        conversationId = await db.createConversation({ userId: ctx.user.id, datasetId: dataset.id, title: input.question.slice(0, 90) });
      }
      const messages = await db.listMessages(conversationId);
      const previousRuns = (await db.listAnalysisRuns(ctx.user.id, dataset.id)).filter(run => run.conversationId === conversationId).slice(0, 4);
      const history = [
        ...messages.slice(-8).map(message => `${message.role}: ${message.content}`),
        ...previousRuns.map(run => `prior analysis: ${run.question}; result summary: ${JSON.stringify(run.result).slice(0, 900)}`),
      ];
      await db.addMessage({ conversationId, role: "user", content: input.question });
      try {
        const output = await analyzeQuestion({ question: input.question, records: parsed.records, schema: parsed.schema, history });
        const analysisRunId = await db.createAnalysisRun({ userId: ctx.user.id, datasetId: dataset.id, conversationId, question: input.question, answer: output.answer, generatedSql: output.details.generatedSql, safeSql: output.safeSql, status: "succeeded", toolsUsed: output.details.toolsUsed as any, columnsUsed: output.details.columnsUsed as any, result: output.result as any, visualization: output.visualization as any, analysisDetails: output.details as any, metrics: output.metrics as any, durationMs: output.metrics.totalMs });
        await db.addMessage({ conversationId, analysisRunId, role: "assistant", content: output.answer });
        if (output.metrics.retryCount > 0) await db.recordAnalysisEvent({ userId: ctx.user.id, datasetId: dataset.id, analysisRunId, eventType: "analysis_retry", durationMs: 0, metadata: { retryCount: output.metrics.retryCount } as any });
        await db.recordAnalysisEvent({ userId: ctx.user.id, datasetId: dataset.id, analysisRunId, eventType: "analysis_succeeded", durationMs: Date.now() - started, metadata: { sqlMs: output.metrics.sqlMs, retryCount: output.metrics.retryCount, tools: output.details.toolsUsed } as any });
        return { ...output, analysisRunId, conversationId };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Analysis failed. Please try a different question.";
        await db.recordAnalysisEvent({ userId: ctx.user.id, datasetId: dataset.id, eventType: "analysis_failed", durationMs: Date.now() - started, metadata: { message } as any });
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),
    list: protectedProcedure.input(z.object({ datasetId: z.number().int().positive().optional() })).query(({ ctx, input }) => db.listAnalysisRuns(ctx.user.id, input.datasetId)),
    get: protectedProcedure.input(z.object({ analysisRunId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const run = await db.getAnalysisRunForUser(ctx.user.id, input.analysisRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found." });
      return run;
    }),
  }),
  insights: router({
    list: protectedProcedure.query(({ ctx }) => db.listInsights(ctx.user.id)),
    save: protectedProcedure.input(z.object({ analysisRunId: z.number().int().positive(), title: z.string().trim().min(1).max(255), note: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      const run = await db.getAnalysisRunForUser(ctx.user.id, input.analysisRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found." });
      return { insightId: await db.createInsight({ userId: ctx.user.id, analysisRunId: input.analysisRunId, title: input.title, note: input.note ?? null }) };
    }),
    delete: protectedProcedure.input(z.object({ insightId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await db.deleteInsightForUser(ctx.user.id, input.insightId);
      return { success: true };
    }),
  }),
  overview: router({
    get: protectedProcedure.query(({ ctx }) => db.getOverview(ctx.user.id)),
    sampleQuestions: protectedProcedure.query(() => sampleQuestions),
    health: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "This operational view is available to administrators only." });
      return db.getOperationalHealth();
    }),
  }),
});

export type AppRouter = typeof appRouter;
