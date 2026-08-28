#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_ROOT="$(cd "$REPO_ROOT/../htmltrust-browser-client" 2>/dev/null && pwd || true)"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required." >&2
  exit 2
fi
if [[ -z "$CLIENT_ROOT" || ! -f "$CLIENT_ROOT/package.json" ]]; then
  echo "Expected htmltrust-browser-client beside this checkout." >&2
  echo "Clone it at: $(dirname "$REPO_ROOT")/htmltrust-browser-client" >&2
  exit 2
fi

CHECKOUT_ID="$(printf '%s\n%s' "$REPO_ROOT" "$CLIENT_ROOT" | cksum | awk '{print $1}')"
NPM_CACHE="htmltrust-browser-${CHECKOUT_ID}-npm"

docker run --rm \
  --volume "$REPO_ROOT:/source/browser-reference:ro" \
  --volume "$CLIENT_ROOT:/source/browser-client:ro" \
  --volume "$NPM_CACHE:/root/.npm" \
  node:22-bookworm sh -euc '
    mkdir -p /work/htmltrust-browser-reference /work/htmltrust-browser-client
    (cd /source/browser-reference && tar --exclude=node_modules --exclude=build -cf - .) \
      | (cd /work/htmltrust-browser-reference && tar -xf -)
    (cd /source/browser-client && tar --exclude=node_modules --exclude=build -cf - .) \
      | (cd /work/htmltrust-browser-client && tar -xf -)

    cd /work/htmltrust-browser-client
    npm ci --ignore-scripts --no-audit --no-fund
    npm run build

    cd /work/htmltrust-browser-reference
    npm ci --ignore-scripts --no-audit --no-fund
    npm test -- --runInBand
    npm run typecheck
    npm run lint
    npm run build:all
  '
