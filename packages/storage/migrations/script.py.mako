"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
${upgrades if upgrades else "pass"}
    # Initialize TimescaleDB Hypertables
    op.execute("SELECT create_hypertable('raw_events', 'received_at', if_not_exists => TRUE);")
    op.execute("SELECT create_hypertable('normalized_events', 'occurred_at', if_not_exists => TRUE);")


def downgrade() -> None:
${downgrades if downgrades else "pass"}
