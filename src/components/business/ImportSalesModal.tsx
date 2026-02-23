import { useState } from 'react';
import { AlertCircle, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';

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
}

export function ImportSalesModal({ isOpen, onClose, onSuccess }: ImportSalesModalProps) {
    const { companyId } = useAuth();
    const [rawText, setRawText] = useState('');
    const [previewData, setPreviewData] = useState<ParsedItem[]>([]);
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [loading, setLoading] = useState(false);
    const [importErrors, setImportErrors] = useState<string[]>([]);

    // Helpers to parse Brazilian currency/numbers (Robust)
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
            // Fetch existing products (filtered by company)
            const query = supabase.from('products').select('id, name');
            if (companyId) query.eq('company_id', companyId);
            const { data: existingProducts } = await query;
            const products = existingProducts || [];

            // Helper for normalization
            const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const productMap = new Map(products.map(p => [normalize(p.name), p.id]));

            const lines = rawText.split('\n').filter(l => l.trim().length > 0);
            const parsed: ParsedItem[] = [];

            // --- Header Detection & Dynamic Mapping ---
            let idxProduct = 0;
            let idxCategory = 1;
            let idxQty = 2;
            let idxTotal = 3;
            let idxAvg = 4;

            let dataStartIndex = 0;

            const normHeader = (h: string) => h.toLowerCase().trim()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, "");

            const headerLineIndex = lines.findIndex(line => {
                const lower = normHeader(line);
                return lower.includes('produto') && (lower.includes('qtd') || lower.includes('quantidade'));
            });

            if (headerLineIndex !== -1) {
                const headers = lines[headerLineIndex].split('\t').map(normHeader);

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

                // Skip qty 0 or invalid
                if (qty <= 0) {
                    console.warn(`Importação: qty inválida para "${name}" (${qty}), ignorado.`);
                    continue;
                }

                parsed.push({
                    name,
                    category,
                    qty,
                    total,
                    avgPrice,
                    status: existingId ? 'matched' : 'not_found',
                    existingId
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
        setImportErrors([]);
        try {
            const errors: string[] = [];
            const matchedItems = previewData.filter(item => item.status === 'matched' && item.existingId);

            if (matchedItems.length === 0) {
                alert('Nenhum produto reconhecido para importar.');
                setLoading(false);
                return;
            }

            // Build sales records
            const salesRecords = matchedItems.map(item => ({
                product_id: item.existingId!,
                quantity: item.qty,
                sale_price: item.avgPrice, // weighted avg unit price
                company_id: companyId,
                sold_at: new Date()
            }));

            // Insert into sales table
            const { error } = await supabase.from('sales').insert(salesRecords);

            if (error) {
                console.error('Error inserting sales:', error);
                errors.push(`Erro ao gravar vendas: ${error.message}`);
            }

            if (errors.length > 0) {
                setImportErrors(errors);
                alert(`Importação com erros: ${errors.join(', ')}`);
            } else {
                const notFound = previewData.filter(item => item.status === 'not_found');
                if (notFound.length > 0) {
                    alert(`Importação concluída! ${matchedItems.length} vendas registradas.\n\n${notFound.length} produto(s) não encontrado(s) foram ignorados.`);
                } else {
                    alert(`Importação concluída! ${matchedItems.length} vendas registradas.`);
                }
                onSuccess();
                onClose();
            }
        } catch (error) {
            console.error('Error saving data:', error);
            alert('Erro ao salvar no banco de dados.');
        } finally {
            setLoading(false);
        }
    }

    const matchedCount = previewData.filter(i => i.status === 'matched').length;
    const notFoundCount = previewData.filter(i => i.status === 'not_found').length;
    const notFoundItems = previewData.filter(i => i.status === 'not_found');

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
                                <p className="mt-2 text-amber-400">⚠️ Apenas produtos já cadastrados serão importados. Produtos não reconhecidos serão ignorados.</p>
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
                                <span>{matchedCount} Reconhecidos</span>
                            </div>
                            {notFoundCount > 0 && (
                                <div className="flex items-center gap-2 text-amber-400">
                                    <AlertTriangle size={16} />
                                    <span>{notFoundCount} Não Encontrados</span>
                                </div>
                            )}
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
                                        <tr key={idx} className={`hover:bg-dark-700/50 ${item.status === 'not_found' ? 'opacity-50' : ''}`}>
                                            <td className="px-4 py-2">
                                                {item.status === 'matched' ? (
                                                    <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">✓ Encontrado</span>
                                                ) : (
                                                    <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-1 rounded">⚠ Ignorado</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2">{item.name}</td>
                                            <td className="px-4 py-2 text-slate-400">{item.category}</td>
                                            <td className="px-4 py-2 text-right">{item.qty}</td>
                                            <td className="px-4 py-2 text-right">R$ {item.total.toFixed(2)}</td>
                                            <td className="px-4 py-2 text-right">R$ {item.avgPrice.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Not found items summary */}
                        {notFoundItems.length > 0 && (
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                                <p className="text-sm text-amber-400 font-medium mb-2">
                                    Produtos não encontrados ({notFoundItems.length}):
                                </p>
                                <p className="text-xs text-slate-400">
                                    {notFoundItems.map(i => i.name).join(', ')}
                                </p>
                                <p className="text-xs text-slate-500 mt-2">
                                    Cadastre esses produtos primeiro na aba Produtos, depois importe novamente.
                                </p>
                            </div>
                        )}

                        {importErrors.length > 0 && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                <p className="text-sm text-red-400 font-medium">Erros:</p>
                                {importErrors.map((err, i) => (
                                    <p key={i} className="text-xs text-red-300">{err}</p>
                                ))}
                            </div>
                        )}

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
                                    disabled={loading || matchedCount === 0}
                                >
                                    {loading ? 'Salvando...' : `Confirmar (${matchedCount} vendas)`}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
