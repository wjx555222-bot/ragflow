import os
import json
import csv
import io
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sentence_transformers import SentenceTransformer
from langchain.text_splitter import RecursiveCharacterTextSplitter
from app.core.config import settings
from app.core.logging import get_logger
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.vector_store import add_chunks, delete_collection

logger = get_logger(__name__)

_embedding_model: SentenceTransformer | None = None


def _get_embedding_model() -> SentenceTransformer:
    global _embedding_model
    if _embedding_model is None:
        logger.info("Loading embedding model: %s", settings.embedding_model)
        _embedding_model = SentenceTransformer(
            settings.embedding_model,
            device=settings.embedding_device,
        )
    return _embedding_model


def parse_file(file_path: str, file_type: str) -> str:
    file_type_lower = file_type.lower()
    text = ""

    if file_type_lower == "pdf":
        from PyPDF2 import PdfReader
        reader = PdfReader(file_path)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

    elif file_type_lower in ("docx", "doc"):
        from docx import Document as DocxDocument
        doc = DocxDocument(file_path)
        for paragraph in doc.paragraphs:
            if paragraph.text:
                text += paragraph.text + "\n"

    elif file_type_lower in ("txt", "md"):
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()

    elif file_type_lower == "csv":
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            reader = csv.reader(f)
            for row in reader:
                text += " | ".join(row) + "\n"

    else:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()

    return text.strip()


def split_text(text: str, chunk_size: int | None = None, chunk_overlap: int | None = None) -> list[str]:
    cs = chunk_size or settings.chunk_size
    co = chunk_overlap or settings.chunk_overlap
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=cs,
        chunk_overlap=co,
        separators=["\n\n", "\n", "。", ".", " ", ""],
    )
    return splitter.split_text(text)


async def create_embeddings(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _get_embedding_model()
    result = model.encode(texts, normalize_embeddings=True)
    return [emb.tolist() for emb in result]


async def process_document(
    db: AsyncSession,
    document_id: str,
    file_path: str,
    file_type: str,
) -> None:
    try:
        result = await db.execute(select(Document).where(Document.id == document_id))
        doc = result.scalar_one_or_none()
        if doc is None:
            logger.error("Document %s not found", document_id)
            return

        logger.info("Parsing document %s (%s)", document_id, file_type)
        full_text = parse_file(file_path, file_type)
        if not full_text:
            await db.execute(
                update(Document).where(Document.id == document_id).values(status="error")
            )
            await db.commit()
            logger.warning("Document %s parsed empty content", document_id)
            return

        logger.info("Splitting document %s into chunks", document_id)
        chunks = split_text(full_text)
        if not chunks:
            await db.execute(
                update(Document).where(Document.id == document_id).values(status="error")
            )
            await db.commit()
            return

        logger.info("Creating embeddings for %d chunks of document %s", len(chunks), document_id)
        embeddings = await create_embeddings(chunks)

        chunk_ids = []
        chunk_metadatas = []
        for i, chunk_text in enumerate(chunks):
            chunk = DocumentChunk(
                document_id=document_id,
                chunk_index=i,
                content=chunk_text,
                metadata=json.dumps({
                    "document_id": document_id,
                    "filename": doc.filename,
                    "chunk_index": i,
                    "knowledge_base_id": doc.knowledge_base_id,
                }),
            )
            db.add(chunk)
            chunk_ids.append(chunk.id)
            chunk_metadatas.append({
                "document_id": document_id,
                "filename": doc.filename,
                "chunk_index": i,
            })

        await db.flush()

        if doc.knowledge_base_id:
            add_chunks(
                kb_id=doc.knowledge_base_id,
                chunk_ids=chunk_ids,
                texts=chunks,
                embeddings=embeddings,
                metadatas=chunk_metadatas,
            )

        await db.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(status="ready", chunks_count=len(chunks))
        )
        await db.commit()

        logger.info("Document %s processed successfully with %d chunks", document_id, len(chunks))

    except Exception as e:
        logger.exception("Error processing document %s: %s", document_id, str(e))
        try:
            await db.execute(
                update(Document).where(Document.id == document_id).values(status="error")
            )
            await db.commit()
        except Exception:
            pass
