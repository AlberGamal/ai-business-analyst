# AI workflow

The orchestration service follows a constrained sequence: query understanding, schema/availability validation, plan generation, SQL safety validation, embedded DuckDB execution, visualization selection, insight synthesis, and persistence. The model receives schema and compact result context; it does not receive database credentials or direct database access.

Only one isolated table named `dataset` exists during execution. The SQL guard permits one `SELECT` statement or CTE scoped to that table and blocks mutation, DDL, comments, multiple statements, filesystem scans, external reads, and system functions. SQL validation occurs before DuckDB receives the query.

Every model call has a short deadline. If a planner times out, errors, produces unsupported SQL, or generates an invalid plan, the application attempts one deterministic recovery based on actual column names and values. If the requested metric or dimension does not exist, it returns a limitation instead of an unrelated answer. `Analysis Details` exposes the model-generated SQL, validated SQL, referenced columns, stages, execution rows, tools, and timings.
