# Database and migrations

MySQL 8 stores users, dataset metadata, profiles, conversations, messages, analysis runs, saved insights, and operational events. Source file bytes stay in `STORAGE_DIR`; rows are materialized into an in-memory DuckDB table only while analysis executes.

The committed schema lives in `drizzle/schema.ts`. `drizzle/0001_odd_firelord.sql` creates the analytical tables and `drizzle/0002_keen_bloodaxe.sql` adds foreign-key ownership and cleanup rules. Apply a fresh database with `pnpm db:migrate`. Make schema changes in TypeScript, run `pnpm db:generate`, inspect the SQL, then run `pnpm db:migrate`.

The sample CSV is not inserted directly into MySQL. Use the in-app **Use sample sales data** control after local sign-in; it stores a user-owned copy and metadata using the same path as real uploads.
