import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Fee } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';

export function Fees() {
    const { companyId } = useAuth();
    const [fees, setFees] = useState<Fee[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', percentage: '' });
    const { toast } = useToast();

    useEffect(() => { fetchFees(); }, []);

    async function fetchFees() {
        const { data } = await supabase.from('fees').select('*').order('name');
        setFees(data || []);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const { error } = await supabase.from('fees').insert({
            name: formData.name,
            percentage: parseFloat(formData.percentage),
            company_id: companyId
        });

        if (error) {
            toast.error('Erro ao salvar taxa');
            return;
        }

        toast.success('Taxa salva com sucesso');
        setIsModalOpen(false);
        setFormData({ name: '', percentage: '' });
        fetchFees();
    }

    async function handleDelete(id: number) {
        if (!confirm('Excluir taxa?')) return;
        const { error } = await supabase.from('fees').delete().eq('id', id);

        if (error) {
            toast.error('Erro ao excluir taxa');
            return;
        }

        toast.success('Taxa excluída');
        fetchFees();
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-100">Taxas e Impostos</h2>
                <Button onClick={() => setIsModalOpen(true)} leftIcon={<Plus size={20} />}>
                    Nova Taxa
                </Button>
            </div>

            <div className="bg-dark-800 border border-dark-700 rounded-lg overflow-hidden">
                {fees.length === 0 ? (
                    <EmptyState
                        icon={Calculator}
                        title="Nenhuma taxa cadastrada"
                        description="Cadastre as taxas e impostos que incidem sobre suas vendas (Simples, Maquininha, etc)."
                        actionLabel="Nova Taxa"
                        onAction={() => setIsModalOpen(true)}
                    />
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-dark-700">
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Descrição</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Porcentagem</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-slate-400 uppercase tracking-wider w-20">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fees.map(fee => (
                                <tr key={fee.id} className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors">
                                    <td className="px-4 py-4 text-slate-100">{fee.name}</td>
                                    <td className="px-4 py-4 text-slate-300">{fee.percentage}%</td>
                                    <td className="px-4 py-4 text-right">
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={() => handleDelete(fee.id)}
                                            className="h-8 w-8 p-0"
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nova Taxa">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Nome</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ex: Simples Nacional, Taxa Maquininha"
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Porcentagem (%)</label>
                        <input
                            type="number"
                            step="0.01"
                            required
                            value={formData.percentage}
                            onChange={e => setFormData({ ...formData, percentage: e.target.value })}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 placeholder-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
                        />
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
        </div>
    );
}
