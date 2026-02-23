import { useEffect, useState } from 'react';
import { Plus, Trash2, DollarSign, Percent, Edit2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';

interface VariableCost {
    id: string;
    name: string;
    category: string;
    type: 'fixed' | 'percent';
    monthly_value: number | null;
    percentage: number | null;
}

const CATEGORIES = [
    { value: 'emprestimos', label: 'Empréstimos' },
    { value: 'taxas_gerais', label: 'Taxas Gerais' },
    { value: 'custos_gerais', label: 'Custos Gerais' },
    { value: 'imposto', label: 'Imposto' },
    { value: 'outros', label: 'Outros' },
];

const categoryLabel = (val: string) => CATEGORIES.find(c => c.value === val)?.label ?? val;

const getItemTypeLabel = (cat: string) => {
    switch (cat) {
        case 'imposto': return { label: 'Imposto', color: 'bg-red-500/10 text-red-400' };
        case 'comissao': return { label: 'Comissão', color: 'bg-blue-500/10 text-blue-400' };
        case 'taxa_cartao': return { label: 'Taxa Cartão', color: 'bg-amber-500/10 text-amber-400' };
        default: return { label: categoryLabel(cat), color: 'bg-slate-700/50 text-slate-400' };
    }
};

export function VariableCosts() {
    const { companyId } = useAuth();
    const { toast } = useToast();
    const [items, setItems] = useState<VariableCost[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<VariableCost | null>(null);

    // Form state
    const [formName, setFormName] = useState('');
    const [formCategory, setFormCategory] = useState('outros');
    const [formType, setFormType] = useState<'fixed' | 'percent'>('fixed');
    const [formValue, setFormValue] = useState('');

    useEffect(() => { fetchItems(); }, []);

    async function fetchItems() {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('variable_costs')
                .select('*')
                .eq('company_id', companyId)
                .order('category', { ascending: true });
            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            console.error('Error fetching variable costs:', err);
        } finally {
            setLoading(false);
        }
    }

    function openNew() {
        setEditing(null);
        setFormName('');
        setFormCategory('outros');
        setFormType('fixed');
        setFormValue('');
        setModalOpen(true);
    }

    function openEdit(item: VariableCost) {
        setEditing(item);
        setFormName(item.name);
        setFormCategory(item.category);
        setFormType(item.type);
        setFormValue(item.type === 'fixed' ? String(item.monthly_value ?? '') : String(item.percentage ?? ''));
        setModalOpen(true);
    }

    async function handleSave() {
        if (!formName.trim()) {
            toast.error('Informe o nome do custo');
            return;
        }
        const numVal = parseFloat(formValue);
        if (isNaN(numVal) || numVal <= 0) {
            toast.error('Informe um valor válido');
            return;
        }

        const payload: any = {
            name: formName.trim(),
            category: formCategory,
            type: formType,
            monthly_value: formType === 'fixed' ? numVal : null,
            percentage: formType === 'percent' ? numVal : null,
            company_id: companyId,
        };

        try {
            if (editing) {
                const { error } = await supabase.from('variable_costs').update(payload).eq('id', editing.id);
                if (error) throw error;
                toast.success('Custo atualizado');
            } else {
                const { error } = await supabase.from('variable_costs').insert(payload);
                if (error) throw error;
                toast.success('Custo adicionado');
            }
            setModalOpen(false);
            fetchItems();
        } catch (err) {
            console.error('Error saving variable cost:', err);
            toast.error('Erro ao salvar custo variável');
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Excluir este custo variável?')) return;
        try {
            const { error } = await supabase.from('variable_costs').delete().eq('id', id).eq('company_id', companyId);
            if (error) throw error;
            toast.success('Custo excluído');
            fetchItems();
        } catch (err) {
            console.error('Error deleting variable cost:', err);
            toast.error('Erro ao excluir custo');
        }
    }

    // Group by category for totals
    const totalFixed = items.filter(i => i.type === 'fixed').reduce((a, i) => a + (i.monthly_value ?? 0), 0);
    const totalPercent = items.filter(i => i.type === 'percent').reduce((a, i) => a + (i.percentage ?? 0), 0);

    return (
        <div className="space-y-6 fade-in">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Custos Variáveis</h2>
                    <p className="page-subtitle">Gerencie taxas, impostos e comissões</p>
                </div>
                <Button
                    onClick={() => openNew()}
                    leftIcon={<Plus size={20} />}
                    className="btn-primary self-center md:self-end"
                >
                    Novo Custo
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-6 border-l-4 border-l-blue-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Total Percentual</p>
                            <h3 className="text-2xl font-bold text-white mt-1">{totalPercent.toFixed(2)}%</h3>
                        </div>
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Percent className="text-blue-500" size={24} />
                        </div>
                    </div>
                </div>

                <div className="glass-card p-6 border-l-4 border-l-emerald-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Total Fixo</p>
                            <h3 className="text-2xl font-bold text-white mt-1">R$ {totalFixed.toFixed(2)}</h3>
                        </div>
                        <div className="p-2 bg-emerald-500/20 rounded-lg">
                            <DollarSign className="text-emerald-500" size={24} />
                        </div>
                    </div>
                </div>

                <div className="glass-card p-6 border-l-4 border-l-purple-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Custos Cadastrados</p>
                            <h3 className="text-2xl font-bold text-white mt-1">{items.length}</h3>
                        </div>
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                            <Plus className="text-purple-500" size={24} />
                        </div>
                    </div>
                </div>
            </div>
            {/* Table */}
            <div className="glass-card overflow-hidden">
                <table className="data-table text-sm">
                    <thead>
                        <tr>
                            <th className="pl-6">Nome</th>
                            <th className="text-left">Tipo</th>
                            <th className="text-right">Valor</th>
                            <th className="text-right w-24 pr-6">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && !loading ? (
                            <tr>
                                <td colSpan={4} className="text-center text-slate-400 py-8">
                                    Nenhum custo variável cadastrado.
                                </td>
                            </tr>
                        ) : (
                            items.map(item => (
                                <tr key={item.id} className="hover:bg-slate-700/20 transition-colors">
                                    <td className="pl-6 font-medium text-slate-200">{item.name}</td>
                                    <td>
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${getItemTypeLabel(item.category).color
                                            }`}>
                                            {getItemTypeLabel(item.category).label}
                                        </span>
                                    </td>
                                    <td className="text-right font-bold text-slate-100">
                                        {item.type === 'percent'
                                            ? `${(item.percentage || 0).toFixed(2)}%`
                                            : `R$ ${(item.monthly_value || 0).toFixed(2)}`
                                        }
                                    </td>
                                    <td className="text-right pr-6">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => openEdit(item)}
                                                className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
                                                title="Editar"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                                                title="Excluir"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md p-6 space-y-5">
                        <h3 className="text-lg font-bold text-slate-100">
                            {editing ? 'Editar Custo Variável' : 'Novo Custo Variável'}
                        </h3>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Nome</label>
                            <input
                                type="text"
                                className="input w-full bg-dark-900 border border-dark-600 rounded p-2 text-white"
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                                placeholder="Ex: Gasolina, Imposto Simples..."
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Categoria</label>
                            <select
                                className="input w-full bg-dark-900 border border-dark-600 rounded p-2 text-white"
                                value={formCategory}
                                onChange={e => setFormCategory(e.target.value)}
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Tipo</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${formType === 'fixed'
                                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                                        : 'border-dark-600 text-slate-400 hover:border-dark-500'
                                        }`}
                                    onClick={() => setFormType('fixed')}
                                >
                                    <DollarSign size={16} />
                                    <span className="text-sm font-medium">Valor Mensal</span>
                                </button>
                                <button
                                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${formType === 'percent'
                                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                                        : 'border-dark-600 text-slate-400 hover:border-dark-500'
                                        }`}
                                    onClick={() => setFormType('percent')}
                                >
                                    <Percent size={16} />
                                    <span className="text-sm font-medium">% Faturamento</span>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">
                                {formType === 'fixed' ? 'Valor Mensal (R$)' : 'Percentual do Faturamento (%)'}
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                className="input w-full bg-dark-900 border border-dark-600 rounded p-2 text-white"
                                value={formValue}
                                onChange={e => setFormValue(e.target.value)}
                                placeholder={formType === 'fixed' ? '660.00' : '5.00'}
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button
                                variant="ghost"
                                onClick={() => setModalOpen(false)}
                                className="flex-1"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="flex-1"
                            >
                                {editing ? 'Salvar' : 'Adicionar'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
