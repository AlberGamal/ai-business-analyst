# API reference

The application uses tRPC at `/api/trpc`; frontend calls are typed from `server/routers.ts`.

| Router | Main procedures | Access |
| --- | --- | --- |
| `auth` | `me`, `localLogin`, `logout` | Public; local login creates an httpOnly session. |
| `datasets` | `list`, `get`, `upload`, `ensureSample`, `delete` | Authenticated and user-scoped. |
| `conversations` | `list`, `getMessages`, `create` | Authenticated and dataset/conversation scoped. |
| `analysis` | `ask`, `list`, `get` | Authenticated; `ask` runs the safe analytical pipeline. |
| `insights` | `list`, `save`, `delete` | Authenticated and user-scoped. |
| `overview` | `get`, `sampleQuestions`, `health` | Authenticated; health is admin-only. |

The file-serving route is `/api/storage/*`. It is private by filesystem path and is consumed server-side for analysis; it should be protected behind an authorization check before exposing direct dataset download in a multi-user production deployment.
