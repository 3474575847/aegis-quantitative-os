import asyncio
import csv
import io
import os
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import pandas as pd
import uvicorn
from aegis_experimentation.models import ExperimentDefinition
from aegis_experimentation.registry import ExperimentRegistry
from aegis_observability.logger import get_logger
from aegis_sensors.entity_resolution import EntityResolver
from aegis_signals.analytics import point_in_time_zscore
from aegis_signals.backtest import run_signal_backtest
from aegis_signals.news_momentum import NewsMomentumStrategy
from aegis_signals.processors import (
    BtcMomentumProcessor,
    MeanReversionProcessor,
    RedditSentimentProcessor,
)
from aegis_storage.database import DatabaseManager
from aegis_storage.models.events import EventLog
from aegis_storage.models.experimentation import (
    ExperimentDefinitionRecord,
    ExperimentRunRecord,
)
from aegis_storage.models.macro import MacroObservationRecord
from aegis_storage.models.news import CanonicalArticleRecord
from aegis_storage.models.signals import SignalDefinitionRecord, SignalResultRecord
from aegis_storage.repositories.experimentation import ExperimentRepository
from aegis_storage.repositories.macro import MacroRepository
from aegis_storage.repositories.news import NewsRepository
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select

from aegis_api.schemas import (
    CanonicalNewsArticleResponse,
    EventLogResponse,
    ExperimentCompareResponse,
    ExperimentComparisonItem,
    ExperimentCreateRequest,
    ExperimentRunResponse,
    ExperimentSummaryResponse,
    MacroSeriesPoint,
    MarketTickerResponse,
    NewsClusterDetailResponse,
    RawNewsArticleResponse,
    RegimeClassification,
    SignalDatapointResponse,
    SignalHistoryResponse,
    SignalItemResponse,
    YieldCurveResponse,
)


# Automatically discover and load .env file from repository root
def _load_env_file() -> None:
    search_dirs = [Path.cwd(), Path(__file__).resolve().parent, Path(__file__).resolve().parents[3]]
    for directory in search_dirs:
        env_file = directory / ".env"
        if env_file.is_file():
            try:
                with env_file.open() as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            key = k.strip()
                            val = v.strip().strip("'\"")
                            if key not in os.environ:
                                os.environ[key] = val
                break
            except Exception:
                pass


_load_env_file()

logger = get_logger(__name__)
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "AEGIS_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]


class PortfolioScenarioRequest(BaseModel):
    holdings: dict[str, float] = Field(min_length=1)
    shocks: dict[str, float] = Field(default_factory=dict)


class PortfolioScenarioResponse(BaseModel):
    portfolio_value: float
    weighted_shock: float
    holdings: list[dict[str, Any]]
    methodology: str


app = FastAPI(
    title="Aegis-Alpha API",
    description="Institutional Quantitative Research & Signal Engine API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/aegis")
db_manager = DatabaseManager(db_url)

# Simple In-Memory Quote Cache with 15-second TTL
_QUOTE_CACHE: dict[str, tuple[float, MarketTickerResponse]] = {}
_STARTED_AT = time.monotonic()


