
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Channel, Fee } from '../types';
import { Modal } from '../components/ui/Modal';

interface ChannelWithFees extends Channel {
    fees: Fee[];

}

export function Channels() {
    const [channels, setChannels] = useState<ChannelWithFees[]>([]);
    const [allFees, setAllFees] = useState<Fee[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Fee Association Modal
    const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
    const [selectedChannel, setSelectedChannel] = useState<ChannelWithFees | null>(null);
    const [selectedFeeId, setSelectedFeeId] = useState<string>('');

    const [channelName, setChannelName] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        const [channelsRes, feesRes] = await Promise.all([
            supabase.from('sales_channels').select('*'),
            supabase.from('fees').select('*')
        ]);

        const _channels = channelsRes.data || [];
        const _fees = feesRes.data || [];
        setAllFees(_fees);

        // Fetch associated fees for each channel
        const channelsWithFees = await Promise.all(_channels.map(async (c) => {
            const { data } = await supabase
                .from('channel_fees')
                .select('fee_id')
                .eq('channel_id', c.id);

            const associatedFeeIds = data?.map(d => d.fee_id) || [];
            const channelFees = _fees.filter(f => associatedFeeIds.includes(f.id));

            return { ...c, fees: channelFees };
        }));

        setChannels(channelsWithFees);
    }

    async function handleCreateChannel(e: React.FormEvent) {
        e.preventDefault();
        await supabase.from('sales_channels').insert({ name: channelName });
        setIsModalOpen(false);
        setChannelName('');
        fetchData();
    }

    async function handleDeleteChannel(id: number) {
        if (!confirm('Excluir canal?')) return;
        await supabase.from('sales_channels').delete().eq('id', id);
        fetchData();
    }

    async function handleAddFee() {
        if (!selectedChannel || !selectedFeeId) return;

        await supabase.from('channel_fees').insert({
            channel_id: selectedChannel.id,
            fee_id: parseInt(selectedFeeId)
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
            .eq('fee_id', feeId);

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
        <div className="page-container">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Canais de Venda</h2>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={20} /> Novo Canal
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {channels.map(channel => {
                    const totalFees = channel.fees.reduce((acc, f) => acc + f.percentage, 0);

                    return (
                        <div key={channel.id} className="card">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xl font-bold">{channel.name}</h3>
                                <button onClick={() => handleDeleteChannel(channel.id)} className="text-danger hover:bg-slate-800 p-1 rounded">
                                    <Trash2 size={18} />
                                </button>
                            </div>

                            <div className="bg-secondary p-3 rounded-lg mb-4">
                                <div className="text-secondary text-sm mb-1">Custo Total de Taxas</div>
                                <div className="text-2xl font-bold text-warning">{totalFees.toFixed(2)}%</div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-bold text-secondary uppercase">Taxas Aplicadas</h4>
                                {channel.fees.length === 0 && <p className="text-sm text-secondary italic">Nenhuma taxa configurada</p>}

                                {channel.fees.map(fee => (
                                    <div key={fee.id} className="flex justify-between text-sm border-b border-color pb-1">
                                        <span>{fee.name}</span>
                                        <span>{fee.percentage}%</span>
                                    </div>
                                ))}
                            </div>

                            <button
                                className="btn btn-ghost w-full mt-4 border border-color"
                                onClick={() => openFeeModal(channel)}
                            >
                                <Settings size={16} /> Configurar Taxas
                            </button>
                        </div>
                    );
                })}
            </div>

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
                        <button type="submit" className="btn btn-primary">Salvar</button>
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
                    <button
                        onClick={handleAddFee}
                        disabled={!selectedFeeId}
                        className="btn btn-primary"
                    >
                        <Plus size={20} />
                    </button>
                </div>

                <div className="space-y-2">
                    {selectedChannel?.fees.map(fee => (
                        <div key={fee.id} className="flex justify-between items-center bg-secondary p-2 rounded">
                            <span>{fee.name} ({fee.percentage}%)</span>
                            <button
                                onClick={() => handleRemoveFee(fee.id)}
                                className="text-danger hover:text-red-400"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </Modal>
        </div>
    );
}
