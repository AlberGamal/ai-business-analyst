import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const deleteDatasetForUser = vi.fn(async () => undefined);
const deleteInsightForUser = vi.fn(async () => undefined);

vi.mock("./db", () => ({ deleteDatasetForUser, deleteInsightForUser }));

const { appRouter } = await import("./routers");

function authenticatedContext(): TrpcContext {
  return {
    user: { id: 41, openId: "deletion-test-user", email: "delete@example.com", name: "Deletion Test", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("user-scoped deletion procedures", () => {
  it("passes the authenticated user ID when deleting a dataset", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.datasets.delete({ datasetId: 77 })).resolves.toEqual({ success: true });
    expect(deleteDatasetForUser).toHaveBeenCalledWith(41, 77);
  });

  it("passes the authenticated user ID when deleting a saved insight", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.insights.delete({ insightId: 88 })).resolves.toEqual({ success: true });
    expect(deleteInsightForUser).toHaveBeenCalledWith(41, 88);
  });
});
