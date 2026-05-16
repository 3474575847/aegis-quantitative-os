# Aegis-Alpha: Infrastructure Stabilization Report

## 1. Critical Risks

### Hypertable Constraint Non-Compliance
*   **Issue**: `NormalizedEvent` and `EventLog` define primary keys or unique indexes that do not include the partitioning column (`occurred_at` / `timestamp`).
*   **Risk**: TimescaleDB enforces that any unique constraint (including PKs) must include the partition key. Attempting to create these hypertables or insert data into existing ones with these constraints will fail in production.
*   **Impact**: Database initialization or ingestion failure.
*   **Proproposed Fix**: Change primary keys to composite keys including the timestamp.

### Publisher Blocking in Event Bus
*   **Issue**: `InMemoryEventBus.publish` awaits `asyncio.gather(*tasks)`.
*   **Risk**: A slow subscriber (e.g., a database persistence handler with I/O wait) blocks the sensor ingestion pipeline. This violates the "non-blocking" requirement of an event-driven system.
*   **Impact**: Increased sensor latency and reduced system throughput.
*   **Proposed Fix**: Change `publish` to fire-and-forget using `asyncio.create_task` or similar, ensuring subscriber isolation.

## 2. Medium Risks

### Fragmented Event Models
*   **Issue**: Both `Event` (legacy/data) and `BaseEvent` (infrastructure) exist in `packages/events`.
*   **Risk**: Inconsistency in how different parts of the system handle events. `BaseSensor` still returns `list[Event]`, but the `EventBus` expects `BaseEvent`.
*   **Impact**: Increased developer cognitive load and potential type errors during integration.
*   **Proposed Fix**: Unify the event hierarchy.

### Manual Ingestion Persistence
*   **Issue**: The Ingestion Worker still manually persists `NormalizedEvent` data in a loop instead of relying entirely on the event bus.
*   **Risk**: Bypassing the event bus for data events limits the visibility and replayability of the research pipeline.
*   **Impact**: Incomplete audit trails and fragmented observability.
*   **Proposed Fix**: Fully migrate data ingestion to emit `DataEvent` to the bus.

## 3. Low-Priority Improvements

### Structured Logging Consistency
*   **Issue**: `StructuredLogger` lacks a standard way to handle `correlation_id` automatically.
*   **Proposed Fix**: Integrate context vars to propagate `correlation_id` across log calls.

## 4. Replay Edge Cases
*   **Deterministic Ordering**: Current replay foundation relies on DB query order. Without explicit `ORDER BY timestamp, event_id`, event ordering in the same millisecond might be non-deterministic.
*   **Stateful Handlers**: If a subscriber maintains internal state during replay, it must be reset manually.

## 5. Scaling Bottlenecks
*   **In-Memory Depth**: A burst of events could lead to high memory usage if subscribers are slow, as there is currently no backpressure/queue depth limit in the `InMemoryEventBus`.

## 6. Technical Debt Assessment
The infrastructure is modern (Python 3.12, UV, TimescaleDB) but shows early signs of "model fragmentation" and "synchronous leakage" in the async bus. Stabilization is needed before adding signal logic.
