FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY . .
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ENV UV_NATIVE_TLS=1
RUN uv sync --frozen --no-dev --package aegis-api
ENV PYTHONPATH=/app/apps/api
CMD ["sh", "-c", "uv run --no-sync --package aegis-storage alembic -c packages/storage/alembic.ini upgrade head && uv run --no-sync python -m aegis_api.main"]
