from aegis_orchestration.models import WorkflowStatus
from aegis_orchestration.state import WorkflowStateMachine


def test_valid_transitions() -> None:
    # Pending -> Running
    assert WorkflowStateMachine.validate_transition(WorkflowStatus.PENDING, WorkflowStatus.RUNNING)
    # Running -> SignalGeneration
    assert WorkflowStateMachine.validate_transition(
        WorkflowStatus.RUNNING, WorkflowStatus.SIGNAL_GENERATION
    )
    # SignalGeneration -> Failed
    assert WorkflowStateMachine.validate_transition(
        WorkflowStatus.SIGNAL_GENERATION, WorkflowStatus.FAILED
    )


def test_invalid_transitions() -> None:
    # Completed -> Running (terminal state)
    assert not WorkflowStateMachine.validate_transition(
        WorkflowStatus.COMPLETED, WorkflowStatus.RUNNING
    )
    # Pending -> Backtesting (skip stages)
    assert not WorkflowStateMachine.validate_transition(
        WorkflowStatus.PENDING, WorkflowStatus.BACKTESTING
    )
