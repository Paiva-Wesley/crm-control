import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Utensils, Calculator, Beaker, Box, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Ingredient } from '../types';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';

type IngredientCategory = 'Insumo' | 'Embalagem' | 'Acompanhamento';

const CATEGORIES: { id: IngredientCategory; label: string; icon: typeof Beaker }[] = [
    { id: 'Insumo', label: 'Insumos', icon: Beaker },
    { id: 'Embalagem', label: 'Embalagens', icon: Box },
    { id: 'Acompanhamento', label: 'Acompanhamentos', icon: Utensils }
];

export function Ingredients() {
    const { companyId } = useAuth();
    const { checkLimit, loading: subLoading } = useSubscription();
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<IngredientCategory>('Insumo');
    const { toast } = useToast();

    const [formData, setFormData] = useState<{
        name: string;
        unit: string;
        cost_per_unit: string;
        category: IngredientCategory;
    }>({
        name: '',
        unit: 'kg',
        cost_per_unit: '',
        category: 'Insumo'
    });

    const [calcValues, setCalcValues] = useState({
        packagePrice: '',
        packageAmount: '',
        unitMultiplier: '1'
    });

    const location = useLocation();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const categoryParam = params.get('category');
        if (categoryParam && ['Insumo', 'Embalagem', 'Acompanhamento'].includes(categoryParam)) {
            setActiveTab(categoryParam as IngredientCategory);
        }
    }, [location.search]);

    useEffect(() => {
        fetchIngredients();
        setFormData(prev => ({ ...prev, category: activeTab }));
    }, [activeTab]);

    // Calculator effect with multiplier
    useEffect(() => {
        const price = parseFloat(calcValues.packagePrice);
        const amount = parseFloat(calcValues.packageAmount);
        const multiplier = parseFloat(calcValues.unitMultiplier) || 1;

        if (price > 0 && amount > 0) {
            const costPerUnit = (price / amount) * multiplier;
            setFormData(prev => ({ ...prev, cost_per_unit: costPerUnit.toFixed(4) }));
        }
    }, [calcValues]);

    async function fetchIngredients() {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('ingredients')
                .select('*')
                .order('name');

            if (error) throw error;
            setIngredients(data || []);
        } catch (error) {
            console.error('Error fetching ingredients:', error);
        } finally {
            setLoading(false);
        }
    }

    // Filtered ingredients
    const filteredIngredients = useMemo(() => {
        return ingredients.filter(i => {
            const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase());
            const category = i.category || 'Insumo';
            return matchesSearch && category === activeTab;
        });
    }, [ingredients, searchTerm, activeTab]);

    // Stats per category
    const stats = useMemo(() => {
        const categoryItems = ingredients.filter(i => (i.category || 'Insumo') === activeTab);
        return {
            count: categoryItems.length,
            totalValue: categoryItems.reduce((acc, i) => acc + i.cost_per_unit, 0),
            avgCost: categoryItems.length > 0
                ? categoryItems.reduce((acc, i) => acc + i.cost_per_unit, 0) / categoryItems.length
                : 0
        };
    }, [ingredients, activeTab]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            const costValue = parseFloat(formData.cost_per_unit);
            if (!formData.name.trim() || isNaN(costValue) || costValue <= 0) {
                toast.error('Preencha todos os campos corretamente');
                return;
            }

            const payload = {
                name: formData.name.trim(),
                unit: formData.unit,
                cost_per_unit: costValue,
                category: formData.category,
                company_id: companyId
            };

            if (editingId) {
                const { error } = await supabase
                    .from('ingredients')
                    .update(payload)
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('ingredients')
                    .insert(payload);
                if (error) throw error;
            }

            setIsModalOpen(false);
            resetForm();
            toast.success('Insumo salvo com sucesso');
            fetchIngredients();
        } catch (error) {
            console.error('Error saving ingredient:', error);
            toast.error('Erro ao salvar insumo');
        }
    }

    async function handleDelete(id: number) {
        // Check dependencies before deleting
        const { count } = await supabase
            .from('product_ingredients')
            .select('*', { count: 'exact', head: true })
            .eq('ingredient_id', id);

        if (count && count > 0) {
            toast.error(`Não é possível excluir: usado em ${count} produto(s)`);
            return;
        }

        if (!confirm('Tem certeza que deseja excluir este insumo?')) return;

        try {
            const { error } = await supabase
                .from('ingredients')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('Insumo excluído');
            fetchIngredients();
        } catch (error) {
            console.error('Error deleting ingredient:', error);
            toast.error('Erro ao excluir insumo');
        }
    }

    function handleEdit(ingredient: Ingredient) {
        setEditingId(ingredient.id);
        setFormData({
            name: ingredient.name,
            unit: ingredient.unit,
            cost_per_unit: ingredient.cost_per_unit.toString(),
            category: ingredient.category || 'Insumo'
        });
        setCalcValues({ packagePrice: '', packageAmount: '', unitMultiplier: '1' });
        setIsModalOpen(true);
    }

    function resetForm() {
        setFormData({ name: '', unit: 'kg', cost_per_unit: '', category: activeTab });
        setCalcValues({ packagePrice: '', packageAmount: '', unitMultiplier: '1' });
        setEditingId(null);
    }

    const getUnitOptions = (category: IngredientCategory) => {
        switch (category) {
            case 'Embalagem':
                return ['un', 'pct', 'cx', 'mil'];
            case 'Acompanhamento':
                return ['un', 'pct', 'kg', 'g'];
            default:
                return ['kg', 'g', 'l', 'ml', 'un', 'pct', 'cx'];
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Insumos</h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Gerencie ingredientes, embalagens e acompanhamentos
                    </p>
                </div>
                <div className="flex gap-2">
                    {!subLoading && !checkLimit('ingredients') && (
                        <div className="text-sm text-red-400 self-center mr-2 border border-red-500/30 px-3 py-1 rounded bg-red-500/10">
                            Limite do plano atingido
                        </div>
                    )}
                    <Button
                        onClick={() => {
                            if (!subLoading && checkLimit('ingredients')) {
                                resetForm();
                                setIsModalOpen(true);
                            }
                        }}
                        disabled={!subLoading && !checkLimit('ingredients')}
                        leftIcon={<Plus size={20} />}
                    >
                        Novo Insumo
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-dark-800 p-4 rounded-lg border border-dark-700">
                    <p className="text-sm text-slate-400">Total em {activeTab}s</p>
                    <p className="text-2xl font-bold text-white">{stats.count}</p>
                </div>
                <div className="bg-dark-800 p-4 rounded-lg border border-dark-700">
                    <p className="text-sm text-slate-400">Custo Médio</p>
                    <p className="text-2xl font-bold text-emerald-400">
                        R$ {stats.avgCost.toFixed(2)}
                    </p>
                </div>
                <div className="bg-dark-800 p-4 rounded-lg border border-dark-700">
                    <p className="text-sm text-slate-400">Soma dos Custos</p>
                    <p className="text-2xl font-bold text-blue-400">
                        R$ {stats.totalValue.toFixed(2)}
                    </p>
                </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 border-b border-dark-700">
                {CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const count = ingredients.filter(i => (i.category || 'Insumo') === cat.id).length;

                    return (
                        <button
                            key={cat.id}
                            onClick={() => setActiveTab(cat.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === cat.id
                                    ? 'text-primary border-primary bg-primary/10'
                                    : 'text-slate-400 border-transparent hover:text-white hover:bg-dark-800'
                                }`}
                        >
                            <Icon size={18} />
                            {cat.label}
                            <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === cat.id ? 'bg-primary/20' : 'bg-dark-700'
                                }`}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Search */}
            <div className="search-box w-full sm:w-96">
                <Search size={20} className="text-slate-400" />
                <input
                    type="text"
                    placeholder={`Buscar ${activeTab.toLowerCase()}...`}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Table */}
            <div className="bg-dark-800 border border-dark-700 rounded-lg overflow-hidden">
                {filteredIngredients.length === 0 && !loading ? (
                    <EmptyState
                        icon={Utensils}
                        title={searchTerm ? "Nenhum insumo encontrado" : `Nenhum ${activeTab.toLowerCase()} cadastrado`}
                        description={searchTerm ? "Tente buscar com outros termos." : "Cadastre os insumos e custos para suas fichas técnicas."}
                        actionLabel={!searchTerm ? "Novo Item" : undefined}
                        onAction={!searchTerm ? () => {
                            if (!subLoading && checkLimit('ingredients')) {
                                resetForm();
                                setIsModalOpen(true);
                            }
                        } : undefined}
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-dark-700">
                                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Nome</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Categoria</th>
                                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-400 uppercase tracking-wider">Unidade</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-400 uppercase tracking-wider">Custo Unit.</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-400 uppercase tracking-wider">Custo/100g ou un</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-400 uppercase tracking-wider">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Carregando...</td></tr>
                                ) : (
                                    filteredIngredients.map(ing => {
                                        const normalizedCost = ing.unit === 'kg'
                                            ? ing.cost_per_unit / 10
                                            : ing.unit === 'g'
                                                ? ing.cost_per_unit * 100
                                                : ing.cost_per_unit;

                                        return (
                                            <tr key={ing.id} className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors">
                                                <td className="px-4 py-4">
                                                    <p className="font-semibold text-slate-100">{ing.name}</p>
                                                    <p className="text-xs text-slate-500">ID: {ing.id}</p>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                                        {ing.category || 'Insumo'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <span className="px-2 py-1 bg-dark-700 rounded text-sm text-slate-300">
                                                        {ing.unit}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-right text-slate-300">
                                                    R$ {Number(ing.cost_per_unit).toFixed(4)}
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <span className="text-emerald-400">
                                                        R$ {normalizedCost.toFixed(4)}
                                                    </span>
                                                    <span className="text-xs text-slate-500 ml-1">
                                                        /{ing.unit === 'kg' || ing.unit === 'g' ? '100g' : 'un'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleEdit(ing)}
                                                            className="h-8 w-8 p-0"
                                                            title="Editar"
                                                        >
                                                            <Edit2 size={18} />
                                                        </Button>
                                                        <Button
                                                            variant="danger"
                                                            size="sm"
                                                            onClick={() => handleDelete(ing.id)}
                                                            className="h-8 w-8 p-0"
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={18} />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingId ? 'Editar Insumo' : 'Novo Insumo'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Nome do Item *</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ex: Queijo Mussarela, Saco Kraft"
                                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Categoria</label>
                            <select
                                value={formData.category}
                                onChange={e => {
                                    const cat = e.target.value as IngredientCategory;
                                    setFormData(prev => ({
                                        ...prev,
                                        category: cat,
                                        unit: cat === 'Embalagem' ? 'un' : prev.unit
                                    }));
                                }}
                                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                            >
                                {CATEGORIES.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Cost Calculator with multiplier */}
                    <div className="bg-dark-700/50 border border-dark-600 rounded-lg p-4 space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                            <Calculator size={20} />
                            <h4 className="text-xs font-semibold uppercase">Calculadora de Custo</h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Preço da Embalagem (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={calcValues.packagePrice}
                                    onChange={e => setCalcValues(prev => ({ ...prev, packagePrice: e.target.value }))}
                                    placeholder="Ex: 50,00"
                                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Qtd na Embalagem</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    value={calcValues.packageAmount}
                                    onChange={e => setCalcValues(prev => ({ ...prev, packageAmount: e.target.value }))}
                                    placeholder={`Ex: 1000 (${formData.unit})`}
                                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Multiplicador</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    value={calcValues.unitMultiplier}
                                    onChange={e => setCalcValues(prev => ({ ...prev, unitMultiplier: e.target.value }))}
                                    placeholder="Ex: 1"
                                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                                />
                                <p className="text-xs text-slate-500 mt-1">Use 0.001 para converter kg→g</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-dark-600">
                            <span className="text-sm text-slate-400">Custo Calculado:</span>
                            <span className="text-lg font-bold text-primary">
                                R$ {formData.cost_per_unit || '0.0000'}
                            </span>
                        </div>
                    </div>

                    {/* Manual Cost + Unit */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Custo por Unidade (R$) *</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2 text-slate-400">R$</span>
                                <input
                                    type="number"
                                    step="0.0001"
                                    required
                                    value={formData.cost_per_unit}
                                    onChange={e => setFormData({ ...formData, cost_per_unit: e.target.value })}
                                    placeholder="0.00"
                                    className="w-full pl-10 pr-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Unidade de Medida *</label>
                            <select
                                value={formData.unit}
                                onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                                required
                            >
                                {getUnitOptions(formData.category).map(unit => (
                                    <option key={unit} value={unit}>{unit}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Tip */}
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                        <p className="text-xs text-blue-400">
                            <strong>Dica:</strong> Para sólidos (queijo, carne), prefira kg ou g. Para líquidos, use ml ou L. Embalagens por unidade.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1"
                        >
                            <Save size={18} className="mr-2" />
                            {editingId ? 'Atualizar' : 'Criar'} Insumo
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
