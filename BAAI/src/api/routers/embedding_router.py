from typing import Annotated

from fastapi import APIRouter, Body, Depends
from fastapi.responses import ORJSONResponse

from api.dtos.create_embeddings_dto import CreateEmbeddingsDto
from api.dtos.create_embeddings_result_dto import CreateEmbeddingsResultDto
from application.usecases.create_embeddings_usecase import CreateEmbeddingsUseCase


class EmbeddingRouter:
    def __init__(self) -> None:
        self.router = APIRouter()
        self.router.post("/embeddings")(self.create_embeddings)

    async def create_embeddings(
        self,
        create_embeddings_usecase: Annotated[CreateEmbeddingsUseCase, Depends()],
        create_embeddings_dto: CreateEmbeddingsDto = Body(...),
    ) -> ORJSONResponse:
        result = await create_embeddings_usecase.execute(
            create_embeddings_dto.texts,
            create_embeddings_dto.include_dense,
            create_embeddings_dto.include_sparse,
            create_embeddings_dto.include_colbert,
        )

        response_dto = CreateEmbeddingsResultDto(
            embeddings=result.embeddings,
        )

        content = response_dto.model_dump()

        return ORJSONResponse(content=content)
