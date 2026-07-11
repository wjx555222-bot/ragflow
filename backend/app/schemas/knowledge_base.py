from datetime import datetime
from pydantic import BaseModel, Field


class KBCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)


class KBUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)


class KBResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KBListResponse(BaseModel):
    total: int
    items: list[KBResponse]


class KBStatsResponse(BaseModel):
    id: str
    name: str
    document_count: int
    chunk_count: int


class KBCloneRequest(BaseModel):
    new_name: str | None = None


class KBMergeRequest(BaseModel):
    source_ids: list[str]
    target_id: str


class ChunkPreviewItem(BaseModel):
    chunk_id: str
    document_name: str
    chunk_index: int
    content: str
    full_length: int
    created_at: str | None = None


class ChunkPreviewResponse(BaseModel):
    chunks: list[ChunkPreviewItem]
    total: int
