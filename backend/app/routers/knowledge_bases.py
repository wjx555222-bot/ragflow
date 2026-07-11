from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.knowledge_base import KnowledgeBase
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.schemas.knowledge_base import (
    KBCreate, KBUpdate, KBResponse, KBListResponse, KBStatsResponse,
    KBCloneRequest, KBMergeRequest, ChunkPreviewResponse,
)
from app.services.vector_store import delete_collection
from app.services.kb_service import (
    copy_knowledge_base, merge_knowledge_bases,
    rebuild_vector_index, get_chunk_preview,
)

router = APIRouter(tags=["knowledge_bases"])


@router.get("", response_model=KBListResponse)
async def list_knowledge_bases(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KnowledgeBase)
        .where(KnowledgeBase.user_id == current_user.id)
        .order_by(KnowledgeBase.updated_at.desc())
    )
    items = result.scalars().all()
    return KBListResponse(
        total=len(items),
        items=[KBResponse.model_validate(item) for item in items],
    )


@router.post("", response_model=KBResponse, status_code=status.HTTP_201_CREATED)
async def create_knowledge_base(
    data: KBCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kb = KnowledgeBase(
        user_id=current_user.id,
        name=data.name,
        description=data.description,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return KBResponse.model_validate(kb)


@router.get("/{kb_id}", response_model=KBResponse)
async def get_knowledge_base(
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
    return KBResponse.model_validate(kb)


@router.put("/{kb_id}", response_model=KBResponse)
async def update_knowledge_base(
    kb_id: str,
    data: KBUpdate,
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

    if data.name is not None:
        kb.name = data.name
    if data.description is not None:
        kb.description = data.description

    await db.commit()
    await db.refresh(kb)
    return KBResponse.model_validate(kb)


@router.delete("/{kb_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge_base(
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

    delete_collection(kb_id)
    await db.delete(kb)
    await db.commit()


@router.get("/{kb_id}/stats", response_model=KBStatsResponse)
async def get_knowledge_base_stats(
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

    doc_count_result = await db.execute(
        select(func.count(Document.id)).where(Document.knowledge_base_id == kb_id)
    )
    doc_count = doc_count_result.scalar() or 0

    chunk_count_result = await db.execute(
        select(func.count(DocumentChunk.id))
        .join(Document, DocumentChunk.document_id == Document.id)
        .where(Document.knowledge_base_id == kb_id)
    )
    chunk_count = chunk_count_result.scalar() or 0

    return KBStatsResponse(
        id=kb.id,
        name=kb.name,
        document_count=doc_count,
        chunk_count=chunk_count,
    )


@router.post("/{kb_id}/clone", response_model=KBResponse, status_code=status.HTTP_201_CREATED)
async def clone_knowledge_base(
    kb_id: str,
    data: KBCloneRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_kb = await copy_knowledge_base(db, kb_id, current_user.id, data.new_name if data else None)
    return KBResponse.model_validate(new_kb)


@router.post("/{kb_id}/merge", response_model=KBResponse)
async def merge_to_knowledge_base(
    kb_id: str,
    data: KBMergeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    merged = await merge_knowledge_bases(db, data.source_ids, kb_id, current_user.id)
    return KBResponse.model_validate(merged)


@router.post("/{kb_id}/rebuild-index")
async def rebuild_index(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kb_result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.user_id == current_user.id,
        )
    )
    if not kb_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")
    total = await rebuild_vector_index(db, kb_id, current_user.id)
    return {"status": "ok", "chunks_indexed": total}


@router.get("/{kb_id}/chunks", response_model=ChunkPreviewResponse)
async def preview_chunks(
    kb_id: str,
    offset: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kb_result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.user_id == current_user.id,
        )
    )
    if not kb_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")
    result = await get_chunk_preview(db, kb_id, offset, limit)
    return ChunkPreviewResponse(**result)
