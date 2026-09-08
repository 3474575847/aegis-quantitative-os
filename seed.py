import asyncio
import os
import random
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from alembic import command
from alembic.config import Config

from aegis_storage.database import DatabaseManager
from aegis_storage.models.events import EventLog
from aegis_storage.models.experimentation import ExperimentDefinitionRecord, ExperimentRunRecord
from aegis_storage.models.signals import SignalDefinitionRecord, SignalResultRecord


async def main() -> None:
    db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/aegis")
    print(f"Connecting to database at {db_url}...")
    db_manager = DatabaseManager(db_url)
    
    try:
        alembic_config = Config(
            str(Path(__file__).resolve().parent / "packages/storage/alembic.ini")
        )
        alembic_config.set_main_option("sqlalchemy.url", db_url)
        command.upgrade(alembic_config, "head")
        print("Database schema and hypertables migrated.")
    except Exception as e:
        print(f"Error during database migration: {e}")
        raise
        
    async for session in db_manager.get_session():
        # Let's verify if data already exists to avoid duplicate seed
        from sqlalchemy import select
        existing_defs = await session.execute(select(SignalDefinitionRecord))
        if existing_defs.scalars().first():
            print("Database already seeded. Skipping.")
            return

        print("Seeding database...")
        
        # 1. Add Signal Definitions
        signals = [
            SignalDefinitionRecord(
                id=uuid.uuid4(),
                name="BTC_MOMENTUM_ZSCORE",
                version="1.0.0",
                parameters={"window": 14, "vol_target": 0.15},
                created_at=datetime.now(UTC) - timedelta(days=10)
            ),
            SignalDefinitionRecord(
                id=uuid.uuid4(),
                name="REDDIT_SENTIMENT_LEAD",
                version="2.1.0",
                parameters={"lag": 3, "lookback": 5},
                created_at=datetime.now(UTC) - timedelta(days=8)
            ),
            SignalDefinitionRecord(
                id=uuid.uuid4(),
                name="MEAN_REVERSION_PRICE",
                version="1.2.0",
                parameters={"lookback_period": 20, "std_dev": 2.0},
                created_at=datetime.now(UTC) - timedelta(days=5)
            )
        ]
        for sig in signals:
            session.add(sig)
        await session.flush()
        
        # 2. Add Experiments
        experiments = [
            ExperimentDefinitionRecord(
                experiment_id=uuid.uuid4(),
                name="Momentum & Sentiment Joint Alpha",
                description="Evaluating interaction of social sentiment lead and price momentum on BTC.",
                workflow_ids=[uuid.uuid4()],
                parameters={"min_confidence": 0.7, "allocation": 0.5},
                metadata_json={"researcher": "Jules", "priority": "high"},
                tags=["momentum", "sentiment", "btc"],
                created_at=datetime.now(UTC) - timedelta(days=7)
            ),
            ExperimentDefinitionRecord(
                experiment_id=uuid.uuid4(),
                name="Mean Reversion Base Model",
                description="Baseline mean reversion testing on high-volatility spot assets.",
                workflow_ids=[uuid.uuid4(), uuid.uuid4()],
                parameters={"threshold": 1.5},
                metadata_json={"researcher": "Aryan", "priority": "medium"},
                tags=["mean-reversion", "spot"],
                created_at=datetime.now(UTC) - timedelta(days=4)
            )
        ]
        for exp in experiments:
            session.add(exp)
        await session.flush()

        # 3. Add Experiment Runs
        statuses = ["COMPLETED", "FAILED", "RUNNING", "PENDING"]
        for exp in experiments:
            # Add a couple of runs
            for i in range(3):
                status = statuses[i % len(statuses)]
                started = datetime.now(UTC) - timedelta(days=3 - i, hours=random.randint(1, 10))
                completed = started + timedelta(minutes=random.randint(5, 45)) if status in ["COMPLETED", "FAILED"] else None
                
                run = ExperimentRunRecord(
                    run_id=uuid.uuid4(),
                    experiment_id=exp.experiment_id,
                    status=status,
                    started_at=started,
                    completed_at=completed,
                    workflow_run_ids=[uuid.uuid4()],
                    metadata_json={"step": "backtest", "metrics": {"sharpe": random.uniform(1.2, 2.5), "drawdown": random.uniform(-0.15, -0.05)} if status == "COMPLETED" else {}}
                )
                session.add(run)
        
        # 4. Add Signal Results
        for sig in signals:
            # Let's generate a time-series of values for the last 5 days
            for i in range(120): # hourly values
                timestamp = datetime.now(UTC) - timedelta(hours=i)
                result = SignalResultRecord(
                    id=uuid.uuid4(),
                    run_id=uuid.uuid4(),
                    signal_id=sig.id,
                    timestamp=timestamp,
                    value=random.normalvariate(0.5, 1.2),
                    metadata_json={"computation_time_ms": random.uniform(10.0, 50.0)}
                )
                session.add(result)

        # 5. Add Event Logs
        event_types = ["SensorRunStarted", "SensorRunCompleted", "SignalGenerationTriggered", "SignalComputed", "SignalPersisted"]
        for i in range(50):
            timestamp = datetime.now(UTC) - timedelta(minutes=i * 15)
            evt = EventLog(
                event_id=uuid.uuid4(),
                event_type=random.choice(event_types),
                timestamp=timestamp,
                source="seed_pipeline",
                correlation_id=uuid.uuid4(),
                payload={"info": f"Seed message event sequence number {i}"},
                metadata_json={"environment": "development"}
            )
            session.add(evt)

        print("Mock data seeded successfully.")

if __name__ == "__main__":
    asyncio.run(main())
