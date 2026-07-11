import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Send,
  Plus,
  Trash2,
  Edit3,
  Loader2,
  Bot,
  User,
  ArrowLeft,
  BookOpen,
  FileText,
  Grid3X3,
  MessageSquare,
  Check,
  X,
  Copy,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  Clock,
  CheckCircle2,
  Download,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  knowledgeBaseApi,
  conversationApi,
} from '@/api/client';
import type {
  KnowledgeBase,
  Conversation,
  Message,
  SourceChunk,
  StatsResponse,
} from '@/types';
import { useToastStore } from '@/components/Toast';

export default function KnowledgeBaseChatPage() {
  const { id, convId } = useParams<{ id: string; convId: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(convId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [streamSources, setStreamSources] = useState<SourceChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!id) return;
    const init = async () => {
      try {
        const [kbRes, statsRes, convsRes] = await Promise.all([
          knowledgeBaseApi.get(id),
          knowledgeBaseApi.getStats(id),
          conversationApi.list(id),
        ]);
        setKb(kbRes.data);
        setStats(statsRes.data);
        setConversations(convsRes.data || []);
      } catch {
        addToast('error', '加载知识库数据失败');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id]);

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

  const handleCreateConv = async () => {
    if (!id) return;
    try {
      const res = await conversationApi.create(id);
      setConversations((prev) => [res.data, ...prev]);
      setActiveConvId(res.data.id);
      setMessages([]);
    } catch {
      addToast('error', '创建对话失败');
    }
  };

  const handleDeleteConv = async (convIdToDelete: string) => {
    if (!id || !window.confirm('确定要删除这个对话吗？')) return;
    try {
      await conversationApi.delete(id, convIdToDelete);
      setConversations((prev) => prev.filter((c) => c.id !== convIdToDelete));
      if (activeConvId === convIdToDelete) {
        setActiveConvId(null);
        setMessages([]);
      }
      addToast('success', '对话已删除');
    } catch {
      addToast('error', '删除对话失败');
    }
  };

  const startRename = (conv: Conversation) => {
    setEditingConvId(conv.id);
    setEditTitle(conv.title);
  };

  const confirmRename = async () => {
    if (!id || !editingConvId || !editTitle.trim()) {
      setEditingConvId(null);
      return;
    }
    setConversations((prev) =>
      prev.map((c) =>
        c.id === editingConvId ? { ...c, title: editTitle.trim() } : c
      )
    );
    setEditingConvId(null);
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
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || '请求失败');
      }

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
            } else if (data.type === 'tool_call') {
              fullContent += `\n\n> 🔧 调用工具：**${data.tool_name}**\n`;
              if (data.tool_output) {
                fullContent += `\n> 结果：${data.tool_output}\n`;
              }
              setStreamContent(fullContent);
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
        sources: sources.length > 0 ? sources : undefined,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamContent('');
      setStreamSources([]);

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConvId
            ? { ...c, message_count: c.message_count + 2 }
            : c
        )
      );
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '发送失败');
    } finally {
      setStreaming(false);
    }
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      addToast('success', '已复制到剪贴板');
    });
  };

  const handleFeedback = async (msg: Message, rating: string) => {
    if (!activeConvId || feedbackMap[msg.id]) return;
    try {
      await knowledgeBaseApi.submitFeedback(activeConvId, msg.id, {
        message_id: msg.id,
        rating,
        comment: '',
      });
      setFeedbackMap((prev) => ({ ...prev, [msg.id]: rating }));
      addToast('success', rating === 'positive' ? '感谢您的反馈！' : '感谢您的反馈，我们会持续改进');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '提交反馈失败');
    }
  };

  if (loading) {
    return (
      <div className="p-6 h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!kb) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          知识库不存在
        </h2>
        <button onClick={() => navigate('/knowledge-bases')} className="btn-primary mt-4">
          返回知识库列表
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-0px)]">
      <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() => navigate(`/knowledge-bases/${id}`)}
            className="btn-ghost w-full mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            返回知识库
          </button>
          <button onClick={handleCreateConv} className="btn-primary w-full text-sm">
            <Plus className="w-4 h-4" />
            新建对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => {
                setActiveConvId(conv.id);
                navigate(`/knowledge-bases/${id}/chat/${conv.id}`, { replace: true });
              }}
              className={`group flex items-center gap-2 p-3 rounded-2xl cursor-pointer transition-colors mb-1 ${
                activeConvId === conv.id
                  ? 'bg-primary-50 dark:bg-primary-900/30'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {editingConvId === conv.id ? (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    className="input-field text-xs py-1 px-2 flex-1"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename();
                      if (e.key === 'Escape') setEditingConvId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmRename();
                    }}
                    className="p-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-green-500"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingConvId(null);
                    }}
                    className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <MessageSquare
                    className={`w-4 h-4 flex-shrink-0 ${
                      activeConvId === conv.id
                        ? 'text-primary-500'
                        : 'text-gray-400'
                    }`}
                  />
                  <span
                    className={`flex-1 text-sm truncate ${
                      activeConvId === conv.id
                        ? 'font-medium text-primary-700 dark:text-primary-300'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {conv.title}
                  </span>
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(conv);
                      }}
                      className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <Edit3 className="w-3 h-3 text-gray-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConv(conv.id);
                      }}
                      className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-400 dark:text-gray-500">暂无对话</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950 min-w-0">
        {activeConvId ? (
          <>
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto scrollbar-thin p-6"
            >
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.length === 0 && !streaming && (
                  <div className="text-center py-20">
                    <Bot className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      开始对话
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      向知识库提问，获取基于文档内容的精准答案
                    </p>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-4 ${
                      msg.role === 'assistant' ? 'flex-row' : 'flex-row-reverse'
                    } animate-fade-slide-up`}
                  >
                    <div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'assistant'
                          ? 'bg-gradient-to-br from-primary-500 to-purple-600 shadow-md'
                          : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <Bot className="w-5 h-5 text-white" />
                      ) : (
                        <User className="w-5 h-5 text-white" />
                      )}
                    </div>

                    <div
                      className={`max-w-[80%] rounded-2xl px-5 py-4 ${
                        msg.role === 'assistant'
                          ? 'bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-750'
                          : 'bg-primary-600 text-white shadow-md'
                      }`}
                    >
                      <div
                        className={`prose prose-sm dark:prose-invert max-w-none ${
                          msg.role === 'user'
                            ? 'text-white [&_*]:!text-white'
                            : 'text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>

                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-2 mb-3">
                            <BookOpen className="w-4 h-4 text-primary-500" />
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              引用来源 ({msg.sources.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {msg.sources.map((source, i) => (
                              <div
                                key={i}
                                className="relative group bg-gray-50 dark:bg-gray-750 rounded-xl p-3 border border-blue-200 dark:border-purple-800 hover:border-blue-400 dark:hover:border-purple-500 hover:shadow-sm transition-all"
                              >
                                <div className="flex items-start justify-between mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400 text-[10px] font-bold flex-shrink-0">
                                      {i + 1}
                                    </span>
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                      {source.document_name}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-2">
                                    得分：{source.score.toFixed(2)}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                  {source.content.length > 150
                                    ? source.content.slice(0, 150) + '...'
                                    : source.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-1 mt-3 pt-2 border-t border-gray-100 dark:border-gray-750 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => copyMessage(msg.content)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title="复制"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleFeedback(msg, 'positive')}
                            disabled={!!feedbackMap[msg.id]}
                            className={`p-1.5 rounded-lg transition-colors ${
                              feedbackMap[msg.id] === 'positive'
                                ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                                : feedbackMap[msg.id]
                                  ? 'text-gray-300 dark:text-gray-600'
                                  : 'text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                            }`}
                            title="有帮助"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleFeedback(msg, 'negative')}
                            disabled={!!feedbackMap[msg.id]}
                            className={`p-1.5 rounded-lg transition-colors ${
                              feedbackMap[msg.id] === 'negative'
                                ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                                : feedbackMap[msg.id]
                                  ? 'text-gray-300 dark:text-gray-600'
                                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                            }`}
                            title="无帮助"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {streamContent && (
                  <div className="flex gap-4 animate-fade-slide-up">
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="max-w-[80%] rounded-2xl px-5 py-4 bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-750">
                      <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200">
                        <ReactMarkdown>{streamContent}</ReactMarkdown>
                      </div>
                      <span className="inline-flex items-center gap-1 mt-2">
                        <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
                        <span className="w-2 h-2 bg-primary-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <span className="w-2 h-2 bg-primary-300 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                      </span>
                      {streamSources.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-2 mb-3">
                            <BookOpen className="w-4 h-4 text-primary-500" />
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              引用来源 ({streamSources.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {streamSources.map((source, i) => (
                              <div
                                key={i}
                                className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3 border border-blue-200 dark:border-purple-800 hover:border-blue-400 dark:hover:border-purple-500 hover:shadow-sm transition-all"
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400 text-[10px] font-bold">
                                    {i + 1}
                                  </span>
                                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    {source.document_name}
                                  </span>
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
                                    得分：{source.score.toFixed(2)}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {source.content.length > 150
                                    ? source.content.slice(0, 150) + '...'
                                    : source.content}
                                </p>
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
            </div>

            <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="max-w-3xl mx-auto flex gap-3">
                <textarea
                  className="input-field resize-none"
                  rows={2}
                  placeholder="输入您的问题... (Shift+Enter 换行, Enter 发送)"
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
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Bot className="w-20 h-20 text-gray-300 dark:text-gray-600 mx-auto mb-5" />
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                {kb.name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
                选择左侧对话或创建新对话，开始基于知识库内容的智能问答
              </p>
              <button onClick={handleCreateConv} className="btn-primary">
                <Plus className="w-5 h-5" />
                开始新对话
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="w-64 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 overflow-y-auto scrollbar-thin">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary-500" />
          知识库信息
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
              名称
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {kb.name}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
              描述
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {kb.description || '暂无描述'}
            </p>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
              统计信息
            </p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  文档数
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {stats?.document_count ?? kb.document_count}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                  <Grid3X3 className="w-3.5 h-3.5" />
                  知识块
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {stats?.chunk_count ?? kb.chunk_count}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  对话数
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {stats?.conversation_count ?? conversations.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
