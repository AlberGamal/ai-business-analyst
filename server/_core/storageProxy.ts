import type { Express } from "express";
import path from "node:path";
import { storageRead } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/api/storage/*splat", async (req, res) => {
    const captured = req.params.splat;
    const key = Array.isArray(captured) ? captured.join("/") : captured ?? "";
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    try {
      const data = await storageRead(key);
      const extension = path.extname(key).toLowerCase();
      const type = extension === ".csv" ? "text/csv" : extension === ".xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/octet-stream";
      res.set({ "Cache-Control": "private, no-store", "Content-Type": type }).send(data);
    } catch {
      res.status(404).send("Stored file not found");
    }
  });
}
