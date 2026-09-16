#!/usr/bin/env bash

# Colors for terminal output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo -e "${YELLOW}Stopping Aegis-Alpha local processes...${NC}"

# Kill any lingering node/next dev, uvicorn, or worker processes on ports 3000 and 8000
pkill -f "uvicorn aegis_api.main:app" > /dev/null 2>&1 || true
pkill -f "aegis_worker.main" > /dev/null 2>&1 || true
lsof -ti:8000 | xargs kill -9 > /dev/null 2>&1 || true
lsof -ti:3000 | xargs kill -9 > /dev/null 2>&1 || true

echo -e "${GREEN}API, Worker, and Frontend processes stopped.${NC}"

if [ "$1" == "--docker" ] || [ "$1" == "-d" ] || [ "$1" == "--all" ]; then
  echo -e "${YELLOW}Stopping Docker containers...${NC}"
  docker compose -f infrastructure/docker-compose.yml down
  echo -e "${GREEN}Docker infrastructure stopped.${NC}"
else
  echo -e "${BLUE}Note: Database and Redis containers are still running in Docker.${NC}"
  echo -e "${BLUE}Pass '--docker' or '-d' to also stop Docker containers (e.g. ./stop.sh --docker).${NC}"
fi
