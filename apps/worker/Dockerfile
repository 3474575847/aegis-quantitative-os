FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY . .
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ENV UV_NATIVE_TLS=1
RUN uv sync --frozen --no-dev --package aegis-worker
ENV PYTHONPATH=/app/apps/worker
CMD ["uv", "run", "--no-sync", "python", "-m", "aegis_worker.main"]
