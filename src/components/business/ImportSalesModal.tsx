import { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Check, AlertTriangle, Search, Trash2, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { normalizeString } from '../../utils/stringUtils';

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
    status: 'matched' | 'not_found';
    existingId?: number;
    selected?: boolean;
}

export function ImportSalesModal({ isOpen, onClose, onSuccess }: ImportSalesModalProps) {
    const { companyId } = useAuth();
    const [rawText, setRawText] = useState('');
    const [previewData, setPreviewData] = useState<ParsedItem[]>([]);
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [loading, setLoading] = useState(false);
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const [importMonth, setImportMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    // Toggles for not found items
    const [createSelectedItems, setCreateSelectedItems] = useState(false);
    const [importSelectedSales, setImportSelectedSales] = useState(false);

    // Filters for not found items
    const [hideDrinks, setHideDrinks] = useState(true);
    const [searchNotFound, setSearchNotFound] = useState('');

    // Last Batch info
    const [lastBatch, setLastBatch] = useState<{ id: string, created_at: string, count: number } | null>(null);

    useEffect(() => {
        if (isOpen && companyId) {
            fetchLastBatch();
            setRawText('');
            setStep('input');
            setPreviewData([]);
        }
    }, [isOpen, companyId]);

    async function fetchLastBatch() {
        if (!companyId) return;
        try {
            // Find the most recent inserted sale logic. Since sales has sequential id, max(id) is the latest.
            await supabase.rpc('get_latest_import_batch', { p_company_id: companyId });

            // If the RPC does not exist, we do it via JS. Let's do a direct query:
            const { data: salesData, error: salesError } = await supabase
                .from('sales')
                .select('import_batch_id, id, sold_at')
                .eq('company_id', companyId)
                .not('import_batch_id', 'is', null)
                .order('id', { ascending: false })
                .limit(1);

            if (salesError) throw salesError;

            if (salesData && salesData.length > 0) {
                const batchId = salesData[0].import_batch_id;
                // Get count
                const { count } = await supabase.from('sales')
                    .select('*', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('import_batch_id', batchId);

                setLastBatch({
                    id: batchId,
                    created_at: salesData[0].sold_at, // Approximately when it was attached to
                    count: count || 0
                });
            } else {
                setLastBatch(null);
            }
        } catch (error) {
            console.error('Error fetching last batch:', error);
        }
    }

    async function handleUndoBatch() {
        if (!lastBatch || !companyId) return;
        if (!confirm(`Tem certeza que deseja apagar a última importação (Lote ${lastBatch.id}, ${lastBatch.count} vendas)? Esta ação não pode ser desfeita.`)) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('sales')
                .delete()
                .eq('company_id', companyId)
                .eq('import_batch_id', lastBatch.id);

            if (error) throw error;

            alert('Lote apagado com sucesso!');
            setLastBatch(null);
            onSuccess();
        } catch (error: any) {
            console.error('Error undoing batch:', error);
            alert(`Erro ao desfazer: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    // Helpers to parse Brazilian currency/numbers
    function parseBRL(value: string): number {
        if (!value) return 0;
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
        setImportErrors([]);
        try {
            const query = supabase.from('products').select('id, name');
            if (companyId) query.eq('company_id', companyId);
            const { data: existingProducts } = await query;
            const products = existingProducts || [];

            const productMap = new Map(products.map(p => [normalizeString(p.name), p.id]));

            const lines = rawText.split('\n').filter(l => l.trim().length > 0);
            const parsed: ParsedItem[] = [];

            let idxProduct = 0;
            let idxCategory = 1;
            let idxQty = 2;
            let idxTotal = 3;
            let idxAvg = 4;
            let dataStartIndex = 0;

            const headerLineIndex = lines.findIndex(line => {
                const lower = normalizeString(line);
                return lower.includes('produto') && (lower.includes('qtd') || lower.includes('quantidade'));
            });

            if (headerLineIndex !== -1) {
                const headers = lines[headerLineIndex].split('\t').map(normalizeString);
                idxProduct = -1; idxTotal = -1; idxAvg = -1; idxQty = -1; idxCategory = -1;

                headers.forEach((h, i) => {
                    if (h.includes('produto')) idxProduct = i;
                    else if (h.includes('categoria')) idxCategory = i;
                    else if (h.includes('faturamento') || h === 'total' || h.includes('tot') || h.includes('valor')) idxTotal = i;
                    else if (h.includes('medio') || h.includes('unitario') || h.includes('preco')) idxAvg = i;
                    else if (h.includes('qtd') || h.includes('quant')) idxQty = i;
                });

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

                const name = cols[idxProduct]?.trim();
                if (!name || name === 'Total' || normalizeString(name) === 'produto') continue;

                const category = idxCategory !== -1 ? cols[idxCategory]?.trim() : '';
                const qty = idxQty !== -1 ? parseQty(cols[idxQty]) : 0;

                let total = (idxTotal !== -1 && cols[idxTotal]) ? parseBRL(cols[idxTotal]) : 0;
                let avgPrice = (idxAvg !== -1 && cols[idxAvg]) ? parseBRL(cols[idxAvg]) : 0;

                if (total === 0 && avgPrice > 0 && qty > 0) total = qty * avgPrice;
                if (avgPrice === 0 && total > 0 && qty > 0) avgPrice = total / qty;

                const normName = normalizeString(name);
                let existingId = productMap.get(normName);
                if (!existingId && normName.endsWith('s')) existingId = productMap.get(normName.slice(0, -1));

                if (qty <= 0) continue;

                parsed.push({
                    name,
                    category,
                    qty,
                    total,
                    avgPrice,
                    status: existingId ? 'matched' : 'not_found',
                    existingId,
                    selected: false
                });
            }

            // Apply drink filters by default only to selection state visually, or just keep them hidden
            setPreviewData(parsed);
            setStep('preview');
        } catch (error) {
            console.error('Error parsing data:', error);
            alert('Erro ao processar dados. Verifique o formato.');
        } finally {
            setLoading(false);
        }
    }

    const drinkKeywords = ['coca', 'guarana', 'agua', 'lata', '2l', 'bebida', 'suco', 'refrigerante', 'fanta', 'sprite', 'kuat'];

    const filteredNotFoundItems = useMemo(() => {
        return previewData.filter(i => {
            if (i.status === 'matched') return false;

            const normName = normalizeString(i.name);
            const isDrink = drinkKeywords.some(kw => normName.includes(kw));

            if (hideDrinks && isDrink) return false;
            if (searchNotFound && !normName.includes(normalizeString(searchNotFound))) return false;

            return true;
        });
    }, [previewData, hideDrinks, searchNotFound]);

    const notFoundCount = previewData.filter(i => i.status === 'not_found').length;
    const selectedNotFoundCount = previewData.filter(i => i.status === 'not_found' && i.selected).length;
    const matchedItems = previewData.filter(item => item.status === 'matched' && item.existingId);

    function toggleSelectAllNotFound() {
        const anyUnselected = filteredNotFoundItems.some(i => !i.selected);
        setPreviewData(prev => prev.map(item => {
            if (item.status === 'not_found' && filteredNotFoundItems.some(f => f.name === item.name)) {
                return { ...item, selected: anyUnselected };
            }
            return item;
        }));
    }

    function toggleSelectItem(name: string) {
        setPreviewData(prev => prev.map(item =>
            item.name === name ? { ...item, selected: !item.selected } : item
        ));
    }

    async function handleConfirmImport() {
        if (!companyId) return;
        setLoading(true);
        setImportErrors([]);
        try {
            const errors: string[] = [];

            const batchId = `batch_${companyId}_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;

            // Calculate specific time (last day of month at 12:00)
            const [yearStr, monthStr] = importMonth.split('-');
            const year = parseInt(yearStr);
            const month = parseInt(monthStr); // 1-12
            // Last day of month is month 0 of NEXT month
            const soldAtDate = new Date(year, month, 0, 12, 0, 0);

            // 1. Sequentially create new products if needed
            const selectedUnfound = previewData.filter(i => i.status === 'not_found' && i.selected);
            const newlyCreatedProducts: Map<string, number> = new Map();

            if (createSelectedItems && selectedUnfound.length > 0) {
                for (const item of selectedUnfound) {
                    const { data, error } = await supabase.from('products').insert({
                        company_id: companyId,
                        name: item.name,
                        category: item.category || 'Importado',
                        sale_price: item.avgPrice,
                        active: true,
                        description: 'Criado via importação de vendas'
                    }).select('id').single();

                    if (error) {
                        console.error('Error creating product:', error);
                        errors.push(`Erro ao criar produto ${item.name}: ${error.message}`);
                    } else if (data) {
                        newlyCreatedProducts.set(item.name, data.id);
                    }
                }
            }

            // 2. Build sales records
            let salesToInsert: any[] = [];

            // Base matched items
            salesToInsert = matchedItems.map(item => ({
                product_id: item.existingId!,
                quantity: item.qty,
                sale_price: item.avgPrice,
                company_id: companyId,
                sold_at: soldAtDate.toISOString(),
                import_batch_id: batchId
            }));

            // Added newly created products sales if toggle is on
            if (importSelectedSales && selectedUnfound.length > 0) {
                for (const item of selectedUnfound) {
                    const newId = newlyCreatedProducts.get(item.name);
                    if (newId) {
                        salesToInsert.push({
                            product_id: newId,
                            quantity: item.qty,
                            sale_price: item.avgPrice,
                            company_id: companyId,
                            sold_at: soldAtDate.toISOString(),
                            import_batch_id: batchId
                        });
                    }
                }
            }

            if (salesToInsert.length === 0) {
                alert('Nenhuma venda válida para ser importada.');
                setLoading(false);
                return;
            }

            // 3. Insert into sales table
            const { error: salesError } = await supabase.from('sales').insert(salesToInsert);

            if (salesError) {
                console.error('Error inserting sales:', salesError);
                errors.push(`Erro ao gravar vendas: ${salesError.message}`);
            }

            if (errors.length > 0) {
                setImportErrors(errors);
                alert(`Importação concluída com avisos/erros. Verifique o alerta.`);
            } else {
                alert(`Importação Lote concluída!\n\n${salesToInsert.length} vendas registradas.\n${newlyCreatedProducts.size} produtos novos criados.`);
                onSuccess();
                onClose();
            }
        } catch (error) {
            console.error('Error saving data:', error);
            alert('Erro inesperado ao salvar no banco de dados.');
        } finally {
            setLoading(false);
        }
    }

    const itemsToImportCount = matchedItems.length + (importSelectedSales ? selectedNotFoundCount : 0);
    const disableConfirm = loading || itemsToImportCount === 0;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={step === 'input' ? 'Importar Vendas' : 'Revisar e Confirmar'}
            maxWidth="1000px" // Increased width for the table
        >
            <div className="space-y-4">
                {step === 'input' ? (
                    <>
                        {/* 1. Mês de Importação UI */}
                        <div className="bg-dark-800 p-4 rounded-lg flex items-center gap-4 border border-dark-700">
                            <div className="flex bg-primary/20 p-2 rounded-full text-primary">
                                <Calendar size={24} />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-white">Mês/Período de Referência</h3>
                                <p className="text-xs text-slate-400">As vendas importadas serão contabilizadas para este mês</p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                <input
                                    type="month"
                                    className="input text-sm w-40"
                                    value={importMonth}
                                    onChange={e => setImportMonth(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="bg-blue-900/10 text-blue-400 p-4 rounded-lg flex gap-3 text-sm">
                            <AlertCircle className="shrink-0" size={20} />
                            <div>
                                <p className="font-bold mb-1">Passo a passo:</p>
                                <p>1. Copie as colunas do seu relatório (iFood, etc).</p>
                                <p>2. Ordem esperada: <strong>Produto | Categoria | Qtd Vendida | Faturamento | Preço Médio</strong></p>
                                <p>3. Cole no campo abaixo.</p>
                            </div>
                        </div>

                        <textarea
                            className="w-full h-64 bg-dark-700 border border-dark-600 rounded-lg p-4 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                            placeholder={"Produto\\tCategoria\\tQtd\\tTotal\\tMédio\\nX-Tudo\\tLanches\\t65\\tR$ 2.024,88\\tR$ 30,68..."}
                            value={rawText}
                            onChange={e => setRawText(e.target.value)}
                        />

                        {lastBatch && (
                            <div className="bg-dark-800 p-3 rounded-lg border border-dark-700 flex justify-between items-center text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-400">Última importação gerada:</span>
                                    <span className="font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-xs">{lastBatch.id}</span>
                                    <span className="text-slate-500">({lastBatch.count} vendas)</span>
                                </div>
                                <button
                                    onClick={handleUndoBatch}
                                    disabled={loading}
                                    className="text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors px-2 py-1 hover:bg-red-400/10 rounded"
                                >
                                    <Trash2 size={14} />
                                    <span>Desfazer este lote</span>
                                </button>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
                            <button
                                onClick={handleParse}
                                className="btn btn-primary"
                                disabled={!rawText.trim() || loading || !importMonth}
                            >
                                {loading ? 'Processando...' : 'Avançar (Revisar Produtos)'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-dark-800 p-4 border border-emerald-500/20 rounded-lg flex flex-col justify-center">
                                <div className="flex items-center gap-2 text-emerald-400 mb-1">
                                    <Check size={18} />
                                    <span className="font-semibold">{matchedItems.length} Produtos Reconhecidos</span>
                                </div>
                                <p className="text-xs text-slate-400">Suas vendas serão importadas normalmente.</p>
                            </div>

                            <div className="bg-dark-800 p-4 border border-amber-500/20 rounded-lg flex flex-col justify-center">
                                <div className="flex items-center gap-2 text-amber-400 mb-1">
                                    <AlertTriangle size={18} />
                                    <span className="font-semibold">{notFoundCount} Produtos Não Encontrados</span>
                                </div>
                                <p className="text-xs text-slate-400">Você pode criá-los automaticamente abaixo.</p>
                            </div>
                        </div>

                        {/* Toggles for creation */}
                        <div className="border border-dark-600 rounded-lg p-3 bg-dark-800 space-y-3">
                            <h4 className="text-sm font-semibold text-white px-1">O que fazer com os {selectedNotFoundCount} itens marcados?</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <label className="flex items-center gap-2 p-2 hover:bg-dark-700 rounded cursor-pointer transition-colors border border-transparent hover:border-dark-600">
                                    <input
                                        type="checkbox"
                                        className="checkbox"
                                        checked={createSelectedItems}
                                        onChange={e => setCreateSelectedItems(e.target.checked)}
                                    />
                                    <span className="text-sm text-slate-300">Criar cadastro desses produtos</span>
                                </label>
                                <label className={`flex items-center gap-2 p-2 hover:bg-dark-700 rounded cursor-pointer transition-colors border border-transparent hover:border-dark-600 ${!createSelectedItems ? 'opacity-50' : ''}`}>
                                    <input
                                        type="checkbox"
                                        className="checkbox"
                                        checked={importSelectedSales}
                                        onChange={e => setImportSelectedSales(e.target.checked)}
                                        disabled={!createSelectedItems && false} // Let them choose independently? Yes, user requested it. Re-enabling independence.
                                    />
                                    <span className="text-sm text-slate-300">Importar as vendas deles também</span>
                                </label>
                            </div>
                        </div>

                        {/* Not found Items Table */}
                        <div className="flex flex-col border border-dark-600 rounded-lg overflow-hidden bg-dark-800">
                            <div className="bg-dark-900 p-2 flex items-center justify-between border-b border-dark-600 gap-2">
                                <div className="flex gap-2">
                                    <button onClick={toggleSelectAllNotFound} className="text-xs btn btn-ghost px-2 py-1">
                                        Marcar / Desmarcar Visíveis
                                    </button>
                                </div>
                                <div className="flex gap-2 items-center flex-1 justify-end">
                                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer mr-2">
                                        <input
                                            type="checkbox"
                                            checked={hideDrinks}
                                            onChange={(e) => setHideDrinks(e.target.checked)}
                                            className="checkbox w-3.5 h-3.5 rounded-sm"
                                        />
                                        Ocultar bedidas/industrializados
                                    </label>
                                    <div className="relative w-48">
                                        <Search className="absolute left-2 top-1.5 text-slate-500" size={14} />
                                        <input
                                            type="text"
                                            placeholder="Buscar item..."
                                            className="input w-full pl-8 py-1 text-xs h-7"
                                            value={searchNotFound}
                                            onChange={e => setSearchNotFound(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="max-h-64 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-dark-900/50 text-slate-400 text-xs sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                                        <tr>
                                            <th className="px-3 py-2 text-center w-10">#</th>
                                            <th className="px-4 py-2 text-left">Produto Não Encontrado</th>
                                            <th className="px-4 py-2 text-left">Categoria</th>
                                            <th className="px-4 py-2 text-right">Qtd</th>
                                            <th className="px-4 py-2 text-right">Preço Un.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-dark-700/50">
                                        {filteredNotFoundItems.length === 0 ? (
                                            <tr><td colSpan={5} className="text-center py-6 text-slate-500 text-xs text-center">Nenhum item não encontrado visível.</td></tr>
                                        ) : (
                                            filteredNotFoundItems.map((item, idx) => (
                                                <tr key={idx} className={`hover:bg-dark-700/50 cursor-pointer transition-colors ${item.selected ? 'bg-primary/5' : ''}`} onClick={() => toggleSelectItem(item.name)}>
                                                    <td className="px-3 py-2 text-center">
                                                        <input
                                                            type="checkbox"
                                                            className="checkbox w-4 h-4 rounded"
                                                            checked={item.selected}
                                                            onChange={() => { }} // handled by row click
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">{item.name}</td>
                                                    <td className="px-4 py-2 text-slate-400 text-xs">{item.category || '-'}</td>
                                                    <td className="px-4 py-2 text-right">{item.qty}</td>
                                                    <td className="px-4 py-2 text-right">R$ {item.avgPrice.toFixed(2)}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {importErrors.length > 0 && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                <p className="text-sm text-red-400 font-medium mb-1">Erros de Validação:</p>
                                <div className="max-h-24 overflow-y-auto">
                                    {importErrors.map((err, i) => (
                                        <p key={i} className="text-xs text-red-300">• {err}</p>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center pt-4 border-t border-dark-700 mt-2">
                            <button
                                onClick={() => setStep('input')}
                                className="text-slate-400 hover:text-white text-sm"
                            >
                                ← Voltar para edição
                            </button>
                            <div className="flex gap-2">
                                <button onClick={onClose} className="btn btn-ghost" disabled={loading}>Cancelar</button>
                                <button
                                    onClick={handleConfirmImport}
                                    className="btn btn-primary"
                                    disabled={disableConfirm}
                                >
                                    {loading ? 'Salvando...' : `Confirmar Importação (${itemsToImportCount})`}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
