export const ENV = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  storageDir: process.env.STORAGE_DIR ?? "./data/uploads",
  localAuthEmail: (process.env.LOCAL_AUTH_EMAIL ?? "").trim().toLowerCase(),
  localAuthName: process.env.LOCAL_AUTH_NAME ?? "Local Analyst",
  localAuthPassword: process.env.LOCAL_AUTH_PASSWORD ?? "",
  localAuthRole: process.env.LOCAL_AUTH_ROLE === "user" ? "user" as const : "admin" as const,
  llmBaseUrl: (process.env.LLM_BASE_URL ?? "https://api.openai.com").replace(/\/$/, ""),
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  isProduction: process.env.NODE_ENV === "production",
};
