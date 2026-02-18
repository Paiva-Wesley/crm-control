import React, { useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Calculator, Package, DollarSign, Store, Menu, ChevronDown, ChevronRight, PieChart, Coffee, LogOut, Star, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface NavGroupProps {
    id: string;
    label: string;
    icon: any;
    children: React.ReactNode;
    sidebarOpen: boolean;
    isOpen: boolean;
    onToggle: (id: string) => void;
    isActive?: boolean;
}

function NavGroup({ id, label, icon: Icon, children, sidebarOpen, isOpen, onToggle, isActive }: NavGroupProps) {
    if (!sidebarOpen) return <div className="flex flex-col gap-1">{children}</div>;

    return (
        <div className="flex flex-col gap-1">
            <button
                className={`flex items-center justify-between px-4 py-3 rounded-lg text-slate-400 hover:bg-dark-700 hover:text-white transition-colors duration-200 ${isActive ? 'text-white' : ''}`}
                onClick={() => onToggle(id)}
            >
                <div className="flex items-center gap-2">
                    <Icon size={20} />
                    <span>{label}</span>
                </div>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {isOpen && <div className="flex flex-col gap-1">{children}</div>}
        </div>
    );
}

export function Layout() {
    const [sidebarOpen, setSidebarOpen] = React.useState(true);
    const location = useLocation();
    const [openGroup, setOpenGroup] = useState<string | null>(null);
    const { signOut, user, companyName } = useAuth();

    React.useEffect(() => {
        const path = location.pathname;
        if (path.includes('/ingredients')) {
            setOpenGroup('itens');
        } else if (path.includes('/fixed-costs')) {
            setOpenGroup('custos');
        } else {
            setOpenGroup(null);
        }
    }, [location.pathname]);

    const handleToggle = (id: string) => {
        setOpenGroup(prev => prev === id ? null : id);
    };

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
                        to="/cmv-analysis" // Matched route from App.tsx
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

                    <NavLink
                        to="/combos"
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200
                            ${isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-dark-700 hover:text-white'}
                        `}
                    >
                        <ShoppingBag size={20} />
                        {sidebarOpen && <span>Fichas de Combos</span>}
                    </NavLink>

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

                    {/* Group: Custos Fixos */}
                    <NavGroup
                        id="custos"
                        label="Custos Fixos"
                        icon={DollarSign}
                        sidebarOpen={sidebarOpen}
                        isOpen={openGroup === 'custos'}
                        onToggle={handleToggle}
                        isActive={location.pathname.includes('/fixed-costs')}
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
                    </NavGroup>

                    <NavLink
                        to="/fees"
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200
                            ${isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-dark-700 hover:text-white'}
                        `}
                    >
                        <Calculator size={20} />
                        {sidebarOpen && <span>Taxas</span>}
                    </NavLink>

                    <NavLink
                        to="/channels"
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200
                            ${isActive ? 'bg-primary text-white' : 'text-slate-400 hover:bg-dark-700 hover:text-white'}
                        `}
                    >
                        <Store size={20} />
                        {sidebarOpen && <span>Canais de Venda</span>}
                    </NavLink>
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
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-dark-700 bg-dark-900">
                    <h1 className="text-lg md:text-xl font-semibold text-slate-100">Gestão de Custos e Precificação</h1>
                </header>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-dark-900">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
