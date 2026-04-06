#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "[1/5] Checking virtual environment..."
if [[ ! -d "venv" ]]; then
  python -m venv venv
fi

# shellcheck disable=SC1091
source venv/bin/activate

echo "[2/5] Installing dependencies..."
pip install -r requirements.txt

echo "[3/5] Applying latest migrations..."
alembic upgrade head

echo "[4/5] Starting FastAPI server..."
echo "Docs: http://127.0.0.1:3001/docs"
echo "Health: http://127.0.0.1:3001/health"

echo "[5/5] Running uvicorn..."
exec uvicorn app.main:app --reload --port 3001