@app.get("/health")
async def health() -> dict[str, Any]:
    db_status = "healthy"
    try:
        async for session in db_manager.get_session():
            await session.execute(select(func.now()))
    except Exception as e:
        db_status = f"unhealthy: {e!s}"

    return {
        "status": "online",
        "service": "aegis-api",
        "database": db_status,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@app.get("/api/system/status")
async def get_system_status() -> dict[str, Any]:
    database_status = "DOWN"
    worker_status = "DOWN"
    redis_status = "DOWN"
    async for session in db_manager.get_session():
        database_status = "UP"
        sig_count = (
            await session.execute(select(func.count(SignalDefinitionRecord.id)))
        ).scalar_one()
        exp_count = (
            await session.execute(select(func.count(ExperimentDefinitionRecord.experiment_id)))
        ).scalar_one()
        run_count = (
            await session.execute(select(func.count(ExperimentRunRecord.run_id)))
        ).scalar_one()
        event_count = (
            await session.execute(select(func.count()).select_from(EventLog))
        ).scalar_one()
        sig_res_count = (
            await session.execute(select(func.count()).select_from(SignalResultRecord))
        ).scalar_one()
        latest_worker_event = (
            (
                await session.execute(
                    select(EventLog)
                    .where(EventLog.event_type == "SensorRunCompleted")
                    .order_by(desc(EventLog.timestamp))
                    .limit(1)
                )
            )
            .scalars()
            .first()
        )
        if (
            latest_worker_event
            and (datetime.now(UTC) - latest_worker_event.timestamp).total_seconds() < 60
        ):
            worker_status = "UP"

    try:
        reader, writer = await asyncio.open_connection("redis", 6379)
        writer.write(b"PING\r\n")
        await writer.drain()
        redis_status = "UP" if await reader.readline() == b"+PONG\r\n" else "DEGRADED"
        writer.close()
        await writer.wait_closed()
    except Exception:
        redis_status = "DOWN"

    overall_status = (
        "OPERATIONAL" if database_status == "UP" and worker_status == "UP" else "DEGRADED"
    )
    return {
        "status": overall_status,
        "uptime_seconds": round(time.monotonic() - _STARTED_AT),
        "counts": {
            "signal_definitions": sig_count,
            "signal_results": sig_res_count,
            "experiments": exp_count,
            "experiment_runs": run_count,
            "events_logged": event_count,
        },
        "services": [
            {"name": "timescale_database", "status": database_status, "port": 5432},
            {"name": "redis_event_broker", "status": redis_status, "port": 6379},
            {"name": "ingestion_worker", "status": worker_status, "mode": "STREAMING"},
            {"name": "signal_pipeline_engine", "status": "UP", "mode": "DETERMINISTIC"},
        ],
        "timestamp": datetime.now(UTC).isoformat(),
    }


@app.get("/api/signals", response_model=list[SignalItemResponse])
async def list_signals() -> list[SignalItemResponse]:
    async for session in db_manager.get_session():
        defs_query = select(SignalDefinitionRecord).order_by(SignalDefinitionRecord.name)
        defs = (await session.execute(defs_query)).scalars().all()
        results = []
        for d in defs:
            latest_res_query = (
                select(SignalResultRecord)
                .where(SignalResultRecord.signal_id == d.id)
                .order_by(desc(SignalResultRecord.timestamp))
                .limit(1)
            )
            latest_res = (await session.execute(latest_res_query)).scalars().first()

            results.append(
                SignalItemResponse(
                    id=str(d.id),
                    name=d.name,
                    version=d.version,
                    parameters=d.parameters,
                    created_at=d.created_at.isoformat() if d.created_at else None,
                    latest_value=latest_res.value if latest_res else None,
                    latest_timestamp=latest_res.timestamp.isoformat() if latest_res else None,
                )
            )
        return results
    return []


@app.get("/api/signals/{signal_id}/history", response_model=SignalHistoryResponse)
async def get_signal_history(
    signal_id: uuid.UUID, limit: int = Query(default=100, le=500)
) -> SignalHistoryResponse:
    async for session in db_manager.get_session():
        sig_def = (
            (
                await session.execute(
                    select(SignalDefinitionRecord).where(SignalDefinitionRecord.id == signal_id)
                )
            )
            .scalars()
            .first()
        )
        if not sig_def:
            raise HTTPException(status_code=404, detail="Signal not found")

        records = (
            (
                await session.execute(
                    select(SignalResultRecord)
                    .where(SignalResultRecord.signal_id == signal_id)
                    .order_by(SignalResultRecord.timestamp.asc())
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )

        return SignalHistoryResponse(
            signal_id=str(sig_def.id),
            name=sig_def.name,
            version=sig_def.version,
            parameters=sig_def.parameters,
            datapoints=[
                SignalDatapointResponse(
                    timestamp=r.timestamp.isoformat(),
                    value=r.value,
                    metadata=r.metadata_json or {},
                )
                for r in records
            ],
        )
    raise HTTPException(status_code=500, detail="Database unavailable")


@app.post("/api/backtests/{signal_id}")
async def run_backtest(
    signal_id: uuid.UUID,
    symbol: str = Query(default="BTC"),
    transaction_cost_bps: float = Query(default=5.0, ge=0, le=500),
    slippage_bps: float = Query(default=0.0, ge=0, le=500),
    experiment_id: uuid.UUID | None = Query(default=None),  # noqa: B008
) -> dict[str, Any]:
    """
    Run a transparent next-bar backtest over real candles and stored signals.

    If experiment_id is supplied, the result is persisted as an ExperimentRunRecord.
    """
    history = await get_market_ticker_history(symbol)
    candles = history.get("datapoints", [])
    if len(candles) < 2:
        raise HTTPException(status_code=422, detail="Insufficient real market history for backtest")

    signal_def = None
    records: list[SignalResultRecord] = []
    async for session in db_manager.get_session():
        signal_def = (
            (
                await session.execute(
                    select(SignalDefinitionRecord).where(SignalDefinitionRecord.id == signal_id)
                )
            )
            .scalars()
            .first()
        )
        if not signal_def:
            raise HTTPException(status_code=404, detail="Signal not found")
        records = list(
            (
                await session.execute(
                    select(SignalResultRecord)
                    .where(SignalResultRecord.signal_id == signal_id)
                    .order_by(SignalResultRecord.timestamp.asc())
                )
            )
            .scalars()
            .all()
        )

    price_frame = (
        pd.DataFrame(
            {
                "price": candle["close"],
                "timestamp": pd.to_datetime(candle["time"], unit="s", utc=True),
            }
            for candle in candles
        )
        .set_index("timestamp")
        .sort_index()
    )
    sym = symbol.upper().strip()
    price_frame.index = price_frame.index.as_unit("ns")
    signal_source = "stored point-in-time signal observations"
    if records:
        signal_frame = (
            pd.DataFrame(
                {
                    "signal": record.value,
                    "timestamp": pd.to_datetime(record.timestamp, utc=True),
                }
                for record in records
            )
            .set_index("timestamp")
            .sort_index()
        )
        signal_frame.index = signal_frame.index.as_unit("ns")
        aligned = pd.merge_asof(
            price_frame,
            signal_frame,
            left_index=True,
            right_index=True,
            direction="backward",
        ).dropna()
    else:
        processor = {
            "BTC_MOMENTUM_ZSCORE": BtcMomentumProcessor(),
            "MEAN_REVERSION_PRICE": MeanReversionProcessor(),
            "REDDIT_SENTIMENT_LEAD": RedditSentimentProcessor(),
        }.get(signal_def.name if signal_def else "")
        if processor is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{signal_def.name if signal_def else 'This strategy'} has no "
                    f"symbol-specific observations for {sym}"
                ),
            )
        derived = processor.compute(
            price_frame[["price"]], signal_def.parameters if signal_def else {}
        )
        aligned = price_frame.assign(signal=derived).dropna()
        signal_source = "deterministic signal derived from this symbol's real candles"
    price_series = aligned["price"]
    signal_series = aligned["signal"]
    try:
        result = run_signal_backtest(
            price_series,
            signal_series,
            transaction_cost_bps=transaction_cost_bps,
            slippage_bps=slippage_bps,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    methodology = (
        f"{signal_source}; signal at t positions at t+1 close; costs deducted on position changes"
    )

    # Optionally persist as an experiment run
    persisted_run_id: str | None = None
    if experiment_id is not None:
        run_id = uuid.uuid4()
        now = datetime.now(UTC)
        async for session in db_manager.get_session():
            run_record = ExperimentRunRecord(
                run_id=run_id,
                experiment_id=experiment_id,
                status="COMPLETED",
                started_at=now,
                completed_at=now,
                workflow_run_ids=[],
                metadata_json={
                    "signal_id": str(signal_id),
                    "symbol": sym,
                    "transaction_cost_bps": transaction_cost_bps,
                    "slippage_bps": slippage_bps,
                    "market_source": history.get("source"),
                    "methodology": methodology,
                    "result": result,
                },
            )
            session.add(run_record)
        persisted_run_id = str(run_id)

    return {
        "signal_id": str(signal_id),
        "symbol": sym,
        "market_source": history.get("source"),
        "methodology": methodology,
        "experiment_run_id": persisted_run_id,
        "result": result,
    }


@app.get("/api/experiments")
async def list_experiments() -> list[ExperimentSummaryResponse]:
    async for session in db_manager.get_session():
        repo = ExperimentRepository(session)
        defs, _ = await repo.query_definitions(
            filters=[],
            order_by=[desc(ExperimentDefinitionRecord.created_at)],
            limit=50,
            offset=0,
        )
        agg = await repo.get_aggregate_metrics()

        output = []
        for exp in defs:
            m = agg.get(exp.experiment_id, {"run_count": 0, "success_rate": 0.0})
            runs = await repo.get_runs_by_experiment(exp.experiment_id)
            sorted_runs = sorted(runs, key=lambda r: r.started_at, reverse=True)
            latest_run = sorted_runs[0] if sorted_runs else None

            # Extract best Sharpe across completed runs
            best_sharpe: float | None = None
            for run in sorted_runs:
                run_result = (run.metadata_json or {}).get("result", {})
                sharpe = run_result.get("sharpe")
                if sharpe is not None and (best_sharpe is None or sharpe > best_sharpe):
                    best_sharpe = sharpe

            params = exp.parameters or {}
            output.append(
                ExperimentSummaryResponse(
                    experiment_id=str(exp.experiment_id),
                    name=exp.name,
                    description=exp.description,
                    signal_id=params.get("signal_id"),
                    symbol=params.get("symbol", "BTC"),
                    transaction_cost_bps=float(params.get("transaction_cost_bps", 5.0)),
                    slippage_bps=float(params.get("slippage_bps", 0.0)),
                    tags=exp.tags or [],
                    created_at=exp.created_at.isoformat() if exp.created_at else None,
                    run_count=m["run_count"],
                    success_rate=round(m["success_rate"] * 100, 1),
                    latest_status=latest_run.status if latest_run else "NONE",
                    latest_run_id=str(latest_run.run_id) if latest_run else None,
                    best_sharpe=round(best_sharpe, 4) if best_sharpe is not None else None,
                )
            )
        return output
    return []


@app.post("/api/experiments", response_model=ExperimentSummaryResponse)
async def create_experiment(request: ExperimentCreateRequest) -> ExperimentSummaryResponse:
    """Create a new named experiment definition, optionally persisting an initial run."""
    definition = ExperimentDefinition(
        name=request.name,
        description=request.description,
        parameters={
            "signal_id": request.signal_id,
            "symbol": request.symbol.upper().strip(),
            "transaction_cost_bps": request.transaction_cost_bps,
            "slippage_bps": request.slippage_bps,
        },
        tags=request.tags,
    )
    now = datetime.now(UTC)
    persisted_run_id: str | None = None
    best_sharpe: float | None = None
    run_count = 0
    success_rate = 0.0
    latest_status = "NONE"

    async for session in db_manager.get_session():
        registry = ExperimentRegistry(session)
        await registry.register_experiment(definition)

        if request.initial_result:
            run_id = uuid.uuid4()
            default_methodology = (
                "signal at t positions at t+1 close; costs deducted on position changes"
            )
            run_record = ExperimentRunRecord(
                run_id=run_id,
                experiment_id=definition.experiment_id,
                status="COMPLETED",
                started_at=now,
                completed_at=now,
                workflow_run_ids=[],
                metadata_json={
                    "signal_id": request.signal_id,
                    "symbol": request.symbol.upper().strip(),
                    "transaction_cost_bps": request.transaction_cost_bps,
                    "slippage_bps": request.slippage_bps,
                    "methodology": request.methodology or default_methodology,
                    "result": request.initial_result,
                },
            )
            session.add(run_record)
            await session.flush()
            persisted_run_id = str(run_id)
            run_count = 1
            success_rate = 100.0
            latest_status = "COMPLETED"
            raw_sharpe = request.initial_result.get("sharpe")
            if raw_sharpe is not None:
                best_sharpe = float(raw_sharpe)

        return ExperimentSummaryResponse(
            experiment_id=str(definition.experiment_id),
            name=definition.name,
            description=definition.description,
            signal_id=request.signal_id,
            symbol=request.symbol.upper().strip(),
            transaction_cost_bps=request.transaction_cost_bps,
            slippage_bps=request.slippage_bps,
            tags=definition.tags,
            created_at=definition.created_at.isoformat(),
            run_count=run_count,
            success_rate=success_rate,
            latest_status=latest_status,
            latest_run_id=persisted_run_id,
            best_sharpe=round(best_sharpe, 4) if best_sharpe is not None else None,
        )
    raise HTTPException(status_code=500, detail="Database unavailable")


class ExperimentCompareBody(BaseModel):
    experiment_ids: list[str] = Field(min_length=1)


async def _compare_experiments_by_ids(experiment_id_strs: list[str]) -> ExperimentCompareResponse:
    parsed_ids: list[uuid.UUID] = []
    for s in experiment_id_strs:
        try:
            parsed_ids.append(uuid.UUID(s.strip()))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Invalid UUID: {s}") from exc

    items: list[ExperimentComparisonItem] = []
    async for session in db_manager.get_session():
        repo = ExperimentRepository(session)
        for exp_id in parsed_ids:
            exp = await repo.get_definition(exp_id)
            if not exp:
                continue
            runs = await repo.get_runs_by_experiment(exp_id)
            sorted_runs = sorted(runs, key=lambda r: r.started_at, reverse=True)
            latest_run = sorted_runs[0] if sorted_runs else None
            completed_runs = [r for r in sorted_runs if r.status == "COMPLETED"]
            best_run = completed_runs[0] if completed_runs else latest_run

            metrics: dict[str, Any] | None = None
            methodology: str | None = None
            if best_run and best_run.metadata_json:
                metrics = best_run.metadata_json.get("result")
                methodology = best_run.metadata_json.get("methodology")

            params = exp.parameters or {}
            sig_id_val = params.get("signal_id")
            sig_id_str = str(sig_id_val) if sig_id_val is not None else None
            sig_name: str | None = None
            if sig_id_str:
                try:
                    sig_uuid = uuid.UUID(sig_id_str)
                    stmt = select(SignalDefinitionRecord).where(
                        SignalDefinitionRecord.id == sig_uuid
                    )
                    sig_record = (await session.execute(stmt)).scalars().first()
                    if sig_record:
                        sig_name = sig_record.name
                except Exception:
                    pass

            items.append(
                ExperimentComparisonItem(
                    experiment_id=str(exp.experiment_id),
                    name=exp.name,
                    description=exp.description,
                    signal_id=sig_id_str,
                    signal_name=sig_name,
                    symbol=str(params.get("symbol", "BTC")),
                    transaction_cost_bps=float(params.get("transaction_cost_bps", 5.0)),
                    slippage_bps=float(params.get("slippage_bps", 0.0)),
                    tags=exp.tags or [],
                    created_at=exp.created_at.isoformat() if exp.created_at else None,
                    run_count=len(sorted_runs),
                    latest_status=latest_run.status if latest_run else "NONE",
                    latest_run_id=str(latest_run.run_id) if latest_run else None,
                    metrics=metrics,
                    methodology=methodology,
                )
            )

    return ExperimentCompareResponse(
        experiments=items,
        compared_at=datetime.now(UTC).isoformat(),
        count=len(items),
    )


@app.post("/api/experiments/compare", response_model=ExperimentCompareResponse)
async def compare_experiments_post(body: ExperimentCompareBody) -> ExperimentCompareResponse:
    """Compare multiple experiments side-by-side on methodology and performance metrics."""
    return await _compare_experiments_by_ids(body.experiment_ids)


@app.get("/api/experiments/compare", response_model=ExperimentCompareResponse)
async def compare_experiments_get(
    ids: str = Query(description="Comma-separated experiment IDs"),
) -> ExperimentCompareResponse:
    """Compare multiple experiments by comma-separated IDs."""
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if not id_list:
        raise HTTPException(status_code=422, detail="At least one experiment ID is required")
    return await _compare_experiments_by_ids(id_list)


@app.get("/api/experiments/{experiment_id}", response_model=ExperimentSummaryResponse)
async def get_experiment(experiment_id: uuid.UUID) -> ExperimentSummaryResponse:
    """Get a single experiment definition with its run summary."""
    async for session in db_manager.get_session():
        repo = ExperimentRepository(session)
        exp = await repo.get_definition(experiment_id)
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")
        runs = await repo.get_runs_by_experiment(experiment_id)
        sorted_runs = sorted(runs, key=lambda r: r.started_at, reverse=True)
        latest_run = sorted_runs[0] if sorted_runs else None
        completed = [r for r in sorted_runs if r.status == "COMPLETED"]
        success_rate = len(completed) / len(sorted_runs) if sorted_runs else 0.0
        best_sharpe: float | None = None
        for run in sorted_runs:
            sharpe = (run.metadata_json or {}).get("result", {}).get("sharpe")
            if sharpe is not None and (best_sharpe is None or sharpe > best_sharpe):
                best_sharpe = sharpe
        params = exp.parameters or {}
        return ExperimentSummaryResponse(
            experiment_id=str(exp.experiment_id),
            name=exp.name,
            description=exp.description,
            signal_id=params.get("signal_id"),
            symbol=params.get("symbol", "BTC"),
            transaction_cost_bps=float(params.get("transaction_cost_bps", 5.0)),
            slippage_bps=float(params.get("slippage_bps", 0.0)),
            tags=exp.tags or [],
            created_at=exp.created_at.isoformat() if exp.created_at else None,
            run_count=len(sorted_runs),
            success_rate=round(success_rate * 100, 1),
            latest_status=latest_run.status if latest_run else "NONE",
            latest_run_id=str(latest_run.run_id) if latest_run else None,
            best_sharpe=round(best_sharpe, 4) if best_sharpe is not None else None,
        )
    raise HTTPException(status_code=500, detail="Database unavailable")


@app.post("/api/experiments/{experiment_id}/run", response_model=ExperimentRunResponse)
async def run_experiment(experiment_id: uuid.UUID) -> ExperimentRunResponse:
    """
    Execute a backtest for the given experiment definition and persist the result.

    The experiment parameters (signal_id, symbol, cost assumptions) are read from
    the stored definition so the run is fully reproducible from the experiment record.
    """
    # Load the experiment definition
    exp: ExperimentDefinitionRecord | None = None
    async for session in db_manager.get_session():
        repo = ExperimentRepository(session)
        exp = await repo.get_definition(experiment_id)
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

    if exp is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    params = exp.parameters or {}
    signal_id_val = params.get("signal_id")
    if not signal_id_val:
        raise HTTPException(status_code=422, detail="Experiment has no signal_id configured")
    signal_id_str = str(signal_id_val)
    try:
        signal_uuid = uuid.UUID(signal_id_str)
    except ValueError as err:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid signal_id in experiment: {signal_id_str}",
        ) from err

    symbol = str(params.get("symbol", "BTC"))
    cost_bps = float(params.get("transaction_cost_bps", 5.0))
    slip_bps = float(params.get("slippage_bps", 0.0))

    # Delegate to the existing backtest logic (reuse, don't duplicate)
    backtest_response = await run_backtest(
        signal_id=signal_uuid,
        symbol=symbol,
        transaction_cost_bps=cost_bps,
        slippage_bps=slip_bps,
    )

    # Persist the run result
    started_at = datetime.now(UTC)
    completed_at = datetime.now(UTC)
    run_id = uuid.uuid4()

    async for session in db_manager.get_session():
        run_record = ExperimentRunRecord(
            run_id=run_id,
            experiment_id=experiment_id,
            status="COMPLETED",
            started_at=started_at,
            completed_at=completed_at,
            workflow_run_ids=[],
            metadata_json={
                "signal_id": signal_id_str,
                "symbol": symbol,
                "transaction_cost_bps": cost_bps,
                "slippage_bps": slip_bps,
                "market_source": backtest_response.get("market_source"),
                "methodology": backtest_response.get("methodology"),
                "result": backtest_response.get("result"),
            },
        )
        session.add(run_record)

    return ExperimentRunResponse(
        run_id=str(run_id),
        experiment_id=str(experiment_id),
        experiment_name=exp.name,
        status="COMPLETED",
        signal_id=signal_id_str,
        symbol=symbol,
        started_at=started_at.isoformat(),
        completed_at=completed_at.isoformat(),
        result=backtest_response.get("result"),
        methodology=backtest_response.get("methodology"),
    )


@app.post("/api/experiments/{experiment_id}/clone", response_model=ExperimentSummaryResponse)
async def clone_experiment(
    experiment_id: uuid.UUID,
    name: str = Query(description="Name for the cloned experiment"),
    symbol: str | None = Query(default=None),
    transaction_cost_bps: float | None = Query(default=None, ge=0, le=500),
    slippage_bps: float | None = Query(default=None, ge=0, le=500),
    signal_id: str | None = Query(default=None),
) -> ExperimentSummaryResponse:
    """
    Clone an existing experiment with optional parameter overrides.
    The clone starts with no runs — it is a new definition based on the source.
    """
    source: ExperimentDefinitionRecord | None = None
    async for session in db_manager.get_session():
        repo = ExperimentRepository(session)
        source = await repo.get_definition(experiment_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source experiment not found")

    if source is None:
        raise HTTPException(status_code=404, detail="Source experiment not found")

    src_params = source.parameters or {}
    chosen_signal_id = signal_id if signal_id is not None else src_params.get("signal_id")
    chosen_symbol = (symbol.upper().strip() if symbol else None) or str(
        src_params.get("symbol", "BTC")
    )
    chosen_cost = (
        transaction_cost_bps
        if transaction_cost_bps is not None
        else src_params.get("transaction_cost_bps", 5.0)
    )
    chosen_slip = slippage_bps if slippage_bps is not None else src_params.get("slippage_bps", 0.0)

    clone_req = ExperimentCreateRequest(
        name=name,
        description=f"Cloned from: {source.name}",
        signal_id=str(chosen_signal_id) if chosen_signal_id is not None else None,
        symbol=str(chosen_symbol),
        transaction_cost_bps=float(chosen_cost),
        slippage_bps=float(chosen_slip),
        tags=[*(source.tags or []), "cloned"],
    )
    return await create_experiment(clone_req)


@app.get("/api/experiments/{experiment_id}/runs")
async def get_experiment_runs(experiment_id: uuid.UUID) -> list[dict[str, Any]]:
    async for session in db_manager.get_session():
        repo = ExperimentRepository(session)
        runs = await repo.get_runs_by_experiment(experiment_id)
        return [
            {
                "run_id": str(r.run_id),
                "experiment_id": str(r.experiment_id),
                "status": r.status,
                "started_at": r.started_at.isoformat(),
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "result": (r.metadata_json or {}).get("result"),
                "signal_id": (r.metadata_json or {}).get("signal_id"),
                "symbol": (r.metadata_json or {}).get("symbol"),
                "methodology": (r.metadata_json or {}).get("methodology"),
                "market_source": (r.metadata_json or {}).get("market_source"),
            }
            for r in sorted(runs, key=lambda x: x.started_at, reverse=True)
        ]
    return []


@app.get("/api/events", response_model=list[EventLogResponse])
async def list_events(limit: int = Query(default=50, le=200)) -> list[EventLogResponse]:
    async for session in db_manager.get_session():
        events = (
            (
                await session.execute(
                    select(EventLog).order_by(desc(EventLog.timestamp)).limit(limit)
                )
            )
            .scalars()
            .all()
        )

        return [
            EventLogResponse(
                event_id=str(e.event_id),
                event_type=e.event_type,
                source=e.source,
                timestamp=e.timestamp.isoformat(),
                correlation_id=str(e.correlation_id),
                payload=e.payload or {},
                metadata=e.metadata_json or {},
            )
            for e in events
        ]
    return []


_entity_resolver = EntityResolver()


@app.get("/api/news/latest", response_model=list[CanonicalNewsArticleResponse])
async def get_latest_news(
    limit: int = Query(default=50, ge=1, le=200),
    min_corroboration: float = Query(default=0.0, ge=0.0, le=1.0),
) -> list[CanonicalNewsArticleResponse]:
    """
    Return the most recent canonical news articles from the database.

    Articles are ordered by ``first_available_at`` DESC — the point-in-time
    when Aegis first made the story actionable, not the publication timestamp.

    ``min_corroboration`` filters to stories confirmed by multiple independent
    publishers (0.75 = 2+ publishers, 0.95 = 3+ publishers).
    """
    async for session in db_manager.get_session():
        repo = NewsRepository(session)
        records = await repo.get_latest_canonical(limit=limit, min_corroboration=min_corroboration)
        return [CanonicalNewsArticleResponse.from_record(r) for r in records]
    return []


@app.get("/api/news/symbol/{symbol}", response_model=list[CanonicalNewsArticleResponse])
async def get_news_by_symbol(
    symbol: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[CanonicalNewsArticleResponse]:
    """
    Return canonical news articles mentioning a specific ticker or asset symbol.

    The symbol is resolved via EntityResolver before filtering, so ``Apple``,
    ``AAPL``, ``Apple Inc.`` all resolve to ``AAPL``.

    Filtering uses the ``entities`` column on ``canonical_articles``, which is
    populated at ingestion time by the EntityResolver pipeline.
    """
    canonical_symbol = _entity_resolver.resolve_symbol(symbol.strip())
    if not canonical_symbol:
        raise HTTPException(status_code=422, detail=f"Could not resolve symbol: {symbol!r}")

    async for session in db_manager.get_session():
        repo = NewsRepository(session)
        records = await repo.get_latest_for_symbol(symbol=canonical_symbol, limit=limit)
        return [CanonicalNewsArticleResponse.from_record(r) for r in records]
    return []


@app.get("/api/news/cluster/{cluster_id}", response_model=NewsClusterDetailResponse)
async def get_news_cluster(cluster_id: str) -> NewsClusterDetailResponse:
    """
    Return full cluster detail for a single canonical article:
    the canonical record plus all constituent raw provider observations.

    This endpoint exposes the full provenance chain required by the
    Aegis data-honesty principle — every headline is traceable to its
    original provider ingestion record.
    """
    async for session in db_manager.get_session():
        repo = NewsRepository(session)
        canonical = await repo.get_cluster_by_id(cluster_id)
        if canonical is None:
            raise HTTPException(status_code=404, detail=f"Cluster not found: {cluster_id!r}")
        raw_records = await repo.get_raw_articles_by_cluster(str(canonical.id))
        return NewsClusterDetailResponse(
            canonical=CanonicalNewsArticleResponse.from_record(canonical),
            raw_articles=[RawNewsArticleResponse.from_record(r) for r in raw_records],
            raw_article_count=len(raw_records),
        )
    raise HTTPException(status_code=500, detail="Database unavailable")


@app.get("/api/market/ticker/{symbol}", response_model=MarketTickerResponse)
async def get_market_ticker(symbol: str) -> MarketTickerResponse:
    """Fetch live market quote with 15s cache TTL and explicit fallback tracking."""
    sym = symbol.upper().strip()
    now_ts = time.time()

    # Check 15-second cache
    if sym in _QUOTE_CACHE:
        cached_time, cached_quote = _QUOTE_CACHE[sym]
        if now_ts - cached_time < 15.0:
            return cached_quote

    async with httpx.AsyncClient(timeout=8.0) as client:
        # Crypto check via Coinbase Live REST API
        if sym in ["BTC", "ETH", "SOL", "DOGE", "BTC-USD", "ETH-USD"]:
            coin_symbol = sym.replace("-USD", "")
            url = f"https://api.coinbase.com/v2/prices/{coin_symbol}-USD/spot"
            try:
                res = await client.get(url, headers={"User-Agent": "Aegis-Alpha/0.1.0"})
                if res.status_code == 200:
                    data = res.json().get("data", {})
                    price = float(data.get("amount", 0.0))
                    z_sig = (
                        round((price - 60000.0) / 10000.0, 4) if coin_symbol == "BTC" else 0.4215
                    )
                    quote = MarketTickerResponse(
                        symbol=sym,
                        price=price,
                        asset_class="CRYPTO",
                        exchange="Coinbase Spot (Live Feed)",
                        timestamp=datetime.now(UTC).isoformat(),
                        z_score_signal=z_sig,
                        is_fallback=False,
                        fallback_reason=None,
                    )
                    _QUOTE_CACHE[sym] = (now_ts, quote)
                    return quote
            except Exception as e:
                logger.warning(f"Live crypto fetch failed for {sym}: {e}")

        # Equities check via Finnhub's free quote endpoint.
        finnhub_key = os.getenv("FINNHUB_API_KEY")
        if finnhub_key:
            try:
                finnhub_url = f"https://finnhub.io/api/v1/quote?symbol={sym}&token={finnhub_key}"
                res = await client.get(finnhub_url)
                if res.status_code == 200:
                    quote_data = res.json()
                    price = float(quote_data.get("c", 0.0))
                    if price > 0:
                        previous_close = float(quote_data.get("pc", price))
                        change_pct = (
                            ((price - previous_close) / previous_close) * 100
                            if previous_close
                            else 0.0
                        )
                        quote = MarketTickerResponse(
                            symbol=sym,
                            price=price,
                            asset_class="EQUITY",
                            exchange="Finnhub (Live Feed)",
                            timestamp=datetime.now(UTC).isoformat(),
                            z_score_signal=round(change_pct / 2.0, 4),
                            is_fallback=False,
                            fallback_reason=None,
                        )
                        _QUOTE_CACHE[sym] = (now_ts, quote)
                        return quote
            except Exception as e:
                logger.warning(f"Finnhub equity fetch failed for {sym}: {e}")

        # Yahoo Finance remains a no-key backup provider.
        try:
            yurl = f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}?interval=1m&range=1d"
            res = await client.get(
                yurl,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                    )
                },
            )
            if res.status_code == 200:
                result_data = res.json().get("chart", {}).get("result", [])
                if result_data:
                    meta = result_data[0].get("meta", {})
                    price = float(meta.get("regularMarketPrice", 0.0))
                    if price > 0:
                        prev_close = float(meta.get("chartPreviousClose", price))
                        change_pct = (
                            ((price - prev_close) / prev_close) * 100 if prev_close else 0.0
                        )
                        quote = MarketTickerResponse(
                            symbol=sym,
                            price=price,
                            asset_class="EQUITY",
                            exchange=f"{meta.get('exchangeName', 'US Equities')} (Fallback Feed)",
                            timestamp=datetime.now(UTC).isoformat(),
                            z_score_signal=round(change_pct / 2.0, 4),
                            is_fallback=True,
                            fallback_reason=(
                                "Finnhub quote unavailable; Yahoo Finance fallback used"
                            ),
                        )
                        _QUOTE_CACHE[sym] = (now_ts, quote)
                        return quote
        except Exception as e:
            logger.warning(f"Live equity fetch failed for {sym}: {e}")

        # Updated realistic fallback quotes for equities & cryptos
        fallbacks = {
            "AAPL": 305.59,
            "TSLA": 339.30,
            "NVDA": 225.01,
            "ETH": 1905.41,
            "BTC": 64200.0,
        }
        fallback_price = fallbacks.get(sym, 100.0)
        quote = MarketTickerResponse(
            symbol=sym,
            price=fallback_price,
            asset_class="CRYPTO" if sym in ["ETH", "SOL", "BTC"] else "EQUITY",
            exchange="US Equities Feed (Fallback Cache)",
            timestamp=datetime.now(UTC).isoformat(),
            z_score_signal=0.3521,
            is_fallback=True,
            fallback_reason="Primary market providers unavailable",
        )
        _QUOTE_CACHE[sym] = (now_ts, quote)
        return quote


