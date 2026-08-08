#!/bin/sh
set -eu

echo "[entrypoint] Running database migrations…"
node dist/db/migrate.js

echo "[entrypoint] Starting Caedral Discord bot…"
exec node dist/index.js
