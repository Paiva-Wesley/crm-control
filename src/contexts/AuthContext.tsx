import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    companyId: number | null;
    companyName: string | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    companyId: null,
    companyName: null,
    loading: true,
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [companyId, setCompanyId] = useState<number | null>(null);
    const [companyName, setCompanyName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchCompany(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // Listen for changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchCompany(session.user.id);
            } else {
                setCompanyId(null);
                setCompanyName(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchCompany = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('company_members')
                .select('company_id, companies(name)')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching company:', error);
            }

            if (data) {
                setCompanyId(data.company_id);
                setCompanyName((data as any).companies?.name || null);
            } else {
                setCompanyId(null);
                setCompanyName(null);
            }
        } catch (err) {
            console.error('Unexpected error fetching company:', err);
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setCompanyId(null);
        setCompanyName(null);
        setUser(null);
        setSession(null);
    };

    return (
        <AuthContext.Provider value={{ user, session, companyId, companyName, loading, signOut }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
