-- Todo + timer schema. Safe to run more than once.
CREATE TABLE IF NOT EXISTS todos (
  id               SERIAL PRIMARY KEY,
  title            TEXT NOT NULL,
  done             BOOLEAN NOT NULL DEFAULT false,
  total_seconds    INTEGER NOT NULL DEFAULT 0,
  timer_started_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrades an older todos table (id, title, created_at) in place.
ALTER TABLE todos ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS total_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ;
