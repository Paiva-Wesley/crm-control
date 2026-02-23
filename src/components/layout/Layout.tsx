import React, { useState } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Calculator, Package, DollarSign, Store, Menu, ChevronDown, ChevronRight, PieChart, Coffee, LogOut, Star, User, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';

interface NavGroupProps {
    id: string;
    label: string;
    icon: any;
    children: React.ReactNode;
    sidebarOpen: boolean;
    isOpen: boolean;
    onToggle: (id: string) => void;
    isActive?: boolean;
    locked?: boolean;
    badgeLabel?: string;
}

function NavGroup({ id, label, icon: Icon, children, sidebarOpen, isOpen, onToggle, isActive, locked, badgeLabel }: NavGroupProps) {
    if (!sidebarOpen) return <div className="flex flex-col gap-1">{children}</div>;

    return (
        <div className="flex flex-col gap-1">
            <button
                className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors duration-200 ${locked
                    ? 'text-slate-600 cursor-not-allowed'
                    : isActive
                        ? 'text-white hover:bg-dark-700'
                        : 'text-slate-400 hover:bg-dark-700 hover:text-white'
                    }`}
                onClick={() => !locked && onToggle(id)}
            >
                <div className="flex items-center gap-2">
                    <Icon size={20} />
                    <span>{label}</span>
                    {locked && badgeLabel && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 uppercase tracking-wider leading-none">
                            {badgeLabel}
                        </span>
                    )}
                </div>
                {!locked && (isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                {locked && <Lock size={14} className="text-slate-600" />}
            </button>
            {!locked && isOpen && <div className="flex flex-col gap-1">{children}</div>}
        </div>
    );
}

interface GatedNavLinkProps {
    to: string;
    icon: any;
    label: string;
    sidebarOpen: boolean;
    locked?: boolean;
    badgeLabel?: string;
}

function GatedNavLink({ to, icon: Icon, label, sidebarOpen, locked, badgeLabel }: GatedNavLinkProps) {
    const navigate = useNavigate();

    if (locked) {
        return (
            <button
                onClick={() => navigate('/plans')}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 cursor-not-allowed transition-colors duration-200 w-full text-left hover:bg-dark-700/50"
            >
                <Icon size={20} />
                {sidebarOpen && (
                    <span className="flex items-center gap-2">
                        {label}
                        {badgeLabel && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 uppercase tracking-wider leading-none">
                                {badgeLabel}
                            </span>
                        )}
                    </span>
                )}
            </button>
        );
    }

    return (
        <NavLink
            to={to}
            className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200
                ${isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-dark-700 hover:text-white'}
            `}
        >
            <Icon size={20} />
            {sidebarOpen && <span>{label}</span>}
        </NavLink>
    );
}

