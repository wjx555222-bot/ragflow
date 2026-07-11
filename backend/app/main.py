import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from app.core.config import settings
from app.core.logging import setup_logging, get_logger
from app.core.database import init_db
from app.core.middleware import LoggingMiddleware, validation_error_handler, global_exception_handler
from app.core.auth import get_current_user
from app.routers.auth import router as auth_router
from app.routers.knowledge_bases import router as kb_router
from app.routers.documents import router as docs_router
from app.routers.conversations import router as conv_router

setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting RagFlow application...")
    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.chroma_persist_dir, exist_ok=True)
    await init_db()
    logger.info("Database initialized")
    logger.info("RagFlow application started successfully")
    yield
    logger.info("Shutting down RagFlow application...")


app = FastAPI(
    title="RagFlow",
    description="RAG Enterprise Knowledge Base Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(LoggingMiddleware)

app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(Exception, global_exception_handler)

app.include_router(auth_router, prefix="/api/auth")
app.include_router(kb_router, prefix="/api/knowledge_bases")
app.include_router(docs_router, prefix="/api/knowledge_bases")
app.include_router(conv_router, prefix="/api/conversations")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/stats")
async def api_stats():
    from app.core.database import async_session
    from sqlalchemy import select, func
    from app.models.user import User
    from app.models.knowledge_base import KnowledgeBase
    from app.models.document import Document
    from app.models.document_chunk import DocumentChunk
    from app.models.conversation import Conversation

    async with async_session() as db:
        user_count = (await db.execute(select(func.count(User.id)))).scalar() or 0
        kb_count = (await db.execute(select(func.count(KnowledgeBase.id)))).scalar() or 0
        doc_count = (await db.execute(select(func.count(Document.id)))).scalar() or 0
        chunk_count = (await db.execute(select(func.count(DocumentChunk.id)))).scalar() or 0
        conv_count = (await db.execute(select(func.count(Conversation.id)))).scalar() or 0

    return {
        "users": user_count,
        "knowledge_bases": kb_count,
        "documents": doc_count,
        "chunks": chunk_count,
        "conversations": conv_count,
    }
