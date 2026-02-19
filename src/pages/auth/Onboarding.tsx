import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { Loader2, Building2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function Onboarding() {

    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [companyName, setCompanyName] = useState('');

    const handleCreateCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase
                .from('companies')
                .insert({ name: companyName })
                .select()
                .single();

            if (error) throw error;

            // Force reload or re-fetch session/company will happen via AuthContext if we redirect
            // But AuthContext listens to auth state changes, not DB changes.
            // We might need to force a window reload or update context manually.
            // A simple reload is safest for now to ensure all hooks rebuild.
            window.location.href = '/';
        } catch (err: any) {
            setError(err.message || 'Erro ao criar empresa');
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Vamos configurar seu negócio"
            subtitle="Primeiro, qual o nome da sua empresa?"
        >
            <form className="space-y-6" onSubmit={handleCreateCompany}>
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <div>
                    <label htmlFor="companyName" className="label">
                        Nome do Estabelecimento
                    </label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <Building2 className="h-5 w-5 text-slate-500" />
                        </div>
                        <input
                            type="text"
                            name="companyName"
                            id="companyName"
                            required
                            className="input pl-10"
                            placeholder="Ex: Hamburgueria do João"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary w-full justify-center"
                >
                    {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        'Começar a usar'
                    )}
                </button>
            </form>
        </AuthLayout>
    );
}
