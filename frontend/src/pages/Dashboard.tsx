import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  FileText,
  Grid3X3,
  MessageSquare,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Upload,
  Search,
  Bot,
  BarChart3,
  FileUp,
  MessagesSquare,
} from 'lucide-react';
import { statsApi, knowledgeBaseApi } from '@/api/client';
import type { StatsResponse, KnowledgeBase } from '@/types';
import { useAuthStore } from '@/stores/authStore';

const statCards = [
  {
    key: 'knowledge_base_count',
    label: '知识库',
    icon: BookOpen,
    gradient: 'from-blue-500 to-cyan-500',
    bgLight: 'bg-blue-50 dark:bg-blue-900/20',
  },
  {
    key: 'document_count',
    label: '文档',
    icon: FileText,
    gradient: 'from-purple-500 to-pink-500',
    bgLight: 'bg-purple-50 dark:bg-purple-900/20',
  },
  {
    key: 'chunk_count',
    label: '知识块',
    icon: Grid3X3,
    gradient: 'from-emerald-500 to-teal-500',
    bgLight: 'bg-emerald-50 dark:bg-emerald-900/20',
  },
  {
    key: 'conversation_count',
    label: '对话',
    icon: MessageSquare,
    gradient: 'from-orange-500 to-amber-500',
    bgLight: 'bg-orange-50 dark:bg-orange-900/20',
  },
] as const;

const quickSteps = [
  {
    icon: BookOpen,
    title: '创建知识库',
    desc: '建立您的第一个知识库，为 RAG 检索做准备',
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
  },
  {
    icon: Upload,
    title: '上传文档',
    desc: '上传 PDF、Word、TXT 等文档，系统自动解析和向量化',
    color: 'text-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
  },
  {
    icon: Bot,
    title: '开始对话',
    desc: '基于知识库内容进行智能问答，获取精准答案',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
  },
  {
    icon: BarChart3,
    title: '分析优化',
    desc: '查看统计数据，持续优化知识库质量',
    color: 'text-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
  },
];

export default function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [recentKbs, setRecentKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, kbRes] = await Promise.all([
          statsApi.getStats(),
          knowledgeBaseApi.list(),
        ]);
        setStats(statsRes.data);
        setRecentKbs((kbRes.data || []).slice(0, 5));
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          欢迎回来，{' '}
          <span className="gradient-heading">{user?.username || '用户'}</span>
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          以下是您的知识库平台概览
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {statCards.map((card, i) => (
          <div
            key={card.key}
            className={`card p-5 animate-fade-slide-up stagger-${i + 1}`}
          >
            {loading ? (
              <div className="space-y-3">
                <div className="skeleton h-10 w-10 rounded-2xl" />
                <div className="skeleton h-6 w-16" />
                <div className="skeleton h-4 w-20" />
              </div>
            ) : (
              <>
                <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-lg mb-3`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                  {stats?.[card.key] ?? 0}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {card.label}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary-500" />
                最近的知识库
              </h2>
              <Link
                to="/knowledge-bases"
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-1 transition-colors"
              >
                查看全部 <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton w-10 h-10 rounded-2xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-4 w-32" />
                      <div className="skeleton h-3 w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentKbs.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  还没有知识库，快去创建一个吧
                </p>
                <Link to="/knowledge-bases" className="btn-primary mt-4 inline-flex">
                  <Sparkles className="w-4 h-4" />
                  创建知识库
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentKbs.map((kb) => (
                  <Link
                    key={kb.id}
                    to={`/knowledge-bases/${kb.id}`}
                    className="flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors truncate">
                        {kb.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {kb.description || '暂无描述'}
                      </p>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2 flex-shrink-0">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        {kb.document_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessagesSquare className="w-3.5 h-3.5" />
                        {kb.chunk_count}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
            <Sparkles className="w-5 h-5 text-amber-500" />
            快速入门
          </h2>
          <div className="space-y-4">
            {quickSteps.map((step, i) => (
              <div
                key={i}
                className={`flex gap-3 p-3 rounded-2xl ${step.bgColor} animate-fade-slide-up stagger-${i + 1}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${step.bgColor}`}>
                  <span className={`text-sm font-bold ${step.color}`}>
                    {i + 1}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <step.icon className={`w-4 h-4 ${step.color}`} />
                    {step.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
