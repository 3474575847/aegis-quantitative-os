FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY . .
RUN uv sync --frozen --no-dev --package aegis-worker
ENV PYTHONPATH=/app/apps/worker
CMD ["uv", "run", "--no-sync", "python", "-m", "aegis_worker.main"]
