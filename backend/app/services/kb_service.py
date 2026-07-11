import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from app.models.knowledge_base import KnowledgeBase
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.document_service import create_embeddings
from app.services.vector_store import add_chunks, delete_collection, get_chroma_collection
from app.core.logging import get_logger

logger = get_logger(__name__)


async def copy_knowledge_base(db: AsyncSession, source_id: str, user_id: str, new_name: str | None = None) -> KnowledgeBase:
    src_result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == source_id))
    src = src_result.scalar_one_or_none()
    if not src:
        raise ValueError("Source knowledge base not found")

    new_kb = KnowledgeBase(
        name=new_name or f"{src.name} (Copy)",
        description=src.description,
        user_id=user_id,
    )
    db.add(new_kb)
    await db.flush()

    docs_result = await db.execute(
        select(Document).where(Document.knowledge_base_id == source_id, Document.status == "ready")
    )
    documents = docs_result.scalars().all()

    for doc in documents:
        new_doc = Document(
            knowledge_base_id=new_kb.id,
            filename=doc.filename,
            file_type=doc.file_type,
            file_size=doc.file_size,
            status="ready",
            chunks_count=doc.chunks_count,
        )
        db.add(new_doc)
        await db.flush()

        chunks_result = await db.execute(
            select(DocumentChunk).where(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.chunk_index)
        )
        chunks = chunks_result.scalars().all()

        if chunks:
            new_chunks = []
            chunk_ids = []
            texts = []
            metadatas = []
            for c in chunks:
                nc = DocumentChunk(
                    document_id=new_doc.id,
                    chunk_index=c.chunk_index,
                    content=c.content,
                    metadata=c.metadata,
                )
                new_chunks.append(nc)

            db.add_all(new_chunks)
            await db.flush()

            for nc in new_chunks:
                chunk_ids.append(nc.id)
                texts.append(nc.content)
                metadatas.append({"document_id": new_doc.id, "filename": doc.filename, "chunk_index": nc.chunk_index})

            try:
                embeddings = await create_embeddings(texts)
                add_chunks(kb_id=new_kb.id, chunk_ids=chunk_ids, texts=texts, embeddings=embeddings, metadatas=metadatas)
            except Exception as e:
                logger.warning("Copy KB: embedding failed for document %s: %s", doc.filename, str(e))

    await db.commit()
    await db.refresh(new_kb)
    return new_kb


async def merge_knowledge_bases(db: AsyncSession, source_ids: list[str], target_id: str, user_id: str) -> KnowledgeBase:
    target_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == target_id, KnowledgeBase.user_id == user_id)
    )
    target = target_result.scalar_one_or_none()
    if not target:
        raise ValueError("Target knowledge base not found")

    for src_id in source_ids:
        if src_id == target_id:
            continue
        docs_result = await db.execute(
            select(Document).where(Document.knowledge_base_id == src_id, Document.status == "ready")
        )
        documents = docs_result.scalars().all()

        for doc in documents:
            chunks_result = await db.execute(
                select(DocumentChunk).where(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.chunk_index)
            )
            chunks = chunks_result.scalars().all()

            if not chunks:
                continue

            new_doc = Document(
                knowledge_base_id=target_id,
                filename=f"[merged] {doc.filename}",
                file_type=doc.file_type,
                file_size=doc.file_size,
                status="ready",
                chunks_count=len(chunks),
            )
            db.add(new_doc)
            await db.flush()

            new_chunks = []
            chunk_ids = []
            texts = []
            metadatas = []
            for c in chunks:
                nc = DocumentChunk(document_id=new_doc.id, chunk_index=c.chunk_index, content=c.content, metadata=c.metadata)
                new_chunks.append(nc)
            db.add_all(new_chunks)
            await db.flush()

            for nc in new_chunks:
                chunk_ids.append(nc.id)
                texts.append(nc.content)
                metadatas.append({"document_id": new_doc.id, "filename": doc.filename, "chunk_index": nc.chunk_index})

            try:
                embeddings = await create_embeddings(texts)
                add_chunks(kb_id=target_id, chunk_ids=chunk_ids, texts=texts, embeddings=embeddings, metadatas=metadatas)
            except Exception as e:
                logger.warning("Merge KB: embedding failed for %s: %s", doc.filename, str(e))

    await db.commit()
    await db.refresh(target)
    return target


async def rebuild_vector_index(db: AsyncSession, kb_id: str, user_id: str) -> int:
    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == user_id)
    )
    if not kb_result.scalar_one_or_none():
        raise ValueError("Knowledge base not found")

    delete_collection(kb_id)

    docs_result = await db.execute(
        select(Document).where(Document.knowledge_base_id == kb_id, Document.status == "ready")
    )
    documents = docs_result.scalars().all()

    total_indexed = 0
    for doc in documents:
        chunks_result = await db.execute(
            select(DocumentChunk).where(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.chunk_index)
        )
        chunks = chunks_result.scalars().all()
        if not chunks:
            continue

        texts = [c.content for c in chunks]
        chunk_ids = [c.id for c in chunks]
        metadatas = [{"document_id": doc.id, "filename": doc.filename, "chunk_index": c.chunk_index} for c in chunks]

        try:
            embeddings = await create_embeddings(texts)
            add_chunks(kb_id=kb_id, chunk_ids=chunk_ids, texts=texts, embeddings=embeddings, metadatas=metadatas)
            total_indexed += len(chunks)
        except Exception as e:
            logger.warning("Rebuild index: embedding failed for doc %s: %s", doc.filename, str(e))

    await db.commit()
    return total_indexed


async def get_chunk_preview(db: AsyncSession, kb_id: str, offset: int = 0, limit: int = 20) -> dict:
    docs_result = await db.execute(
        select(Document).where(Document.knowledge_base_id == kb_id, Document.status == "ready")
    )
    documents = docs_result.scalars().all()
    doc_ids = [d.id for d in documents]

    if not doc_ids:
        return {"chunks": [], "total": 0}

    total = await db.scalar(
        select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id.in_(doc_ids))
    )

    chunks_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id.in_(doc_ids))
        .order_by(DocumentChunk.created_at)
        .offset(offset)
        .limit(limit)
    )
    chunks = chunks_result.scalars().all()

    doc_name_map = {d.id: d.filename for d in documents}
    chunk_list = []
    for c in chunks:
        chunk_list.append({
            "chunk_id": c.id,
            "document_name": doc_name_map.get(c.document_id, "unknown"),
            "chunk_index": c.chunk_index,
            "content": c.content[:400],
            "full_length": len(c.content),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return {"chunks": chunk_list, "total": total or 0}
