import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Trash2, Users, Bike, Coffee, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { FixedCost, Product } from '../types';

// Grouping for Tabs
type GroupTab = 'Equipe' | 'Despesas';

export function FixedCosts() {
    const [loading, setLoading] = useState(true);
    const [costs, setCosts] = useState<FixedCost[]>([]);
    const [products, setProducts] = useState<Product[]>([]); // For snack linking
    const [activeTab, setActiveTab] = useState<GroupTab>('Equipe');

    // Accordion State
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
                supabase.from('fixed_costs').select('*').order('id'),
                supabase.from('products').select('*').eq('active', true).order('name')
            ]);

            if (costsRes.error) throw costsRes.error;

            // Ensure numeric values are parsed (Supabase returns numeric as string)
            const parsedCosts = (costsRes.data || []).map(c => ({
                ...c,
                monthly_value: parseFloat(c.monthly_value as any) || 0
            }));

            setCosts(parsedCosts);
            setProducts(productsRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }

    // --- Action Handlers ---

    async function handleAddCost(category: string, initialConfig: any = {}) {
        const defaultName = category.includes('CLT') ? 'Novo Funcionário' :
            category.includes('Lanche') ? 'Item de Lanche' : 'Novo Custo';

        try {
            const { data, error } = await supabase.from('fixed_costs').insert({
                name: defaultName,
                category,
                monthly_value: 0,
                config: initialConfig
            }).select().single();

            if (error) throw error;
            setCosts(prev => [...prev, data]);
            // Ensure section is open
            setOpenSections(prev => ({ ...prev, [category]: true }));
        } catch (error) {
            console.error('Error adding cost:', error);
        }
    }

    async function handleUpdateCost(id: number, updates: Partial<FixedCost>) {
        // Optimistic update
        setCosts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
        try {
            await supabase.from('fixed_costs').update(updates).eq('id', id);
        } catch (error) {
            console.error('Error updating cost:', error);
        }
    }

    async function handleDeleteCost(id: number) {
        if (!confirm('Excluir este custo?')) return;
        setCosts(prev => prev.filter(c => c.id !== id));
        try {
            await supabase.from('fixed_costs').delete().eq('id', id);
        } catch (error) {
            console.error('Error deleting cost:', error);
        }
    }

    // --- Calculation Logic ---

    function updateCLT(cost: FixedCost, baseSalary: number) {
        const thirteenth = baseSalary / 12;
        const vacation = (baseSalary + (baseSalary / 3)) / 12; // 1/3 constitutional
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
            // Fetch product cost
            const prod = products.find(p => p.id === productId);
            if (prod) {
                const unitCost = prod.cost_price || 0;
                newVal = unitCost * (days || 0);
                newConfig.unit_cost = unitCost;
            } else {
                // Determine logic if product not found (keep old or zero)
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

    // --- Helper for Filtering ---

    // Some costs might have categories not in our static list (legacy compatibility)
    // We group them by tab based on known logic.
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
            <div className="flex flex-col md:flex-row justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100">Custos Fixos e Mão de Obra</h2>
                    <p className="text-slate-400 text-sm">Gerencie sua equipe e despesas mensais</p>
                </div>
                <div className="mt-4 md:mt-0 flex bg-dark-800 rounded-lg p-1 border border-dark-700">
                    <button
                        onClick={() => setActiveTab('Equipe')}
                        className={`px-4 py-2 rounded transition-all ${activeTab === 'Equipe' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        Mão de Obra (Equipe)
                    </button>
                    <button
                        onClick={() => setActiveTab('Despesas')}
                        className={`px-4 py-2 rounded transition-all ${activeTab === 'Despesas' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        Despesas Mensais
                    </button>
                </div>
            </div>

            <div className="card bg-dark-800 border-l-4 border-l-primary p-4 flex justify-between items-center">
                <div>
                    <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Total {activeTab}</span>
                </div>
                <span className="text-3xl font-bold text-white">R$ {totalTabCosts.toFixed(2)}</span>
            </div>

            {/* --- EQUITY TAB CONTENT --- */}
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
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 border-b border-dark-700 text-left">
                                    <th className="pb-2 pl-2">Funcionário</th>
                                    <th className="pb-2 text-right">Salário Base</th>
                                    <th className="pb-2 text-right">Encargos (13º/Férias/FGTS)</th>
                                    <th className="pb-2 text-right">Total Mensal</th>
                                    <th className="pb-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {costs.filter(c => c.category === 'Salários CLT' || c.category === 'CLT').map(cost => (
                                    <tr key={cost.id} className="border-b border-dark-700/50 hover:bg-dark-700/30 group">
                                        <td className="py-2 pl-2">
                                            <input
                                                className="bg-transparent border-none focus:ring-0 text-white w-full"
                                                value={cost.name}
                                                onChange={e => handleUpdateCost(cost.id, { name: e.target.value })}
                                                placeholder="Nome do Funcionário"
                                            />
                                        </td>
                                        <td className="py-2 text-right">
                                            <input
                                                type="number"
                                                className="bg-dark-700 rounded border border-dark-600 w-24 text-right px-2 py-1 text-white focus:border-blue-500 outline-none"
                                                value={cost.config?.base_salary || ''}
                                                onChange={e => updateCLT(cost, parseFloat(e.target.value) || 0)}
                                            />
                                        </td>
                                        <td className="py-2 text-right text-slate-400 text-xs">
                                            <div className="flex flex-col items-end">
                                                <span>Total: R$ {((cost.config?.thirteenth || 0) + (cost.config?.vacation || 0) + (cost.config?.fgts || 0)).toFixed(2)}</span>
                                                <span className="opacity-50 text-[10px]">13º: {cost.config?.thirteenth?.toFixed(0)} | Fér: {cost.config?.vacation?.toFixed(0)} | FGTS: {cost.config?.fgts?.toFixed(0)}</span>
                                            </div>
                                        </td>
                                        <td className="py-2 text-right font-bold text-white">R$ {cost.monthly_value.toFixed(2)}</td>
                                        <td className="py-2 text-center">
                                            <button onClick={() => handleDeleteCost(cost.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button onClick={() => handleAddCost('Salários CLT', { base_salary: 0 })} className="mt-4 text-xs flex items-center gap-1 text-primary hover:text-white font-medium uppercase tracking-wider">
                            <Plus size={14} /> Adicionar Funcionário
                        </button>
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
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 border-b border-dark-700 text-left">
                                    <th className="pb-2 pl-2">Função / Pessoa</th>
                                    <th className="pb-2 text-right">Diária</th>
                                    <th className="pb-2 text-right">Qtd Pessoas</th>
                                    <th className="pb-2 text-right">Dias/Mês</th>
                                    <th className="pb-2 text-right">Total</th>
                                    <th className="pb-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {costs.filter(c => c.category === 'Salários Freelancer' || c.category === 'Freelancer').map(cost => (
                                    <tr key={cost.id} className="border-b border-dark-700/50 hover:bg-dark-700/30 group">
                                        <td className="py-2 pl-2">
                                            <input
                                                className="bg-transparent border-none focus:ring-0 text-white w-full"
                                                value={cost.name}
                                                onChange={e => handleUpdateCost(cost.id, { name: e.target.value })}
                                            />
                                        </td>
                                        <td className="py-2 text-right">
                                            <input type="number" className="bg-dark-700 rounded border border-dark-600 w-20 text-right px-2 py-1 text-white"
                                                value={cost.config?.daily_rate || ''} onChange={e => updateFreightOrFreelancer(cost, 'daily_rate', parseFloat(e.target.value))} />
                                        </td>
                                        <td className="py-2 text-right">
                                            <input type="number" className="bg-dark-700 rounded border border-dark-600 w-16 text-right px-2 py-1 text-white"
                                                value={cost.config?.qty_people || ''} onChange={e => updateFreightOrFreelancer(cost, 'qty_people', parseFloat(e.target.value))} />
                                        </td>
                                        <td className="py-2 text-right">
                                            <input type="number" className="bg-dark-700 rounded border border-dark-600 w-16 text-right px-2 py-1 text-white"
                                                value={cost.config?.days_worked || ''} onChange={e => updateFreightOrFreelancer(cost, 'days_worked', parseFloat(e.target.value))} />
                                        </td>
                                        <td className="py-2 text-right font-bold text-white">R$ {cost.monthly_value.toFixed(2)}</td>
                                        <td className="py-2 text-center">
                                            <button onClick={() => handleDeleteCost(cost.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button onClick={() => handleAddCost('Salários Freelancer', { daily_rate: 0, qty_people: 1, days_worked: 0 })} className="mt-4 text-xs flex items-center gap-1 text-primary hover:text-white font-medium uppercase tracking-wider">
                            <Plus size={14} /> Adicionar Freelancer
                        </button>
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
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 border-b border-dark-700 text-left">
                                    <th className="pb-2 pl-2">Descrição</th>
                                    <th className="pb-2 text-right">Diária Fixa</th>
                                    <th className="pb-2 text-right">Qtd Motos</th>
                                    <th className="pb-2 text-right">Dias/Mês</th>
                                    <th className="pb-2 text-right">Total</th>
                                    <th className="pb-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {costs.filter(c => c.category === 'Motoboys').map(cost => (
                                    <tr key={cost.id} className="border-b border-dark-700/50 hover:bg-dark-700/30 group">
                                        <td className="py-2 pl-2">
                                            <input
                                                className="bg-transparent border-none focus:ring-0 text-white w-full"
                                                value={cost.name}
                                                onChange={e => handleUpdateCost(cost.id, { name: e.target.value })}
                                            />
                                        </td>
                                        <td className="py-2 text-right">
                                            <input type="number" className="bg-dark-700 rounded border border-dark-600 w-20 text-right px-2 py-1 text-white"
                                                value={cost.config?.daily_rate || ''} onChange={e => updateFreightOrFreelancer(cost, 'daily_rate', parseFloat(e.target.value))} />
                                        </td>
                                        <td className="py-2 text-right">
                                            <input type="number" className="bg-dark-700 rounded border border-dark-600 w-16 text-right px-2 py-1 text-white"
                                                value={cost.config?.qty_people || ''} onChange={e => updateFreightOrFreelancer(cost, 'qty_people', parseFloat(e.target.value))} />
                                        </td>
                                        <td className="py-2 text-right">
                                            <input type="number" className="bg-dark-700 rounded border border-dark-600 w-16 text-right px-2 py-1 text-white"
                                                value={cost.config?.days_worked || ''} onChange={e => updateFreightOrFreelancer(cost, 'days_worked', parseFloat(e.target.value))} />
                                        </td>
                                        <td className="py-2 text-right font-bold text-white">R$ {cost.monthly_value.toFixed(2)}</td>
                                        <td className="py-2 text-center">
                                            <button onClick={() => handleDeleteCost(cost.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button onClick={() => handleAddCost('Motoboys', { daily_rate: 0, qty_people: 1, days_worked: 0 })} className="mt-4 text-xs flex items-center gap-1 text-primary hover:text-white font-medium uppercase tracking-wider">
                            <Plus size={14} /> Adicionar Motoboy
                        </button>
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
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 border-b border-dark-700 text-left">
                                    <th className="pb-2 pl-2">Descrição / Produto</th>
                                    <th className="pb-2 text-right">Custo Unit.</th>
                                    <th className="pb-2 text-right">Dias/Mês</th>
                                    <th className="pb-2 text-right">Total</th>
                                    <th className="pb-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {costs.filter(c => c.category === 'Lanche' || c.category === 'Lanche Funcionário').map(cost => {
                                    const isProduct = !!cost.config?.product_id;
                                    return (
                                        <tr key={cost.id} className="border-b border-dark-700/50 hover:bg-dark-700/30 group">
                                            <td className="py-2 pl-2">
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        className="bg-transparent text-xs text-primary border-none outline-none cursor-pointer font-bold"
                                                        value={isProduct ? 'product' : 'manual'}
                                                        onChange={e => {
                                                            const mode = e.target.value as 'product' | 'manual';
                                                            if (mode === 'manual') {
                                                                updateSnack(cost, 'manual', 0, undefined, cost.config?.monthly_qty);
                                                            } else {
                                                                // Switch to product mode: pick first product if available
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
                                                            className="bg-dark-700 border border-dark-600 rounded text-white text-sm px-2 py-1 flex-1 max-w-[200px]"
                                                            value={cost.config?.product_id || ''}
                                                            onChange={e => updateSnack(cost, 'product', undefined, parseInt(e.target.value), cost.config?.monthly_qty)}
                                                        >
                                                            <option value="">Selecione...</option>
                                                            {products.map(p => (
                                                                <option key={p.id} value={p.id}>{p.name} (R$ {p.cost_price?.toFixed(2)})</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            className="bg-transparent border-none focus:ring-0 text-white flex-1"
                                                            value={cost.name}
                                                            onChange={e => handleUpdateCost(cost.id, { name: e.target.value })}
                                                            placeholder="Queijo, pão, café..."
                                                        />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-2 text-right">
                                                {isProduct ?
                                                    <span className="text-slate-400">R$ {(cost.config?.unit_cost || 0).toFixed(2)}</span> :
                                                    <input type="number" className="bg-dark-700 rounded border border-dark-600 w-20 text-right px-2 py-1 text-white"
                                                        value={cost.config?.unit_cost || ''} onChange={e => updateSnack(cost, 'manual', parseFloat(e.target.value), undefined, cost.config?.monthly_qty)} />
                                                }
                                            </td>
                                            <td className="py-2 text-right">
                                                <input type="number" className="bg-dark-700 rounded border border-dark-600 w-16 text-right px-2 py-1 text-white"
                                                    value={cost.config?.monthly_qty || ''} onChange={e => updateSnack(cost, isProduct ? 'product' : 'manual', cost.config?.unit_cost, cost.config?.product_id, parseFloat(e.target.value))} />
                                            </td>
                                            <td className="py-2 text-right font-bold text-white">R$ {cost.monthly_value.toFixed(2)}</td>
                                            <td className="py-2 text-center">
                                                <button onClick={() => handleDeleteCost(cost.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <button onClick={() => handleAddCost('Lanche Funcionário', { monthly_qty: 26, unit_cost: 0 })} className="mt-4 text-xs flex items-center gap-1 text-primary hover:text-white font-medium uppercase tracking-wider">
                            <Plus size={14} /> Adicionar Item de Lanche
                        </button>
                    </CostSection>
                </div>
            )}

            {/* --- EXPENSES TAB CONTENT --- */}
            {activeTab === 'Despesas' && (
                <div className="space-y-6">
                    {/* General/Other Table */}
                    <div className="card bg-dark-800 border border-dark-700 rounded-lg p-4">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 border-b border-dark-700 text-left">
                                    <th className="pb-2 pl-2">Descrição</th>
                                    <th className="pb-2">Categoria</th>
                                    <th className="pb-2 text-right">Valor Mensal</th>
                                    <th className="pb-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentTabCosts.map(cost => (
                                    <tr key={cost.id} className="border-b border-dark-700/50 hover:bg-dark-700/30 group">
                                        <td className="py-2 pl-2">
                                            <input
                                                className="bg-transparent border-none focus:ring-0 text-white w-full"
                                                value={cost.name}
                                                onChange={e => handleUpdateCost(cost.id, { name: e.target.value })}
                                            />
                                        </td>
                                        <td className="py-2">
                                            <select
                                                className="bg-transparent border-none outline-none text-slate-400 text-xs w-full"
                                                value={cost.category}
                                                onChange={e => handleUpdateCost(cost.id, { category: e.target.value })}
                                            >
                                                <option value="Operacional">Operacional</option>
                                                <option value="Geral">Geral</option>
                                                <option value="Aluguel & Contas">Aluguel & Contas</option>
                                                <option value="Marketing">Marketing</option>
                                                <option value="Sistemas/Outros">Sistemas/Outros</option>
                                            </select>
                                        </td>
                                        <td className="py-2 text-right">
                                            <input
                                                type="number"
                                                className="bg-dark-700 rounded border border-dark-600 w-32 text-right px-2 py-1 text-white focus:border-emerald-500 outline-none"
                                                value={cost.monthly_value || ''}
                                                onChange={e => handleUpdateCost(cost.id, { monthly_value: parseFloat(e.target.value) || 0 })}
                                            />
                                        </td>
                                        <td className="py-2 text-center">
                                            <button onClick={() => handleDeleteCost(cost.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button onClick={() => handleAddCost('Aluguel & Contas')} className="mt-4 text-xs flex items-center gap-1 text-primary hover:text-white font-medium uppercase tracking-wider">
                            <Plus size={14} /> Adicionar Nova Despesa
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper Component for Accordion Sections
function CostSection({ title, icon: Icon, color, isOpen, onToggle, costs, totalValue, children }: any) {
    return (
        <div className="card bg-dark-800 border border-dark-700 rounded-lg overflow-hidden transition-all duration-300">
            <div
                className={`p-4 ${isOpen ? 'bg-dark-900 border-b border-dark-700' : ''} flex justify-between items-center cursor-pointer hover:bg-dark-700/50 transition-colors`}
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
                <div className="p-4 bg-dark-800/50 animate-in fade-in slide-in-from-top-2 duration-200">
                    {children}
                </div>
            )}
        </div>
    );
}
