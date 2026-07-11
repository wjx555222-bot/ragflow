import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { ToastContainer } from '@/components/Toast';
import Layout from '@/components/Layout';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import Dashboard from '@/pages/Dashboard';
import KnowledgeBasesPage from '@/pages/KnowledgeBasesPage';
import KnowledgeBaseDetailPage from '@/pages/KnowledgeBaseDetailPage';
import KnowledgeBaseDocumentsPage from '@/pages/KnowledgeBaseDocumentsPage';
import KnowledgeBaseChatPage from '@/pages/KnowledgeBaseChatPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/knowledge-bases" element={<KnowledgeBasesPage />} />
          <Route path="/knowledge-bases/:id" element={<KnowledgeBaseDetailPage />} />
          <Route
            path="/knowledge-bases/:id/documents"
            element={<KnowledgeBaseDocumentsPage />}
          />
          <Route
            path="/knowledge-bases/:id/chat/:convId"
            element={<KnowledgeBaseChatPage />}
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}
