import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  MessageSquare,
  Upload,
  Send,
  Trash2,
  RefreshCw,
  Bot,
  User,
  Loader2,
  BookOpen,
  ArrowLeft,
  Settings,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  File,
  FileArchive,
  FileCode,
  FileImage,
  AlertTriangle,
  ExternalLink,
  Plus,
  Copy,
  Layers,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { knowledgeBaseApi, documentApi, conversationApi } from '@/api/client';
import type {
  KnowledgeBase,
  Document,
  Conversation,
  Message,
  SourceChunk,
} from '@/types';
import { useToastStore } from '@/components/Toast';

type Tab = 'documents' | 'chat';

const fileTypeIcon = (type: string) => {
  if (/pdf/i.test(type)) return FileText;
  if (/word|doc/i.test(type)) return FileText;
  if (/zip|rar|7z/i.test(type)) return FileArchive;
  if (/code|py|js|ts|java|go|rust/i.test(type)) return FileCode;
  if (/image|png|jpg|jpeg/i.test(type)) return FileImage;
  return File;
};

const fileTypeColor = (type: string) => {
  if (/pdf/i.test(type)) return 'text-red-500';
  if (/word|doc/i.test(type)) return 'text-blue-500';
  if (/zip|rar/i.test(type)) return 'text-yellow-500';
  if (/code|py|js/i.test(type)) return 'text-green-500';
  if (/image/i.test(type)) return 'text-purple-500';
  return 'text-gray-500';
};

