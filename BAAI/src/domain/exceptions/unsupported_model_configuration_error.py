class UnsupportedModelConfigurationError(Exception):
    def __init__(self, model_name: str) -> None:
        super().__init__(f"Unsupported model configuration: {model_name}")
