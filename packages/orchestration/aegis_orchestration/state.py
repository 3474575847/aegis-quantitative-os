import logging
from typing import ClassVar

from aegis_orchestration.models import WorkflowStatus

logger = logging.getLogger(__name__)


class WorkflowStateMachine:
    """Manages deterministic state transitions for research workflows."""

    # Valid transitions: Current Status -> Allowed Next Statuses
    TRANSITIONS: ClassVar[dict[WorkflowStatus, set[WorkflowStatus]]] = {
        WorkflowStatus.PENDING: {WorkflowStatus.RUNNING, WorkflowStatus.FAILED},
        WorkflowStatus.RUNNING: {
            WorkflowStatus.SIGNAL_GENERATION,
            WorkflowStatus.FAILED,
        },
        WorkflowStatus.SIGNAL_GENERATION: {
            WorkflowStatus.BACKTESTING,
            WorkflowStatus.FAILED,
        },
        WorkflowStatus.BACKTESTING: {
            WorkflowStatus.PERSISTING_ARTIFACTS,
            WorkflowStatus.FAILED,
        },
        WorkflowStatus.PERSISTING_ARTIFACTS: {
            WorkflowStatus.COMPLETED,
            WorkflowStatus.FAILED,
        },
        WorkflowStatus.COMPLETED: set(),  # Terminal state
        WorkflowStatus.FAILED: {WorkflowStatus.PENDING},  # Allow retry from failure
    }

    @classmethod
    def validate_transition(cls, current: WorkflowStatus, next_status: WorkflowStatus) -> bool:
        """Verify if a state transition is permitted."""
        allowed = cls.TRANSITIONS.get(current, set())
        is_valid = next_status in allowed

        if not is_valid:
            logger.warning(
                f"Invalid state transition attempted: {current.value} -> {next_status.value}"
            )

        return is_valid
