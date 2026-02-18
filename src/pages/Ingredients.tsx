import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Utensils, Calculator, Beaker, Box, Save, Layers, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Ingredient, IngredientComponent } from '../types';
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

interface ComponentRow {
    child_ingredient_id: number;
    quantity: string;
}

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
        is_composite: boolean;
    }>({
        name: '',
        unit: 'kg',
        cost_per_unit: '',
        category: 'Insumo',
        is_composite: false
    });

    // Composite sub-ingredients
    const [components, setComponents] = useState<ComponentRow[]>([]);

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

    // Calculator effect with multiplier (only for non-composite)
    useEffect(() => {
        if (formData.is_composite) return;
        const price = parseFloat(calcValues.packagePrice);
        const amount = parseFloat(calcValues.packageAmount);
        const multiplier = parseFloat(calcValues.unitMultiplier) || 1;

        if (price > 0 && amount > 0) {
            const costPerUnit = (price / amount) * multiplier;
            setFormData(prev => ({ ...prev, cost_per_unit: costPerUnit.toFixed(4) }));
        }
    }, [calcValues, formData.is_composite]);

    // Auto-calculate composite cost when components change
    const compositeCost = useMemo(() => {
        if (!formData.is_composite || components.length === 0) return 0;
        return components.reduce((total, comp) => {
            const child = ingredients.find(i => i.id === comp.child_ingredient_id);
            const qty = parseFloat(comp.quantity) || 0;
            if (child) {
                return total + (child.cost_per_unit * qty);
            }
            return total;
        }, 0);
    }, [components, ingredients, formData.is_composite]);

    // Sync composite cost to form
    useEffect(() => {
        if (formData.is_composite && compositeCost > 0) {
            setFormData(prev => ({ ...prev, cost_per_unit: compositeCost.toFixed(4) }));
        }
    }, [compositeCost, formData.is_composite]);

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

    // Available ingredients for composite (exclude self when editing, exclude composites to prevent deep nesting)
    const availableChildIngredients = useMemo(() => {
        return ingredients.filter(i => {
            if (editingId && i.id === editingId) return false;
            if (i.is_composite) return false;
            return true;
        });
    }, [ingredients, editingId]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            const costValue = parseFloat(formData.cost_per_unit);
            if (!formData.name.trim() || isNaN(costValue) || costValue <= 0) {
                toast.error('Preencha todos os campos corretamente');
                return;
            }

            if (formData.is_composite && components.length === 0) {
                toast.error('Adicione pelo menos um sub-insumo');
                return;
            }

            const payload = {
                name: formData.name.trim(),
                unit: formData.unit,
                cost_per_unit: costValue,
                category: formData.category,
                company_id: companyId,
                is_composite: formData.is_composite
            };

            let ingredientId = editingId;

            if (editingId) {
                const { error } = await supabase
                    .from('ingredients')
                    .update(payload)
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase
                    .from('ingredients')
                    .insert(payload)
                    .select('id')
                    .single();
                if (error) throw error;
                ingredientId = data.id;
            }

            // Save components for composite ingredients
            if (formData.is_composite && ingredientId) {
                // Delete existing components
                await supabase
                    .from('ingredient_components')
                    .delete()
                    .eq('parent_ingredient_id', ingredientId);

                // Insert new components
                const componentPayloads = components
                    .filter(c => c.child_ingredient_id && parseFloat(c.quantity) > 0)
                    .map(c => ({
                        parent_ingredient_id: ingredientId,
                        child_ingredient_id: c.child_ingredient_id,
                        quantity: parseFloat(c.quantity),
                        company_id: companyId
                    }));

                if (componentPayloads.length > 0) {
                    const { error } = await supabase
                        .from('ingredient_components')
                        .insert(componentPayloads);
                    if (error) throw error;
                }
            } else if (!formData.is_composite && editingId) {
                // If switching from composite to non-composite, remove components
                await supabase
                    .from('ingredient_components')
                    .delete()
                    .eq('parent_ingredient_id', editingId);
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

    async function handleEdit(ingredient: Ingredient) {
        setEditingId(ingredient.id);
        setFormData({
            name: ingredient.name,
            unit: ingredient.unit,
            cost_per_unit: ingredient.cost_per_unit.toString(),
            category: ingredient.category || 'Insumo',
            is_composite: ingredient.is_composite || false
        });
        setCalcValues({ packagePrice: '', packageAmount: '', unitMultiplier: '1' });

        // Load components if composite
        if (ingredient.is_composite) {
            const { data } = await supabase
                .from('ingredient_components')
                .select('child_ingredient_id, quantity')
                .eq('parent_ingredient_id', ingredient.id);

            if (data && data.length > 0) {
                setComponents(data.map(c => ({
                    child_ingredient_id: c.child_ingredient_id,
                    quantity: c.quantity.toString()
                })));
            } else {
                setComponents([]);
            }
        } else {
            setComponents([]);
        }

        setIsModalOpen(true);
    }

    function resetForm() {
        setFormData({ name: '', unit: 'kg', cost_per_unit: '', category: activeTab, is_composite: false });
        setCalcValues({ packagePrice: '', packageAmount: '', unitMultiplier: '1' });
        setComponents([]);
        setEditingId(null);
    }

    function addComponent() {
        setComponents(prev => [...prev, { child_ingredient_id: 0, quantity: '' }]);
    }

    function removeComponent(index: number) {
        setComponents(prev => prev.filter((_, i) => i !== index));
    }

    function updateComponent(index: number, field: keyof ComponentRow, value: string | number) {
        setComponents(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
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
                                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Tipo</th>
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
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-semibold text-slate-100">{ing.name}</p>
                                                        {ing.is_composite && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-400 border border-purple-500/20">
                                                                <Layers size={12} />
                                                                Composto
                                                            </span>
                                                        )}
                                                    </div>
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
                                placeholder="Ex: Queijo Mussarela, Molho Bolonhesa"
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

                    {/* Composite Toggle */}
                    <div className="flex items-center gap-3 p-3 bg-dark-700/50 border border-dark-600 rounded-lg">
                        <button
                            type="button"
                            onClick={() => {
                                const newIsComposite = !formData.is_composite;
                                setFormData(prev => ({
                                    ...prev,
                                    is_composite: newIsComposite,
                                    cost_per_unit: newIsComposite ? '' : prev.cost_per_unit
                                }));
                                if (newIsComposite && components.length === 0) {
                                    addComponent();
                                }
                            }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.is_composite ? 'bg-purple-500' : 'bg-dark-600'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_composite ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <div>
                            <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
                                <Layers size={16} className="text-purple-400" />
                                Insumo Composto
                            </p>
                            <p className="text-xs text-slate-500">
                                Feito a partir de outros insumos (ex: Molho Bolonhesa = Carne + Calabresa + Milho)
                            </p>
                        </div>
                    </div>

                    {/* Composite Sub-ingredients */}
                    {formData.is_composite && (
                        <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-purple-400 flex items-center gap-2">
                                    <Layers size={16} />
                                    Sub-Insumos
                                </h4>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={addComponent}
                                    className="text-purple-400 hover:text-purple-300"
                                >
                                    <Plus size={16} className="mr-1" />
                                    Adicionar
                                </Button>
                            </div>

                            {components.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-4">
                                    Adicione os sub-insumos que compõem este insumo.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {components.map((comp, index) => {
                                        const childIngredient = ingredients.find(i => i.id === comp.child_ingredient_id);
                                        const lineCost = childIngredient ? (childIngredient.cost_per_unit * (parseFloat(comp.quantity) || 0)) : 0;

                                        return (
                                            <div key={index} className="flex items-center gap-2 bg-dark-800/50 rounded-lg p-2">
                                                <select
                                                    value={comp.child_ingredient_id || ''}
                                                    onChange={e => updateComponent(index, 'child_ingredient_id', parseInt(e.target.value))}
                                                    className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition duration-200"
                                                >
                                                    <option value="">Selecione um insumo...</option>
                                                    {availableChildIngredients.map(ing => (
                                                        <option key={ing.id} value={ing.id}>
                                                            {ing.name} (R$ {Number(ing.cost_per_unit).toFixed(4)}/{ing.unit})
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        placeholder="Qtd"
                                                        value={comp.quantity}
                                                        onChange={e => updateComponent(index, 'quantity', e.target.value)}
                                                        className="w-24 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 text-sm text-right focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition duration-200"
                                                    />
                                                    {childIngredient && (
                                                        <span className="text-xs text-slate-500 w-8">{childIngredient.unit}</span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-emerald-400 w-24 text-right whitespace-nowrap">
                                                    R$ {lineCost.toFixed(4)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeComponent(index)}
                                                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Composite Cost Total */}
                            <div className="flex items-center justify-between pt-3 border-t border-purple-500/20">
                                <span className="text-sm font-medium text-slate-400">Custo Total Calculado:</span>
                                <span className="text-lg font-bold text-purple-400">
                                    R$ {compositeCost.toFixed(4)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Cost Calculator with multiplier (only for non-composite) */}
                    {!formData.is_composite && (
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
                    )}

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
                                    disabled={formData.is_composite}
                                    className={`w-full pl-10 pr-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200 ${formData.is_composite ? 'opacity-60 cursor-not-allowed' : ''}`}
                                />
                            </div>
                            {formData.is_composite && (
                                <p className="text-xs text-purple-400 mt-1">Calculado automaticamente pelos sub-insumos</p>
                            )}
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
                            {formData.is_composite ? (
                                <><strong>Dica:</strong> Adicione todos os sub-insumos com suas quantidades. O custo será calculado automaticamente pela soma. Depois, esse insumo poderá ser usado normalmente na ficha técnica dos produtos.</>
                            ) : (
                                <><strong>Dica:</strong> Para sólidos (queijo, carne), prefira kg ou g. Para líquidos, use ml ou L. Embalagens por unidade.</>
                            )}
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
