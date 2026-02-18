import { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
    onDismiss: (id: string) => void;
}

export function Toast({ id, message, type, duration = 3000, onDismiss }: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss(id);
        }, duration);

        return () => clearTimeout(timer);
    }, [id, duration, onDismiss]);

    const icons = {
        success: <CheckCircle size={20} className="text-emerald-400" />,
        error: <AlertCircle size={20} className="text-red-400" />,
        info: <Info size={20} className="text-blue-400" />,
        warning: <AlertTriangle size={20} className="text-amber-400" />
    };

    const bgColors = {
        success: 'bg-dark-800 border-l-4 border-emerald-500',
        error: 'bg-dark-800 border-l-4 border-red-500',
        info: 'bg-dark-800 border-l-4 border-blue-500',
        warning: 'bg-dark-800 border-l-4 border-amber-500'
    };

    return (
        <div className={`flex items-start gap-3 p-4 rounded shadow-lg border border-dark-700 min-w-[300px] max-w-sm animate-in slide-in-from-right-5 fade-in duration-300 ${bgColors[type]}`}>
            <div className="flex-shrink-0 mt-0.5">
                {icons[type]}
            </div>
            <div className="flex-1 text-sm font-medium text-slate-100">
                {message}
            </div>
            <button
                onClick={() => onDismiss(id)}
                className="text-slate-500 hover:text-white transition-colors"
            >
                <X size={16} />
            </button>
        </div>
    );
}
