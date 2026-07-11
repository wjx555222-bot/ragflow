import type {
  User,
  KnowledgeBase,
  Document,
  Conversation,
  Message,
  StatsResponse,
  ApiResponse,
  PaginatedResponse,
} from '@/types';

const API_BASE = '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('未授权，请重新登录');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const message =
      errorData?.detail || errorData?.message || `请求失败 (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

export const authApi = {
  register: (data: {
    username: string;
    email: string;
    password: string;
  }): Promise<ApiResponse<{ token: string; user: User }>> =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: {
    username: string;
    password: string;
  }): Promise<ApiResponse<{ token: string; user: User }>> =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const knowledgeBaseApi = {
  list: (): Promise<ApiResponse<KnowledgeBase[]>> =>
    request('/knowledge-bases'),

  create: (data: {
    name: string;
    description?: string;
  }): Promise<ApiResponse<KnowledgeBase>> =>
    request('/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: string): Promise<ApiResponse<KnowledgeBase>> =>
    request(`/knowledge-bases/${id}`),

  update: (
    id: string,
    data: { name?: string; description?: string }
  ): Promise<ApiResponse<KnowledgeBase>> =>
    request(`/knowledge-bases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string): Promise<ApiResponse<null>> =>
    request(`/knowledge-bases/${id}`, {
      method: 'DELETE',
    }),

  getStats: (id: string): Promise<ApiResponse<StatsResponse>> =>
    request(`/knowledge-bases/${id}/stats`),

  submitFeedback: (
    convId: string,
    msgId: string,
    data: { message_id: string; rating: string; comment: string }
  ): Promise<ApiResponse<null>> =>
    request(`/conversations/${convId}/messages/${msgId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  cloneKB: (
    kbId: string,
    data?: { new_name?: string }
  ): Promise<ApiResponse<KnowledgeBase>> =>
    request(`/knowledge-bases/${kbId}/clone`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  mergeKB: (
    kbId: string,
    data: { source_ids: string[]; target_id: string }
  ): Promise<ApiResponse<KnowledgeBase>> =>
    request(`/knowledge-bases/${kbId}/merge`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  rebuildIndex: (kbId: string): Promise<ApiResponse<null>> =>
    request(`/knowledge-bases/${kbId}/rebuild-index`, {
      method: 'POST',
    }),

  getChunks: (
    kbId: string,
    offset: number = 0,
    limit: number = 20,
    docId?: string
  ): Promise<PaginatedResponse<Record<string, unknown>>> => {
    let url = `/knowledge-bases/${kbId}/chunks?offset=${offset}&limit=${limit}`;
    if (docId) url += `&document_id=${docId}`;
    return request(url);
  },
};

export const documentApi = {
  upload: (
    knowledgeBaseId: string,
    file: File
  ): Promise<ApiResponse<Document>> => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/knowledge-bases/${knowledgeBaseId}/documents`, {
      method: 'POST',
      body: formData,
    });
  },

  listByKB: (
    knowledgeBaseId: string
  ): Promise<ApiResponse<Document[]>> =>
    request(`/knowledge-bases/${knowledgeBaseId}/documents`),

  get: (
    knowledgeBaseId: string,
    documentId: string
  ): Promise<ApiResponse<Document>> =>
    request(`/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`),

  delete: (
    knowledgeBaseId: string,
    documentId: string
  ): Promise<ApiResponse<null>> =>
    request(`/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`, {
      method: 'DELETE',
    }),

  reprocess: (
    knowledgeBaseId: string,
    documentId: string
  ): Promise<ApiResponse<Document>> =>
    request(
      `/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/reprocess`,
      { method: 'POST' }
    ),

  batchUpload: (
    knowledgeBaseId: string,
    files: File[]
  ): Promise<ApiResponse<Document[]>> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return request(`/knowledge-bases/${knowledgeBaseId}/batch-upload`, {
      method: 'POST',
      body: formData,
    });
  },
};

export const conversationApi = {
  list: (
    knowledgeBaseId: string
  ): Promise<ApiResponse<Conversation[]>> =>
    request(`/knowledge-bases/${knowledgeBaseId}/conversations`),

  create: (
    knowledgeBaseId: string,
    title?: string
  ): Promise<ApiResponse<Conversation>> =>
    request(`/knowledge-bases/${knowledgeBaseId}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ title: title || '新对话' }),
    }),

  get: (
    knowledgeBaseId: string,
    conversationId: string
  ): Promise<ApiResponse<Conversation>> =>
    request(
      `/knowledge-bases/${knowledgeBaseId}/conversations/${conversationId}`
    ),

  getMessages: (
    knowledgeBaseId: string,
    conversationId: string
  ): Promise<ApiResponse<Message[]>> =>
    request(
      `/knowledge-bases/${knowledgeBaseId}/conversations/${conversationId}/messages`
    ),

  delete: (
    knowledgeBaseId: string,
    conversationId: string
  ): Promise<ApiResponse<null>> =>
    request(
      `/knowledge-bases/${knowledgeBaseId}/conversations/${conversationId}`,
      { method: 'DELETE' }
    ),

  chat: (
    knowledgeBaseId: string,
    conversationId: string,
    message: string
  ): Promise<Response> => {
    const token = getToken();
    return fetch(
      `${API_BASE}/knowledge-bases/${knowledgeBaseId}/conversations/${conversationId}/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ message }),
      }
    );
  },
};

export const statsApi = {
  getStats: (): Promise<ApiResponse<StatsResponse>> =>
    request('/stats'),
};
