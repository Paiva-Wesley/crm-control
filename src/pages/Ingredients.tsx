import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Utensils } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Ingredient } from '../types';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';

type IngredientCategory = 'Insumo' | 'Embalagem' | 'Acompanhamento';

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

    const [calc, setCalc] = useState({ price: '', amount: '' });
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

    useEffect(() => {
        if (calc.price && calc.amount) {
            const price = parseFloat(calc.price);
            const amount = parseFloat(calc.amount);
            if (amount > 0) {
                const cost = price / amount;
                setFormData(prev => ({ ...prev, cost_per_unit: cost.toFixed(4) }));
            }
        }
    }, [calc.price, calc.amount]);

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

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            const payload = {
                name: formData.name,
                unit: formData.unit,
                cost_per_unit: parseFloat(formData.cost_per_unit),
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
            toast.error('Erro ao excluir (verifique se não está em uso)');
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
        setCalc({ price: '', amount: '' });
        setIsModalOpen(true);
    }

    function resetForm() {
        setFormData({ name: '', unit: 'kg', cost_per_unit: '', category: activeTab });
        setCalc({ price: '', amount: '' });
        setEditingId(null);
    }

    const filteredIngredients = ingredients.filter(i => {
        const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase());
        const category = i.category || 'Insumo';
        return matchesSearch && category === activeTab;
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="search-box w-full sm:w-96">
                    <Search size={20} className="text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

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
                    Novo Item
                </Button>
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
                                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Unidade</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Custo Unitário</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-400 uppercase tracking-wider">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Carregando...</td></tr>
                                ) : (
                                    filteredIngredients.map(ing => (
                                        <tr key={ing.id} className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors">
                                            <td className="px-4 py-4 font-semibold text-slate-100">{ing.name}</td>
                                            <td className="px-4 py-4">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                                    {ing.category || 'Insumo'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-slate-300">{ing.unit}</td>
                                            <td className="px-4 py-4 text-slate-300">R$ {Number(ing.cost_per_unit).toFixed(2)}</td>
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
                                    ))
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
                title={editingId ? 'Editar Item' : 'Novo Item'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Nome do Item</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ex: Carne Moída, Saco Kraft, Maionese"
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Categoria</label>
                        <select
                            value={formData.category}
                            onChange={e => setFormData({ ...formData, category: e.target.value as IngredientCategory })}
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                        >
                            <option value="Insumo">Insumo</option>
                            <option value="Embalagem">Embalagem</option>
                            <option value="Acompanhamento">Acompanhamento</option>
                        </select>
                    </div>

                    <div className="bg-dark-700/50 border border-dark-600 rounded-lg p-4">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Calculadora de Custo</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Preço da Embalagem (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={calc.price}
                                    onChange={e => setCalc({ ...calc, price: e.target.value })}
                                    placeholder="Ex: 28.00"
                                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Qtd na Embalagem</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    value={calc.amount}
                                    onChange={e => setCalc({ ...calc, amount: e.target.value })}
                                    placeholder={`Ex: 1.7 (${formData.unit})`}
                                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Unidade Base</label>
                            <select
                                value={formData.unit}
                                onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                            >
                                <option value="kg">kg (Quilo)</option>
                                <option value="g">g (Grama)</option>
                                <option value="l">l (Litro)</option>
                                <option value="ml">ml (Mililitro)</option>
                                <option value="un">un (Unidade)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Custo por Unidade</label>
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
                    </div>

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
                            Salvar
                        </Button>
                    </div>
                </form>
            </Modal>
        </div >
    );
}
