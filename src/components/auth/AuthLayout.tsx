import type { ReactNode } from 'react';
import { LayoutDashboard } from 'lucide-react';

interface AuthLayoutProps {
    children: ReactNode;
    title: string;
    subtitle: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
    return (
        <div className="min-h-screen bg-dark-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <div className="bg-primary/20 p-3 rounded-xl border border-primary/20">
                        <LayoutDashboard className="h-8 w-8 text-primary" />
                    </div>
                </div>
                <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-white">
                    {title}
                </h2>
                <p className="mt-2 text-center text-sm text-slate-400">
                    {subtitle}
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="glass-card py-8 px-4 shadow-xl sm:rounded-xl sm:px-10">
                    {children}
                </div>
            </div>
        </div>
    );
}
