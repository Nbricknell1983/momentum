#!/bin/bash
# Start Momentum locally on port 5000
set -a && source .env && set +a
export PORT=5000
echo "[Momentum] Starting on port $PORT..."
echo "[Momentum] AI Systems target: $AI_SYSTEMS_BASE_URL"
npx tsx server/index.ts
