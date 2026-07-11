# RagFlow

Enterprise RAG (Retrieval-Augmented Generation) knowledge base platform. Upload documents, build knowledge bases, and chat with your data using AI powered by DeepSeek.

## Features

- **Document Processing** — Upload PDF, DOCX, Markdown, TXT, CSV files. Automatic parsing and intelligent chunking
- **Vector Search** — ChromaDB vector store with semantic similarity search
- **RAG Chat** — Ask questions about your documents, get AI-generated answers with source citations
- **Multi Knowledge Base** — Create and manage multiple isolated knowledge bases
- **Source Citations** — Every answer includes numbered references to the original document chunks
- **JWT Authentication** — User registration/login with role-based access
- **Dark Mode** — Full light/dark theme support
- **Production Ready** — Logging, error handling, Docker Compose

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python + FastAPI + SQLAlchemy (async) + SQLite |
| Vector DB | ChromaDB |
| AI Engine | DeepSeek (LLM) + BGE-large-zh (Embeddings) |
| Frontend | React 18 + TypeScript + Tailwind CSS + Zustand |
| Auth | JWT + bcrypt |
| Deployment | Docker Compose |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend   │────▶│   FastAPI    │────▶│   SQLite    │
│  React + TS  │     │   Backend    │     │  (Metadata) │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────▼───────┐
                    │   ChromaDB   │
                    │ (Vectors)    │
                    └──────────────┘

Document Flow:
Upload → Parse (PDF/DOCX/MD/TXT) → RecursiveCharacterTextSplitter
→ DeepSeek Embeddings → ChromaDB Store

Chat Flow:
User Question → Embed Query → Vector Search (top-K) → Context Assembly
→ DeepSeek LLM → Stream Response + Source Citations
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- DeepSeek API key (get from https://platform.deepseek.com)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and set DEEPSEEK_API_KEY=sk-xxx
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### 3. Docker

```bash
DEEPSEEK_API_KEY=sk-xxx docker-compose up
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT |
| GET | `/api/auth/me` | Get current user |
| GET/POST | `/api/knowledge_bases` | List / Create knowledge bases |
| GET/PUT/DELETE | `/api/knowledge_bases/:id` | Get / Update / Delete KB |
| GET | `/api/knowledge_bases/:id/stats` | KB statistics |
| POST | `/api/knowledge_bases/:id/upload` | Upload document (multipart) |
| GET | `/api/knowledge_bases/:id/documents` | List documents |
| DELETE | `/api/knowledge_bases/:id/documents/:doc_id` | Delete document |
| POST | `/api/knowledge_bases/:id/documents/:doc_id/reprocess` | Reprocess document |
| GET/POST | `/api/conversations` | List / Create conversations |
| DELETE | `/api/conversations/:id` | Delete conversation |
| POST | `/api/conversations/:id/chat` | Chat with KB (SSE stream) |
| GET | `/api/conversations/:id/export` | Export conversation |
| GET | `/api/health` | Health check |
| GET | `/api/stats` | Platform statistics |

## Project Structure

```
ragflow/
├── backend/
│   ├── app/
│   │   ├── core/               # Config, database, auth, logging, middleware
│   │   ├── models/             # User, KnowledgeBase, Document, Chunk, Conversation
│   │   ├── schemas/            # Pydantic request/response validation
│   │   ├── services/           # Document processing, vector store, RAG engine
│   │   ├── routers/            # Auth, KB, documents, conversations
│   │   └── main.py             # FastAPI entry point
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/                # API client with JWT
│   │   ├── components/         # Layout, Toast
│   │   ├── pages/              # Dashboard, KB, Documents, Chat
│   │   ├── stores/             # Auth store
│   │   └── types/              # TypeScript definitions
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Supported File Types

| Format | Extension | Parser |
|--------|-----------|--------|
| PDF | `.pdf` | PyPDF2 |
| Word | `.docx` | python-docx |
| Markdown | `.md` | Built-in |
| Plain Text | `.txt` | Built-in |
| CSV | `.csv` | Built-in |

## Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `DEEPSEEK_API_KEY` | - | DeepSeek API key (required) |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | DeepSeek API endpoint |
| `DEEPSEEK_MODEL` | `deepseek-chat` | LLM model name |
| `CHUNK_SIZE` | `500` | Text chunk size for splitting |
| `CHUNK_OVERLAP` | `50` | Chunk overlap amount |
| `RETRIEVAL_TOP_K` | `5` | Number of chunks to retrieve |
| `MAX_UPLOAD_SIZE_MB` | `20` | Max file upload size |

## License

MIT
