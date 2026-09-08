import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any


class StructuredLogger:
    def __init__(self, name: str) -> None:
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)
        if not self.logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            self.logger.addHandler(handler)

    def _log(self, level: str, message: str, *args: Any, **kwargs: Any) -> None:
        # Support both printf-style positional args (e.g. logger.info("msg %s", val))
        # and keyword arguments for structured metadata.
        if args:
            try:
                formatted_message = message % args
            except (TypeError, ValueError):
                formatted_message = f"{message} {args}"
        else:
            formatted_message = message
        log_entry = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": level,
            "message": formatted_message,
            **kwargs,
        }
        self.logger.info(json.dumps(log_entry))

    def debug(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log("DEBUG", message, *args, **kwargs)

    def info(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log("INFO", message, *args, **kwargs)

    def warning(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log("WARNING", message, *args, **kwargs)

    def error(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log("ERROR", message, *args, **kwargs)

    def critical(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log("CRITICAL", message, *args, **kwargs)


def get_logger(name: str) -> StructuredLogger:
    return StructuredLogger(name)

