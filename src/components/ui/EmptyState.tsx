import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-dark-800 border border-dark-700 rounded-lg">
            <div className="bg-dark-700 p-4 rounded-full mb-4">
                <Icon size={32} className="text-slate-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">{title}</h3>
            <p className="text-slate-400 max-w-sm mb-6">{description}</p>
            {actionLabel && onAction && (
                <button
                    onClick={onAction}
                    className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition-colors duration-200"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
}
