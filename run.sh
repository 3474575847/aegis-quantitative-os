#!/usr/bin/env bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Export environment variables from .env if present
if [ -f .env ]; then
  while IFS='=' read -r key value || [ -n "$key" ]; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [ -z "$key" ] && continue
    key=$(echo "$key" | tr -d '[:space:]')
    value=$(echo "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    export "$key=$value"
  done < .env
fi

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}      Aegis-Alpha Platform Runner        ${NC}"
echo -e "${BLUE}=========================================${NC}"

# 1. Start Infrastructure (TimescaleDB & Redis)
echo -e "\n${YELLOW}[1/4] Starting Docker Infrastructure (TimescaleDB & Redis)...${NC}"
docker compose -f infrastructure/docker-compose.yml up -d db redis

# Wait briefly for PostgreSQL to be ready
echo -e "Waiting for database to be ready..."
RETRIES=15
until docker compose -f infrastructure/docker-compose.yml exec -T db pg_isready -U postgres -d aegis > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
  sleep 1
  RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
  echo -e "${RED}Warning: Database took too long to respond, continuing anyway...${NC}"
else
  echo -e "${GREEN}Database is healthy and ready.${NC}"
fi

# 2. Apply versioned schema and seed data
echo -e "\n${YELLOW}[2/4] Applying Database Migrations & Seed Data...${NC}"
DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://postgres:postgres@localhost:5432/aegis}" \
  uv run --package aegis-storage alembic -c packages/storage/alembic.ini upgrade head
uv run python seed.py

# Process management for background services
PIDS=()

cleanup() {
  echo -e "\n\n${YELLOW}Shutting down Aegis-Alpha services...${NC}"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" > /dev/null 2>&1; then
      kill "$pid" > /dev/null 2>&1 || true
    fi
  done
  wait > /dev/null 2>&1 || true
  echo -e "${GREEN}All services stopped cleanly.${NC}"
  echo -e "${BLUE}Tip: To also stop docker containers, run: ./stop.sh --docker${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 3. Start Backend API & Ingestion Worker
echo -e "\n${YELLOW}[3/4] Starting Backend Services...${NC}"

echo -e "  - Launching FastAPI Server on port 8000..."
uv run --package aegis-api uvicorn aegis_api.main:app --host 0.0.0.0 --port 8000 &
PIDS+=($!)

echo -e "  - Launching Ingestion & Factor Worker..."
uv run --package aegis-worker python -m aegis_worker.main &
PIDS+=($!)

# 4. Start Next.js Frontend
echo -e "\n${YELLOW}[4/4] Starting Next.js Command Center...${NC}"
echo -e "  - Launching Frontend on port 3000..."
(cd frontend && npm run dev) &
PIDS+=($!)

echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}  Aegis-Alpha Platform is Live!          ${NC}"
echo -e "${GREEN}=========================================${NC}"
echo -e "  - Web Command Center : ${BLUE}http://localhost:3000${NC}"
echo -e "  - FastAPI Docs       : ${BLUE}http://localhost:8000/docs${NC}"
echo -e "  - System Status      : ${BLUE}http://localhost:8000/api/system/status${NC}"
echo -e "  - Health Check       : ${BLUE}http://localhost:8000/health${NC}"
echo -e "-----------------------------------------"
echo -e "${YELLOW}Press [Ctrl+C] anytime to stop all services.${NC}\n"

# Wait for all background child processes
wait
