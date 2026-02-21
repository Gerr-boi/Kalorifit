import time
from contextlib import contextmanager


@contextmanager
def measure_ms():
    start = time.perf_counter()
    try:
        yield lambda: int((time.perf_counter() - start) * 1000)
    finally:
        pass
