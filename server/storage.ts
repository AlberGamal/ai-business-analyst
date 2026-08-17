import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENV } from "./_core/env";

function storageRoot() {
  return path.resolve(process.cwd(), ENV.storageDir);
}

function normalizeKey(relKey: string) {
  const key = relKey.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!key || key.split("/").some(part => part === "..")) throw new Error("Invalid storage key.");
  return key;
}

function fullPath(relKey: string) {
  const root = storageRoot();
  const target = path.resolve(root, normalizeKey(relKey));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Storage path escapes the configured upload directory.");
  return target;
}

function appendHashSuffix(relKey: string) {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const extension = path.posix.extname(relKey);
  return extension ? `${relKey.slice(0, -extension.length)}_${suffix}${extension}` : `${relKey}_${suffix}`;
}

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, _contentType = "application/octet-stream") {
  const key = appendHashSuffix(normalizeKey(relKey));
  const target = fullPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return { key, url: `/api/storage/${key.split("/").map(encodeURIComponent).join("/")}` };
}

export async function storageRead(relKey: string) {
  return readFile(fullPath(relKey));
}

export async function storageGet(relKey: string) {
  const key = normalizeKey(relKey);
  return { key, url: `/api/storage/${key.split("/").map(encodeURIComponent).join("/")}` };
}
