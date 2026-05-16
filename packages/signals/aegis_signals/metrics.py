from prometheus_client import Counter, Histogram

SIGNAL_LATENCY = Histogram(
    "signal_execution_duration_seconds", "Time spent computing a signal", ["signal_name"]
)

SIGNAL_ERRORS = Counter(
    "signal_errors_total", "Total number of signal computation errors", ["signal_name"]
)

SIGNAL_COMPUTED = Counter(
    "signal_computed_total", "Total number of signals successfully computed", ["signal_name"]
)

SIGNAL_PERSISTENCE_LATENCY = Histogram(
    "signal_persistence_duration_seconds", "Time spent persisting signal results", ["signal_name"]
)
