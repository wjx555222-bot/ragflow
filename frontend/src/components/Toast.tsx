import { create } from 'zustand';
import { useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (type, message) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onRemove, 4000);
    return () => clearTimeout(timer);
  }, [onRemove]);

  const config = {
    success: {
      icon: CheckCircle,
      bg: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800',
      text: 'text-emerald-800 dark:text-emerald-200',
      iconColor: 'text-emerald-500',
    },
    error: {
      icon: XCircle,
      bg: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      iconColor: 'text-red-500',
    },
    info: {
      icon: Info,
      bg: 'bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800',
      text: 'text-primary-800 dark:text-primary-200',
      iconColor: 'text-primary-500',
    },
  }[toast.type];

  const Icon = config.icon;

  return (
    <div
      className={`animate-slide-in-right flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-lg ${config.bg} ${config.text} min-w-[320px] max-w-[420px]`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 ${config.iconColor}`} />
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  const handleRemove = useCallback(
    (id: string) => removeToast(id),
    [removeToast]
  );

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={() => handleRemove(toast.id)} />
        </div>
      ))}
    </div>
  );
}
