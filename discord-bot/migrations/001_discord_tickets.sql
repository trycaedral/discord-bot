-- Discord bot ticket + transcript storage
CREATE TABLE IF NOT EXISTS discord_tickets (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL UNIQUE,
  opener_discord_id TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  transcript TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS discord_tickets_opener_idx ON discord_tickets (opener_discord_id);
CREATE INDEX IF NOT EXISTS discord_tickets_status_idx ON discord_tickets (status);
