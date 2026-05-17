from prometheus_client import Counter, Histogram

WORKFLOW_DURATION = Histogram(
    "research_workflow_duration_seconds",
    "Total time for a research workflow to complete",
    ["workflow_name"],
)

STAGE_LATENCY = Histogram(
    "workflow_stage_duration_seconds",
    "Time spent in a specific workflow stage",
    ["workflow_name", "stage_name"],
)

WORKFLOW_ERRORS = Counter(
    "workflow_errors_total",
    "Total number of research workflow failures",
    ["workflow_name", "stage_name"],
)

ARTIFACT_PERSISTENCE_LATENCY = Histogram(
    "workflow_artifact_persistence_seconds",
    "Time spent persisting research artifacts",
    ["workflow_name"],
)
