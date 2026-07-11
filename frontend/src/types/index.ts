export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  document_count: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_size: number;
  file_type: string;
  status: 'processing' | 'ready' | 'error';
  chunk_count: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
  chunk_index: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  knowledge_base_id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceChunk[];
  created_at: string;
}

export interface SourceChunk {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  score: number;
}

export interface ChatChunk {
  type: 'token' | 'source' | 'done' | 'error' | 'tool_call';
  content?: string;
  sources?: SourceChunk[];
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  error?: string;
}

export interface StatsResponse {
  knowledge_base_count: number;
  document_count: number;
  chunk_count: number;
  conversation_count: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
