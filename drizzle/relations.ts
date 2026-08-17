import { relations } from "drizzle-orm";
import { analysisEvents, analysisRuns, conversationMessages, conversations, datasets, savedInsights, users } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  datasets: many(datasets),
  conversations: many(conversations),
  analysisRuns: many(analysisRuns),
  savedInsights: many(savedInsights),
  analysisEvents: many(analysisEvents),
}));

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
  user: one(users, { fields: [datasets.userId], references: [users.id] }),
  conversations: many(conversations),
  analysisRuns: many(analysisRuns),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  dataset: one(datasets, { fields: [conversations.datasetId], references: [datasets.id] }),
  messages: many(conversationMessages),
  analysisRuns: many(analysisRuns),
}));

export const messagesRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, { fields: [conversationMessages.conversationId], references: [conversations.id] }),
  analysisRun: one(analysisRuns, { fields: [conversationMessages.analysisRunId], references: [analysisRuns.id] }),
}));

export const analysisRunsRelations = relations(analysisRuns, ({ one, many }) => ({
  user: one(users, { fields: [analysisRuns.userId], references: [users.id] }),
  dataset: one(datasets, { fields: [analysisRuns.datasetId], references: [datasets.id] }),
  conversation: one(conversations, { fields: [analysisRuns.conversationId], references: [conversations.id] }),
  messages: many(conversationMessages),
  insights: many(savedInsights),
  events: many(analysisEvents),
}));

export const savedInsightsRelations = relations(savedInsights, ({ one }) => ({
  user: one(users, { fields: [savedInsights.userId], references: [users.id] }),
  analysisRun: one(analysisRuns, { fields: [savedInsights.analysisRunId], references: [analysisRuns.id] }),
}));

export const analysisEventsRelations = relations(analysisEvents, ({ one }) => ({
  user: one(users, { fields: [analysisEvents.userId], references: [users.id] }),
  dataset: one(datasets, { fields: [analysisEvents.datasetId], references: [datasets.id] }),
  analysisRun: one(analysisRuns, { fields: [analysisEvents.analysisRunId], references: [analysisRuns.id] }),
}));
