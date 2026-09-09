# ruff: noqa: F401

"""Create the initial Aegis-Alpha storage schema.

This baseline is intentionally idempotent so it can reconcile development
databases created by the pre-Alembic ``create_all`` startup path. Future schema
changes must use new revisions rather than expanding this migration.
"""

from collections.abc import Sequence

import aegis_storage.models.events as _events
import aegis_storage.models.experimentation as _experimentation
import aegis_storage.models.macro as _macro
import aegis_storage.models.news as _news
import aegis_storage.models.signals as _signals
from aegis_storage.models.base import Base
from alembic import op
from sqlalchemy import text

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)

    if bind.dialect.name == "postgresql":
        hypertables = (
            ("raw_events", "received_at"),
            ("normalized_events", "occurred_at"),
            ("event_log", "timestamp"),
            ("signal_results", "timestamp"),
            ("raw_news_articles", "published_at"),
            ("canonical_articles", "first_published_at"),
            ("macro_observations", "observation_date"),
        )
        for table_name, time_column in hypertables:
            bind.execute(
                text("SELECT create_hypertable(:table_name, :time_column, if_not_exists => TRUE)"),
                {"table_name": table_name, "time_column": time_column},
            )


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, checkfirst=True)
