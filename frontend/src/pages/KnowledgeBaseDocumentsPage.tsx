import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  FileText,
  FileArchive,
  FileCode,
  FileImage,
  File,
  Trash2,
  RefreshCw,
  Loader2,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Eye,
  X,
  Layers,
} from 'lucide-react';
import { knowledgeBaseApi, documentApi } from '@/api/client';
import type { KnowledgeBase, Document } from '@/types';
import { useToastStore } from '@/components/Toast';

type FilterStatus = 'all' | 'processing' | 'ready' | 'error';

const fileTypeIcon = (type: string) => {
  if (/pdf/i.test(type)) return FileText;
  if (/word|doc/i.test(type)) return FileText;
  if (/zip|rar|7z/i.test(type)) return FileArchive;
  if (/code|py|js|ts|java|go|rust/i.test(type)) return FileCode;
  if (/image|png|jpg|jpeg/i.test(type)) return FileImage;
  return File;
};

const fileTypeColor = (type: string) => {
  if (/pdf/i.test(type)) return 'text-red-500 bg-red-50 dark:bg-red-900/20';
  if (/word|doc/i.test(type)) return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';
  if (/zip|rar/i.test(type)) return 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
  if (/code|py|js/i.test(type)) return 'text-green-500 bg-green-50 dark:bg-green-900/20';
  if (/image/i.test(type)) return 'text-purple-500 bg-purple-50 dark:bg-purple-900/20';
  return 'text-gray-500 bg-gray-50 dark:bg-gray-800';
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

const filters: { key: FilterStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'processing', label: '处理中' },
  { key: 'ready', label: '就绪' },
  { key: 'error', label: '错误' },
];

export default function KnowledgeBaseDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewDocName, setPreviewDocName] = useState('');
  const [previewChunks, setPreviewChunks] = useState<Record<string, unknown>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    try {
      const [kbRes, docRes] = await Promise.all([
        knowledgeBaseApi.get(id),
        documentApi.listByKB(id),
      ]);
      setKb(kbRes.data);
      setDocuments(docRes.data || []);
    } catch {
      addToast('error', '加载文档列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const filteredDocs = useMemo(() => {
    let docs = documents;
    if (filter !== 'all') {
      docs = docs.filter((d) => d.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      docs = docs.filter((d) => d.filename.toLowerCase().includes(q));
    }
    return docs;
  }, [documents, filter, search]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !id) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await documentApi.upload(id, files[i]);
      }
      addToast('success', `成功上传 ${files.length} 个文件，正在处理中...`);
      await fetchData();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0 || !id) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await documentApi.upload(id, files[i]);
      }
      addToast('success', `成功上传 ${files.length} 个文件，正在处理中...`);
      await fetchData();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!id || !window.confirm('确定要删除这个文档吗？')) return;
    setDeletingId(docId);
    try {
      await documentApi.delete(id, docId);
      addToast('success', '文档已删除');
      await fetchData();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const handleReprocess = async (docId: string) => {
    if (!id) return;
    setReprocessingId(docId);
    try {
      await documentApi.reprocess(id, docId);
      addToast('success', '已开始重新处理');
      await fetchData();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '重新处理失败');
    } finally {
      setReprocessingId(null);
    }
  };

  const handlePreview = async (doc: Document) => {
    if (!id) return;
    setPreviewDocName(doc.filename);
    setShowPreview(true);
    setPreviewLoading(true);
    try {
      const res = await knowledgeBaseApi.getChunks(id, 0, 50, doc.id);
      setPreviewChunks((res.data || []) as Record<string, unknown>[]);
    } catch {
      addToast('error', '加载知识块预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(`/knowledge-bases/${id}`)}
          className="btn-ghost p-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {kb ? `${kb.name} · 文档管理` : '文档管理'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            上传和管理知识库文档，支持 PDF、Word、TXT 等多种格式
          </p>
        </div>
      </div>

      <div
        className={`card p-8 mb-6 border-2 border-dashed text-center cursor-pointer transition-colors ${
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
          multiple
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.ppt,.pptx"
        />
        {uploading ? (
          <Loader2 className="w-10 h-10 text-primary-500 animate-spin mx-auto mb-3" />
        ) : (
          <Upload className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
        )}
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {uploading ? '上传中...' : '拖拽文件到此处，或点击批量上传'}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          支持 PDF、Word、TXT、Markdown、CSV、Excel 等格式
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
                filter === f.key
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            className="input-field pl-10"
            placeholder="搜索文档..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center gap-4">
                <div className="skeleton w-10 h-10 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-48" />
                  <div className="skeleton h-3 w-64" />
                </div>
                <div className="skeleton h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          {search || filter !== 'all' ? (
            <>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                没有找到匹配的文档
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                尝试更改筛选条件或搜索关键词
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                还没有文档
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                上传您的第一个文档开始构建知识库
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 dark:bg-gray-750 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <div className="col-span-5">文件</div>
            <div className="col-span-2">大小</div>
            <div className="col-span-2">状态</div>
            <div className="col-span-1 text-right">知识块</div>
            <div className="col-span-2 text-right">操作</div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-750">
            {filteredDocs.map((doc) => {
              const TypeIcon = fileTypeIcon(doc.file_type);
              const status = statusConfig[doc.status];
              const StatusIcon = status.icon;
              return (
                <div
                  key={doc.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${fileTypeColor(doc.file_type)}`}>
                      <TypeIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {doc.filename}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>
                  <div className="sm:col-span-2 text-sm text-gray-500 dark:text-gray-400">
                    {formatSize(doc.file_size)}
                  </div>
                  <div className="sm:col-span-2">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {status.label}
                    </span>
                    {doc.status === 'error' && doc.error_message && (
                      <p className="text-xs text-red-500 mt-1 line-clamp-2">{doc.error_message}</p>
                    )}
                  </div>
                  <div className="sm:col-span-1 text-sm text-gray-500 dark:text-gray-400 text-right">
                    {doc.chunk_count}
                  </div>
                  <div className="sm:col-span-2 flex items-center justify-end gap-1">
                    <button
                      onClick={() => handlePreview(doc)}
                      className="btn-ghost text-xs p-2"
                      title="预览知识块"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {doc.status === 'error' && (
                      <button
                        onClick={() => handleReprocess(doc.id)}
                        disabled={reprocessingId === doc.id}
                        className="btn-ghost text-xs p-2"
                        title="重新处理"
                      >
                        {reprocessingId === doc.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="btn-ghost text-xs p-2 text-red-500 hover:text-red-600"
                      title="删除"
                    >
                      {deletingId === doc.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="card p-6 w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-slide-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  知识块预览
                </h2>
                <span className="text-sm text-gray-400 dark:text-gray-500 truncate max-w-[200px]">
                  {previewDocName}
                </span>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-750"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 min-h-0">
              {previewLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="card p-4">
                      <div className="skeleton h-4 w-16 mb-2" />
                      <div className="skeleton h-4 w-full" />
                      <div className="skeleton h-4 w-3/4 mt-1" />
                    </div>
                  ))}
                </div>
              ) : previewChunks.length === 0 ? (
                <div className="text-center py-12">
                  <Layers className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    暂无知识块数据
                  </p>
                </div>
              ) : (
                previewChunks.map((chunk, i) => (
                  <div
                    key={i}
                    className="card p-4 border border-gray-100 dark:border-gray-750 hover:border-primary-200 dark:hover:border-primary-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-lg">
                        知识块 #{chunk.chunk_index as number}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                      {chunk.content as string}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-750 mt-4">
              <button
                onClick={() => setShowPreview(false)}
                className="btn-secondary text-sm"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
