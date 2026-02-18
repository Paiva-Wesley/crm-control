import { createContext, useContext, useState, type ReactNode } from 'react';
import { Toast, type ToastType } from '../components/ui/Toast';

interface ToastData {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    addToast: (message: string, type?: ToastType, duration?: number) => void;
    // Shortcuts
    toast: {
        success: (message: string, duration?: number) => void;
        error: (message: string, duration?: number) => void;
        info: (message: string, duration?: number) => void;
        warning: (message: string, duration?: number) => void;
    };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastData[]>([]);

    const addToast = (message: string, type: ToastType = 'info', duration = 3000) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, message, type, duration }]);
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const toastHelper = {
        success: (msg: string, dur?: number) => addToast(msg, 'success', dur),
        error: (msg: string, dur?: number) => addToast(msg, 'error', dur),
        info: (msg: string, dur?: number) => addToast(msg, 'info', dur),
        warning: (msg: string, dur?: number) => addToast(msg, 'warning', dur)
    };

    return (
        <ToastContext.Provider value={{ addToast, toast: toastHelper }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map(t => (
                    <Toast
                        key={t.id}
                        id={t.id}
                        message={t.message}
                        type={t.type}
                        duration={t.duration}
                        onDismiss={removeToast}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
