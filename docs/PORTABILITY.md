# Portability inventory

| Previous managed dependency | Local replacement | Operator action |
| --- | --- | --- |
| Hosted OAuth portal | Local credential sign-in and signed session cookie | Set `LOCAL_AUTH_*` and `JWT_SECRET`. |
| Hosted relational database | MySQL 8.4 via local install or Docker Compose | Set `DATABASE_URL`, then run `pnpm db:migrate`. |
| Forge object storage | Filesystem adapter under `STORAGE_DIR` | Keep `data/` local and excluded from Git. |
| Forge LLM proxy | Configurable OpenAI-compatible chat-completions endpoint | Set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`. |
| Managed Vite runtime/debug collector | Standard Vite + Express integration | No platform plugin, domain allowlist, or preview token is required. |
| Managed notification, map, image, and voice helpers | Removed because they were unused by this analytics application | Add independent providers only if those product features are later introduced. |

The local credential session supports independent development but is not a shared production identity provider. Use the callback boundary documented in `LOCAL_DEVELOPMENT.md` when integrating Auth0, Azure AD, Google, Keycloak, or another OIDC provider. An LLM provider remains an external dependency; no model API key is included in source control.
