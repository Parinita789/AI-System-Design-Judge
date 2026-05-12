#!/usr/bin/env bash
#
# Map one backend module via graphify + flatten.py.
#
# Usage:
#   agents/graphify/map-module.sh <module-name> [graphify-extract-flags...]
#
# Examples:
#   agents/graphify/map-module.sh build-sessions
#   agents/graphify/map-module.sh evaluations --max-concurrency 1
#   MODEL=claude-sonnet-4-6 agents/graphify/map-module.sh llm
#
# Three things happen in order:
#   1. `graphify extract` against backend/src/<resolved-path> →
#      writes raw symbol-level graph to agents/graphify/<name>/graphify-out/
#   2. `flatten.py <out>`              → file-level tree HTML
#   3. `flatten.py <out> --high-level` → behavioral-files-only tree HTML
#
# Re-running is idempotent: graphify reuses the same out dir;
# flatten.py overwrites its outputs.

set -euo pipefail

MODULE="${1:?usage: $0 <module-name> [extra graphify args...]}"
shift || true

MODEL="${MODEL:-claude-sonnet-4-5}"

# Path resolution. NestJS modules live under src/modules/<name>;
# the three top-level infra dirs are direct children of src/;
# eval-harness and scripts are outside src/ entirely.
case "$MODULE" in
  common|config|database)  SRC_PATH="src/$MODULE" ;;
  eval-harness|scripts)    SRC_PATH="$MODULE" ;;
  *)                       SRC_PATH="src/modules/$MODULE" ;;
esac

# Resolve repo root from this script's location so the script works
# regardless of which dir the user invoked it from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
OUT_DIR="$REPO_ROOT/agents/graphify/$MODULE"

if [ ! -d "$BACKEND_DIR/$SRC_PATH" ]; then
  echo "error: $BACKEND_DIR/$SRC_PATH does not exist" >&2
  exit 1
fi

echo "==> graphify extract ./$SRC_PATH  (model: $MODEL)"
(
  cd "$BACKEND_DIR"
  graphify extract "./$SRC_PATH" \
    --backend claude \
    --model "$MODEL" \
    --out "$OUT_DIR" \
    "$@"
)

echo "==> flatten (file-level)"
"$SCRIPT_DIR/flatten.py" "$OUT_DIR"

echo "==> flatten (high-level)"
"$SCRIPT_DIR/flatten.py" "$OUT_DIR" --high-level

echo
echo "Done. Open one of:"
echo "  open $OUT_DIR/graphify-out/GRAPH_TREE_high-level.html"
echo "  open $OUT_DIR/graphify-out/GRAPH_TREE_files.html"
echo "  open $OUT_DIR/graphify-out/GRAPH_REPORT.md"
