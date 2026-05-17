# Aegis-Alpha: Backtesting Engine

The Backtesting Engine provides the foundational infrastructure for executing reproducible simulations and computing research performance metrics.

## Architecture

### 1. Deterministic Orchestration
The engine is designed to execute backtests using historical signal results. By strictly controlling the input data and parameters, every backtest run is guaranteed to be reproducible.

### 2. Performance Metrics
A specialized vectorized library (`aegis_backtesting.metrics`) computes standard quantitative metrics:
- **Sharpe Ratio**: Risk-adjusted return performance.
- **Sortino Ratio**: Downside risk-adjusted performance.
- **Max Drawdown**: Maximum peak-to-trough decline.
- **Volatility**: Annualized standard deviation of returns.

### 3. Research Lineage
Every run generates a `BacktestResult` linked to:
- A specific `BacktestDefinition`.
- A `SignalDefinition` version.
- A `StrategySnapshot` of all parameters.
- A `ResearchArtifact` pointing to the full returns series.

## Lifecycle
1. **Trigger**: System emits `BacktestTriggered`.
2. **Start**: Engine snapshots parameters and emits `BacktestStarted`.
3. **Simulate**: Computes vectorized metrics using Pandas/NumPy.
4. **Complete**: Engine emits `BacktestCompleted` and `ResearchArtifactStored`.

## Persistence
All metrics and artifacts are stored in append-only TimescaleDB hypertables, ensuring a permanent and immutable audit trail for all quantitative research.
