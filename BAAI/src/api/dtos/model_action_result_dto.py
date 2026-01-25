from pydantic import BaseModel


class ModelActionResultDto(BaseModel):
    message: str
