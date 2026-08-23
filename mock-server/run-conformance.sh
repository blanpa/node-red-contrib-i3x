#!/usr/bin/env bash
#
# Run the official i3X 1.0 Conformance Test Suite against the bundled reference
# mock server.
#
# The suite lives in the CESMII spec repository and is not published to npm, so
# it is fetched (sparse, shallow) into .conformance/ on first use and reused
# afterwards. Set I3X_SPEC_REF to test against a different spec revision.
#
#   ./mock-server/run-conformance.sh          # full run
#   I3X_SPEC_REF=1.0 ./mock-server/run-conformance.sh
#
# Exits non-zero when the mock is not fully compliant.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC_REPO="${I3X_SPEC_REPO:-https://github.com/cesmii/i3X.git}"
SPEC_REF="${I3X_SPEC_REF:-1.0}"
CHECKOUT="$REPO_ROOT/.conformance/i3x-spec"
SUITE="$CHECKOUT/conformance-tests"
PORT="${I3X_MOCK_PORT:-8331}"

if [ ! -d "$SUITE" ]; then
  echo "==> Fetching the i3X conformance suite ($SPEC_REPO @ $SPEC_REF)"
  rm -rf "$CHECKOUT"
  mkdir -p "$(dirname "$CHECKOUT")"
  git clone --depth 1 --branch "$SPEC_REF" --filter=blob:none --sparse \
    "$SPEC_REPO" "$CHECKOUT"
  git -C "$CHECKOUT" sparse-checkout set conformance-tests
fi

echo "==> Starting the reference mock server on port $PORT"
PORT="$PORT" I3X_STREAM=on node "$REPO_ROOT/mock-server/server.js" &
MOCK_PID=$!
trap 'kill "$MOCK_PID" 2>/dev/null || true' EXIT

# Wait for the mock to accept requests (max ~10s).
for _ in $(seq 1 50); do
  if node -e "fetch('http://127.0.0.1:$PORT/v1/info').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

echo "==> Running the conformance suite"
node "$SUITE/bin/i3x-test.js" run "http://127.0.0.1:$PORT/v1" "$@"
