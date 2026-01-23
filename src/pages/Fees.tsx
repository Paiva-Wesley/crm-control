import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Fee } from '../types';
import { Modal } from '../components/ui/Modal';

export function Fees() {
    const [fees, setFees] = useState<Fee[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', percentage: '' });

    useEffect(() => { fetchFees(); }, []);

    async function fetchFees() {
        const { data } = await supabase.from('fees').select('*').order('name');
        setFees(data || []);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        await supabase.from('fees').insert({
            name: formData.name,
            percentage: parseFloat(formData.percentage)
        });
        setIsModalOpen(false);
        setFormData({ name: '', percentage: '' });
        fetchFees();
    }

    async function handleDelete(id: number) {
        if (!confirm('Excluir taxa?')) return;
        await supabase.from('fees').delete().eq('id', id);
        fetchFees();
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-100">Taxas e Impostos</h2>
                <button
                    className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition-colors duration-200 flex items-center gap-2"
                    onClick={() => setIsModalOpen(true)}
                >
                    <Plus size={20} /> Nova Taxa
                </button>
            </div>

            <div className="bg-dark-800 border border-dark-700 rounded-lg overflow-hidden">
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
                                    <button
                                        onClick={() => handleDelete(fee.id)}
                                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 px-4 py-2 text-slate-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors duration-200"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition-colors duration-200"
                        >
                            Salvar
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
