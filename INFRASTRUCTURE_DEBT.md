# Aegis-Alpha: Infrastructure Debt

| Severity | Debt Description | Impact | Remediation Complexity | Recommended Timing |
| :--- | :--- | :--- | :--- | :--- |
| **Critical** | Hypertable unique index non-compliance | Insertions will fail in production | Low | **Immediate** |
| **Critical** | Event bus publisher blocking | Head-of-line blocking in ingestion | Low | **Immediate** |
| **High** | Dual event model hierarchy (`Event` vs `BaseEvent`) | Typing inconsistency and developer friction | Medium | **Short-term** |
| **High** | Manual database flushes in Ingestion Worker | Inconsistent event flow and bypassing bus | Medium | **Short-term** |
| **Medium** | Missing backpressure in `InMemoryEventBus` | Memory saturation during event bursts | Medium | **Mid-term** |
| **Low** | Redundant sensor runs in main worker loop | Wasted I/O and potential duplicate data | Low | **Immediate** |
| **Low** | Weak payload typing (`Dict[str, Any]`) | Reduced type safety for research data | Medium | **Short-term** |
