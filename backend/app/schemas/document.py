from datetime import datetime
from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: str
    knowledge_base_id: str
    filename: str
    file_type: str
    file_size: int
    status: str
    chunks_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    total: int
    items: list[DocumentResponse]


class DocumentUploadResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: int
    status: str
    message: str
