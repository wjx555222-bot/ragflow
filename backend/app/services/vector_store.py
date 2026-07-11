import chromadb
from chromadb.config import Settings as ChromaSettings
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_client: chromadb.PersistentClient | None = None


def _get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def _collection_name(kb_id: str) -> str:
    return f"kb_{kb_id}"


def get_chroma_collection(kb_id: str):
    client = _get_client()
    name = _collection_name(kb_id)
    return client.get_or_create_collection(name=name)


def add_chunks(
    kb_id: str,
    chunk_ids: list[str],
    texts: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict] | None = None,
) -> None:
    if not chunk_ids:
        return
    try:
        collection = get_chroma_collection(kb_id)
        collection.add(
            ids=chunk_ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
        )
        logger.info("Added %d chunks to collection %s", len(chunk_ids), _collection_name(kb_id))
    except Exception as e:
        logger.exception("Failed to add chunks to collection %s: %s", _collection_name(kb_id), str(e))


def search_similar(
    kb_id: str,
    query_embedding: list[float],
    top_k: int | None = None,
) -> list[tuple[str, float, dict]]:
    k = top_k or settings.retrieval_top_k
    try:
        collection = get_chroma_collection(kb_id)
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=k,
            include=["metadatas", "distances", "documents"],
        )
        items = []
        if results["ids"] and results["ids"][0]:
            for i, chunk_id in enumerate(results["ids"][0]):
                score = 1.0 - results["distances"][0][i] if results["distances"] else 0.0
                metadata = results["metadatas"][0][i] if results["metadatas"] else {}
                items.append((chunk_id, score, metadata))
        return items
    except Exception as e:
        logger.exception("Error searching collection %s: %s", _collection_name(kb_id), str(e))
        return []


def delete_collection(kb_id: str) -> None:
    try:
        client = _get_client()
        name = _collection_name(kb_id)
        try:
            client.delete_collection(name=name)
            logger.info("Deleted collection %s", name)
        except Exception:
            logger.warning("Collection %s does not exist or already deleted", name)
    except Exception as e:
        logger.exception("Error deleting collection %s: %s", _collection_name(kb_id), str(e))
