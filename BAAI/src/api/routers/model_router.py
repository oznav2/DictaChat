from typing import Annotated

from fastapi import APIRouter, Depends

from api.dtos.model_action_result_dto import ModelActionResultDto
from api.dtos.model_status_dto import ModelStatusDto
from application.usecases.get_model_status_usecase import GetModelStatusUseCase
from application.usecases.load_model_usecase import LoadModelUseCase
from application.usecases.unload_model_usecase import UnloadModelUseCase


class ModelRouter:
    def __init__(self) -> None:
        self.router = APIRouter()
        self.router.post("/model/load")(self.load_model)
        self.router.post("/model/unload")(self.unload_model)
        self.router.get("/model/status")(self.get_model_status)

    async def load_model(
        self,
        load_model_usecase: Annotated[LoadModelUseCase, Depends()],
    ) -> ModelActionResultDto:
        message = await load_model_usecase.execute()
        return ModelActionResultDto(message=message)

    async def unload_model(
        self,
        unload_model_usecase: Annotated[UnloadModelUseCase, Depends()],
    ) -> ModelActionResultDto:
        message = await unload_model_usecase.execute()
        return ModelActionResultDto(message=message)

    async def get_model_status(
        self,
        get_model_status_usecase: Annotated[GetModelStatusUseCase, Depends()],
    ) -> ModelStatusDto:
        status = await get_model_status_usecase.execute()
        return ModelStatusDto(**status)
