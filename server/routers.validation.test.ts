import { describe, expect, it } from "vitest";
import { appRouter, responseId } from "./routers";
import type { TrpcContext } from "./_core/context";

function authenticatedContext(): TrpcContext {
  return {
    user: { id: 1, openId: "api-validation-user", email: "api@example.com", name: "API Test", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("dataset upload API validation", () => {
  it("rejects unsupported file extensions before any storage or database operation", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.datasets.upload({ filename: "notes.pdf", mimeType: "application/pdf", base64: Buffer.from("not a spreadsheet").toString("base64") })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects protected procedure access without an authenticated user", async () => {
    const unauthenticated = appRouter.createCaller({ ...authenticatedContext(), user: null });
    await expect(unauthenticated.datasets.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects analytical questions outside the configured size and content bounds before touching storage", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.analysis.ask({ datasetId: 1, question: "x".repeat(1001) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.analysis.ask({ datasetId: 1, question: "  " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("normalizes database BigInt identifiers before a mutation response is serialized", () => {
    const response = { datasetId: responseId(900719925n), existing: true };
    expect(response.datasetId).toBe(900719925);
    expect(() => JSON.stringify(response)).not.toThrow();
  });
});