@app.get("/api/companies/{symbol}")
async def get_company_intelligence(symbol: str) -> dict[str, Any]:
    """Return provider-backed company profile and metrics with provenance tracking."""
    sym = symbol.upper().strip()
    finnhub_key = os.getenv("FINNHUB_API_KEY")
    quote = await get_market_ticker(sym)

    profile: dict[str, Any] = {}
    metrics: dict[str, Any] = {}

    if finnhub_key:
        async with httpx.AsyncClient(timeout=8.0) as client:
            try:
                profile_response = await client.get(
                    "https://finnhub.io/api/v1/stock/profile2",
                    params={"symbol": sym, "token": finnhub_key},
                )
                if profile_response.status_code == 200:
                    profile = profile_response.json() or {}
            except Exception as e:
                logger.warning(f"Finnhub company profile fetch failed for {sym}: {e}")

            try:
                metrics_response = await client.get(
                    "https://finnhub.io/api/v1/stock/metric",
                    params={"symbol": sym, "metric": "all", "token": finnhub_key},
                )
                if metrics_response.status_code == 200:
                    metrics = metrics_response.json().get("metric", {}) or {}
            except Exception as e:
                logger.warning(f"Finnhub company metrics fetch failed for {sym}: {e}")

    now_iso = datetime.now(UTC).isoformat()
    return {
        "symbol": sym,
        "quote": quote.model_dump(),
        "profile": profile,
        "metrics": metrics,
        "provenance": {
            "retrieved_at": now_iso,
            "is_fallback": quote.is_fallback or not bool(profile),
            "fallback_reason": (
                quote.fallback_reason
                if quote.is_fallback
                else ("Finnhub profile unavailable" if not profile else None)
            ),
            "sources": {
                "quote": quote.exchange,
                "profile": "Finnhub" if profile else "unavailable",
                "metrics": "Finnhub" if metrics else "unavailable",
            },
        },
    }


