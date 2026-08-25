FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY . .
RUN uv sync --frozen --no-dev --package aegis-api
ENV PYTHONPATH=/app/apps/api
CMD ["uv", "run", "--no-sync", "python", "-m", "aegis_api.main"]
