# Aegis-Alpha Current Implementation Status

## Phase 2 Update — Composable Factors and Research Execution

### Latest Error Check — 2026-09-08

- Resolved frontend TypeScript diagnostics by replacing deprecated `es5`
	target and `node` module resolution with `es2017` and `bundler` in
	`frontend/tsconfig.json`.
- Editor diagnostics for the TypeScript configuration: clear.
- Full Python suite: `154 passed, 1 warning`.
- Frontend production build: passed.
- Remaining warning: existing React hook dependency warning in
	`frontend/src/app/signals/page.tsx`; it does not block the build.

The first Phase 2 subsystem is integrated on top of the Phase 1 vertical slice:

- Added `FactorEngine` with deterministic momentum, volatility, volume surprise,
	SMA deviation, RSI, and sentiment-z factors.
- News Momentum signals now expose factor values, weights, contributions, and
	contributing-factor names while preserving the Phase 1 action rule.
- Extended the shared backtest engine with bounded position sizing, configurable
	holding periods, benchmark comparison support, annualization configuration,
	and entry/exit/trade statistics.
- Upgraded the company chart technical overlay with EMA, RSI, and MACD in
	addition to the existing SMA and Bollinger bands. BUY/SELL marker tooltips
	include factor contributions and article provenance.
- Live API verification confirms factor attribution and backtest controls are
	present in the running Aegis stack.

Validation for this subsystem: 53 signals-package tests passed, 42 focused
factor/strategy/backtest tests passed, 154 full-suite tests passed, Ruff and
mypy passed, and the frontend production build passed. The current AAPL dataset still has one article and
produces an honest HOLD/no-trade result; no performance was manipulated.

Next Phase 2 item: expose factor configuration and attribution in the research
workflow, then add structured financial event extraction as a persisted feature.

## Phase 1 Vertical Slice Update — 2026-09-08

The first news-to-signal vertical slice is now wired end to end for company
symbols:

- Real provider news is fetched by the worker, deduplicated, entity-resolved,
	persisted in `canonical_articles`, and exposed through `/api/news/*`.
- Canonical article polarity is normalized by a point-in-time rolling z-score.
	The score uses only observations available before the article. Sparse symbols
	use an explicitly labelled global canonical-news baseline rather than
	fabricating same-symbol history.
- `NewsMomentumStrategy` combines sentiment z-score and prior completed-bar
	momentum into BUY/SELL/HOLD, score, confidence, rationale, and source article
	IDs.
- `/api/news-momentum/{symbol}` returns real candles and chart-ready signals;
	company charts render BUY/SELL markers with article provenance.
- `/api/news-momentum/{symbol}/backtest` reuses the same strategy output and
	existing cost/slippage backtest engine with timestamp precision normalized.

Live AAPL trace verified on the local stack: one real persisted HSBC/Apple
article resolved to `AAPL`, PIT sentiment z-score `-0.2309`, prior momentum
`-0.00285`, and `HOLD`. The shared backtest returned five real market
observations, zero trades, and flat performance. This is an honest result, not
an optimization claim: the current database has only one AAPL article, so more
history is required before a meaningful trade sample exists.

Validation completed: focused strategy/API tests pass, frontend production
build passes, and the live API/worker/database Docker stack is running. The
existing Signals hook dependency warning remains unrelated to this slice.

