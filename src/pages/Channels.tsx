
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Settings, Store } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Channel, Fee } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';

interface ChannelWithFees extends Channel {
    fees: Fee[];

}

export function Channels() {
    const { companyId } = useAuth();
    const [channels, setChannels] = useState<ChannelWithFees[]>([]);
    const [allFees, setAllFees] = useState<Fee[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Fee Association Modal
    const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
    const [selectedChannel, setSelectedChannel] = useState<ChannelWithFees | null>(null);
    const [selectedFeeId, setSelectedFeeId] = useState<string>('');
    const { toast } = useToast();

    const [channelName, setChannelName] = useState('');

    useEffect(() => {
        fetchData();
    }, []);
    // ... (omitting fetch data logic to avoid replacing too much, wait, I can't skip lines in replace_file_content)
    // Actually, I should use replace_file_content for small blocks.
    // Let's replace the top hooks part.

    async function fetchData() {
        const [channelsRes, feesRes] = await Promise.all([
            supabase.from('sales_channels').select('*').eq('company_id', companyId),
            supabase.from('fees').select('*').eq('company_id', companyId)
        ]);

        const _channels = channelsRes.data || [];
        const _fees = feesRes.data || [];
        setAllFees(_fees);

        // Fetch associated fees for each channel
        const channelsWithFees = await Promise.all(_channels.map(async (c) => {
            const { data } = await supabase
                .from('channel_fees')
                .select('fee_id')
                .eq('channel_id', c.id)
                .eq('company_id', companyId);

            const associatedFeeIds = data?.map(d => d.fee_id) || [];
            const channelFees = _fees.filter(f => associatedFeeIds.includes(f.id));

            return { ...c, fees: channelFees };
        }));

        setChannels(channelsWithFees);
    }

    async function handleCreateChannel(e: React.FormEvent) {
        e.preventDefault();
        const { error } = await supabase.from('sales_channels').insert({ name: channelName, company_id: companyId });

        if (error) {
            toast.error('Erro ao criar canal');
            return;
        }
        toast.success('Canal criado com sucesso!');
        setIsModalOpen(false);
        setChannelName('');
        fetchData();
    }

    async function handleDeleteChannel(id: number) {
        if (!confirm('Excluir canal?')) return;
        const { error } = await supabase.from('sales_channels').delete().eq('id', id).eq('company_id', companyId);
        if (error) {
            toast.error('Erro ao excluir canal');
        } else {
            toast.success('Canal excluído');
            fetchData();
        }
    }

    async function handleAddFee() {
        if (!selectedChannel || !selectedFeeId) return;

        await supabase.from('channel_fees').insert({
            channel_id: selectedChannel.id,
            fee_id: parseInt(selectedFeeId),
            company_id: companyId
        });

        setSelectedFeeId('');
        fetchData(); // Refresh to show new fee

        // Update local state for immediate feedback
        const feeToAdd = allFees.find(f => f.id === parseInt(selectedFeeId));
        if (feeToAdd) {
            setSelectedChannel({
                ...selectedChannel,
                fees: [...selectedChannel.fees, feeToAdd]
            });
        }
    }

    async function handleRemoveFee(feeId: number) {
        if (!selectedChannel) return;

        await supabase.from('channel_fees')
            .delete()
            .eq('channel_id', selectedChannel.id)
            .eq('fee_id', feeId)
            .eq('company_id', companyId);

        fetchData();

        setSelectedChannel({
            ...selectedChannel,
            fees: selectedChannel.fees.filter(f => f.id !== feeId)
        });
    }

    function openFeeModal(channel: ChannelWithFees) {
        setSelectedChannel(channel);
        setIsFeeModalOpen(true);
    }

    return (
        <div className="space-y-6 fade-in">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Canais de Venda</h2>
                    <p className="page-subtitle">Gerencie as taxas de cada canal de venda</p>
                </div>
                <Button onClick={() => setIsModalOpen(true)} leftIcon={<Plus size={20} />} className="btn-primary self-center md:self-end">
                    Novo Canal
                </Button>
            </div>

            {channels.length === 0 ? (
                <EmptyState
                    icon={Store}
                    title="Nenhum canal de venda"
                    description="Cadastre seus canais de venda (iFood, Salão, etc) para calcular as taxas corretamente."
                    actionLabel="Criar Primeiro Canal"
                    onAction={() => setIsModalOpen(true)}
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {channels.map(channel => {
                        const totalFees = channel.fees.reduce((acc, f) => acc + f.percentage, 0);

                        return (
                            <div key={channel.id} className="glass-card p-6 flex flex-col h-full hover:border-slate-600/50 transition-colors">
                                <div className="flex justify-between items-start mb-6">
                                    <h3 className="text-xl font-bold text-white">{channel.name}</h3>
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={() => handleDeleteChannel(channel.id)}
                                        className="h-8 w-8 p-0 opacity-60 hover:opacity-100 transition-opacity"
                                        title="Excluir canal"
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                </div>

                                <div className="bg-slate-800/50 p-4 rounded-xl mb-6 border border-slate-700/50">
                                    <div className="text-slate-400 text-xs uppercase tracking-wider font-medium mb-1">Custo Total de Taxas</div>
                                    <div className="text-3xl font-bold text-emerald-400">{totalFees.toFixed(2)}%</div>
                                </div>

                                <div className="space-y-3 flex-1 mb-6">
                                    <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                        Taxas Aplicadas
                                        <span className="text-xs font-normal text-slate-500 normal-case">({channel.fees.length})</span>
                                    </h4>

                                    {channel.fees.length === 0 && (
                                        <p className="text-sm text-slate-500 italic py-2">Nenhuma taxa configurada</p>
                                    )}

                                    <div className="space-y-2">
                                        {channel.fees.map(fee => (
                                            <div key={fee.id} className="flex justify-between items-center text-sm p-2 rounded bg-slate-800/30">
                                                <span className="text-slate-300">{fee.name}</span>
                                                <span className="font-bold text-slate-200">{fee.percentage}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Button
                                    variant="ghost"
                                    className="w-full mt-auto border border-slate-700 hover:bg-slate-800 text-slate-300"
                                    onClick={() => openFeeModal(channel)}
                                    leftIcon={<Settings size={16} />}
                                >
                                    Configurar Taxas
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Novo Canal">
                <form onSubmit={handleCreateChannel} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm text-secondary mb-1">Nome do Canal</label>
                        <input
                            type="text" required
                            value={channelName}
                            onChange={e => setChannelName(e.target.value)}
                            placeholder="Ex: iFood, Balcão, UberEats"
                        />
                    </div>
                    <div className="modal-footer">
                        <Button type="submit">Salvar</Button>
                    </div>
                </form>
            </Modal>

            {/* Fee Config Modal */}
            <Modal
                isOpen={isFeeModalOpen}
                onClose={() => setIsFeeModalOpen(false)}
                title={`Taxas de: ${selectedChannel?.name}`}
            >
                <div className="flex gap-2 mb-4">
                    <select
                        value={selectedFeeId}
                        onChange={e => setSelectedFeeId(e.target.value)}
                        style={{ flex: 1 }}
                    >
                        <option value="">Adicionar taxa...</option>
                        {allFees
                            .filter(f => !selectedChannel?.fees.find(cf => cf.id === f.id))
                            .map(f => (
                                <option key={f.id} value={f.id}>{f.name} ({f.percentage}%)</option>
                            ))}
                    </select>
                    <Button
                        onClick={handleAddFee}
                        disabled={!selectedFeeId}
                        className="h-10 w-10 p-0"
                    >
                        <Plus size={20} />
                    </Button>
                </div>

                <div className="space-y-2">
                    {selectedChannel?.fees.map(fee => (
                        <div key={fee.id} className="flex justify-between items-center bg-secondary p-2 rounded">
                            <span>{fee.name} ({fee.percentage}%)</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveFee(fee.id)}
                                className="text-danger hover:text-red-400 h-6 w-6 p-0"
                            >
                                <Trash2 size={16} />
                            </Button>
                        </div>
                    ))}
                </div>
            </Modal>
        </div>
    );
}
