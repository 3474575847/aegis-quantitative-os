# Aegis-Alpha: Research Workflow Orchestration

The Research Orchestration layer coordinates the execution of multi-stage quantitative research pipelines, ensuring deterministic order and complete lineage tracking.

## Architecture

### 1. Deterministic State Machine
The orchestrator uses an explicit state machine to manage transitions between research stages.
- **SignalGeneration**: Computing factor scores.
- **Backtesting**: Simulating strategy performance.
- **PersistingArtifacts**: Storing research results and equity curves.

### 2. Research Lineage
The system maintains a directed graph of dependencies:
`Sensor Run → Normalized Events → Signals → Backtest → Research Artifact`

### 3. Replay & Recovery
Because every state transition and event is persisted to TimescaleDB, the orchestrator can:
- Reconstruct the state of a research run at any point in time.
- Recover from failures by resuming from the last successful stage.
- Replay historical research with new parameters to verify sensitivity.

## Event Lifecycle
1. `ResearchWorkflowStarted`
2. `WorkflowStageStarted` (per stage)
3. `WorkflowStageCompleted` (per stage)
4. `ResearchWorkflowCompleted`

## Observability
Prometheus metrics track:
- Total workflow duration.
- Per-stage latency.
- State transition failure rates.
