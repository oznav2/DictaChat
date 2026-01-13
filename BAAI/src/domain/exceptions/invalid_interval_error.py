class InvalidIntervalError(Exception):
    def __init__(self) -> None:
        super().__init__("Interval must be greater than 0")
