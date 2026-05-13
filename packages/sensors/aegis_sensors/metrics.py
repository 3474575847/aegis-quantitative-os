from prometheus_client import Counter, Histogram

SENSOR_LATENCY = Histogram(
    "sensor_execution_duration_seconds", "Time spent running the sensor pipeline", ["sensor_id"]
)

SENSOR_ERRORS = Counter(
    "sensor_errors_total", "Total number of sensor execution errors", ["sensor_id"]
)

EVENTS_PROCESSED = Counter(
    "sensor_events_processed_total", "Total number of events emitted by the sensor", ["sensor_id"]
)
