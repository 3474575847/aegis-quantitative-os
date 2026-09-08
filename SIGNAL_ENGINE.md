# Aegis-Alpha: Signal Engine

The Signal Engine is the core quantitative computation layer of Aegis-Alpha. It transforms normalized event streams into high-fidelity research signals.

## Architecture

### 1. Deterministic Pipeline

Every signal computation is a deterministic function of its inputs (historical events) and parameters. By avoiding hidden global state, we ensure that signals can be perfectly reproduced during backtesting.

### 2. Rolling Analytics

The `aegis_signals.analytics` module provides a library of vectorized, rolling window functions using NumPy and Pandas.

- Rolling Mean / Std / Z-Score
- Lagged Correlation
- Volatility Normalization
- Rolling Percentile Rank

### 3. Signal Lineage

Each `SignalResult` is linked to:

- A specific `SignalDefinition` (and version).
- A `SignalRun` containing a list of `source_event_ids`.
- A `correlation_id` that traces back to the original sensor fetch.

## Lifecycle

1. **Trigger**: An external event or timer triggers a signal run.
2. **Compute**: The `SignalPipelineEngine` executes the registered `BaseSignalProcessor`.
3. **Persist**: Results are stored in the `signal_results` TimescaleDB hypertable.
4. **Emit**: The engine emits `SignalComputed` and `SignalPersisted` events.

## Reproducibility Strategy

Researchers can load a `SignalSnapshot` which contains the exact parameters and version used in the past. Replaying the historical event log through the engine with this snapshot is guaranteed to produce the original outputs.
