from pydantic import BaseModel


class ModelStatusDto(BaseModel):
    is_loaded: bool
    model_name: str
    device: str
