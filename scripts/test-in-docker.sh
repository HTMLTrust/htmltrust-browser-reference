#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required." >&2
  exit 2
fi

CHECKOUT_ID="$(printf '%s\n' "$REPO_ROOT" | cksum | awk '{print $1}')"
NPM_CACHE="htmltrust-browser-${CHECKOUT_ID}-npm"

docker run --rm \
  --volume "$REPO_ROOT:/source/browser-reference:ro" \
  --volume "$NPM_CACHE:/root/.npm" \
  node:22-bookworm sh -euc '
    mkdir -p /work/htmltrust-browser-reference
    (cd /source/browser-reference && tar --exclude=node_modules --exclude=build -cf - .) \
      | (cd /work/htmltrust-browser-reference && tar -xf -)

    cd /work/htmltrust-browser-reference
    npm ci --ignore-scripts=false --no-audit --no-fund
    npm test -- --runInBand
    npm run typecheck
    npm run lint
    npm run build:all
  '
