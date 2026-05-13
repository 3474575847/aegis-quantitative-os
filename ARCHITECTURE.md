# Aegis-Alpha: Architecture

## System Overview
Aegis-Alpha is a distributed, event-driven quantitative research system. It follows the principles of Clean Architecture and Domain-Driven Design to separate business logic from infrastructure concerns.

## 1. Event-Driven Core
The heartbeat of Aegis-Alpha is a typed, immutable event stream.
- **Event Schema**: Defined using Pydantic for strict runtime validation.
- **Persistence**: All events are stored in an append-only historical log (TimescaleDB hypertable).
- **Replay**: Logic is designed to be deterministic, allowing the system to "time-travel" by replaying event logs through signal processors.
- **Future-Proofing**: Internal message passing is abstracted to support migration to Kafka or NATS as throughput requirements scale.

## 2. Sensor Framework
Sensors are the entry point for all external data.
- **BaseSensor**: An abstract base class defining the `fetch → normalize → validate → emit` lifecycle.
- **Async Implementation**: Fully non-blocking I/O using Python's `asyncio`.
- **Mock Mode**: Sensors support a deterministic mock mode for local development and integration testing.
- **Resilience**: Built-in exponential backoff retries and circuit breaking for external API dependencies.

## 3. Data Layer
Leveraging PostgreSQL with the TimescaleDB extension for high-performance time-series data.
- **Hypertables**: Used for event streams and price data to optimize time-based queries.
- **Schema Strategy**: UUID primary keys for global uniqueness.
- **Immutability**: Historical data is never updated; new versions are appended with a timestamp, preserving the audit trail.
- **Compression**: Automated TimescaleDB compression policies for aging data.

## 4. Signal Engine
The engine transforms raw events into alpha-generating signals.
- **Factor Scoring**: A modular system for calculating and combining factors.
- **Z-Score Normalization**: Built-in cross-sectional and time-series normalization.
- **Correlation Analysis**: Real-time monitoring of signal decay and correlation.
- **Pipelines**: Defined as Directed Acyclic Graphs (DAGs) to ensure deterministic execution order.

## 5. Backtesting System
A high-fidelity simulation environment.
- **Reproducibility**: Uses the same signal code as production, fed by historical event logs.
- **Metrics**: Automated calculation of Sharpe Ratio, Max Drawdown, and Rolling Returns.
- **Slippage & Impact**: Configurable models for market impact and execution costs.

## 6. Observability Layer
Integrated telemetry for system health and research quality.
- **Metrics**: Prometheus exporters for system latency, sensor health, and signal drift.
- **Logging**: Structured JSON logging across all services.
- **Tracing**: OpenTelemetry support for tracing events through the pipeline.

## 7. API Layer (FastAPI)
- **Design**: RESTful API with versioning (e.g., `/v1/...`).
- **Performance**: High-concurrency support with Uvicorn/Gunicorn.
- **Middleware**: Integrated authentication, rate-limiting, and request/response logging.

## 8. Frontend (Command Center)
- **Framework**: Next.js 15 with App Router.
- **Communication**: Real-time updates via WebSockets for live signal monitoring.
- **Visualization**: Specialized charting libraries for financial time-series.

## 9. Monorepo Structure
```bash
/
├── apps/
│   ├── api/            # FastAPI Service
│   └── worker/         # Event Processing & Sensors
├── packages/
│   ├── core/           # Domain Models & Logic
│   ├── sensors/        # Data Ingestion Framework
│   ├── signals/        # Signal & Factor Engine
│   ├── storage/        # DB Access & Hypertables
│   ├── events/         # Event Schemas & Bus
│   └── observability/  # Metrics & Logging
├── frontend/           # Next.js Command Center
├── infrastructure/     # Docker, Terraform, K8s
└── docs/               # Architecture & Specifications
```