const statusConfig = {
  processing: {
    icon: Clock,
    color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    label: '处理中',
  },
  ready: {
    icon: CheckCircle2,
    color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    label: '就绪',
  },
  error: {
    icon: AlertCircle,
    color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    label: '错误',
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KnowledgeBaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [tab, setTab] = useState<Tab>('documents');
  const [loading, setLoading] = useState(true);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [streamSources, setStreamSources] = useState<SourceChunk[]>([]);

  const [showSettings, setShowSettings] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const [batchUploading, setBatchUploading] = useState(false);
  const [showChunkPreview, setShowChunkPreview] = useState(false);
  const [chunks, setChunks] = useState<Record<string, unknown>[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunkOffset, setChunkOffset] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [cloning, setCloning] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!id) return;
    const fetchKb = async () => {
      try {
        const [kbRes, docRes] = await Promise.all([
          knowledgeBaseApi.get(id),
          documentApi.listByKB(id),
        ]);
        setKb(kbRes.data);
        setDocuments(docRes.data || []);
        setEditName(kbRes.data.name);
        setEditDesc(kbRes.data.description || '');
      } catch {
        addToast('error', '加载知识库失败');
      } finally {
        setLoading(false);
      }
    };
    fetchKb();
  }, [id]);

  useEffect(() => {
    if (!id || tab !== 'chat') return;
    const fetchConvs = async () => {
      try {
        const res = await conversationApi.list(id);
        setConversations(res.data || []);
      } catch {
        //
      }
    };
    fetchConvs();
  }, [id, tab]);

  useEffect(() => {
    if (!id || !activeConvId) return;
    const fetchMessages = async () => {
      try {
        const res = await conversationApi.getMessages(id, activeConvId);
        setMessages(res.data || []);
      } catch {
        //
      }
    };
    fetchMessages();
  }, [id, activeConvId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamContent, scrollToBottom]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      await documentApi.upload(id, file);
      addToast('success', '文件上传成功，正在处理中...');
      const res = await documentApi.listByKB(id);
      setDocuments(res.data || []);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      await documentApi.upload(id, file);
      addToast('success', '文件上传成功，正在处理中...');
      const res = await documentApi.listByKB(id);
      setDocuments(res.data || []);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!id || !window.confirm('确定要删除这个文档吗？')) return;
    try {
      await documentApi.delete(id, docId);
      addToast('success', '文档已删除');
      const res = await documentApi.listByKB(id);
      setDocuments(res.data || []);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleReprocessDoc = async (docId: string) => {
    if (!id) return;
    try {
      await documentApi.reprocess(id, docId);
      addToast('success', '已开始重新处理');
      const res = await documentApi.listByKB(id);
      setDocuments(res.data || []);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '重新处理失败');
    }
  };

  const handleCreateConv = async () => {
    if (!id) return;
    try {
      const res = await conversationApi.create(id, '新对话');
      setConversations((prev) => [res.data, ...prev]);
      setActiveConvId(res.data.id);
      setMessages([]);
    } catch {
      addToast('error', '创建对话失败');
    }
  };

  const handleDeleteConv = async (convId: string) => {
    if (!id || !window.confirm('确定要删除这个对话吗？')) return;
    try {
      await conversationApi.delete(id, convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
      addToast('success', '对话已删除');
    } catch {
      addToast('error', '删除对话失败');
    }
  };

  const handleSend = async () => {
    if (!id || !activeConvId || !input.trim() || streaming) return;
    const userMessage = input.trim();
    setInput('');
    setStreamContent('');
    setStreamSources([]);
    setStreaming(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: activeConvId,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await conversationApi.chat(id, activeConvId, userMessage);
      if (!response.ok) throw new Error('请求失败');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let sources: SourceChunk[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'token' && data.content) {
              fullContent += data.content;
              setStreamContent(fullContent);
            } else if (data.type === 'source' && data.sources) {
              sources = data.sources;
              setStreamSources(sources);
            } else if (data.type === 'error') {
              throw new Error(data.error || '对话出错');
            }
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        conversation_id: activeConvId,
        role: 'assistant',
        content: fullContent,
        sources,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamContent('');
      setStreamSources([]);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '发送失败');
    } finally {
      setStreaming(false);
    }
  };

  const handleSaveKb = async () => {
    if (!id || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await knowledgeBaseApi.update(id, {
        name: editName.trim(),
        description: editDesc.trim(),
      });
      setKb(res.data);
      addToast('success', '知识库已更新');
      setShowSettings(false);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !id) return;
    setBatchUploading(true);
    try {
      await documentApi.batchUpload(id, Array.from(files));
      addToast('success', `成功上传 ${files.length} 个文件，正在处理中...`);
      const res = await documentApi.listByKB(id);
      setDocuments(res.data || []);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '批量上传失败');
    } finally {
      setBatchUploading(false);
      if (batchFileInputRef.current) batchFileInputRef.current.value = '';
    }
  };

  const fetchChunks = async (offset: number, limit: number) => {
    if (!id) return;
    setChunksLoading(true);
    try {
      const res = await knowledgeBaseApi.getChunks(id, offset, limit);
      setChunks((res.data || []) as Record<string, unknown>[]);
      setChunksTotal(res.total || 0);
    } catch {
      addToast('error', '加载知识块失败');
    } finally {
      setChunksLoading(false);
    }
  };

  const openChunkPreview = () => {
    setChunkOffset(0);
    setShowChunkPreview(true);
    fetchChunks(0, 20);
  };

  const handleChunkPageChange = (newOffset: number) => {
    setChunkOffset(newOffset);
    fetchChunks(newOffset, 20);
  };

  const handleCloneKB = async () => {
    if (!id) return;
    setCloning(true);
    try {
      await knowledgeBaseApi.cloneKB(id);
      addToast('success', '知识库克隆成功');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '克隆失败');
    } finally {
      setCloning(false);
    }
  };

  const handleRebuildIndex = async () => {
    if (!id) return;
    if (!window.confirm('确定要重建索引吗？这可能需要一些时间。')) return;
    setRebuilding(true);
    try {
      await knowledgeBaseApi.rebuildIndex(id);
      addToast('success', '索引重建已开始');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '重建索引失败');
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="skeleton h-10 w-64 mb-4 rounded-2xl" />
        <div className="skeleton h-5 w-96 mb-8 rounded-2xl" />
        <div className="flex gap-3 mb-6">
          <div className="skeleton h-10 w-28 rounded-2xl" />
          <div className="skeleton h-10 w-28 rounded-2xl" />
        </div>
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  if (!kb) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto text-center">
        <AlertTriangle className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          知识库不存在
        </h2>
        <button onClick={() => navigate('/knowledge-bases')} className="btn-primary">
          返回知识库列表
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate('/knowledge-bases')}
          className="btn-ghost p-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary-500" />
            {kb.name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {kb.description || '暂无描述'} · {kb.document_count} 个文档 · {kb.chunk_count} 个知识块
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="btn-ghost ml-auto"
          title="设置"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 dark:border-gray-800">
        {(
          [
            ['documents', '文档', FileText],
            ['chat', '对话', MessageSquare],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'documents' && (
        <div>
          <div
            className={`card p-8 mb-6 border-2 border-dashed text-center transition-colors ${
              uploading
                ? 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleUpload}
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.ppt,.pptx"
            />
            {uploading ? (
              <Loader2 className="w-10 h-10 text-primary-500 animate-spin mx-auto mb-3" />
            ) : (
              <Upload className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
            )}
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {uploading ? '上传中...' : '拖拽文件到此处，或点击上传'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              支持 PDF、Word、TXT、Markdown、CSV、Excel 等格式
            </p>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <input
              ref={batchFileInputRef}
              type="file"
              className="hidden"
              onChange={handleBatchUpload}
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.ppt,.pptx"
            />
            <button
              onClick={() => batchFileInputRef.current?.click()}
              disabled={batchUploading}
              className="btn-secondary text-sm"
            >
              {batchUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              批量上传
            </button>
            <button
              onClick={openChunkPreview}
              className="btn-ghost text-sm"
            >
              <Grid3X3 className="w-4 h-4" />
              知识块预览
            </button>
          </div>

          <div className="space-y-3">
            {documents.map((doc) => {
              const TypeIcon = fileTypeIcon(doc.file_type);
              const status = statusConfig[doc.status];
              const StatusIcon = status.icon;
              return (
                <div
                  key={doc.id}
                  className="card p-4 flex items-center gap-4"
                >
                  <TypeIcon
                    className={`w-8 h-8 flex-shrink-0 ${fileTypeColor(doc.file_type)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {doc.filename}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <span>{formatSize(doc.file_size)}</span>
                      <span>{doc.chunk_count} 个知识块</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </div>
                    {doc.status === 'error' && doc.error_message && (
                      <p className="text-xs text-red-500 mt-1">{doc.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {doc.status === 'error' && (
                      <button
                        onClick={() => handleReprocessDoc(doc.id)}
                        className="btn-ghost text-xs p-2"
                        title="重新处理"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDoc(doc.id);
                      }}
                      className="btn-ghost text-xs p-2 text-red-500 hover:text-red-600"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            {documents.length === 0 && !docsLoading && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  还没有文档，上传您的第一个文档吧
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'chat' && (
        <div className="flex gap-4" style={{ height: 'calc(100vh - 280px)' }}>
          <div className="w-64 flex-shrink-0 card p-3 overflow-y-auto scrollbar-thin">
            <button onClick={handleCreateConv} className="btn-primary w-full text-sm mb-3">
              <Plus className="w-4 h-4" />
              新对话
            </button>
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-colors text-sm ${
                    activeConvId === conv.id
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="truncate flex-1 min-w-0">{conv.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConv(conv.id);
                    }}
                    className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 card flex flex-col overflow-hidden">
            {activeConvId ? (
              <>
                <div
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4"
                >
                  {messages.map((msg) => (
                    <div key={msg.id}>
                      <div
                        className={`flex gap-3 ${
                          msg.role === 'assistant'
                            ? 'flex-row'
                            : 'flex-row-reverse'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                            msg.role === 'assistant'
                              ? 'bg-gradient-to-br from-primary-500 to-purple-600'
                              : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                          }`}
                        >
                          {msg.role === 'assistant' ? (
                            <Bot className="w-4 h-4 text-white" />
                          ) : (
                            <User className="w-4 h-4 text-white" />
                          )}
                        </div>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                            msg.role === 'assistant'
                              ? 'bg-gray-50 dark:bg-gray-750'
                              : 'bg-primary-600 text-white'
                          }`}
                        >
                          <div className={`prose prose-sm dark:prose-invert max-w-none ${msg.role === 'user' ? 'text-white [&_*]:text-white' : ''}`}>
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                引用来源：
                              </p>
                              <div className="space-y-1.5">
                                {msg.sources.map((s, i) => (
                                  <div
                                    key={i}
                                    className="text-xs bg-white dark:bg-gray-800 rounded-xl p-2 border border-gray-100 dark:border-gray-700"
                                  >
                                    <span className="font-medium text-primary-600 dark:text-primary-400">
                                      [{i + 1}]
                                    </span>{' '}
                                    <span className="text-gray-600 dark:text-gray-400">
                                      {s.document_name}
                                    </span>
                                    <p className="text-gray-500 dark:text-gray-500 mt-0.5 line-clamp-2">
                                      {s.content}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {streamContent && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-gray-50 dark:bg-gray-750">
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{streamContent}</ReactMarkdown>
                        </div>
                        <span className="inline-block w-2 h-4 bg-primary-500 animate-pulse rounded-full ml-1 align-middle" />
                        {streamSources.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                              引用来源：
                            </p>
                            <div className="space-y-1.5">
                              {streamSources.map((s, i) => (
                                <div
                                  key={i}
                                  className="text-xs bg-white dark:bg-gray-800 rounded-xl p-2 border border-gray-100 dark:border-gray-700"
                                >
                                  <span className="font-medium text-primary-600 dark:text-primary-400">
                                    [{i + 1}]
                                  </span>{' '}
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {s.document_name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-750">
                  <div className="flex gap-2">
                    <textarea
                      className="input-field resize-none"
                      rows={2}
                      placeholder="输入您的问题..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      disabled={streaming}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || streaming}
                      className="btn-primary self-end p-2.5"
                    >
                      {streaming ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <Bot className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    RagFlow 对话
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    选择或创建一个对话开始基于知识库的问答
                  </p>
                  <button onClick={handleCreateConv} className="btn-primary">
                    <Plus className="w-4 h-4" />
                    开始新对话
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="card p-6 w-full max-w-md animate-fade-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                知识库设置
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-750"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  名称
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  描述
                </label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
              <div className="pt-4 border-t border-gray-100 dark:border-gray-750">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="text-gray-500 dark:text-gray-400">文档数</div>
                  <div className="text-gray-900 dark:text-white font-medium">{kb.document_count}</div>
                  <div className="text-gray-500 dark:text-gray-400">知识块数</div>
                  <div className="text-gray-900 dark:text-white font-medium">{kb.chunk_count}</div>
                  <div className="text-gray-500 dark:text-gray-400">创建时间</div>
                  <div className="text-gray-900 dark:text-white font-medium text-xs">
                    {new Date(kb.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-100 dark:border-gray-750 space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">操作</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCloneKB}
                    disabled={cloning}
                    className="btn-secondary text-sm flex-1"
                  >
                    {cloning ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    克隆
                  </button>
                  <button
                    onClick={handleRebuildIndex}
                    disabled={rebuilding}
                    className="btn-secondary text-sm flex-1"
                  >
                    {rebuilding ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    重建索引
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="btn-secondary flex-1"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveKb}
                  disabled={!editName.trim() || saving}
                  className="btn-primary flex-1"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showChunkPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="card p-6 w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-slide-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  知识块预览
                </h2>
                <span className="text-sm text-gray-400 dark:text-gray-500">
                  (共 {chunksTotal} 个)
                </span>
              </div>
              <button
                onClick={() => setShowChunkPreview(false)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-750"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 min-h-0">
              {chunksLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="card p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="skeleton h-4 w-32" />
                        <div className="skeleton h-3 w-12" />
                      </div>
                      <div className="skeleton h-4 w-full" />
                      <div className="skeleton h-4 w-3/4 mt-1" />
                      <div className="skeleton h-3 w-16 mt-2" />
                    </div>
                  ))}
                </div>
              ) : chunks.length === 0 ? (
                <div className="text-center py-12">
                  <Layers className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    暂无知识块数据
                  </p>
                </div>
              ) : (
                chunks.map((chunk, i) => (
                  <div
                    key={i}
                    className="card p-4 border border-gray-100 dark:border-gray-750 hover:border-primary-200 dark:hover:border-primary-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-lg">
                        #{chunk.chunk_index as number}
                      </span>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {chunk.document_name as string}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">
                      {typeof chunk.content === 'string'
                        ? chunk.content.slice(0, 300)
                        : ''}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        全文长度：{chunk.full_length as number || (typeof chunk.content === 'string' ? chunk.content.length : 0)} 字符
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-750 mt-4">
              <button
                onClick={() => handleChunkPageChange(Math.max(0, chunkOffset - 20))}
                disabled={chunkOffset === 0 || chunksLoading}
                className="btn-ghost text-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                上一页
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {chunkOffset + 1} - {Math.min(chunkOffset + 20, chunksTotal)} / {chunksTotal}
              </span>
              <button
                onClick={() => handleChunkPageChange(chunkOffset + 20)}
                disabled={chunkOffset + 20 >= chunksTotal || chunksLoading}
                className="btn-ghost text-sm"
              >
                下一页
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