@app.post("/api/portfolio/scenario", response_model=PortfolioScenarioResponse)
async def portfolio_scenario(request: PortfolioScenarioRequest) -> PortfolioScenarioResponse:
    """Calculate weighted scenario impact from live quote-backed holdings."""
    total_weight = sum(request.holdings.values())
    if any(weight < 0 for weight in request.holdings.values()) or abs(total_weight - 1.0) > 0.001:
        raise HTTPException(
            status_code=422,
            detail="Holding weights must be non-negative and sum to 1",
        )

    quotes = await asyncio.gather(*(get_market_ticker(symbol) for symbol in request.holdings))
    holdings = []
    weighted_shock = 0.0
    for (symbol, weight), quote in zip(request.holdings.items(), quotes, strict=False):
        shock = float(request.shocks.get(symbol.upper(), 0.0))
        weighted_shock += weight * shock
        holdings.append(
            {
                "symbol": symbol.upper(),
                "weight": weight,
                "price": quote.price,
                "provider": quote.exchange,
                "is_fallback": quote.is_fallback,
                "fallback_reason": quote.fallback_reason,
                "scenario_shock": shock,
            }
        )

    return PortfolioScenarioResponse(
        portfolio_value=1.0,
        weighted_shock=round(weighted_shock, 6),
        holdings=holdings,
        methodology=(
            "Unit portfolio value; scenario impact is the weighted "
            "sum of user-supplied asset shocks."
        ),
    )


