import "dotenv/config";

const required = ["DATABASE_URL", "JWT_SECRET", "LOCAL_AUTH_EMAIL", "LOCAL_AUTH_PASSWORD"];
const missing = required.filter(key => !process.env[key] || process.env[key].includes("replace-with"));
if (missing.length) {
  console.error(`Missing or placeholder configuration: ${missing.join(", ")}`);
  process.exit(1);
}
if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY.includes("replace-with")) {
  console.warn("LLM_API_KEY is not configured; deterministic SQL-backed fallback analysis will be used.");
}
console.log("Local configuration contains all required application values.");
