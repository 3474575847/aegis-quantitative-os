# Aegis-Alpha: Roadmap

This roadmap outlines the phased development of the Aegis-Alpha quantitative research engine.

## Phase 1: Foundations (The Scaffolding)

_Goal: Establish the monorepo, event system, and base abstractions._

- [ ] Initialize Monorepo (Pnpm Workspaces).
- [ ] Implement `packages/events` (Pydantic models, internal bus abstraction).
- [ ] Implement `packages/observability` (Structured logging, Prometheus metrics).
- [ ] Define `packages/sensors` (BaseSensor abstract classes).
- [ ] Setup Dockerized development environment with PostgreSQL + TimescaleDB.

## Phase 2: Ingestion & Storage (The Data Pipeline)

_Goal: Build the first functional sensor and persistent storage layer._

- [ ] Implement `packages/storage` (SQLAlchemy models, TimescaleDB hypertable setup).
- [ ] Build `MarketPriceSensor` (Reference implementation).
- [ ] Build `EconomicIndicatorSensor` (Alternative data ingestion).
- [ ] Implement event persistence worker.
- [ ] Initial FastAPI service for health checks and data inspection.

## Phase 3: Intelligence (The Signal Engine)

_Goal: Transform raw data into structured financial signals._

- [ ] Implement `packages/signals` (Factor scoring framework).
- [ ] Build Signal Processing Worker.
- [ ] Implement Z-Score and Correlation analysis modules.
- [ ] Create Signal Replay utility for historical data.

## Phase 4: Verification (The Research Platform)

_Goal: Backtesting and high-fidelity simulation._

- [ ] Build Backtesting Engine (Historical event log processor).
- [ ] Implement Performance Metrics module (Sharpe, Drawdown, etc.).
- [ ] Build the Command Center (Frontend) initial signal dashboard.
- [ ] Integrate real-time signal monitoring via WebSockets.

## Phase 5: Autonomy (Agent Integration)

_Goal: Enable autonomous agents to interact with the research pipeline._

- [ ] Expose Research API for agent consumption.
- [ ] Implement Signal Proposal API (allowing agents to define new factors).
- [ ] Automated validation and backtesting of agent-proposed signals.
- [ ] Advanced observability for agent-driven system changes.

## Event System Evolution

- [x] Initial In-Memory Event Bus (Foundation)
- [ ] Redis Streams integration for distributed event routing.
- [ ] Full Replay Engine for historical research simulation.
- [ ] Real-time event visualization in the Command Center.

## Signal Engine Evolution

- [x] Foundational Signal Engine (deterministic pipelines)
- [x] Rolling Analytics Library (NumPy/Pandas)
- [ ] Multi-asset factor scoring system.
- [ ] Cross-sectional signal normalization.
- [ ] Real-time signal decay monitoring.
