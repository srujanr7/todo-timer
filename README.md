# Todo Timer

A todo list where each task has its own timer. Start a task to track time on it.
Only one timer runs at a time, so starting a task pauses whichever one was running.

## Structure

```
package.json          npm start -> node backend/server.js
backend/server.js     Express API + serves the frontend
frontend/index.html   The app (plain HTML/CSS/JS)
database/schema.sql   Postgres schema (idempotent)
```

## Environment

- `DATABASE_URL` (required) is a Postgres connection string. SSL is used only if the URL
  has `sslmode=require` (or `ssl=true`).
- `PORT` (optional) defaults to 3000.

The server applies `database/schema.sql` on startup. The file is safe to run repeatedly,
and it also upgrades an older `todos (id, title, created_at)` table in place.

## API

| Method | Path                     | Body                 |
|--------|--------------------------|----------------------|
| GET    | /health                  |                      |
| GET    | /api/todos               |                      |
| POST   | /api/todos               | `{ "title": "..." }` |
| PATCH  | /api/todos/:id           | `{ "title"?, "done"? }` |
| POST   | /api/todos/:id/start     |                      |
| POST   | /api/todos/:id/stop      |                      |
| POST   | /api/todos/:id/reset     |                      |
| DELETE | /api/todos/:id           |                      |

Each todo includes `running` and `elapsed_seconds`, which includes the current run.

## Run locally

```bash
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/todos npm start
```

Open http://localhost:3000.
