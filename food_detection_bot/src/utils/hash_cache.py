import hashlib


class HashCache:
    def __init__(self, max_entries: int = 128):
        self.max_entries = max_entries
        self._store: dict[str, object] = {}

    @staticmethod
    def digest(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    def get(self, key: str):
        return self._store.get(key)

    def set(self, key: str, value: object):
        if len(self._store) >= self.max_entries:
            first_key = next(iter(self._store.keys()), None)
            if first_key is not None:
                self._store.pop(first_key, None)
        self._store[key] = value
