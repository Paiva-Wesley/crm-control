import { useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';

interface ImportSalesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface ParsedItem {
    name: string;
    category: string;
    qty: number;
    total: number;
    avgPrice: number;
    status: 'new' | 'update' | 'error';
    existingId?: number;
    isCombo?: boolean;
    comboItems?: { childId: number; qty: number; name?: string }[];
}

export function ImportSalesModal({ isOpen, onClose, onSuccess }: ImportSalesModalProps) {
    const [rawText, setRawText] = useState('');
    const [previewData, setPreviewData] = useState<ParsedItem[]>([]);
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [loading, setLoading] = useState(false);

    // Helpers to parse Brazilian currency/numbers (Robust)
    function parseBRL(value: string): number {
        if (!value) return 0;
        // Remove currency symbol, spaces, remove dots (thousands), replace comma with dot
        const clean = value.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim();
        return parseFloat(clean) || 0;
    }

    function parseQty(value: string): number {
        if (!value) return 0;
        return parseInt(value.replace(/\./g, '')) || 0;
    }

    async function handleParse() {
        if (!rawText.trim()) return;

        setLoading(true);
        try {
            // Fetch existing products
            const { data: existingProducts } = await supabase.from('products').select('id, name');
            const products = existingProducts || [];

            // Helper for normalization
            const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const productMap = new Map(products.map(p => [normalize(p.name), p.id]));

            const lines = rawText.split('\n').filter(l => l.trim().length > 0);
            const parsed: ParsedItem[] = [];

            // --- Header Detection & Dynamic Mapping ---
            // Default indices (Standard: Product | Category | Qty | Total | Avg)
            let idxProduct = 0;
            let idxCategory = 1;
            let idxQty = 2;
            let idxTotal = 3;
            let idxAvg = 4;

            let dataStartIndex = 0;

            // Normalize helper for headers
            const normHeader = (h: string) => h.toLowerCase().trim()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
                .replace(/[^a-z0-9]/g, ""); // remove special chars

            // Try to find header line
            const headerLineIndex = lines.findIndex(line => {
                const lower = normHeader(line);
                return lower.includes('produto') && (lower.includes('qtd') || lower.includes('quantidade'));
            });

            if (headerLineIndex !== -1) {
                const headers = lines[headerLineIndex].split('\t').map(normHeader);

                // Reset indices to -1 to ensure we only use found ones
                idxProduct = -1; idxTotal = -1; idxAvg = -1; idxQty = -1; idxCategory = -1;

                headers.forEach((h, i) => {
                    if (h.includes('produto')) idxProduct = i;
                    else if (h.includes('categoria')) idxCategory = i;
                    else if (h.includes('faturamento') || h === 'total' || h.includes('tot') || h.includes('valor')) idxTotal = i;
                    else if (h.includes('medio') || h.includes('unitario') || h.includes('preco')) idxAvg = i;
                    else if (h.includes('qtd') || h.includes('quant')) idxQty = i;
                });

                // If critical columns not found, revert to defaults or warn? 
                // Let's fallback to standard if we can't find Product/Qty (revert to default)
                if (idxProduct === -1 || idxQty === -1) {
                    console.warn('Could not identify columns by name, using default positions.');
                    idxProduct = 0; idxCategory = 1; idxQty = 2; idxTotal = 3; idxAvg = 4;
                } else {
                    dataStartIndex = headerLineIndex + 1;
                }
            }

            for (let i = dataStartIndex; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const cols = line.split('\t');
                const maxIdx = Math.max(idxProduct, idxCategory, idxQty, idxTotal, idxAvg);
                if (cols.length <= maxIdx && maxIdx < 5) {
                    // if line is too short but we are using default logic, skip
                }

                const name = cols[idxProduct]?.trim();
                // Filter out header row if logic failed to skip it, or 'Total' row
                if (!name || name === 'Total' || normHeader(name) === 'produto') continue;

                const category = idxCategory !== -1 ? cols[idxCategory]?.trim() : '';
                const qty = idxQty !== -1 ? parseQty(cols[idxQty]) : 0;

                let total = (idxTotal !== -1 && cols[idxTotal]) ? parseBRL(cols[idxTotal]) : 0;
                let avgPrice = (idxAvg !== -1 && cols[idxAvg]) ? parseBRL(cols[idxAvg]) : 0;

                // Calculation Fallbacks
                if (total === 0 && avgPrice > 0 && qty > 0) {
                    total = qty * avgPrice;
                }
                if (avgPrice === 0 && total > 0 && qty > 0) {
                    avgPrice = total / qty;
                }

                // Check existence using normalized name
                const normName = normalize(name);
                let existingId = productMap.get(normName);
                if (!existingId) {
                    if (normName.endsWith('s')) existingId = productMap.get(normName.slice(0, -1));
                }

                let isCombo = false;
                let comboItems: { childId: number; qty: number; name: string }[] = [];

                if (category && category.toLowerCase().includes('combo') && !existingId) {
                    isCombo = true;
                    // Regex split by comma or " e " (case insensitive)
                    const parts = name.split(/,| e /i);

                    for (const part of parts) {
                        const match = part.trim().match(/^(\d+)\s+(.+)$/);
                        if (match) {
                            const q = parseInt(match[1]);
                            const childNameRaw = match[2].trim();
                            const childNameNorm = normalize(childNameRaw);

                            let childId = productMap.get(childNameNorm);

                            // Try plural handling
                            if (!childId && childNameNorm.endsWith('s')) {
                                childId = productMap.get(childNameNorm.slice(0, -1));
                            }
                            // Fuzzy/Substring fallback
                            if (!childId) {
                                const bestMatch = products.find(p => {
                                    const pNorm = normalize(p.name);
                                    return pNorm === childNameNorm || pNorm === childNameNorm.slice(0, -1) || childNameNorm === pNorm.slice(0, -1);
                                });
                                if (bestMatch) childId = bestMatch.id;
                            }

                            if (childId) {
                                comboItems.push({ childId, qty: q, name: childNameRaw });
                            }
                        }
                    }
                }

                parsed.push({
                    name,
                    category,
                    qty,
                    total,
                    avgPrice,
                    status: existingId ? 'update' : 'new',
                    existingId,
                    isCombo,
                    comboItems
                });
            }

            setPreviewData(parsed);
            setStep('preview');
        } catch (error) {
            console.error('Error parsing data:', error);
            alert('Erro ao processar dados. Verifique o formato.');
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirmImport() {
        setLoading(true);
        try {
            const updates = [];

            for (const item of previewData) {
                if (item.status === 'update' && item.existingId) {
                    updates.push(
                        supabase.from('products').update({
                            last_sales_qty: item.qty,
                            last_sales_total: item.total,
                            average_sale_price: item.avgPrice
                        }).eq('id', item.existingId)
                    );
                } else {
                    const { data: newProduct, error } = await supabase.from('products').insert({
                        name: item.name,
                        category: item.category,
                        sale_price: item.avgPrice,
                        last_sales_qty: item.qty,
                        last_sales_total: item.total,
                        average_sale_price: item.avgPrice,
                        active: true,
                        is_combo: item.isCombo || false
                    }).select().single();

                    if (error) {
                        console.error("Error inserting product", item.name, error);
                        continue;
                    }

                    if (item.isCombo && item.comboItems && item.comboItems.length > 0) {
                        const comboInserts = item.comboItems.map(c => ({
                            parent_product_id: newProduct.id,
                            child_product_id: c.childId,
                            quantity: c.qty
                        }));
                        await supabase.from('product_combos').insert(comboInserts);
                    }
                }
            }

            if (updates.length > 0) await Promise.all(updates);

            alert('Importação concluída com sucesso!');
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error saving data:', error);
            alert('Erro ao salvar no banco de dados.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={step === 'input' ? 'Importar Dados de Venda' : 'Confirmar Importação'}
            maxWidth="900px"
        >
            <div className="space-y-4">
                {step === 'input' ? (
                    <>
                        <div className="bg-blue-900/10 text-blue-400 p-4 rounded-lg flex gap-3 text-sm">
                            <AlertCircle className="shrink-0" size={20} />
                            <div>
                                <p className="font-bold mb-1">Como importar?</p>
                                <p>1. No seu sistema de vendas, gere o relatório de produtos vendidos.</p>
                                <p>2. Copie as colunas (Ctrl+C) na ordem: <strong>Produto | Categoria | Qtd Vendida | Faturamento | Preço Médio (Opcional)</strong></p>
                                <p>3. Cole (Ctrl+V) no campo abaixo.</p>
                            </div>
                        </div>

                        <textarea
                            className="w-full h-64 bg-dark-700 border border-dark-600 rounded-lg p-4 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                            placeholder={"Produto\\tCategoria\\tQtd\\tTotal\\tMédio\\nX-Tudo\\tLanches\\t65\\tR$ 2.024,88\\tR$ 30,68..."}
                            value={rawText}
                            onChange={e => setRawText(e.target.value)}
                        />

                        <div className="flex justify-end gap-2 pt-4">
                            <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
                            <button
                                onClick={handleParse}
                                className="btn btn-primary"
                                disabled={!rawText.trim() || loading}
                            >
                                {loading ? 'Processando...' : 'Visualizar Dados'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex gap-4 text-sm mb-4">
                            <div className="flex items-center gap-2 text-emerald-400">
                                <Check size={16} />
                                <span>{previewData.filter(i => i.status === 'update').length} Atualizações</span>
                            </div>
                            <div className="flex items-center gap-2 text-blue-400">
                                <PlusIcon size={16} />
                                <span>{previewData.filter(i => i.status === 'new').length} Novos Cadastros</span>
                            </div>
                        </div>

                        <div className="max-h-96 overflow-y-auto border border-dark-700 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-dark-900 text-slate-400 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Status</th>
                                        <th className="px-4 py-2 text-left">Produto</th>
                                        <th className="px-4 py-2 text-left">Categoria</th>
                                        <th className="px-4 py-2 text-right">Qtd</th>
                                        <th className="px-4 py-2 text-right">Faturamento</th>
                                        <th className="px-4 py-2 text-right">Médio</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-dark-700">
                                    {previewData.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-dark-700/50">
                                            <td className="px-4 py-2">
                                                {item.status === 'new' ? (
                                                    <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded">Novo</span>
                                                ) : (
                                                    <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">Update</span>
                                                )}
                                                {item.isCombo && (
                                                    <span className="ml-1 text-xs bg-purple-500/10 text-purple-400 px-2 py-1 rounded">Combo Auto</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2">
                                                <div>{item.name}</div>
                                                {item.isCombo && item.comboItems && item.comboItems.length > 0 && (
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        Itens: {item.comboItems.map(c => `${c.qty}x ${c.name || 'Produto'}`).join(', ')}
                                                    </div>
                                                )}
                                                {item.isCombo && (!item.comboItems || item.comboItems.length === 0) && (
                                                    <div className="text-xs text-red-500 mt-1">
                                                        Nenhum item identificado
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-slate-400">{item.category}</td>
                                            <td className="px-4 py-2 text-right">{item.qty}</td>
                                            <td className="px-4 py-2 text-right">R$ {item.total.toFixed(2)}</td>
                                            <td className="px-4 py-2 text-right">R$ {item.avgPrice.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-between items-center pt-4">
                            <button
                                onClick={() => setStep('input')}
                                className="text-slate-400 hover:text-white text-sm"
                            >
                                ← Voltar para edição
                            </button>
                            <div className="flex gap-2">
                                <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
                                <button
                                    onClick={handleConfirmImport}
                                    className="btn btn-primary"
                                    disabled={loading}
                                >
                                    {loading ? 'Salvando...' : 'Confirmar Importação'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

// Icon helper
function PlusIcon({ size }: { size: number }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    );
}
