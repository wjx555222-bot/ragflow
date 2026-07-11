from datetime import datetime
from pydantic import BaseModel, Field


class SourceChunk(BaseModel):
    chunk_id: str
    document_name: str
    content: str
    score: float


class ConversationCreate(BaseModel):
    knowledge_base_id: str
    title: str = Field(default="New Conversation", max_length=500)
    first_message: str | None = None


class ConversationResponse(BaseModel):
    id: str
    user_id: str
    knowledge_base_id: str
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationListResponse(BaseModel):
    total: int
    items: list[ConversationResponse]


class ChatRequest(BaseModel):
    query: str
    stream: bool = True


class ChatStreamChunk(BaseModel):
    type: str
    content: str = ""
    sources: list[SourceChunk] = Field(default_factory=list)
    conversation_id: str = ""
    conversation_title: str = ""


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    sources: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetailResponse(ConversationResponse):
    messages: list[MessageResponse] = Field(default_factory=list)


class FeedbackCreate(BaseModel):
    message_id: str
    rating: str = Field(..., pattern="^(positive|negative)$")
    comment: str = Field(default="")


class FeedbackResponse(BaseModel):
    id: str
    message_id: str
    user_id: str
    rating: str
    comment: str
    created_at: datetime

    model_config = {"from_attributes": True}
