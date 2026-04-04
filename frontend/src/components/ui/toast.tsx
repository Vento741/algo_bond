import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

/* ---- Types ---- */

interface ToastItem {
  id: number;
  message: string;
  variant: 'default' | 'success' | 'error';
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastItem['variant']) => void;
}

/* ---- Context ---- */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/* ---- Provider ---- */

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback(
    (message: string, variant: ToastItem['variant'] = 'default') => {
      const id = ++nextId;
      setToasts((t) => [...t, { id, message, variant }]);
    },
    [],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---- Single toast ---- */

function ToastItem({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), 4000);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-right-full',
        item.variant === 'success' &&
          'bg-brand-profit/10 border-brand-profit/20 text-brand-profit',
        item.variant === 'error' &&
          'bg-brand-loss/10 border-brand-loss/20 text-brand-loss',
        item.variant === 'default' &&
          'bg-brand-card border-white/10 text-gray-300',
      )}
    >
      <span className="flex-1">{item.message}</span>
      <button
        onClick={() => onDismiss(item.id)}
        className="text-gray-400 hover:text-white transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
