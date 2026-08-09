-- Structured (JSON) transcript alongside the plain-text one, so the HTML
-- log page can render a real chat emulation instead of a flat text dump.
ALTER TABLE discord_tickets
  ADD COLUMN IF NOT EXISTS transcript_json JSONB;
