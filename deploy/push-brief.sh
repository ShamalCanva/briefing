#!/usr/bin/env bash
# Publish a brief JSON to the live site.
#   ./push-brief.sh ../briefs/2026-10-08.json
# Reads the site URL and ingest secret from ../.deploy/ (gitignored, never committed):
#   .deploy/site_url        e.g. https://shamal-brief.fly.dev
#   .deploy/ingest.secret   the same value you set with `fly secrets set INGEST_SECRET=...`
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FILE="${1:?usage: push-brief.sh path/to/brief.json}"
SITE="$(tr -d '[:space:]' < "$HERE/../.deploy/site_url")"
SECRET="$(tr -d '[:space:]' < "$HERE/../.deploy/ingest.secret")"
curl -sS -f -X POST "$SITE/api/brief" \
  -H "content-type: application/json" \
  -H "x-ingest-secret: $SECRET" \
  --data-binary "@$FILE"
echo
