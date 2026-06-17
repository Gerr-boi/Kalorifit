"""Sliding-window rate limiter for per-key request throttling.

Each identifier (API key or client IP) is tracked independently.
Timestamps older than the window are pruned on every check so memory
usage stays proportional to active traffic rather than total history.
"""

import time
from collections import deque
from threading import Lock


class RateLimiter:
    """In-memory sliding-window rate limiter.

    Parameters
    ----------
    requests_per_minute:
        Maximum number of requests allowed within any 60-second window.
    """

    _WINDOW_SECONDS: float = 60.0

    def __init__(self, requests_per_minute: int = 100) -> None:
        if requests_per_minute < 1:
            raise ValueError('requests_per_minute must be at least 1')
        self._limit = requests_per_minute
        # identifier -> deque of request timestamps (float, seconds since epoch)
        self._windows: dict[str, deque[float]] = {}
        self._lock = Lock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def is_allowed(self, identifier: str) -> bool:
        """Return True and record the request if the identifier is within quota.

        Returns False (without recording) when the limit has been reached.
        """
        now = time.time()
        with self._lock:
            window = self._get_window(identifier)
            self._evict_old(window, now)
            if len(window) >= self._limit:
                return False
            window.append(now)
            return True

    def get_remaining(self, identifier: str) -> int:
        """Return the number of requests still allowed in the current window.

        This is a read-only snapshot; it does *not* consume a request slot.
        """
        now = time.time()
        with self._lock:
            window = self._get_window(identifier)
            self._evict_old(window, now)
            return max(0, self._limit - len(window))

    def reset_at(self, identifier: str) -> float:
        """Return the Unix timestamp when the oldest slot in the window expires.

        If the identifier has no recorded requests the reset time is *now*.
        """
        now = time.time()
        with self._lock:
            window = self._get_window(identifier)
            self._evict_old(window, now)
            if not window:
                return now
            return window[0] + self._WINDOW_SECONDS

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_window(self, identifier: str) -> 'deque[float]':
        """Return (creating if absent) the deque for *identifier*."""
        if identifier not in self._windows:
            self._windows[identifier] = deque()
        return self._windows[identifier]

    def _evict_old(self, window: 'deque[float]', now: float) -> None:
        """Remove timestamps that have fallen outside the sliding window."""
        cutoff = now - self._WINDOW_SECONDS
        while window and window[0] <= cutoff:
            window.popleft()