export function Layout() {
    const [sidebarOpen, setSidebarOpen] = React.useState(true);
    const location = useLocation();
    const [openGroup, setOpenGroup] = useState<string | null>(null);
    const { signOut, user, companyName } = useAuth();
    const { canAccess } = useSubscription();

    React.useEffect(() => {
        const path = location.pathname;
        if (path.includes('/ingredients')) {
            setOpenGroup('itens');
        } else if (path.includes('/fixed-costs') || path.includes('/variable-costs')) {
            setOpenGroup('custos');
        } else {
            setOpenGroup(null);
        }
    }, [location.pathname]);

    const handleToggle = (id: string) => {
        setOpenGroup(prev => prev === id ? null : id);
    };

    // Feature access checks (safe during loading — returns true)
    const hasFixedCosts = canAccess('fixed_costs');
    const hasVariableCosts = canAccess('variable_costs');
    const hasFees = canAccess('fees');
    const hasChannels = canAccess('channels');
    const hasCombos = canAccess('combos');

    // Custos group is locked if both fixed and variable costs are locked
    const costGroupLocked = !hasFixedCosts && !hasVariableCosts;

    return (
        <div className="flex h-screen bg-dark-900 overflow-hidden">
            {/* Sidebar */}
            <aside className={`
                bg-dark-800 border-r border-dark-700 
                transition-all duration-300 flex flex-col
                ${sidebarOpen ? 'w-64' : 'w-20'}
                fixed md:relative inset-y-0 left-0 z-50
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-dark-700">
                    <div className="flex items-center gap-2 text-primary overflow-hidden">
                        <Calculator className="flex-shrink-0" size={24} />
                        {sidebarOpen && <span className="font-bold text-lg text-slate-100 whitespace-nowrap">CMV Control</span>}
                    </div>
                    <button
                        className="p-2 text-slate-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                    >
                        <Menu size={20} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">
                    <NavLink
                        to="/"
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200
                            ${isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-dark-700 hover:text-white'}
                        `}
                    >
                        <LayoutDashboard size={20} />
                        {sidebarOpen && <span>Dashboard</span>}
                    </NavLink>

                    <NavLink
                        to="/data"
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200
                            ${isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-dark-700 hover:text-white'}
                        `}
                    >
                        <PieChart size={20} />
                        {sidebarOpen && <span>Dados</span>}
                    </NavLink>

                    <NavLink
                        to="/cmv-analysis"
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200
                            ${isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-dark-700 hover:text-white'}
                        `}
                    >
                        <PieChart size={20} />
                        {sidebarOpen && <span>Análise CMV</span>}
                    </NavLink>

                    <NavLink
                        to="/products"
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200
                            ${isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-dark-700 hover:text-white'}
                        `}
                    >
                        <ShoppingBag size={20} />
                        {sidebarOpen && <span>Ficha Técnica</span>}
                    </NavLink>

                    <NavLink
                        to="/drinks"
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200
                            ${isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-dark-700 hover:text-white'}
                        `}
                    >
                        <Coffee size={20} />
                        {sidebarOpen && <span>Bebidas</span>}
                    </NavLink>

                    {/* Combos - Gated */}
                    <GatedNavLink
                        to="/combos"
                        icon={ShoppingBag}
                        label="Fichas de Combos"
                        sidebarOpen={sidebarOpen}
                        locked={!hasCombos}
                        badgeLabel="Pro"
                    />

                    {/* Group: Itens */}
                    <NavGroup
                        id="itens"
                        label="Itens"
                        icon={Package}
                        sidebarOpen={sidebarOpen}
                        isOpen={openGroup === 'itens'}
                        onToggle={handleToggle}
                        isActive={location.pathname.includes('/ingredients')}
                    >
                        <Link
                            to="/ingredients?category=Insumo"
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200
                                ${sidebarOpen ? 'pl-12' : ''}
                                ${location.pathname === '/ingredients' && location.search.includes('Insumo')
                                    ? 'bg-primary text-white'
                                    : 'text-slate-400 hover:bg-dark-700 hover:text-white'
                                }
                            `}
                        >
                            <Store size={18} />
                            {sidebarOpen && <span className="text-sm">Insumos</span>}
                        </Link>
                        <Link
                            to="/ingredients?category=Embalagem"
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200
                                ${sidebarOpen ? 'pl-12' : ''}
                                ${location.pathname === '/ingredients' && location.search.includes('Embalagem')
                                    ? 'bg-primary text-white'
                                    : 'text-slate-400 hover:bg-dark-700 hover:text-white'
                                }
                            `}
                        >
                            <Package size={18} />
                            {sidebarOpen && <span className="text-sm">Embalagens</span>}
                        </Link>
                        <Link
                            to="/ingredients?category=Acompanhamento"
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200
                                ${sidebarOpen ? 'pl-12' : ''}
                                ${location.pathname === '/ingredients' && location.search.includes('Acompanhamento')
                                    ? 'bg-primary text-white'
                                    : 'text-slate-400 hover:bg-dark-700 hover:text-white'
                                }
                            `}
                        >
                            <ShoppingBag size={18} />
                            {sidebarOpen && <span className="text-sm">Acompanhamentos</span>}
                        </Link>
                    </NavGroup>

                    {/* Group: Custos - Gated */}
                    <NavGroup
                        id="custos"
                        label="Custos"
                        icon={DollarSign}
                        sidebarOpen={sidebarOpen}
                        isOpen={openGroup === 'custos'}
                        onToggle={handleToggle}
                        isActive={location.pathname.includes('/fixed-costs') || location.pathname.includes('/variable-costs')}
                        locked={costGroupLocked}
                        badgeLabel="Pro"
                    >
                        <Link
                            to="/fixed-costs?tab=Equipe"
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200
                                ${sidebarOpen ? 'pl-12' : ''}
                                ${location.pathname === '/fixed-costs' && location.search.includes('Equipe')
                                    ? 'bg-primary text-white'
                                    : 'text-slate-400 hover:bg-dark-700 hover:text-white'
                                }
                            `}
                        >
                            <DollarSign size={18} />
                            {sidebarOpen && <span className="text-sm">Mão de Obra</span>}
                        </Link>
                        <Link
                            to="/fixed-costs?tab=Despesas"
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200
                                ${sidebarOpen ? 'pl-12' : ''}
                                ${location.pathname === '/fixed-costs' && location.search.includes('Despesas')
                                    ? 'bg-primary text-white'
                                    : 'text-slate-400 hover:bg-dark-700 hover:text-white'
                                }
                            `}
                        >
                            <Calculator size={18} />
                            {sidebarOpen && <span className="text-sm">Despesas Mensais</span>}
                        </Link>
                        <Link
                            to="/variable-costs"
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200
                                ${sidebarOpen ? 'pl-12' : ''}
                                ${location.pathname === '/variable-costs'
                                    ? 'bg-primary text-white'
                                    : 'text-slate-400 hover:bg-dark-700 hover:text-white'
                                }
                            `}
                        >
                            <PieChart size={18} />
                            {sidebarOpen && <span className="text-sm">Custos Variáveis</span>}
                        </Link>
                    </NavGroup>

                    {/* Taxas - Gated */}
                    <GatedNavLink
                        to="/fees"
                        icon={Calculator}
                        label="Taxas"
                        sidebarOpen={sidebarOpen}
                        locked={!hasFees}
                        badgeLabel="Pro"
                    />

                    {/* Canais - Gated */}
                    <GatedNavLink
                        to="/channels"
                        icon={Store}
                        label="Canais de Venda"
                        sidebarOpen={sidebarOpen}
                        locked={!hasChannels}
                        badgeLabel="Pro"
                    />

                    <NavLink
                        to="/plans"
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200
                            ${isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-dark-700 hover:text-white'}
                        `}
                    >
                        <Star size={20} />
                        {sidebarOpen && <span>Planos</span>}
                    </NavLink>
                </nav>

                <div className="p-4 border-t border-dark-700 space-y-3">
                    {/* Profile Card */}
                    {sidebarOpen ? (
                        <div className="flex items-center gap-3 px-3 py-3 bg-dark-900 rounded-lg border border-dark-700">
                            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                <User size={18} className="text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-100 truncate">{companyName || 'Sem empresa'}</p>
                                <p className="text-xs text-slate-500 truncate">{user?.email || ''}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-center">
                            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center" title={`${companyName} - ${user?.email}`}>
                                <User size={18} className="text-primary" />
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => signOut()}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-dark-700 hover:text-red-300 w-full transition-colors duration-200"
                    >
                        <LogOut size={20} />
                        {sidebarOpen && <span>Sair</span>}
                    </button>
                </div>
            </aside>

            {/* Overlay for mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden bg-dark-900">
                <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-dark-700 bg-dark-900">
                    <h1 className="text-lg md:text-xl font-semibold text-slate-100">Gestão de Custos e Precificação</h1>
                </header>
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="max-w-[1200px] mx-auto w-full pb-20">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
