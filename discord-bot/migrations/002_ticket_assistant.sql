-- Ticket AI assistant state (mute after owner reply, conversation history)
ALTER TABLE discord_tickets
  ADD COLUMN IF NOT EXISTS assistant_muted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE discord_tickets
  ADD COLUMN IF NOT EXISTS assistant_history JSONB NOT NULL DEFAULT '[]'::jsonb;
