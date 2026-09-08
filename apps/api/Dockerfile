FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY . .
RUN uv sync --frozen --no-dev --package aegis-api
ENV PYTHONPATH=/app/apps/api
CMD ["sh", "-c", "uv run --no-sync --package aegis-storage alembic -c packages/storage/alembic.ini upgrade head && uv run --no-sync python -m aegis_api.main"]
