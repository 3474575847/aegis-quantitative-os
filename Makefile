.PHONY: run stop test lint seed clean help

help:
	@echo "Aegis-Alpha Commands:"
	@echo "  make run        - Start entire platform (Docker DB, API, Worker, Frontend)"
	@echo "  make stop       - Stop all running processes"
	@echo "  make stop-all   - Stop all running processes and Docker containers"
	@echo "  make test       - Run Python test suite with pytest"
	@echo "  make lint       - Run Ruff and Mypy checks"
	@echo "  make seed       - Seed database with mock signals and experiment records"

run:
	@./run.sh

stop:
	@./stop.sh

stop-all:
	@./stop.sh --docker

test:
	uv run pytest

lint:
	uv run ruff check .
	uv run mypy .

seed:
	docker compose -f infrastructure/docker-compose.yml up -d db redis
	uv run python seed.py
