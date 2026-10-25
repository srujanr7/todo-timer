// backend/server.js
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// Use SSL only when the connection string asks for it
function buildPoolConfig(rawUrl) {
  const url = new URL(rawUrl);
  const sslmode = (url.searchParams.get("sslmode") || "").toLowerCase();
  const sslParam = (url.searchParams.get("ssl") || "").toLowerCase();
  const needsSsl =
    ["require", "verify-ca", "verify-full", "prefer"].includes(sslmode) ||
    ["true", "1"].includes(sslParam);

  if (!needsSsl) return { connectionString: rawUrl };

  url.searchParams.delete("sslmode");
  url.searchParams.delete("ssl");
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } };
}

const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
pool.on("error", (err) => console.error("Unexpected Postgres pool error:", err));

// Elapsed time is computed in SQL so the server and DB clocks never disagree
const TODO_COLUMNS = `
  id, title, done, total_seconds, timer_started_at, created_at,
  (timer_started_at IS NOT NULL) AS running,
  total_seconds + COALESCE(EXTRACT(EPOCH FROM (now() - timer_started_at))::int, 0) AS elapsed_seconds
`;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.get("/health", (req, res) => res.json({ ok: true }));

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid id." });
    return null;
  }
  return id;
}

// List todos
app.get("/api/todos", wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${TODO_COLUMNS} FROM todos ORDER BY done ASC, created_at DESC, id DESC`
  );
  res.json(rows);
}));

// Create a todo { title }
app.post("/api/todos", wrap(async (req, res) => {
  const { title } = req.body || {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "'title' is required." });
  }
  const { rows } = await pool.query(
    `INSERT INTO todos (title) VALUES ($1) RETURNING ${TODO_COLUMNS}`,
    [title.trim().slice(0, 200)]
  );
  res.status(201).json(rows[0]);
}));

// Update a todo { title?, done? }. Marking done also stops its timer.
app.patch("/api/todos/:id", wrap(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const { title, done } = req.body || {};

  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return res.status(400).json({ error: "'title' must be a non-empty string." });
  }
  if (done !== undefined && typeof done !== "boolean") {
    return res.status(400).json({ error: "'done' must be a boolean." });
  }

  const { rows } = await pool.query(
    `UPDATE todos SET
       title = COALESCE($2, title),
       done = COALESCE($3, done),
       total_seconds = CASE WHEN $3 = true AND timer_started_at IS NOT NULL
         THEN total_seconds + EXTRACT(EPOCH FROM (now() - timer_started_at))::int
         ELSE total_seconds END,
       timer_started_at = CASE WHEN $3 = true THEN NULL ELSE timer_started_at END
     WHERE id = $1
     RETURNING ${TODO_COLUMNS}`,
    [id, title === undefined ? null : title.trim().slice(0, 200), done === undefined ? null : done]
  );
  if (!rows.length) return res.status(404).json({ error: "Todo not found." });
  res.json(rows[0]);
}));

// Start a todo's timer. Only one timer runs at a time, so others are stopped.
app.post("/api/todos/:id/start", wrap(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE todos SET
         total_seconds = total_seconds + EXTRACT(EPOCH FROM (now() - timer_started_at))::int,
         timer_started_at = NULL
       WHERE timer_started_at IS NOT NULL AND id <> $1`,
      [id]
    );
    const { rows } = await client.query(
      `UPDATE todos SET timer_started_at = COALESCE(timer_started_at, now()), done = false
       WHERE id = $1 RETURNING ${TODO_COLUMNS}`,
      [id]
    );
    await client.query("COMMIT");
    if (!rows.length) return res.status(404).json({ error: "Todo not found." });
    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}));

// Stop a todo's timer and add the elapsed time to its total
app.post("/api/todos/:id/stop", wrap(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const { rows } = await pool.query(
    `UPDATE todos SET
       total_seconds = total_seconds + COALESCE(EXTRACT(EPOCH FROM (now() - timer_started_at))::int, 0),
       timer_started_at = NULL
     WHERE id = $1 RETURNING ${TODO_COLUMNS}`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "Todo not found." });
  res.json(rows[0]);
}));

// Reset a todo's tracked time to zero
app.post("/api/todos/:id/reset", wrap(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const { rows } = await pool.query(
    `UPDATE todos SET total_seconds = 0, timer_started_at = NULL
     WHERE id = $1 RETURNING ${TODO_COLUMNS}`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "Todo not found." });
  res.json(rows[0]);
}));

// Delete a todo
app.delete("/api/todos/:id", wrap(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const { rowCount } = await pool.query("DELETE FROM todos WHERE id = $1", [id]);
  if (!rowCount) return res.status(404).json({ error: "Todo not found." });
  res.status(204).end();
}));

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Apply database/schema.sql on boot. It is idempotent, so this is safe on every restart.
async function ensureSchema() {
  const file = path.join(__dirname, "..", "database", "schema.sql");
  if (!fs.existsSync(file)) return;
  await pool.query(fs.readFileSync(file, "utf8"));
  console.log("Schema ready");
}

const PORT = process.env.PORT || 3000;
let server;

ensureSchema()
  .catch((err) => console.error("Schema setup failed (continuing):", err.message))
  .finally(() => {
    server = app.listen(PORT, () => console.log(`Todo Timer listening on port ${PORT}`));
  });

function shutdown() {
  if (!server) return process.exit(0);
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
