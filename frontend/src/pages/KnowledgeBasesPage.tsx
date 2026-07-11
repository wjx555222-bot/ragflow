import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  BookOpen,
  FileText,
  Calendar,
  Edit3,
  Trash2,
  Sparkles,
  Loader2,
  X,
  FolderOpen,
} from 'lucide-react';
import { knowledgeBaseApi } from '@/api/client';
import type { KnowledgeBase } from '@/types';
import { useToastStore } from '@/components/Toast';

export default function KnowledgeBasesPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  const fetchKbs = async () => {
    try {
      const res = await knowledgeBaseApi.list();
      setKbs(res.data || []);
    } catch {
      addToast('error', '加载知识库列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKbs();
  }, []);

  const filteredKbs = useMemo(() => {
    if (!search.trim()) return kbs;
    const q = search.toLowerCase();
    return kbs.filter(
      (kb) =>
        kb.name.toLowerCase().includes(q) ||
        (kb.description || '').toLowerCase().includes(q)
    );
  }, [kbs, search]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      await knowledgeBaseApi.create({
        name: createName.trim(),
        description: createDesc.trim(),
      });
      addToast('success', '知识库创建成功');
      setShowCreate(false);
      setCreateName('');
      setCreateDesc('');
      await fetchKbs();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这个知识库吗？此操作不可撤销。')) return;
    setDeletingId(id);
    try {
      await knowledgeBaseApi.delete(id);
      addToast('success', '知识库已删除');
      await fetchKbs();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-primary-500" />
            知识库
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            管理您的所有知识库，创建新的知识库以开始构建 RAG 应用
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary"
        >
          <Plus className="w-5 h-5" />
          创建知识库
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          className="input-field pl-10"
          placeholder="搜索知识库..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="skeleton w-10 h-10 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-5 w-32" />
                  <div className="skeleton h-4 w-full" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredKbs.length === 0 ? (
        <div className="card p-12 text-center">
          {search ? (
            <>
              <Search className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                没有找到匹配的知识库
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                尝试使用不同的关键词搜索
              </p>
            </>
          ) : (
            <>
              <FolderOpen className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                还没有知识库
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                创建您的第一个知识库，开始构建智能问答系统
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="btn-primary"
              >
                <Sparkles className="w-4 h-4" />
                创建第一个知识库
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredKbs.map((kb, i) => (
            <Link
              key={kb.id}
              to={`/knowledge-bases/${kb.id}`}
              className={`card p-6 group cursor-pointer animate-fade-slide-up stagger-${(i % 6) + 1}`}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0 shadow-md group-hover:shadow-lg transition-shadow">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {kb.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                    {kb.description || '暂无描述'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-750">
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {kb.document_count} 文档
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(kb.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(kb.id);
                    }}
                    disabled={deletingId === kb.id}
                    className="p-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="删除"
                  >
                    {deletingId === kb.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="card p-6 w-full max-w-md animate-fade-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary-500" />
                创建知识库
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  知识库名称
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="例如：技术文档库"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  描述（可选）
                </label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  placeholder="简单描述这个知识库的用途..."
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleCreate()}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="btn-secondary flex-1"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!createName.trim() || creating}
                  className="btn-primary flex-1"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
