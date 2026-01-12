# image_security_monitor.py (utils) - Map

## Summary

`image_security_monitor.py` provides a dedicated auditing and observability layer for all image-related operations in RoamPal. It tracks the entire lifecycle of an image—from upload start and analysis to chat integration—while logging security violations and processing failures to a persistent file. Its purpose is to detect anomalous upload patterns and provide metrics on vision-based AI performance.

---

## Technical Map

### Event Tracking (Lines 17-55)

- **`ImageSecurityEvent`**: A structured dataclass capturing:
  - **Context**: `timestamp`, `event_type`, `shard_id`, `user_id`.
  - **Security**: `ip_address`, `user_agent`.
  - **Telemetry**: `file_size`, `processing_time_ms`.
- **`ImageSecurityMonitor`**:
  - **Memory Cache**: stores the last 10,000 events in a `deque` for quick stats retrieval.
  - **Dedicated Logger**: writes raw JSON events to `logs/image_security.log`.

### Automated Logging (Lines 90-185)

- **`log_upload_start` / `log_upload_success`**: Identifies latency bottlenecks in the vision pipeline.
- **`log_security_violation`**: specifically flags suspicious behavior (e.g., unauthorized access attempts or malformed binary blobs).
- **`log_chat_integration`**: tracks how often the LLM successfully incorporates vision context into a textual conversation.

### Maintenance & Reporting (Lines 186-222)

- **`get_stats()`**: Returns a summary of error counts and top-failing shards, used for the Developer Health dashboard.
- **`cleanup_old_logs()`**: manages log rotation and deletion of files older than 30 days to prevent disk bloat.

---

## Connection & Dependencies

- **UnifiedImageService.py**: The primary consumer. Every image transformation and vision analysis call is wrapped in monitor hooks.
- **image_router.py**: Uses the stats reporting functions to populate the "Image Usage" graphs in the UI.
- **Tauri Main**: the monitor instance is initialized globally and persists for the duration of the backend lifecycle.
