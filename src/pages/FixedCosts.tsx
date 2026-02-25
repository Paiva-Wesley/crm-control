import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Trash2, Users, Bike, Coffee, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { FixedCost, Product } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';

type GroupTab = 'Equipe' | 'Despesas';

export function FixedCosts() {
    const [loading, setLoading] = useState(true);
    const { companyId } = useAuth();
    const [costs, setCosts] = useState<FixedCost[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [activeTab, setActiveTab] = useState<GroupTab>('Equipe');
    const { toast } = useToast();

    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        'CLT': true, 'Freelancer': true, 'Motoboys': true, 'Lanche': true, 'ProLabore': true,
        'Operacional': true, 'Geral': true
    });

    const location = useLocation();

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        if (tab && ['Equipe', 'Despesas'].includes(tab)) {
            setActiveTab(tab as GroupTab);
        }
    }, [location.search]);

    async function fetchData() {
        try {
            setLoading(true);
            const [costsRes, productsRes] = await Promise.all([
                supabase.from('fixed_costs').select('*').eq('company_id', companyId).order('id'),
                supabase.from('products').select('*').eq('active', true).eq('company_id', companyId).order('name')
            ]);

            const { data: costsView } = await supabase.from('product_costs_view').select('id, cmv').eq('company_id', companyId);
            const costMap: Record<number, number> = {};
            costsView?.forEach((c: any) => {
                costMap[c.id] = c.cmv;
            });

            if (costsRes.error) throw costsRes.error;

            const parsedCosts = (costsRes.data || []).map(c => ({
                ...c,
                monthly_value: parseFloat(c.monthly_value as any) || 0
            }));

            setCosts(parsedCosts);
            const productsWithCost = (productsRes.data || []).map(p => ({
                ...p,
                cost_price_view: costMap[p.id] || 0
            }));
            setProducts(productsWithCost);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddCost(category: string, initialConfig: any = {}) {
        const defaultName = category.includes('CLT') ? 'Novo Funcionário' :
            category.includes('Lanche') ? 'Item de Lanche' : 'Novo Custo';

        try {
            const { data, error } = await supabase.from('fixed_costs').insert({
                name: defaultName,
                category,
                monthly_value: 0,
                config: initialConfig,
                company_id: companyId
            }).select().single();

            if (error) throw error;
            setCosts(prev => [...prev, data]);
            setOpenSections(prev => ({ ...prev, [category]: true }));
            toast.success('Item adicionado');
        } catch (error) {
            console.error('Error adding cost:', error);
            toast.error('Erro ao adicionar item');
        }
    }

    async function handleUpdateCost(id: number, updates: Partial<FixedCost>) {
        setCosts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
        try {
            await supabase.from('fixed_costs').update(updates).eq('id', id).eq('company_id', companyId);
        } catch (error) {
            console.error('Error updating cost:', error);
        }
    }

    async function handleDeleteCost(id: number) {
        const previousCosts = [...costs];
        setCosts(prev => prev.filter(c => c.id !== id));

        try {
            const { error } = await supabase.from('fixed_costs').delete().eq('id', id).eq('company_id', companyId);
            if (error) throw error;
            toast.success('Custo excluído');
        } catch (error) {
            console.error('Error deleting cost:', error);
            toast.error('Erro ao excluir custo');
            setCosts(previousCosts);
        }
    }

    function updateCLT(cost: FixedCost, baseSalary: number) {
        const thirteenth = baseSalary / 12;
        const vacation = (baseSalary + (baseSalary / 3)) / 12;
        const fgts = baseSalary * 0.08;
        const total = baseSalary + thirteenth + vacation + fgts;

        handleUpdateCost(cost.id, {
            monthly_value: total,
            config: {
                ...cost.config,
                base_salary: baseSalary,
                thirteenth,
                vacation,
                fgts
            }
        });
    }

    function updateSnack(cost: FixedCost, mode: 'manual' | 'product', value?: number, productId?: number, days?: number) {
        const currentConfig = cost.config || {};
        let newVal = cost.monthly_value;
        let newConfig = { ...currentConfig, unit_cost: value, monthly_qty: days, product_id: productId };

        if (mode === 'manual') {
            newVal = (value || 0) * (days || 1);
        } else {
            const prod = products.find(p => p.id === productId);
            if (prod) {
                const unitCost = (prod as any).cost_price_view || 0;
                newVal = unitCost * (days || 0);
                newConfig.unit_cost = unitCost;
            } else {
                newVal = 0;
            }
        }

        handleUpdateCost(cost.id, {
            monthly_value: newVal,
            config: newConfig
        });
    }

    function updateFreightOrFreelancer(cost: FixedCost, field: 'daily_rate' | 'qty_people' | 'days_worked', value: number) {
        const currentConfig = {
            daily_rate: 0,
            qty_people: 1,
            days_worked: 0,
            ...cost.config
        };

        const newConfig = { ...currentConfig, [field]: value };
        const total = (newConfig.daily_rate || 0) * (newConfig.qty_people || 1) * (newConfig.days_worked || 0);

        handleUpdateCost(cost.id, {
            monthly_value: total,
            config: newConfig
        });
    }

    function getCostsForTab(tab: GroupTab) {
        if (tab === 'Equipe') {
            return costs.filter(c =>
                ['CLT', 'Salários CLT', 'Freelancer', 'Salários Freelancer', 'Motoboys', 'Lanche', 'Lanche Funcionário', 'Pró-Labore'].includes(c.category)
            );
        } else {
            return costs.filter(c =>
                !['CLT', 'Salários CLT', 'Freelancer', 'Salários Freelancer', 'Motoboys', 'Lanche', 'Lanche Funcionário', 'Pró-Labore'].includes(c.category)
            );
        }
    }

    const currentTabCosts = getCostsForTab(activeTab);
    const totalTabCosts = currentTabCosts.reduce((acc, c) => acc + c.monthly_value, 0);

    const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

    if (loading) return <div className="p-8 text-center text-slate-400">Carregando dados...</div>;

    return (
        <div className="space-y-6 fade-in">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Custos Fixos e Mão de Obra</h2>
                    <p className="page-subtitle">Gerencie sua equipe e despesas mensais</p>
                </div>
                <div className="flex glass-card p-1 gap-1 self-end md:self-auto">
                    <Button
                        variant={activeTab === 'Equipe' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('Equipe')}
                        className={`transition-all ${activeTab !== 'Equipe' ? 'text-slate-400 hover:text-white' : ''}`}
                    >
                        Mão de Obra (Equipe)
                    </Button>
                    <Button
                        variant={activeTab === 'Despesas' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('Despesas')}
                        className={`transition-all ${activeTab !== 'Despesas' ? 'text-slate-400 hover:text-white' : ''}`}
                    >
                        Despesas Mensais
                    </Button>
                </div>
            </div>

            <div className="glass-card border-l-4 border-l-primary p-6 flex justify-between items-center">
                <div>
                    <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Total {activeTab}</span>
                </div>
                <span className="text-3xl font-bold text-white">R$ {totalTabCosts.toFixed(2)}</span>
            </div>

            {activeTab === 'Equipe' && (
                <div className="space-y-6">

                    {/* 1. CLT */}
                    <CostSection
                        title="Salários CLT"
                        icon={Briefcase}
                        color="text-blue-400"
                        isOpen={openSections['CLT']}
                        onToggle={() => toggleSection('CLT')}
                        costs={costs.filter(c => c.category === 'Salários CLT' || c.category === 'CLT')}
                        totalValue={costs.filter(c => c.category === 'Salários CLT' || c.category === 'CLT').reduce((acc, c) => acc + c.monthly_value, 0)}
                    >
                        <div className="w-full text-sm">
                            {/* Header (Desktop Only) */}
                            <div className="hidden md:grid grid-cols-[1fr_120px_200px_120px_40px] gap-4 px-4 py-3 bg-dark-900/50 text-slate-400 font-medium rounded-t-lg">
                                <div>Funcionário</div>
                                <div className="text-right">Salário Base</div>
                                <div className="text-right">Encargos (13º/Férias/FGTS)</div>
                                <div className="text-right">Total Mensal</div>
                                <div className="w-10"></div>
                            </div>

                            {/* Body Rows */}
                            <div className="divide-y divide-dark-700/50 border border-dark-700/50 rounded-b-lg (md:rounded-t-none md:border-t-0 border-t md:border-t-0)">
                                {costs.filter(c => c.category === 'Salários CLT' || c.category === 'CLT').map(cost => (
                                    <div key={cost.id} className="grid grid-cols-1 md:grid-cols-[1fr_120px_200px_120px_40px] gap-2 md:gap-4 items-center p-3 md:p-4 hover:bg-dark-700/30 group transition-colors">
                                        <div className="flex flex-col md:block">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Funcionário</span>
                                            <input
                                                className="bg-transparent border-none focus:ring-0 text-white w-full placeholder-slate-600 p-0"
                                                value={cost.name}
                                                onChange={e => handleUpdateCost(cost.id, { name: e.target.value })}
                                                placeholder="Nome do Funcionário"
                                            />
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Salário Base</span>
                                            <input
                                                type="number"
                                                className="input w-full md:w-24 text-left md:text-right py-1 h-8"
                                                value={cost.config?.base_salary || ''}
                                                onChange={e => updateCLT(cost, parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end text-slate-400 text-xs">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Encargos</span>
                                            <div className="flex flex-col items-start md:items-end">
                                                <span>Total: R$ {((cost.config?.thirteenth || 0) + (cost.config?.vacation || 0) + (cost.config?.fgts || 0)).toFixed(2)}</span>
                                                <span className="opacity-50 text-[10px]">13º: {cost.config?.thirteenth?.toFixed(0)} | Fér: {cost.config?.vacation?.toFixed(0)} | FGTS: {cost.config?.fgts?.toFixed(0)}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Total Mensal</span>
                                            <span className="font-bold text-white md:text-right w-full block">R$ {cost.monthly_value.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-end md:justify-center mt-2 md:mt-0">
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => handleDeleteCost(cost.id)}
                                                className="opacity-50 hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddCost('Salários CLT', { base_salary: 0 })}
                            className="mt-4 text-xs text-primary hover:text-white font-medium uppercase tracking-wider"
                            leftIcon={<Plus size={14} />}
                        >
                            Adicionar Funcionário
                        </Button>
                    </CostSection>

                    {/* 2. FREELANCER */}
                    <CostSection
                        title="Salários Freelancer"
                        icon={Users}
                        color="text-purple-400"
                        isOpen={openSections['Freelancer']}
                        onToggle={() => toggleSection('Freelancer')}
                        costs={costs.filter(c => c.category === 'Salários Freelancer' || c.category === 'Freelancer')}
                        totalValue={costs.filter(c => c.category === 'Salários Freelancer' || c.category === 'Freelancer').reduce((acc, c) => acc + c.monthly_value, 0)}
                    >
                        <div className="w-full text-sm">
                            <div className="hidden md:grid grid-cols-[1fr_100px_100px_100px_120px_40px] gap-4 px-4 py-3 bg-dark-900/50 text-slate-400 font-medium rounded-t-lg">
                                <div>Função / Pessoa</div>
                                <div className="text-right">Diária</div>
                                <div className="text-right">Qtd Pessoas</div>
                                <div className="text-right">Dias/Mês</div>
                                <div className="text-right">Total</div>
                                <div className="w-10"></div>
                            </div>

                            <div className="divide-y divide-dark-700/50 border border-dark-700/50 rounded-b-lg (md:rounded-t-none md:border-t-0 border-t md:border-t-0)">
                                {costs.filter(c => c.category === 'Salários Freelancer' || c.category === 'Freelancer').map(cost => (
                                    <div key={cost.id} className="grid grid-cols-1 md:grid-cols-[1fr_100px_100px_100px_120px_40px] gap-2 md:gap-4 items-center p-3 md:p-4 hover:bg-dark-700/30 group transition-colors">
                                        <div className="flex flex-col md:block">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Função / Pessoa</span>
                                            <input
                                                className="bg-transparent border-none focus:ring-0 text-white w-full p-0"
                                                value={cost.name}
                                                onChange={e => handleUpdateCost(cost.id, { name: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Diária</span>
                                            <input type="number" className="input w-full md:w-20 text-left md:text-right py-1 h-8"
                                                value={cost.config?.daily_rate || ''} onChange={e => updateFreightOrFreelancer(cost, 'daily_rate', parseFloat(e.target.value))} />
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Qtd Pessoas</span>
                                            <input type="number" className="input w-full md:w-16 text-left md:text-right py-1 h-8"
                                                value={cost.config?.qty_people || ''} onChange={e => updateFreightOrFreelancer(cost, 'qty_people', parseFloat(e.target.value))} />
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Dias/Mês</span>
                                            <input type="number" className="input w-full md:w-16 text-left md:text-right py-1 h-8"
                                                value={cost.config?.days_worked || ''} onChange={e => updateFreightOrFreelancer(cost, 'days_worked', parseFloat(e.target.value))} />
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Total</span>
                                            <span className="font-bold text-white md:text-right w-full block">R$ {cost.monthly_value.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-end md:justify-center mt-2 md:mt-0">
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => handleDeleteCost(cost.id)}
                                                className="opacity-50 hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddCost('Salários Freelancer', { daily_rate: 0, qty_people: 1, days_worked: 0 })}
                            className="mt-4 text-xs text-primary hover:text-white font-medium uppercase tracking-wider"
                            leftIcon={<Plus size={14} />}
                        >
                            Adicionar Freelancer
                        </Button>
                    </CostSection>

                    {/* 3. MOTOBOYS */}
                    <CostSection
                        title="Motoboys"
                        icon={Bike}
                        color="text-orange-400"
                        isOpen={openSections['Motoboys']}
                        onToggle={() => toggleSection('Motoboys')}
                        costs={costs.filter(c => c.category === 'Motoboys')}
                        totalValue={costs.filter(c => c.category === 'Motoboys').reduce((acc, c) => acc + c.monthly_value, 0)}
                    >
                        <div className="w-full text-sm">
                            <div className="hidden md:grid grid-cols-[1fr_100px_100px_100px_120px_40px] gap-4 px-4 py-3 bg-dark-900/50 text-slate-400 font-medium rounded-t-lg">
                                <div>Descrição</div>
                                <div className="text-right">Diária Fixa</div>
                                <div className="text-right">Qtd Motos</div>
                                <div className="text-right">Dias/Mês</div>
                                <div className="text-right">Total</div>
                                <div className="w-10"></div>
                            </div>

                            <div className="divide-y divide-dark-700/50 border border-dark-700/50 rounded-b-lg (md:rounded-t-none md:border-t-0 border-t md:border-t-0)">
                                {costs.filter(c => c.category === 'Motoboys').map(cost => (
                                    <div key={cost.id} className="grid grid-cols-1 md:grid-cols-[1fr_100px_100px_100px_120px_40px] gap-2 md:gap-4 items-center p-3 md:p-4 hover:bg-dark-700/30 group transition-colors">
                                        <div className="flex flex-col md:block">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Descrição</span>
                                            <input
                                                className="bg-transparent border-none focus:ring-0 text-white w-full p-0"
                                                value={cost.name}
                                                onChange={e => handleUpdateCost(cost.id, { name: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Diária Fixa</span>
                                            <input type="number" className="input w-full md:w-20 text-left md:text-right py-1 h-8"
                                                value={cost.config?.daily_rate || ''} onChange={e => updateFreightOrFreelancer(cost, 'daily_rate', parseFloat(e.target.value))} />
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Qtd Motos</span>
                                            <input type="number" className="input w-full md:w-16 text-left md:text-right py-1 h-8"
                                                value={cost.config?.qty_people || ''} onChange={e => updateFreightOrFreelancer(cost, 'qty_people', parseFloat(e.target.value))} />
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Dias/Mês</span>
                                            <input type="number" className="input w-full md:w-16 text-left md:text-right py-1 h-8"
                                                value={cost.config?.days_worked || ''} onChange={e => updateFreightOrFreelancer(cost, 'days_worked', parseFloat(e.target.value))} />
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Total</span>
                                            <span className="font-bold text-white md:text-right w-full block">R$ {cost.monthly_value.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-end md:justify-center mt-2 md:mt-0">
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => handleDeleteCost(cost.id)}
                                                className="opacity-50 hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddCost('Motoboys', { daily_rate: 0, qty_people: 1, days_worked: 0 })}
                            className="mt-4 text-xs text-primary hover:text-white font-medium uppercase tracking-wider"
                            leftIcon={<Plus size={14} />}
                        >
                            Adicionar Motoboy
                        </Button>
                    </CostSection>

                    {/* 4. LANCHE */}
                    <CostSection
                        title="Lanche Funcionário"
                        icon={Coffee}
                        color="text-amber-400"
                        isOpen={openSections['Lanche']}
                        onToggle={() => toggleSection('Lanche')}
                        costs={costs.filter(c => c.category === 'Lanche' || c.category === 'Lanche Funcionário')}
                        totalValue={costs.filter(c => c.category === 'Lanche' || c.category === 'Lanche Funcionário').reduce((acc, c) => acc + c.monthly_value, 0)}
                    >
                        <div className="w-full text-sm">
                            <div className="hidden md:grid grid-cols-[1fr_120px_100px_120px_40px] gap-4 px-4 py-3 bg-dark-900/50 text-slate-400 font-medium rounded-t-lg">
                                <div>Descrição / Produto</div>
                                <div className="text-right">Custo Unit.</div>
                                <div className="text-right">Dias/Mês</div>
                                <div className="text-right">Total</div>
                                <div className="w-10"></div>
                            </div>

                            <div className="divide-y divide-dark-700/50 border border-dark-700/50 rounded-b-lg (md:rounded-t-none md:border-t-0 border-t md:border-t-0)">
                                {costs.filter(c => c.category === 'Lanche' || c.category === 'Lanche Funcionário').map(cost => {
                                    const isProduct = !!cost.config?.product_id;
                                    return (
                                        <div key={cost.id} className="grid grid-cols-1 md:grid-cols-[1fr_120px_100px_120px_40px] gap-2 md:gap-4 items-center p-3 md:p-4 hover:bg-dark-700/30 group transition-colors">
                                            <div className="flex flex-col md:block">
                                                <span className="text-xs text-slate-500 mb-1 md:hidden">Descrição / Produto</span>
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        className="bg-transparent text-xs text-primary border-none outline-none cursor-pointer font-bold px-0"
                                                        value={isProduct ? 'product' : 'manual'}
                                                        onChange={e => {
                                                            const mode = e.target.value as 'product' | 'manual';
                                                            if (mode === 'manual') {
                                                                updateSnack(cost, 'manual', 0, undefined, cost.config?.monthly_qty);
                                                            } else {
                                                                if (products.length > 0) {
                                                                    updateSnack(cost, 'product', undefined, products[0].id, cost.config?.monthly_qty);
                                                                } else {
                                                                    alert('Nenhum produto cadastrado para vincular!');
                                                                }
                                                            }
                                                        }}
                                                    >
                                                        <option value="manual">Manual</option>
                                                        <option value="product">Produto</option>
                                                    </select>
                                                    {isProduct ? (
                                                        <select
                                                            className="bg-dark-700 border border-dark-600 rounded text-white text-sm px-2 py-1 flex-1 min-w-0"
                                                            value={cost.config?.product_id || ''}
                                                            onChange={e => updateSnack(cost, 'product', undefined, parseInt(e.target.value), cost.config?.monthly_qty)}
                                                        >
                                                            <option value="">Selecione...</option>
                                                            {products.map(p => (
                                                                <option key={p.id} value={p.id}>{p.name} (R$ {(p as any).cost_price_view?.toFixed(2)})</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            className="bg-transparent border-none focus:ring-0 text-white flex-1 min-w-0 p-0"
                                                            value={cost.name}
                                                            onChange={e => handleUpdateCost(cost.id, { name: e.target.value })}
                                                            placeholder="Queijo, pão, café..."
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col md:block items-start md:items-end">
                                                <span className="text-xs text-slate-500 mb-1 md:hidden">Custo Unit.</span>
                                                {isProduct ?
                                                    <span className="text-slate-400 mt-1 block">R$ {(cost.config?.unit_cost || 0).toFixed(2)}</span> :
                                                    <input type="number" className="input w-full md:w-20 text-left md:text-right py-1 h-8"
                                                        value={cost.config?.unit_cost || ''} onChange={e => updateSnack(cost, 'manual', parseFloat(e.target.value), undefined, cost.config?.monthly_qty)} />
                                                }
                                            </div>
                                            <div className="flex flex-col md:block items-start md:items-end">
                                                <span className="text-xs text-slate-500 mb-1 md:hidden">Dias/Mês</span>
                                                <input type="number" className="input w-full md:w-16 text-left md:text-right py-1 h-8"
                                                    value={cost.config?.monthly_qty || ''} onChange={e => updateSnack(cost, isProduct ? 'product' : 'manual', cost.config?.unit_cost, cost.config?.product_id, parseFloat(e.target.value))} />
                                            </div>
                                            <div className="flex flex-col md:block items-start md:items-end">
                                                <span className="text-xs text-slate-500 mb-1 md:hidden">Total</span>
                                                <span className="font-bold text-white md:text-right w-full block">R$ {cost.monthly_value.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-end md:justify-center mt-2 md:mt-0">
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => handleDeleteCost(cost.id)}
                                                    className="opacity-50 hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddCost('Lanche Funcionário', { monthly_qty: 26, unit_cost: 0 })}
                            className="mt-4 text-xs text-primary hover:text-white font-medium uppercase tracking-wider"
                            leftIcon={<Plus size={14} />}
                        >
                            Adicionar Item de Lanche
                        </Button>
                    </CostSection>
                </div>
            )}

            {/* --- EXPENSES TAB CONTENT --- */}
            {activeTab === 'Despesas' && (
                <div className="space-y-6">
                    <div className="glass-card overflow-hidden">
                        <div className="w-full text-sm">
                            <div className="hidden md:grid grid-cols-[1fr_200px_150px_40px] gap-4 px-4 py-3 bg-dark-900/50 text-slate-400 font-medium border-b border-dark-700/50">
                                <div>Descrição</div>
                                <div className="text-left">Categoria</div>
                                <div className="text-right">Valor Mensal</div>
                                <div className="w-10"></div>
                            </div>

                            <div className="divide-y divide-dark-700/50">
                                {currentTabCosts.map(cost => (
                                    <div key={cost.id} className="grid grid-cols-1 md:grid-cols-[1fr_200px_150px_40px] gap-2 md:gap-4 items-center p-3 md:p-4 hover:bg-dark-700/30 group transition-colors">
                                        <div className="flex flex-col md:block">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Descrição</span>
                                            <input
                                                className="bg-transparent border-none focus:ring-0 text-white w-full p-0"
                                                value={cost.name}
                                                onChange={e => handleUpdateCost(cost.id, { name: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex flex-col md:block items-start">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Categoria</span>
                                            <select
                                                className="bg-transparent border border-dark-600 md:border-none focus:ring-0 outline-none text-slate-300 md:text-slate-400 text-sm md:text-xs w-full p-1 md:p-0 rounded"
                                                value={cost.category}
                                                onChange={e => handleUpdateCost(cost.id, { category: e.target.value })}
                                            >
                                                <option value="Operacional">Operacional</option>
                                                <option value="Geral">Geral</option>
                                                <option value="Aluguel & Contas">Aluguel & Contas</option>
                                                <option value="Marketing">Marketing</option>
                                                <option value="Sistemas/Outros">Sistemas/Outros</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col md:block items-start md:items-end">
                                            <span className="text-xs text-slate-500 mb-1 md:hidden">Valor Mensal</span>
                                            <input
                                                type="number"
                                                className="input w-full md:w-32 text-left md:text-right py-1 h-8"
                                                value={cost.monthly_value || ''}
                                                onChange={e => handleUpdateCost(cost.id, { monthly_value: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div className="flex justify-end md:justify-center mt-2 md:mt-0">
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => handleDeleteCost(cost.id)}
                                                className="opacity-50 hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 bg-dark-800/20 border-t border-dark-700/50">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddCost('Aluguel & Contas')}
                                className="text-xs text-primary hover:text-white font-medium uppercase tracking-wider"
                                leftIcon={<Plus size={14} />}
                            >
                                Adicionar Nova Despesa
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function CostSection({ title, icon: Icon, color, isOpen, onToggle, costs, totalValue, children }: any) {
    return (
        <div className="glass-card overflow-hidden transition-all duration-300">
            <div
                className={`p-4 ${isOpen ? 'bg-slate-800/50 border-b border-slate-700/50' : ''} flex justify-between items-center cursor-pointer hover:bg-slate-700/30 transition-colors`}
                onClick={onToggle}
            >
                <div className="flex items-center gap-3 text-lg font-bold text-slate-100">
                    <div className={`p-2 rounded-lg bg-dark-800 ${color} bg-opacity-10`}>
                        <Icon size={20} className={color} />
                    </div>
                    {title}
                    <span className="text-xs font-normal text-slate-500 bg-dark-800 px-2 py-1 rounded-full">{costs.length} itens</span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-slate-400 text-sm hidden md:inline">Total: <span className="text-white font-bold">R$ {totalValue.toFixed(2)}</span></span>
                    {isOpen ? <ChevronUp size={20} className="text-slate-500" /> : <ChevronDown size={20} className="text-slate-500" />}
                </div>
            </div>

            {isOpen && (
                <div className="p-4 bg-slate-900/20 animate-in fade-in slide-in-from-top-2 duration-200">
                    {costs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8">
                            <EmptyState
                                icon={Icon}
                                title={`Nenhum custo cadastrado`}
                                description={`Adicione itens em "${title}" para começar a controlar seus gastos.`}
                            />
                            <div className="mt-4">{children}</div>
                        </div>
                    ) : (
                        children
                    )}
                </div>
            )}
        </div>
    );
}
