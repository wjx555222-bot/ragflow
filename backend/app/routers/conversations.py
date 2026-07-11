import json
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.logging import get_logger
from app.models.user import User
from app.models.knowledge_base import KnowledgeBase
from app.models.conversation import Conversation, Message
from app.schemas.conversation import (
    ConversationCreate,
    ConversationResponse,
    ConversationListResponse,
    ConversationDetailResponse,
    MessageResponse,
    ChatRequest,
    FeedbackCreate,
    FeedbackResponse,
)
from app.services.rag_service import build_context, stream_rag_response, generate_conversation_title, RAG_SYSTEM_PROMPT
from app.core.config import settings

logger = get_logger(__name__)
router = APIRouter(tags=["conversations"])


def _message_to_response(msg: Message) -> MessageResponse:
    return MessageResponse(
        id=msg.id,
        conversation_id=msg.conversation_id,
        role=msg.role,
        content=msg.content,
        sources=msg.sources,
        created_at=msg.created_at,
    )


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
    )
    items = result.scalars().all()
    return ConversationListResponse(
        total=len(items),
        items=[ConversationResponse.model_validate(item) for item in items],
    )


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kb_result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == data.knowledge_base_id,
            KnowledgeBase.user_id == current_user.id,
        )
    )
    if not kb_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    conv = Conversation(
        user_id=current_user.id,
        knowledge_base_id=data.knowledge_base_id,
        title=data.title,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return ConversationResponse.model_validate(conv)


@router.get("/{conv_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conv_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == current_user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    msgs_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
    )
    messages = msgs_result.scalars().all()

    resp = ConversationDetailResponse.model_validate(conv)
    resp.messages = [_message_to_response(m) for m in messages]
    return resp


@router.delete("/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conv_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == current_user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    await db.delete(conv)
    await db.commit()


@router.post("/{conv_id}/chat")
async def chat_with_knowledge_base(
    conv_id: str,
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == current_user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    user_msg = Message(
        conversation_id=conv_id,
        role="user",
        content=data.query,
    )
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    msgs_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
    )
    all_msgs = msgs_result.scalars().all()

    history = []
    for m in all_msgs[:-1]:
        history.append({"role": m.role, "content": m.content})

    context_text, sources = await build_context(query=data.query, kb_id=conv.knowledge_base_id)

    is_first_message = len(all_msgs) == 1
    assistant_msg = Message(
        conversation_id=conv_id,
        role="assistant",
        content="",
        sources=json.dumps(sources),
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    if data.stream:
        async def event_generator():
            full_response = ""
            try:
                async for chunk in stream_rag_response(
                    system_prompt=RAG_SYSTEM_PROMPT,
                    model=settings.deepseek_model,
                    query=data.query,
                    context=context_text,
                    history=history,
                ):
                    if chunk["type"] == "text":
                        full_response += chunk["content"]
                        yield f"data: {json.dumps({'type': 'text', 'content': chunk['content']})}\n\n"
                    elif chunk["type"] == "done":
                        if is_first_message:
                            try:
                                title = await generate_conversation_title(data.query)
                                async with async_session() as s:
                                    await s.execute(
                                        update(Conversation)
                                        .where(Conversation.id == conv_id)
                                        .values(title=title)
                                    )
                                    await s.commit()
                            except Exception:
                                pass

                        async with async_session() as s:
                            await s.execute(
                                update(Message)
                                .where(Message.id == assistant_msg.id)
                                .values(content=full_response, sources=json.dumps(sources))
                            )
                            await s.commit()

                        yield f"data: {json.dumps({'type': 'done', 'content': '', 'sources': sources, 'conversation_id': conv_id})}\n\n"
                        yield "data: [DONE]\n\n"
                    elif chunk["type"] == "error":
                        yield f"data: {json.dumps({'type': 'error', 'content': chunk['content']})}\n\n"
                        yield "data: [DONE]\n\n"
            except Exception as e:
                logger.exception("Stream error: %s", str(e))
                async with async_session() as s:
                    await s.execute(
                        update(Message)
                        .where(Message.id == assistant_msg.id)
                        .values(content=full_response, sources=json.dumps(sources))
                    )
                    await s.commit()
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
                yield "data: [DONE]\n\n"

        from app.core.database import async_session
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        full_response = ""
        async for chunk in stream_rag_response(
            system_prompt=RAG_SYSTEM_PROMPT,
            model=settings.deepseek_model,
            query=data.query,
            context=context_text,
            history=history,
        ):
            if chunk["type"] == "text":
                full_response += chunk["content"]
            elif chunk["type"] == "error":
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=chunk["content"])

        assistant_msg.content = full_response
        assistant_msg.sources = json.dumps(sources)
        await db.commit()
        await db.refresh(assistant_msg)

        if is_first_message:
            try:
                title = await generate_conversation_title(data.query)
                conv.title = title
                await db.commit()
            except Exception:
                pass

        return {
            "conversation_id": conv_id,
            "role": "assistant",
            "content": full_response,
            "sources": sources,
        }


@router.post("/{conv_id}/messages/{msg_id}/feedback", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    conv_id: str,
    msg_id: str,
    data: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    msg_result = await db.execute(select(Message).where(Message.id == msg_id, Message.conversation_id == conv_id))
    if not msg_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    from app.models.feedback import Feedback
    fb = Feedback(message_id=msg_id, user_id=current_user.id, rating=data.rating, comment=data.comment)
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return FeedbackResponse.model_validate(fb)


@router.get("/{conv_id}/export")
async def export_conversation(
    conv_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == current_user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    msgs_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
    )
    messages = msgs_result.scalars().all()

    export_lines = [f"# {conv.title}", f"Date: {conv.created_at.isoformat()}", ""]
    for msg in messages:
        role_label = "User" if msg.role == "user" else "Assistant"
        export_lines.append(f"## {role_label}")
        export_lines.append(msg.content)
        if msg.role == "assistant" and msg.sources:
            try:
                srcs = json.loads(msg.sources)
                if srcs:
                    export_lines.append("\nSources:")
                    for src in srcs:
                        export_lines.append(f"  - {src.get('document_name', 'unknown')}")
            except (json.JSONDecodeError, TypeError):
                pass
        export_lines.append("")

    export_text = "\n".join(export_lines)
    return {
        "conversation_id": conv_id,
        "title": conv.title,
        "export_text": export_text,
    }