**Audit date:** 2026-09-08  
**Repository:** `finance-project-jules`  
**Scope:** Read-only reconciliation of the actual repository against `AEGIS_MASTER_TECHNICAL_BLUEPRINT.md`, `PROJECT_STATUS.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `ROADMAP.md`, `STABILIZATION_REPORT.md`, `INFRASTRUCTURE_DEBT.md`, `SIGNAL_ENGINE.md`, `EXPERIMENTATION_ENGINE.md`, and `VISION.md`.

This document is an evidence-based status snapshot. The code and tests are authoritative where they contradict older documentation. No source code, configuration, or test files were modified to produce this report.

## Executive Summary

The repository is a functioning Aegis-Alpha alpha platform, not an empty scaffold. The following areas are implemented and exercised: FastAPI health/system/market/company/news/macro/signal/portfolio/experiment/event endpoints; TimescaleDB-oriented SQLAlchemy storage models; market/news/macro sensors; a scheduled worker; deterministic signal/backtest primitives; experiment persistence and comparison; and a multi-page Next.js frontend.

The largest gap is between the current alpha implementation and the institutional guarantees in the blueprint. The system has useful vertical slices, but it does not yet provide end-to-end point-in-time-safe backtesting, production-grade factor models, migration-managed schema evolution, authenticated/rate-limited APIs, distributed event delivery, a knowledge graph, institutional charting, or autonomous research workflows.

## Verification Baseline

Evidence observed in the repository:

- Python test inventory: 17 test modules under `apps/` and `packages/`.
- Latest full-suite result observed during this audit context: `132 passed, 1 warning` from `uv run pytest -q`.
- API test result observed: `78 passed, 1 warning`.
- Macro endpoint result observed: `15 passed`.
- Frontend production build observed successful with Next.js 15.3.4 and 12 routes generated.
- Root `pnpm dev` now forwards to the `frontend` workspace; a smoke test returned HTTP 200 on a development port.

These are implementation checks, not proof that all blueprint requirements are complete.

## COMPLETE

### 1. API and service foundation

**Evidence**

- FastAPI application and route definitions: `apps/api/aegis_api/main.py`
- Pydantic response/request contracts: `apps/api/aegis_api/schemas.py`
- Dockerized API/worker/database/Redis services: `infrastructure/docker-compose.yml`
- Local runner and shutdown scripts: `run.sh`, `stop.sh`
- API tests: `apps/api/tests/`

**Implemented surface**

- Health and system status endpoints.
- Signal history and backtest endpoints.
- Experiment CRUD, cloning, execution, history, and comparison endpoints.
- Event log endpoint.
- Market ticker and historical candle endpoints.
- Company intelligence endpoint.
- Portfolio scenario endpoint.
- News and macro endpoints described below.

### 2. News normalization, persistence, worker ingestion, and REST API

**Evidence**

- Provider adapters and canonical models: `packages/sensors/aegis_sensors/providers/`
- Deduplication: `packages/sensors/aegis_sensors/deduplication.py`
- Entity resolution: `packages/sensors/aegis_sensors/entity_resolution.py`
- Worker pipeline: `apps/worker/aegis_worker/news_pipeline.py`
- Worker scheduling: `apps/worker/aegis_worker/main.py`
- ORM models: `packages/storage/aegis_storage/models/news.py`
- Repository: `packages/storage/aegis_storage/repositories/news.py`
- API routes: `apps/api/aegis_api/main.py`
- Tests: `apps/api/tests/test_news_endpoints.py`, `packages/sensors/tests/test_news_providers.py`, `packages/sensors/tests/test_deduplication.py`

**Implemented surface**

- Marketaux, Alpha Vantage, Finnhub, and GDELT provider adapters.
- Normalized article provenance and canonical article models.
- URL/title deduplication and cluster membership.
- Static entity/ticker resolution and article entity extraction.
- Raw article, canonical article, and cluster-member persistence.
- Latest-news, symbol-filtered-news, and cluster-detail endpoints.
- Point-in-time `available_at` fields on persisted news records.

**Documentation correction:** The opening audit sections of the blueprint and older status tables describe this functionality as absent or isolated. That is contradicted by the current worker, storage, API, and tests.

### 3. Basic macro ingestion and regime API

**Evidence**

- FRED provider: `packages/sensors/aegis_sensors/providers/fred.py`
- Worker pipeline: `apps/worker/aegis_worker/macro_pipeline.py`
- Macro model: `packages/storage/aegis_storage/models/macro.py`
- Macro repository: `packages/storage/aegis_storage/repositories/macro.py`
- API routes: `apps/api/aegis_api/main.py`
- Tests: `apps/api/tests/test_macro_endpoints.py`

**Implemented surface**

- FRED series ingestion for the configured macro identifiers.
- Macro observation persistence with `(series_id, observation_date)` uniqueness.
- Null-value filtering for unreleased observations.
- Yield-curve slope and inversion response.
- Four-quadrant regime classification based on UNRATE/CPI trajectories.
- Series history endpoint with limit and PIT `available_at` fields.

**Documentation correction:** `PROJECT_STATUS.md` and the blueprint's older matrix mark macro/regime functionality as missing. The current code, 15 dedicated endpoint tests, and `/macro` frontend page show the alpha observatory exists. Advanced blueprint visualization and live transport remain incomplete.

### 4. Macro Observatory frontend

**Evidence**

- Page: `frontend/src/app/macro/page.tsx`
- Navigation: `frontend/src/app/layout.tsx`
- API client: `frontend/src/lib/api.ts`

**Implemented surface**

- Yield-curve slope/inversion summary with 10Y, 2Y, Fed funds, and credit-spread cards.
- Deterministic regime summary with growth/inflation directions and methodology.
- Historical FRED series trend plots for the configured macro identifiers.
- Loading, API error, and empty/unavailable states.
- Observation and PIT `available_at` timestamps surfaced in the UI.

The page is a functional frontend slice over the existing backend contracts. It does not claim the full blueprint's advanced macro regime visualization or live WebSocket transport.

### 4. Experiment registry and research UI foundation

**Evidence**

- Domain models and registry: `packages/experimentation/aegis_experimentation/`
- Persistence models/repository: `packages/storage/aegis_storage/models/experimentation.py`, `packages/storage/aegis_storage/repositories/experimentation.py`
- API tests: `apps/api/tests/test_experiments.py`
- UI: `frontend/src/app/experiments/page.tsx`, `frontend/src/app/research/page.tsx`

**Implemented surface**

- Experiment definition creation and retrieval.
- Run persistence and run history.
- Cloning with overrides.
- Side-by-side comparison.
- Single-asset research/backtest workflow with cost/slippage inputs.
- Metric and equity-curve presentation.

### 5. Basic market ingestion and equity candle fallback

**Evidence**

- Market sensor: `packages/sensors/aegis_sensors/market.py`
- Market routes and provider fallback logic: `apps/api/aegis_api/main.py`
- Tests: `apps/api/tests/test_candle_history.py`, `packages/sensors/tests/test_market_sensor.py`

**Implemented surface**

- Coinbase crypto spot/candle access.
- Finnhub equity quote/candle access when available.
- Yahoo Finance fallback for equity candles.
- Explicit candle fallback metadata and graceful empty results when both providers fail.
- Crypto failure behavior remains distinct from equity fallback behavior.

**Documentation correction:** The blueprint's older claim that equity candle requests always fail with HTTP 502 is stale; the fallback implementation is present and tested.

### 6. Basic event bus and persistence foundation

**Evidence**

- Bus: `packages/events/aegis_events/bus.py`
- Event models: `packages/events/aegis_events/models.py`
- Persistence handler: `packages/events/aegis_events/persistence.py`
- Storage models: `packages/storage/aegis_storage/models/events.py`
- Tests: `packages/events/tests/test_event_bus.py`, `packages/events/tests/test_event_persistence.py`

**Implemented surface**

- Typed event models and subscriber registration.
- Subscriber failure isolation.
- In-process event dispatch.
- Event persistence handler and event log storage model.

### 7. Versioned schema and development runtime

**Evidence**

- Alembic environment: `packages/storage/migrations/env.py`
- Initial revision: `packages/storage/migrations/versions/0001_initial_schema.py`
- API startup migration: `apps/api/Dockerfile`
- Local runtime migration: `run.sh`, `seed.py`
- Timescale models: `packages/storage/aegis_storage/models/news.py`, `packages/storage/aegis_storage/models/macro.py`

**Implemented surface**

- All current ORM models are registered with Alembic metadata.
- The initial revision reconciles databases created by the old startup `create_all()` path and creates the news/macro tables and hypertables.
- News and macro hypertable keys include their partition columns, preserving TimescaleDB uniqueness requirements.
- API containers apply `alembic upgrade head` before Uvicorn starts.
- The development database is at revision `0001_initial_schema`; repeated upgrades are idempotent.
- Docker API, worker, PostgreSQL/TimescaleDB, and Redis services run together.

The migration foundation is COMPLETE for the current schema baseline. Future model changes still require new revisions.

## PARTIAL

### 1. Signal engine and factor quality

**Evidence**

- Engine: `packages/signals/aegis_signals/engine.py`
- Processors: `packages/signals/aegis_signals/processors.py`
- Worker integration: `apps/worker/aegis_worker/main.py`
- Analytics: `packages/signals/aegis_signals/analytics.py`
- Tests: `packages/signals/tests/`

**Implemented**

- Processor registration and deterministic computation interface.
- BTC momentum, mean-reversion, and Reddit sentiment processors.
- Rolling analytics helpers.
- Signal lineage fields including source event IDs and correlation IDs.
- Signal persistence integration.

**Remaining**

- BTC momentum still uses a simplistic baseline formula in `processors.py`.
- Worker signal computation supplies one-row frames in `apps/worker/aegis_worker/main.py`; mean reversion therefore lacks meaningful rolling history.
- Reddit sentiment is currently fixed-center normalization, not a rolling statistical z-score; its worker input is one aggregate Reddit batch and is not symbol-specific.
- No institutional multi-factor synthesis, cross-sectional normalization, regime-aware models, or signal decay monitoring.

### 2. Backtesting and PIT correctness

**Evidence**

- Backtest engine: `packages/signals/aegis_signals/backtest.py`
- API backtest route: `apps/api/aegis_api/main.py`
- Tests: `packages/signals/tests/test_backtest.py`

**Implemented**

- Cost/slippage deduction.
- Equity curve, Sharpe, Sortino, CAGR, Calmar, drawdown, turnover, and win-rate metrics.
- Basic next-bar labeling and deterministic unit tests.
- Price-based strategies derive symbol-specific signals from real candles when stored observations for that symbol are unavailable; Reddit sentiment correctly refuses unsupported symbols instead of being reused silently.

**Remaining**

- The engine hard-codes daily annualization (`252.0`) even when fed intraday candles.
- The API aligns price data to signal timestamps, but the end-to-end path does not enforce the blueprint's `available_at` barrier for every signal input.
- Execution is close-to-close oriented; there is no explicit next-bar-open/OHLC execution model.
- Single-asset backtests only.
- No walk-forward validation, Monte Carlo analysis, survivorship/delisting handling, or dataset/commit hashing.

### 3. Event architecture

**Evidence**

- `packages/events/aegis_events/bus.py`
- `apps/worker/aegis_worker/main.py`
- `infrastructure/docker-compose.yml`
- `apps/api/aegis_api/main.py`

**Implemented**

- In-process event dispatch and persistence foundation.
- Redis service availability in infrastructure and health reporting.

**Remaining**

- Redis Streams is not the dispatch backend.
- Events can be lost during process failure before persistence completes.
- The repository retains more than one event model style.
- Some worker ingestion persistence remains manually coupled rather than fully bus-driven.
- No bounded queue/backpressure or replay service is implemented.

### 4. Frontend workspaces and visualization

**Evidence**

- Pages: `frontend/src/app/`
- API URL helper: `frontend/src/lib/api.ts`
- Charts: `frontend/src/app/components/SentimentPriceChart.tsx`, `frontend/src/app/components/EquityCurveChart.tsx`

**Implemented**

- Command Center, signals, research, experiments, portfolio, companies, news, timeline, and health pages.
- Centralized configurable API base URL.
- Basic canvas/chart visualizations, including a server-side Yahoo fallback for equity symbols when the API provider path is rate-limited.

**Remaining**

- No WebSocket live monitoring.
- No command-terminal overlay or terminal API.
- The charting component is not the specified TradingView-grade system with drawings, Fibonacci, synchronized panes, event pills, or regime shading.
- UI number formatting is inconsistent with the strict two-significant-figure requirement.

### 5. Market and company intelligence

**Evidence**

- Routes: `apps/api/aegis_api/main.py`
- Pages: `frontend/src/app/companies/`, `frontend/src/app/portfolio/page.tsx`

**Implemented**

- Live/fallback quote and company profile/fundamental retrieval.
- Portfolio weight validation, weighted shocks, and per-holding provenance.
- AAPL, TSLA, and NVDA chart history now falls back to real Yahoo daily OHLCV through `frontend/src/app/api/market-history/[symbol]/route.ts` when backend intraday providers are unavailable.

**Remaining**

- Quote failure still falls back to static values such as `AAPL: 305.59` and `BTC: 64200.0` in `apps/api/aegis_api/main.py`, which conflicts with the blueprint's data-honesty rule.
- Portfolio lab has no predefined macro/commodity stress presets or historical risk decomposition.
- Company intelligence has no DCF valuation, thesis builder, or SEC filings timeline.

## MISSING

### 1. Knowledge graph

No entity-node/entity-edge models, graph repository, graph API, or graph UI were found under `packages/`, `apps/`, or `frontend/`. The Company → Security → Event → News → Sentiment → Factor graph remains blueprint-only.

### 2. Institutional backtesting extensions

No implementation was found for:

- Walk-forward validation.
- Parameter grid sweeps.
- Monte Carlo/bootstrap simulation.
- Survivorship and delisting controls.
- Multi-asset portfolio backtesting.
- Explicit execution venue/open-price models.

Relevant existing baseline: `packages/signals/aegis_signals/backtest.py` and `packages/experimentation/aegis_experimentation/`.

### 3. Autonomous AI researcher and research reports

No autonomous hypothesis loop, vector retrieval layer, verified research synthesis workflow, research report persistence, or report UI was found. The blueprint sections describing these remain specifications only.

### 4. Command terminal and real-time transport

No `/api/terminal` or `/api/v1/terminal` route, command palette/terminal overlay, WebSocket server, or frontend WebSocket client was found. `ROADMAP.md` also lists real-time WebSocket monitoring as unfinished.

## TECHNICAL DEBT

### 1. Authentication and rate limiting

**Evidence:** `apps/api/aegis_api/main.py`

Authentication, authorization, and request rate limiting are absent. State-changing experiment and portfolio endpoints are unauthenticated. External provider credentials are read directly by handlers/providers. The API is not yet suitable for an exposed production gateway.

### 2. Provider resilience and quota handling

**Evidence:** `packages/sensors/aegis_sensors/providers/base.py`, `packages/sensors/aegis_sensors/providers/registry.py`

Provider health/failure tracking exists, but the blueprint's full circuit breaker, retry/backoff, quota-aware scheduling, and 15-minute bypass behavior are not implemented or not consistently enforced.

### 3. Storage constraints and event model fragmentation

**Evidence:** `packages/storage/aegis_storage/models/events.py`, `packages/events/aegis_events/models.py`, `packages/sensors/aegis_sensors/base.py`

The repository contains legacy and newer event abstractions. TimescaleDB partition-key/unique-key constraints are now represented in the news and macro models, but same-timestamp event collision and deterministic ordering risks remain documented in `STABILIZATION_REPORT.md` and `INFRASTRUCTURE_DEBT.md`.

### 4. Migration coverage and deployment drift

**Evidence:** `packages/storage/migrations/versions/0001_initial_schema.py`, `packages/storage/migrations/env.py`, `apps/api/Dockerfile`, `run.sh`

The initial versioned schema migration now covers all current ORM models and is applied before API startup. The migration baseline reconciles databases created by the old `create_all()` path, but future model changes still require explicit follow-up revisions. Worker cycle integration coverage remains limited.

### 5. Worker lifecycle and integration coverage

**Evidence:** `apps/worker/aegis_worker/main.py`, `apps/worker/aegis_worker/news_pipeline.py`, `apps/worker/aegis_worker/macro_pipeline.py`, `apps/worker/tests/test_worker_startup.py`

Worker startup is tested, but full news/macro ingestion cycles are not covered by end-to-end mocked database tests. The previous `canonical_articles` runtime drift was fixed through the versioned migration and the live worker now persists news clusters successfully.

### 6. Security configuration drift

**Evidence:** `apps/api/aegis_api/main.py`

CORS is now environment-configurable through `AEGIS_CORS_ORIGINS`, so older documentation claiming `allow_origins=["*"]` is stale. Authentication and rate limiting remain absent. Production configuration must explicitly set allowed origins rather than relying on local defaults.

### 7. UI compliance and dependency debt

**Evidence:** `frontend/src/app/layout.tsx`, `frontend/package.json`, frontend pages under `frontend/src/app/`

- Emoji navigation remains in `layout.tsx` despite the UI standard banning it.
- `lucide-react` is not installed.
- Number formatting uses varied fixed decimal places rather than a shared two-significant-figure formatter.
- Basic charts remain custom canvas implementations rather than the specified institutional charting engine.

### 8. Documentation drift and repository hygiene

**Evidence:** `PROJECT_STATUS.md`, `AEGIS_MASTER_TECHNICAL_BLUEPRINT.md`, `ARCHITECTURE.md`, `STABILIZATION_REPORT.md`, `ROADMAP.md`

- Several documents describe completed news, macro, and equity fallback work as missing.
- `PROJECT_STATUS.md` both marks the news UI complete and repeats it as a next priority.
- Verification dates and test counts are inconsistent across documents.
- `ARCHITECTURE.md` describes WebSockets and integrated authentication/rate limiting as if present, while the code and roadmap show them unfinished.
- The working tree contains extensive uncommitted implementation/documentation changes; release provenance should be established before production deployment.

## Documentation Reconciliation

| Document claim | Actual repository status |
|---|---|
| News providers are isolated with no persistence/API | Contradicted. Worker ingestion, news models, repositories, routes, and tests exist. |
| Macro observatory/backend is missing | Contradicted for the current alpha slice. Macro provider, worker, storage, regime/yield routes, tests, and `/macro` frontend page exist; advanced blueprint visualization remains incomplete. |
| Equity candle endpoint has no fallback | Contradicted. Yahoo fallback and dedicated tests exist. |
| Frontend API URLs are hardcoded | Mostly contradicted. `frontend/src/lib/api.ts` centralizes the base URL. |
| Event bus publisher blocks | Stale according to current `packages/events/aegis_events/bus.py`, which uses asynchronous task dispatch; event persistence/distributed delivery still need work. |
| Architecture has WebSockets/auth/rate limiting | Aspirational, not implemented in the current route/frontend inventory. |

## Recommended Priority Order

1. Remove static quote fallbacks and return explicit unavailable responses with structured provenance.
2. Repair end-to-end PIT backtesting and explicit execution timing before adding more factor complexity.
3. Replace toy processors with tested multi-factor, multi-asset, regime-aware models.
4. Add API authentication, authorization, and rate limiting.
5. Add worker cycle integration tests and a real replay/distributed event path.
6. Expand the macro observatory with advanced regime visualization after backend contracts mature.
7. Add institutional charting, terminal, knowledge graph, and autonomous researcher capabilities after provenance and reproducibility foundations are complete.

## Development Runtime

From the repository root:

```bash
docker compose -f infrastructure/docker-compose.yml up -d db redis
./run.sh
```

`run.sh` waits for PostgreSQL, runs `alembic upgrade head`, seeds the database, and starts the local API, worker, and Next.js development server. For the containerized API/worker path, rebuild after source changes with:

```bash
docker compose -f infrastructure/docker-compose.yml up -d --build api worker
```

The API container runs `alembic upgrade head` before Uvicorn. The frontend is available at `http://localhost:3000` when free, or the next available Next.js port when port 3000 is occupied.
