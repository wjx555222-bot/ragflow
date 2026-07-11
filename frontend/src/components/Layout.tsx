import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Bot,
  LayoutDashboard,
  BookOpen,
  Moon,
  Sun,
  LogOut,
  User,
  ChevronLeft,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

function Layout() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      );
    }
    return false;
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [dark]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const navItems = [
    {
      path: '/',
      icon: LayoutDashboard,
      label: '仪表盘',
    },
    {
      path: '/knowledge-bases',
      icon: BookOpen,
      label: '知识库',
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <aside
        className={`flex flex-col flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-all duration-300 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-100 dark:border-gray-800">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                RagFlow
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                v1.0
              </span>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`sidebar-link w-full ${isActive(item.path) ? 'active' : ''}`}
              title={item.label}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
          <button
            onClick={() => setDark(!dark)}
            className="sidebar-link w-full"
            title={dark ? '切换亮色模式' : '切换暗色模式'}
          >
            {dark ? (
              <Sun className="w-5 h-5 flex-shrink-0" />
            ) : (
              <Moon className="w-5 h-5 flex-shrink-0" />
            )}
            {!sidebarCollapsed && (
              <span>{dark ? '亮色模式' : '暗色模式'}</span>
            )}
          </button>

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="sidebar-link w-full"
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <ChevronLeft
              className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${
                sidebarCollapsed ? 'rotate-180' : ''
              }`}
            />
            {!sidebarCollapsed && <span>收起菜单</span>}
          </button>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2">
            <div
              className={`flex items-center gap-3 px-3 py-2 ${sidebarCollapsed ? 'justify-center' : ''}`}
            >
              <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {user?.username || '用户'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user?.email || ''}
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="sidebar-link w-full text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
              title="退出登录"
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>退出登录</span>}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="page-enter min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;
