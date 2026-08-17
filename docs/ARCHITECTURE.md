# Architecture

The codebase intentionally keeps the existing full-stack layout: `client/` contains the React dashboard, `server/` contains Express, tRPC, storage, sessions, analytics, and database helpers, `drizzle/` contains the MySQL schema and migrations, and `sample-data/` contains reproducible onboarding assets.

The browser communicates only with `/api/trpc` using credentialed requests. The server authenticates the signed local session, scopes every database helper by user ID, reads the selected user-owned dataset from `STORAGE_DIR`, profiles it, and creates a temporary in-memory DuckDB table for analytical work. File bytes are never stored in MySQL.

```mermaid
sequenceDiagram
  participant U as User
  participant C as React client
  participant R as tRPC router
  participant M as MySQL
  participant F as Filesystem storage
  participant D as DuckDB
  participant L as Configured LLM
  U->>C: Ask a business question
  C->>R: analysis.ask(datasetId, question)
  R->>F: Read user-owned file
  R->>D: Create isolated in-memory dataset
  R->>L: Request structured plan (bounded)
  R->>D: Execute validated SELECT/CTE
  R->>M: Persist question, result, SQL, stages, metrics
  R-->>C: Answer + chart payload + Analysis Details
```
