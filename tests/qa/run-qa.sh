#!/usr/bin/env bash
# Momentum QA Runner — convenience wrapper
#
# Usage:
#   ./tests/qa/run-qa.sh
#   QA_EMAIL=you@example.com QA_PASSWORD=secret ./tests/qa/run-qa.sh
#   ./tests/qa/run-qa.sh --headful
#   ./tests/qa/run-qa.sh --skip=/routes,/openclaw-setup
#
# Environment variables:
#   QA_BASE_URL    App URL (default: http://localhost:5000)
#   QA_EMAIL       Account email for authenticated sweep
#   QA_PASSWORD    Account password for authenticated sweep

set -e
cd "$(dirname "$0")/../.."

echo "Running Momentum QA sweep..."
npx tsx tests/qa/index.ts "$@"
