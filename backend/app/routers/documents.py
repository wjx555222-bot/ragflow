import os
import uuid
import asyncio
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.logging import get_logger
from app.models.user import User
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.knowledge_base import KnowledgeBase
from app.schemas.document import DocumentResponse, DocumentListResponse, DocumentUploadResponse
from app.services.document_service import process_document
from app.services.vector_store import delete_collection, add_chunks

logger = get_logger(__name__)
router = APIRouter(tags=["documents"])

ALLOWED_EXTENSIONS = {
    "pdf", "docx", "doc", "txt", "md", "csv", "json", "xml",
}


def get_file_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "unknown"
    return ext


@router.post("/{kb_id}/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    kb_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks = None,
):
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.user_id == current_user.id,
        )
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided")

    file_type = get_file_type(file.filename)
    if file_type not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file_type}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content = await file.read()
    file_size = len(content)
    max_size = settings.max_upload_size_mb * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds {settings.max_upload_size_mb}MB limit",
        )

    os.makedirs(settings.upload_dir, exist_ok=True)
    safe_filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(settings.upload_dir, safe_filename)
    with open(file_path, "wb") as f:
        f.write(content)

    doc = Document(
        knowledge_base_id=kb_id,
        filename=file.filename,
        file_type=file_type,
        file_size=file_size,
        status="processing",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(_process_document_task, doc.id, file_path, file_type)

    return DocumentUploadResponse(
        id=doc.id,
        filename=doc.filename,
        file_type=file_type,
        file_size=file_size,
        status="processing",
        message="Document uploaded, processing started",
    )


@router.post("/{kb_id}/batch-upload", status_code=status.HTTP_201_CREATED)
async def batch_upload_documents(
    kb_id: str,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks = None,
):
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.user_id == current_user.id,
        )
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    uploaded = []
    errors = []
    max_size = settings.max_upload_size_mb * 1024 * 1024

    for file_upload in files:
        if not file_upload.filename:
            errors.append({"filename": "unknown", "error": "No filename"})
            continue
        file_type = get_file_type(file_upload.filename)
        if file_type not in ALLOWED_EXTENSIONS:
            errors.append({"filename": file_upload.filename, "error": f"Unsupported type: {file_type}"})
            continue

        content = await file_upload.read()
        if len(content) > max_size:
            errors.append({"filename": file_upload.filename, "error": f"Exceeds {settings.max_upload_size_mb}MB limit"})
            continue

        os.makedirs(settings.upload_dir, exist_ok=True)
        safe_filename = f"{uuid.uuid4()}_{file_upload.filename}"
        file_path_item = os.path.join(settings.upload_dir, safe_filename)
        with open(file_path_item, "wb") as f:
            f.write(content)

        doc = Document(
            knowledge_base_id=kb_id,
            filename=file_upload.filename,
            file_type=file_type,
            file_size=len(content),
            status="processing",
        )
        db.add(doc)
        await db.flush()
        await db.refresh(doc)

        background_tasks.add_task(_process_document_task, doc.id, file_path_item, file_type)
        uploaded.append({"id": doc.id, "filename": file_upload.filename, "file_type": file_type, "status": "processing"})

    await db.commit()
    return {"uploaded": uploaded, "errors": errors, "total": len(uploaded) + len(errors)}


async def _process_document_task(document_id: str, file_path: str, file_type: str):
    from app.core.database import async_session
    async with async_session() as db:
        await process_document(db, document_id, file_path, file_type)


@router.get("/{kb_id}", response_model=DocumentListResponse)
async def list_documents(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.user_id == current_user.id,
        )
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    docs_result = await db.execute(
        select(Document)
        .where(Document.knowledge_base_id == kb_id)
        .order_by(Document.created_at.desc())
    )
    docs = docs_result.scalars().all()
    return DocumentListResponse(
        total=len(docs),
        items=[DocumentResponse.model_validate(d) for d in docs],
    )


@router.get("/{kb_id}/{doc_id}", response_model=DocumentResponse)
async def get_document(
    kb_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.knowledge_base_id == kb_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    kb_result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.user_id == current_user.id,
        )
    )
    if not kb_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    return DocumentResponse.model_validate(doc)


@router.delete("/{kb_id}/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    kb_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.knowledge_base_id == kb_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    kb_result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.user_id == current_user.id,
        )
    )
    if not kb_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    delete_collection(kb_id)
    await db.delete(doc)
    await db.commit()

    from app.models.document_chunk import DocumentChunk
    chunk_result = await db.execute(
        select(DocumentChunk).where(DocumentChunk.document_id == doc_id)
    )
    remaining_docs = await db.execute(
        select(Document).where(
            Document.knowledge_base_id == kb_id,
            Document.id != doc_id,
            Document.status == "ready",
        )
    )
    all_docs = remaining_docs.scalars().all()
    if all_docs:
        for d in all_docs:
            await _reindex_document(db, d)
    await db.commit()


async def _reindex_document(db: AsyncSession, doc: Document):
    from app.services.document_service import create_embeddings
    chunk_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == doc.id)
        .order_by(DocumentChunk.chunk_index)
    )
    chunks = chunk_result.scalars().all()
    if not chunks:
        return
    texts = [c.content for c in chunks]
    embeddings = await create_embeddings(texts)
    chunk_ids = [c.id for c in chunks]
    metadatas = []
    for c in chunks:
        metadatas.append({
            "document_id": doc.id,
            "filename": doc.filename,
            "chunk_index": c.chunk_index,
        })
    add_chunks(
        kb_id=doc.knowledge_base_id,
        chunk_ids=chunk_ids,
        texts=texts,
        embeddings=embeddings,
        metadatas=metadatas,
    )


@router.post("/{kb_id}/{doc_id}/reprocess", response_model=DocumentResponse)
async def reprocess_document(
    kb_id: str,
    doc_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.knowledge_base_id == kb_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    kb_result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.user_id == current_user.id,
        )
    )
    if not kb_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    from sqlalchemy import update
    await db.execute(
        update(Document).where(Document.id == doc_id).values(status="processing", chunks_count=0)
    )
    await db.commit()

    chunk_result = await db.execute(
        select(DocumentChunk).where(DocumentChunk.document_id == doc_id)
    )
    old_chunks = chunk_result.scalars().all()
    for chunk in old_chunks:
        await db.delete(chunk)
    await db.commit()

    safe_filename = f"{doc.id}_{doc.filename}"
    file_path = os.path.join(settings.upload_dir, safe_filename)
    if not os.path.exists(file_path):
        file_path = os.path.join(settings.upload_dir, f"{uuid.uuid4()}_{doc.filename}")
        for fname in os.listdir(settings.upload_dir):
            if fname.endswith(f"_{doc.filename}"):
                file_path = os.path.join(settings.upload_dir, fname)
                break

    background_tasks.add_task(_process_document_task, doc.id, file_path, doc.file_type)

    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)
