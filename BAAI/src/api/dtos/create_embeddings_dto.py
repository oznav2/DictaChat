from typing import List, Optional

from pydantic import BaseModel


class CreateEmbeddingsDto(BaseModel):
    texts: List[str]
    include_dense: Optional[bool] = True
    include_sparse: Optional[bool] = False
    include_colbert: Optional[bool] = False
