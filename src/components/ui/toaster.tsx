'use client';
import * as React from 'react';

const ToasterContext = React.createContext<{
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}>({
  addToast: () => {},
});

export function useToast() {
  return React.useContext(ToasterContext);
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function Toaster() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToasterContext.Provider value={{ addToast }}>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all animate-in slide-in-from-right-5 ${
              toast.type === 'success' ? 'bg-green-600' :
              toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToasterContext.Provider>
  );
}
