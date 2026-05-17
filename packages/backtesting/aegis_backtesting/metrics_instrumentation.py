from prometheus_client import Counter, Histogram

BACKTEST_DURATION = Histogram(
    "backtest_execution_duration_seconds", "Time spent executing a backtest run", ["strategy_name"]
)

BACKTEST_ERRORS = Counter(
    "backtest_errors_total", "Total number of backtest execution errors", ["strategy_name"]
)

METRIC_COMPUTATION_LATENCY = Histogram(
    "backtest_metric_computation_seconds",
    "Time spent computing performance metrics",
    ["strategy_name"],
)

BACKTEST_PERSISTENCE_LATENCY = Histogram(
    "backtest_persistence_duration_seconds",
    "Time spent persisting backtest results",
    ["strategy_name"],
)