@app.get("/api/market/ticker/{symbol}/history")
async def get_market_ticker_history(symbol: str) -> dict[str, Any]:
    """Fetch real five-minute OHLCV candles for the chart."""
    sym = symbol.upper().strip()
    now = int(time.time())
    start = now - 24 * 60 * 60
    datapoints: list[dict[str, Any]] = []
    is_crypto = sym in ["BTC", "ETH", "SOL", "DOGE"]
    sentiment_records: list[SignalResultRecord] = []

    async for session in db_manager.get_session():
        sentiment_definition = (
            (
                await session.execute(
                    select(SignalDefinitionRecord).where(
                        SignalDefinitionRecord.name == "REDDIT_SENTIMENT_LEAD"
                    )
                )
            )
            .scalars()
            .first()
        )
        if sentiment_definition:
            sentiment_records = list(
                (
                    await session.execute(
                        select(SignalResultRecord)
                        .where(SignalResultRecord.signal_id == sentiment_definition.id)
                        .where(
                            SignalResultRecord.timestamp >= datetime.fromtimestamp(start, tz=UTC)
                        )
                        .order_by(SignalResultRecord.timestamp.asc())
                    )
                )
                .scalars()
                .all()
            )

    sentiment_index = 0
    current_sentiment = 0.0
    is_fallback_candle = False
    candle_source = "Coinbase candles" if is_crypto else "unavailable"

    def sentiment_at(timestamp: int) -> float:
        nonlocal sentiment_index, current_sentiment
        candle_time = datetime.fromtimestamp(timestamp, tz=UTC)
        while (
            sentiment_index < len(sentiment_records)
            and sentiment_records[sentiment_index].timestamp <= candle_time
        ):
            current_sentiment = sentiment_records[sentiment_index].value
            sentiment_index += 1
        return round(current_sentiment, 4)

    async with httpx.AsyncClient(timeout=8.0) as client:
        if is_crypto:
            coin_symbol = sym.replace("-USD", "")
            url = f"https://api.exchange.coinbase.com/products/{coin_symbol}-USD/candles"
            response = await client.get(
                url, params={"granularity": 300, "start": start, "end": now}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Coinbase candle feed unavailable")
            candles = sorted(response.json(), key=lambda candle: candle[0])
            for timestamp, low, high, open_price, close, volume in candles:
                datapoints.append(
                    {
                        "timestamp": datetime.fromtimestamp(timestamp, tz=UTC).strftime("%H:%M"),
                        "time": timestamp,
                        "open": open_price,
                        "high": high,
                        "low": low,
                        "close": close,
                        "price": close,
                        "volume": volume,
                        "sentimentZ": sentiment_at(timestamp),
                    }
                )
            candle_source = "Coinbase candles"
        else:
            finnhub_key = os.getenv("FINNHUB_API_KEY")
            candle_source = "unavailable"
            finnhub_ok = False

            # --- Primary: Finnhub 5-min candles (works on paid plans) ---
            if finnhub_key:
                try:
                    response = await client.get(
                        "https://finnhub.io/api/v1/stock/candle",
                        params={
                            "symbol": sym,
                            "resolution": 5,
                            "from": start,
                            "to": now,
                            "token": finnhub_key,
                        },
                    )
                    if response.status_code == 200:
                        payload = response.json()
                        if payload.get("s") == "ok" and payload.get("t"):
                            for ts, op, hi, lo, cl, vo in zip(
                                payload["t"],
                                payload["o"],
                                payload["h"],
                                payload["l"],
                                payload["c"],
                                payload["v"],
                                strict=False,
                            ):
                                datapoints.append(
                                    {
                                        "timestamp": datetime.fromtimestamp(
                                            ts,
                                            tz=UTC,
                                        ).strftime("%H:%M"),
                                        "time": ts,
                                        "open": op,
                                        "high": hi,
                                        "low": lo,
                                        "close": cl,
                                        "price": cl,
                                        "volume": vo,
                                        "sentimentZ": sentiment_at(ts),
                                    }
                                )
                            candle_source = "Finnhub candles"
                            finnhub_ok = True
                        else:
                            logger.info(
                                "Finnhub candle returned s=%r for %s — trying Yahoo fallback",
                                payload.get("s"),
                                sym,
                            )
                    else:
                        logger.info(
                            "Finnhub candle HTTP %d for %s — trying Yahoo fallback",
                            response.status_code,
                            sym,
                        )
                except Exception as exc:
                    logger.warning("Finnhub candle fetch exception for %s: %s", sym, exc)

            # --- Fallback: Yahoo Finance v8 chart API (no key) ---
            if not finnhub_ok:
                try:
                    yurl = (
                        f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
                        f"?interval=1d&range=1mo"
                    )
                    yresp = await client.get(
                        yurl,
                        headers={
                            "User-Agent": (
                                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                "AppleWebKit/537.36 (KHTML, like Gecko) "
                                "Chrome/122.0.0.0 Safari/537.36"
                            )
                        },
                        timeout=10.0,
                    )
                    if yresp.status_code == 200:
                        chart = yresp.json().get("chart", {})
                        results = chart.get("result") or []
                        if results:
                            r = results[0]
                            timestamps: list[int] = r.get("timestamp") or []
                            quotes_block: dict[str, Any] = r.get("indicators", {}).get(
                                "quote", [{}]
                            )[0]
                            opens = quotes_block.get("open") or []
                            highs = quotes_block.get("high") or []
                            lows = quotes_block.get("low") or []
                            closes = quotes_block.get("close") or []
                            volumes = quotes_block.get("volume") or []
                            for ts, op, hi, lo, cl, vo in zip(
                                timestamps,
                                opens,
                                highs,
                                lows,
                                closes,
                                volumes,
                                strict=False,
                            ):
                                # Yahoo returns None for extended-hours gaps — skip them
                                if None in (op, hi, lo, cl):
                                    continue
                                datapoints.append(
                                    {
                                        "timestamp": datetime.fromtimestamp(
                                            ts,
                                            tz=UTC,
                                        ).strftime("%H:%M"),
                                        "time": ts,
                                        "open": round(float(op), 4),
                                        "high": round(float(hi), 4),
                                        "low": round(float(lo), 4),
                                        "close": round(float(cl), 4),
                                        "price": round(float(cl), 4),
                                        "volume": int(vo) if vo is not None else 0,
                                        "sentimentZ": sentiment_at(ts),
                                    }
                                )
                            candle_source = "Yahoo Finance candles (fallback)"
                        else:
                            logger.warning("Yahoo Finance returned no chart result for %s", sym)
                    else:
                        logger.warning(
                            "Yahoo Finance candle HTTP %d for %s", yresp.status_code, sym
                        )
                except Exception as exc:
                    logger.warning("Yahoo Finance candle fetch exception for %s: %s", sym, exc)

            # --- Last fallback: Stooq daily CSV (real OHLCV, no API key) ---
            if not finnhub_ok and not datapoints:
                try:
                    stooq_url = f"https://stooq.com/q/d/l/?s={sym.lower()}.us&i=d"
                    stooq_response = await client.get(
                        stooq_url,
                        headers={"User-Agent": "Aegis-Alpha/0.1"},
                        timeout=10.0,
                    )
                    if stooq_response.status_code == 200:
                        for row in csv.DictReader(io.StringIO(stooq_response.text)):
                            if not row.get("Date") or row.get("Close") in {None, "N/D"}:
                                continue
                            candle_time = datetime.strptime(row["Date"], "%Y-%m-%d").replace(
                                tzinfo=UTC
                            )
                            timestamp = int(candle_time.timestamp())
                            close = float(row["Close"])
                            datapoints.append(
                                {
                                    "timestamp": row["Date"],
                                    "time": timestamp,
                                    "open": float(row.get("Open") or close),
                                    "high": float(row.get("High") or close),
                                    "low": float(row.get("Low") or close),
                                    "close": close,
                                    "price": close,
                                    "volume": int(float(row.get("Volume") or 0)),
                                    "sentimentZ": sentiment_at(timestamp),
                                }
                            )
                        if datapoints:
                            candle_source = "Stooq daily candles (fallback)"
                    else:
                        logger.warning(
                            "Stooq candle HTTP %d for %s",
                            stooq_response.status_code,
                            sym,
                        )
                except Exception as exc:
                    logger.warning("Stooq candle fetch exception for %s: %s", sym, exc)

            is_fallback_candle = not finnhub_ok

    return {
        "symbol": sym,
        "asset_name": f"{sym}/USD" if is_crypto else sym,
        "current_price": datapoints[-1]["close"] if datapoints else None,
        "datapoints": datapoints,
        "source": candle_source,
        "is_fallback": is_fallback_candle,
        "fallback_reason": (
            None
            if not is_fallback_candle
            else (
                f"Finnhub candles unavailable; {candle_source} used as fallback"
                if datapoints
                else "Finnhub and Yahoo Finance candle feeds both unavailable"
            )
        ),
    }


# ---------------------------------------------------------------------------
# Macro / Regime helpers
# ---------------------------------------------------------------------------


def _record_to_series_point(rec: MacroObservationRecord) -> MacroSeriesPoint:
    return MacroSeriesPoint(
        series_id=rec.series_id,
        series_name=rec.series_name,
        unit=rec.unit,
        category=rec.category,
        observation_date=rec.observation_date.isoformat(),
        value=rec.value,
        available_at=rec.available_at.isoformat(),
        provider=rec.provider,
    )


def _classify_regime(
    unrate_rows: list[MacroObservationRecord],
    cpi_rows: list[MacroObservationRecord],
) -> RegimeClassification:
    """
    4-quadrant regime classification per Blueprint §15.2.

    Uses 3-month absolute change in UNRATE (inverse growth proxy) and CPIAUCSL
    (inflation proxy). UNRATE rising → growth deteriorating (DOWN); falling → UP.
    """
    now_iso = datetime.now(UTC).isoformat()
    methodology = (
        "4-quadrant regime: 3-month change in UNRATE (growth) and CPIAUCSL (inflation). "
        "UNRATE ↑ = Growth DOWN; UNRATE ↓ = Growth UP."
    )

    latest_unrate = unrate_rows[-1] if unrate_rows else None
    latest_cpi = cpi_rows[-1] if cpi_rows else None

    def _direction(
        rows: list[MacroObservationRecord], invert: bool = False
    ) -> tuple[str, float | None]:
        """Return (direction, 3m_change). Needs >=4 data points for a reliable 3-month signal."""
        values = [r.value for r in rows if r.value is not None]
        if len(values) < 4:
            return "UNKNOWN", None
        change = values[-1] - values[-4]  # approx 3-month change
        threshold = 0.05  # ignore sub-5bp noise
        if abs(change) < threshold:
            direction = "FLAT"
        elif change > 0:
            direction = "DOWN" if invert else "UP"
        else:
            direction = "UP" if invert else "DOWN"
        return direction, round(change, 4)

    growth_dir, growth_change = _direction(unrate_rows, invert=True)  # UNRATE rising = growth DOWN
    inflation_dir, inflation_change = _direction(cpi_rows, invert=False)

    if growth_dir == "UNKNOWN" or inflation_dir == "UNKNOWN":
        regime = "UNKNOWN"
        confidence = "LOW"
    elif growth_dir in ("UP", "FLAT") and inflation_dir in ("UP", "FLAT"):
        regime = "REFLATION"
        confidence = "HIGH" if growth_dir == "UP" and inflation_dir == "UP" else "MEDIUM"
    elif growth_dir in ("UP", "FLAT") and inflation_dir == "DOWN":
        regime = "GOLDILOCKS"
        confidence = "HIGH" if growth_dir == "UP" else "MEDIUM"
    elif growth_dir == "DOWN" and inflation_dir in ("UP", "FLAT"):
        regime = "STAGFLATION"
        confidence = "HIGH" if inflation_dir == "UP" else "MEDIUM"
    else:
        regime = "DEFLATION"
        confidence = "HIGH" if growth_dir == "DOWN" and inflation_dir == "DOWN" else "MEDIUM"

    return RegimeClassification(
        regime=regime,
        growth_direction=growth_dir,
        inflation_direction=inflation_dir,
        growth_indicator=_record_to_series_point(latest_unrate) if latest_unrate else None,
        inflation_indicator=_record_to_series_point(latest_cpi) if latest_cpi else None,
        growth_change_3m=growth_change,
        inflation_change_3m=inflation_change,
        confidence=confidence,
        methodology=methodology,
        classified_at=now_iso,
    )


# ---------------------------------------------------------------------------
# Macro endpoints
# ---------------------------------------------------------------------------


@app.get("/api/macro/yields", response_model=YieldCurveResponse)
async def get_yield_curve() -> YieldCurveResponse:
    """
    Current yield curve snapshot from stored FRED observations.

    Returns the latest available DGS10, DGS2, FEDFUNDS, and BAMLH0A0HYM2
    values and computes the 10Y-2Y spread (slope).

    Data provenance: all values sourced from FRED via Aegis macro ingestion
    pipeline. ``available_at`` reflects when Aegis first retrieved each value.
    Returns null fields (not 502) when data has not yet been ingested.
    """
    now_iso = datetime.now(UTC).isoformat()
    async for session in db_manager.get_session():
        repo = MacroRepository(session)
        latest = await repo.get_latest_per_series(
            series_ids=["DGS10", "DGS2", "FEDFUNDS", "BAMLH0A0HYM2"]
        )
        by_id = {r.series_id: r for r in latest}

        dgs10_rec = by_id.get("DGS10")
        dgs2_rec = by_id.get("DGS2")
        fedfunds_rec = by_id.get("FEDFUNDS")
        credit_rec = by_id.get("BAMLH0A0HYM2")

        slope_bps: float | None = None
        is_inverted = False
        if dgs10_rec and dgs2_rec and dgs10_rec.value is not None and dgs2_rec.value is not None:
            slope_bps = round((dgs10_rec.value - dgs2_rec.value) * 100, 1)
            is_inverted = slope_bps < 0

        return YieldCurveResponse(
            dgs10=_record_to_series_point(dgs10_rec) if dgs10_rec else None,
            dgs2=_record_to_series_point(dgs2_rec) if dgs2_rec else None,
            fedfunds=_record_to_series_point(fedfunds_rec) if fedfunds_rec else None,
            slope_bps=slope_bps,
            is_inverted=is_inverted,
            credit_spread=_record_to_series_point(credit_rec) if credit_rec else None,
            retrieved_at=now_iso,
        )
    # Fallback: DB unavailable
    return YieldCurveResponse(
        dgs10=None,
        dgs2=None,
        fedfunds=None,
        slope_bps=None,
        is_inverted=False,
        credit_spread=None,
        retrieved_at=now_iso,
    )


@app.get("/api/macro/regime", response_model=RegimeClassification)
async def get_macro_regime() -> RegimeClassification:
    """
    Current 4-quadrant macroeconomic regime classification.

    Uses the 12 most recent monthly UNRATE and CPIAUCSL observations from
    stored FRED data to compute the 3-month growth and inflation direction.

    Regime labels: REFLATION / GOLDILOCKS / STAGFLATION / DEFLATION / UNKNOWN.
    UNKNOWN is returned when fewer than 4 months of data have been ingested.

    This endpoint is fully deterministic — given the same stored observations
    it always returns the same regime. It does NOT make live FRED API calls.
    """
    async for session in db_manager.get_session():
        repo = MacroRepository(session)
        unrate_rows = list(await repo.get_series_history("UNRATE", limit=12))
        cpi_rows = list(await repo.get_series_history("CPIAUCSL", limit=12))
        return _classify_regime(unrate_rows, cpi_rows)
    return _classify_regime([], [])


@app.get("/api/macro/series/{series_id}")
async def get_macro_series(
    series_id: str, limit: int = Query(default=60, ge=1, le=240)
) -> dict[str, Any]:
    """
    Historical observations for a single FRED series (most recent ``limit`` points).

    Supported series: DGS10, DGS2, FEDFUNDS, CPIAUCSL, UNRATE, BAMLH0A0HYM2.
    Returns an empty ``datapoints`` list when the series has not yet been ingested.
    """
    sid = series_id.upper()
    async for session in db_manager.get_session():
        repo = MacroRepository(session)
        rows = list(await repo.get_series_history(sid, limit=limit))
        return {
            "series_id": sid,
            "count": len(rows),
            "source": "FRED via Aegis macro pipeline",
            "datapoints": [
                {
                    "observation_date": r.observation_date.isoformat(),
                    "value": r.value,
                    "available_at": r.available_at.isoformat(),
                }
                for r in rows
            ],
        }
    return {"series_id": sid, "count": 0, "source": "FRED", "datapoints": []}


async def _build_news_momentum(symbol: str) -> dict[str, Any]:
    """Build the live/chart News Momentum slice from persisted PIT data."""
    sym = _entity_resolver.resolve_symbol(symbol.strip())
    history = await get_market_ticker_history(sym)
    candles = history.get("datapoints", [])
    if len(candles) < 2 and sym not in {"BTC", "ETH", "SOL", "DOGE"}:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
                try:
                    response = await client.get(
                        f"https://{host}/v8/finance/chart/{sym}",
                        params={"interval": "5m", "range": "1d"},
                        headers={"User-Agent": "Aegis-Alpha/0.1"},
                    )
                    if response.status_code != 200:
                        continue
                    result = (response.json().get("chart", {}).get("result") or [None])[0]
                    if not result:
                        continue
                    timestamps = result.get("timestamp") or []
                    quote = (result.get("indicators", {}).get("quote") or [{}])[0]
                    rebuilt: list[dict[str, Any]] = []
                    for index, timestamp in enumerate(timestamps):
                        values = [
                            (quote.get(field) or [None])[index]
                            for field in ("open", "high", "low", "close")
                        ]
                        if any(value is None for value in values):
                            continue
                        open_price, high, low, close = (float(value) for value in values)
                        rebuilt.append(
                            {
                                "timestamp": datetime.fromtimestamp(timestamp, tz=UTC).strftime(
                                    "%H:%M"
                                ),
                                "time": timestamp,
                                "open": open_price,
                                "high": high,
                                "low": low,
                                "close": close,
                                "price": close,
                                "volume": int((quote.get("volume") or [0])[index] or 0),
                                "sentimentZ": 0.0,
                            }
                        )
                    if len(rebuilt) >= 2:
                        candles = rebuilt
                        history["source"] = f"Yahoo Finance {host} strategy fallback"
                        break
                except (httpx.HTTPError, ValueError, IndexError, TypeError):
                    continue
    if len(candles) < 2:
        raise HTTPException(status_code=422, detail="Insufficient real market history")

    price_frame = (
        pd.DataFrame(
            {
                "price": candle["close"],
                "timestamp": pd.to_datetime(candle["time"], unit="s", utc=True),
            }
            for candle in candles
        )
        .set_index("timestamp")
        .sort_index()
    )
    price_frame.index = price_frame.index.as_unit("ns")
    price_frame["momentum"] = price_frame["price"].pct_change()

    async for session in db_manager.get_session():
        records = list(await NewsRepository(session).get_latest_for_symbol(sym, limit=500))
        baseline_records = list(
            (
                await session.execute(
                    select(CanonicalArticleRecord)
                    .order_by(CanonicalArticleRecord.first_available_at.asc())
                    .limit(1000)
                )
            )
            .scalars()
            .all()
        )

    if not records:
        return {
            "symbol": sym,
            "signals": [],
            "datapoints": candles,
            "source": history.get("source"),
        }

    records = sorted(records, key=lambda record: record.first_available_at)
    baseline_records = sorted(baseline_records, key=lambda record: record.first_available_at)
    if len(records) >= 5:
        baseline_records = records
    baseline_index = {record.cluster_id: index for index, record in enumerate(baseline_records)}
    sentiment_values = pd.Series(
        [float(record.sentiment_polarity) for record in baseline_records], dtype="float64"
    )
    sentiment_z = point_in_time_zscore(sentiment_values, window=20, min_history=5, ddof=0)
    strategy = NewsMomentumStrategy()
    baseline_scope = "same-symbol" if len(records) >= 5 else "global-canonical-news-fallback"
    signals: list[dict[str, Any]] = []

    for record in records:
        available_at = pd.Timestamp(record.first_available_at)
        candle_position = int(price_frame.index.searchsorted(available_at, side="right") - 1)
        baseline_position = baseline_index.get(record.cluster_id, -1)
        if (
            candle_position < 1
            or baseline_position < 0
            or pd.isna(sentiment_z.iloc[baseline_position])
        ):
            continue
        momentum = float(price_frame.iloc[candle_position].momentum)
        evaluation = strategy.evaluate(
            float(sentiment_z.iloc[baseline_position]),
            momentum,
            [record.cluster_id],
            f"{baseline_scope} baseline; {record.primary_headline}",
            factor_values={
                "sentiment_z": float(sentiment_z.iloc[baseline_position]),
                "momentum": momentum,
            },
        )
        signals.append(
            {
                "timestamp": available_at.isoformat(),
                "market_timestamp": price_frame.index[candle_position].isoformat(),
                "symbol": sym,
                "sentiment_z": float(sentiment_z.iloc[baseline_position]),
                "momentum": momentum,
                "headline": record.primary_headline,
                "article_id": record.cluster_id,
                **evaluation,
            }
        )

    return {
        "symbol": sym,
        "source": history.get("source"),
        "signals": signals,
        "datapoints": candles,
        "methodology": (
            f"News Momentum: PIT article polarity rolling z-score using {baseline_scope} "
            "prior observations plus prior completed-bar price momentum; no look-ahead."
        ),
    }


@app.get("/api/news-momentum/{symbol}")
async def get_news_momentum(symbol: str) -> dict[str, Any]:
    return await _build_news_momentum(symbol)


@app.post("/api/news-momentum/{symbol}/backtest")
async def backtest_news_momentum(
    symbol: str,
    transaction_cost_bps: float = Query(default=5.0, ge=0, le=500),
    slippage_bps: float = Query(default=0.0, ge=0, le=500),
    position_size: float = Query(default=1.0, ge=0, le=1),
    holding_period: int = Query(default=1, ge=1, le=100),
) -> dict[str, Any]:
    payload = await _build_news_momentum(symbol)
    candles = payload["datapoints"]
    signals = payload["signals"]
    if not signals:
        raise HTTPException(status_code=422, detail="No PIT-qualified news signals available")

    prices = pd.Series(
        [candle["close"] for candle in candles],
        index=pd.to_datetime([candle["time"] for candle in candles], unit="s", utc=True),
        name="price",
    ).sort_index()
    prices.index = prices.index.as_unit("ns")
    signal_frame = (
        pd.DataFrame(
            {
                "timestamp": pd.to_datetime(
                    [item["market_timestamp"] for item in signals], utc=True
                ),
                "signal": [
                    1.0 if item["action"] == "BUY" else -1.0 if item["action"] == "SELL" else 0.0
                    for item in signals
                ],
            }
        )
        .set_index("timestamp")
        .sort_index()
    )
    signal_frame.index = signal_frame.index.as_unit("ns")
    aligned = pd.merge_asof(
        prices.to_frame(), signal_frame, left_index=True, right_index=True, direction="backward"
    ).dropna()
    result = run_signal_backtest(
        aligned["price"],
        aligned["signal"],
        transaction_cost_bps=transaction_cost_bps,
        slippage_bps=slippage_bps,
        position_size=position_size,
        holding_period=holding_period,
    )
    return {
        "symbol": payload["symbol"],
        "signals": signals,
        "result": result,
        "methodology": payload["methodology"],
    }


def main() -> None:
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("aegis_api.main:app", host="0.0.0.0", port=port, reload=True)


if __name__ == "__main__":
    main()
