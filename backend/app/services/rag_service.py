import json
from typing import AsyncIterator
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage, AIMessage
from sentence_transformers import SentenceTransformer
from app.core.config import settings
from app.core.logging import get_logger
from app.services.vector_store import search_similar

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


RAG_SYSTEM_PROMPT = """You are a helpful AI assistant with access to a knowledge base.
Use the provided context to answer the user's question accurately and concisely.

If the context does not contain enough information to answer the question, say so honestly.
Do not make up information that is not in the context.

Context:
{context}

When referencing information from the context, cite the source document names when possible."""


async def build_context(query: str, kb_id: str, top_k: int | None = None) -> tuple[str, list[dict]]:
    model = _get_embedding_model()
    query_embedding = model.encode(query, normalize_embeddings=True).tolist()

    results = search_similar(kb_id=kb_id, query_embedding=query_embedding, top_k=top_k)

    if not results:
        return "", []

    context_parts = []
    sources = []
    contents_map = {}

    collection_name = f"kb_{kb_id}"
    import chromadb
    from chromadb.config import Settings as ChromaSettings
    try:
        client_chroma = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        collection = client_chroma.get_collection(name=collection_name)
        chunk_ids = [r[0] for r in results]
        doc_results = collection.get(ids=chunk_ids, include=["documents"])
        if doc_results and doc_results["documents"]:
            for i, chunk_id in enumerate(doc_results["ids"]):
                contents_map[chunk_id] = doc_results["documents"][i] if doc_results["documents"][i] else ""
    except Exception:
        pass

    for chunk_id, score, metadata in results:
        content = contents_map.get(chunk_id, "")
        doc_name = metadata.get("filename", "unknown")
        context_parts.append(f"[Source: {doc_name}]\n{content}")
        sources.append({
            "chunk_id": chunk_id,
            "document_name": doc_name,
            "content": content,
            "score": round(score, 4),
        })

    context_text = "\n\n---\n\n".join(context_parts)
    return context_text, sources


async def stream_rag_response(
    system_prompt: str,
    model: str,
    query: str,
    context: str,
    history: list[dict] | None = None,
) -> AsyncIterator[dict]:
    filled_prompt = system_prompt.format(context=context) if "{context}" in system_prompt else system_prompt

    messages = [SystemMessage(content=filled_prompt)]

    if history:
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=query))

    llm = ChatOpenAI(
        model=model,
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
        streaming=True,
        temperature=0.7,
        max_tokens=2048,
    )

    try:
        async for chunk in llm.astream(messages):
            if chunk.content:
                yield {"type": "text", "content": chunk.content}
    except Exception as e:
        logger.exception("Error streaming RAG response: %s", str(e))
        yield {"type": "error", "content": str(e)}

    yield {"type": "done", "content": ""}


async def generate_conversation_title(first_message: str) -> str:
    try:
        llm = ChatOpenAI(
            model=settings.deepseek_model,
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            temperature=0.3,
            max_tokens=50,
        )
        prompt = f"""Generate a short, concise title (maximum 10 words) for a conversation that starts with this message. 
Reply with only the title, no quotes or extra text.

Message: {first_message}

Title:"""
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        title = response.content
        if title:
            title = title.strip().strip('"').strip("'")
            if len(title) > 100:
                title = title[:97] + "..."
            return title
    except Exception as e:
        logger.warning("Failed to generate conversation title: %s", str(e))
    return "New Conversation"
