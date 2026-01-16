class WorkerNotRunningError(Exception):
    def __init__(self) -> None:
        super().__init__("Worker is not running")
