import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Search, Package, Calculator, ImagePlus, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useBusinessSettings } from '../../hooks/useBusinessSettings';
import { computeIdealMenuPrice, computeAllChannelPrices, computeProductMetrics } from '../../lib/pricing';
import type { Product, Ingredient } from '../../types';

interface ProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    editingProduct?: Product | null;
}

interface IngredientLine {
    id: number;
    ingredient_id: number;
    quantity: number;
    ingredient?: Ingredient;
    cost_per_unit?: number;
}

export function ProductModal({ isOpen, onClose, editingProduct }: ProductModalProps) {
    const { companyId } = useAuth();
    const { toast } = useToast();

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [salePrice, setSalePrice] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [active, setActive] = useState(true);

    // Ingredients
    const [ingredientLines, setIngredientLines] = useState<IngredientLine[]>([]);
    const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showIngredientSearch, setShowIngredientSearch] = useState<number | null>(null);

    // Settings & Calculations (via pricing engine)
    const biz = useBusinessSettings();
    const [totalCost, setTotalCost] = useState(0);
    const [suggestedPrice, setSuggestedPrice] = useState(0);

    // UI state
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'data' | 'ingredients' | 'pricing'>('data');

    // Load data
    useEffect(() => {
        if (!isOpen || !companyId) return;

        loadIngredients();

        if (editingProduct) {
            setName(editingProduct.name);
            setDescription(editingProduct.description || '');
            setCategory(editingProduct.category || '');
            setSalePrice(editingProduct.sale_price?.toString() || '');
            setImageUrl(editingProduct.image_url || '');
            setActive(editingProduct.active);
            loadProductIngredients(editingProduct.id);
        } else {
            resetForm();
        }
    }, [isOpen, editingProduct, companyId]);

    const loadIngredients = async () => {
        const { data } = await supabase
            .from('ingredients')
            .select('*')
            .eq('company_id', companyId)
            .order('name');

        setAvailableIngredients(data || []);
    };

    // Settings are now loaded via useBusinessSettings hook

    const loadProductIngredients = async (productId: number) => {
        const { data } = await supabase
            .from('product_ingredients')
            .select('*, ingredient:ingredients(*)')
            .eq('product_id', productId);

        if (data) {
            const lines = data.map((item: any) => ({
                id: item.id,
                ingredient_id: item.ingredient_id,
                quantity: item.quantity,
                ingredient: item.ingredient,
                cost_per_unit: item.ingredient?.cost_per_unit
            }));
            setIngredientLines(lines);
        }
    };

    const resetForm = () => {
        setName('');
        setDescription('');
        setCategory('');
        setSalePrice('');
        setImageUrl('');
        setActive(true);
        setIngredientLines([]);
        setActiveTab('data');
    };

    // Calculations using centralized pricing engine
    useEffect(() => {
        const cost = ingredientLines.reduce((acc, line) => {
            const ingredient = availableIngredients.find(i => i.id === line.ingredient_id);
            return acc + (line.quantity * (ingredient?.cost_per_unit || line.cost_per_unit || 0));
        }, 0);

        setTotalCost(cost);

        // Preço Sugerido = CMV × Markup (via pricing engine)
        const suggested = computeIdealMenuPrice(cost, biz.markup);
        setSuggestedPrice(suggested);
    }, [ingredientLines, availableIngredients, biz.markup]);

    // Ingredient handlers
    const addIngredientLine = () => {
        setIngredientLines(prev => [...prev, {
            id: Date.now(),
            ingredient_id: 0,
            quantity: 0
        }]);
    };

    const updateIngredientLine = (lineId: number, updates: Partial<IngredientLine>) => {
        setIngredientLines(prev => prev.map(line =>
            line.id === lineId ? { ...line, ...updates } : line
        ));
    };

    const removeIngredientLine = (lineId: number) => {
        setIngredientLines(prev => prev.filter(line => line.id !== lineId));
    };

    const selectIngredient = (lineId: number, ingredient: Ingredient) => {
        updateIngredientLine(lineId, {
            ingredient_id: ingredient.id,
            ingredient: ingredient,
            cost_per_unit: ingredient.cost_per_unit
        });
        setShowIngredientSearch(null);
        setSearchTerm('');
    };

    // Image upload
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !companyId) return;

        try {
            setLoading(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${companyId}/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

            setImageUrl(publicUrl);
            toast.success('Imagem enviada com sucesso!');
        } catch (err) {
            toast.error('Erro ao enviar imagem');
        } finally {
            setLoading(false);
        }
    };

    // Save
    const handleSave = async () => {
        if (!companyId) return;

        if (!name.trim()) {
            toast.error('Nome do produto é obrigatório');
            setActiveTab('data');
            return;
        }

        if (!salePrice || Number(salePrice) <= 0) {
            toast.error('Preço de venda inválido');
            setActiveTab('pricing');
            return;
        }

        const invalidIngredients = ingredientLines.filter(
            l => !l.ingredient_id || l.quantity <= 0
        );
        if (invalidIngredients.length > 0) {
            toast.error('Verifique os ingredientes (todos devem ter item e quantidade)');
            setActiveTab('ingredients');
            return;
        }

        try {
            setSaving(true);

            const productData = {
                name: name.trim(),
                description: description.trim() || null,
                category: category.trim() || null,
                sale_price: Number(salePrice),
                image_url: imageUrl || null,
                active,
                company_id: companyId,
                is_combo: false
            };

            let productId: number;

            if (editingProduct) {
                const { error } = await supabase
                    .from('products')
                    .update(productData)
                    .eq('id', editingProduct.id);

                if (error) throw error;
                productId = editingProduct.id;
            } else {
                const { data, error } = await supabase
                    .from('products')
                    .insert(productData)
                    .select()
                    .single();

                if (error) throw error;
                productId = data.id;
            }

            // Sync ingredients
            await supabase
                .from('product_ingredients')
                .delete()
                .eq('product_id', productId);

            if (ingredientLines.length > 0) {
                const ingredientsToInsert = ingredientLines.map(line => ({
                    product_id: productId,
                    ingredient_id: line.ingredient_id,
                    quantity: line.quantity,
                    company_id: companyId
                }));

                const { error: ingError } = await supabase
                    .from('product_ingredients')
                    .insert(ingredientsToInsert);

                if (ingError) throw ingError;
            }

            toast.success(editingProduct ? 'Produto atualizado!' : 'Produto criado!');
            onClose();
        } catch (err) {
            console.error('Error saving product:', err);
            toast.error('Erro ao salvar produto');
        } finally {
            setSaving(false);
        }
    };

    const filteredIngredients = availableIngredients.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-dark-700">
                    <div className="flex items-center gap-3">
                        <Package className="text-primary" size={24} />
                        <h2 className="text-xl font-bold text-white">
                            {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-dark-700">
                    {[
                        { id: 'data', label: 'Dados Básicos' },
                        { id: 'ingredients', label: 'Ficha Técnica' },
                        { id: 'pricing', label: 'Precificação' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === tab.id
                                ? 'text-primary border-b-2 border-primary bg-primary/10'
                                : 'text-slate-400 hover:text-white hover:bg-dark-700/50'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Tab: Dados Básicos */}
                    {activeTab === 'data' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Nome do Produto *
                                        </label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Ex: Hambúrguer Artesanal"
                                            className="w-full px-4 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white focus:border-primary focus:outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Categoria
                                        </label>
                                        <input
                                            type="text"
                                            value={category}
                                            onChange={(e) => setCategory(e.target.value)}
                                            placeholder="Ex: Lanches, Bebidas, Sobremesas"
                                            className="w-full px-4 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white focus:border-primary focus:outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Descrição
                                        </label>
                                        <textarea
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            rows={3}
                                            placeholder="Descrição do produto..."
                                            className="w-full px-4 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white focus:border-primary focus:outline-none resize-none"
                                        />
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="active-product"
                                            checked={active}
                                            onChange={(e) => setActive(e.target.checked)}
                                            className="w-5 h-5 rounded border-dark-600 bg-dark-900 text-primary focus:ring-primary"
                                        />
                                        <label htmlFor="active-product" className="text-white">
                                            Produto ativo
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Imagem do Produto
                                    </label>
                                    <div className="relative aspect-video bg-dark-900 rounded-lg border-2 border-dashed border-dark-600 overflow-hidden group">
                                        {imageUrl ? (
                                            <>
                                                <img
                                                    src={imageUrl}
                                                    alt={name}
                                                    className="w-full h-full object-cover"
                                                />
                                                <button
                                                    onClick={() => setImageUrl('')}
                                                    className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        ) : (
                                            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-dark-800/50 transition-colors">
                                                <ImagePlus size={48} className="text-slate-600 mb-2" />
                                                <span className="text-sm text-slate-500">Clique para adicionar imagem</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleImageUpload}
                                                    className="hidden"
                                                />
                                            </label>
                                        )}
                                    </div>
                                    {loading && (
                                        <p className="text-sm text-primary">Enviando imagem...</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab: Ficha Técnica */}
                    {activeTab === 'ingredients' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-medium text-white">Composição do Produto</h3>
                                <button
                                    onClick={addIngredientLine}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary hover:bg-primary/80 text-white rounded-lg transition-colors"
                                >
                                    <Plus size={16} />
                                    Adicionar Insumo
                                </button>
                            </div>

                            <div className="space-y-3">
                                {ingredientLines.map((line, index) => (
                                    <div
                                        key={line.id}
                                        className="flex items-center gap-3 p-4 bg-dark-900 rounded-lg border border-dark-700"
                                    >
                                        <span className="text-slate-500 font-mono w-8">
                                            {String(index + 1).padStart(2, '0')}
                                        </span>

                                        {/* Ingredient Selector */}
                                        <div className="flex-1 relative">
                                            {line.ingredient ? (
                                                <div className="flex items-center justify-between px-3 py-2 bg-dark-800 rounded-lg border border-dark-600">
                                                    <span className="text-white">{line.ingredient.name}</span>
                                                    <button
                                                        onClick={() => setShowIngredientSearch(line.id)}
                                                        className="text-sm text-primary hover:text-primary/80"
                                                    >
                                                        Trocar
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setShowIngredientSearch(line.id)}
                                                    className="w-full px-3 py-2 text-left text-slate-400 bg-dark-800 rounded-lg border border-dark-600 hover:border-primary transition-colors"
                                                >
                                                    Selecionar insumo...
                                                </button>
                                            )}

                                            {/* Search Dropdown */}
                                            {showIngredientSearch === line.id && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-xl z-20">
                                                    <div className="p-2">
                                                        <div className="relative">
                                                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                            <input
                                                                type="text"
                                                                autoFocus
                                                                value={searchTerm}
                                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                                placeholder="Buscar insumo..."
                                                                className="w-full pl-8 pr-3 py-1.5 bg-dark-900 border border-dark-700 rounded text-sm text-white focus:border-primary focus:outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="max-h-40 overflow-y-auto">
                                                        {filteredIngredients.map(ing => (
                                                            <button
                                                                key={ing.id}
                                                                onClick={() => selectIngredient(line.id, ing)}
                                                                className="w-full px-3 py-2 text-left hover:bg-dark-700 text-sm text-white flex justify-between items-center"
                                                            >
                                                                <span>{ing.name}</span>
                                                                <span className="text-slate-400 text-xs">
                                                                    R$ {ing.cost_per_unit.toFixed(2)}/{ing.unit}
                                                                </span>
                                                            </button>
                                                        ))}
                                                        {filteredIngredients.length === 0 && (
                                                            <p className="px-3 py-2 text-sm text-slate-500">
                                                                Nenhum insumo encontrado
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Quantity */}
                                        <div className="w-32">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={line.quantity || ''}
                                                    onChange={(e) => updateIngredientLine(line.id, {
                                                        quantity: Number(e.target.value)
                                                    })}
                                                    className="w-full px-2 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-center focus:border-primary focus:outline-none"
                                                />
                                                <span className="text-slate-400 text-sm w-12">
                                                    {line.ingredient?.unit || 'un'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Cost */}
                                        <div className="w-28 text-right">
                                            <p className="text-sm text-slate-400">Custo</p>
                                            <p className="text-white font-medium">
                                                R$ {((line.quantity || 0) * (line.cost_per_unit || 0)).toFixed(2)}
                                            </p>
                                        </div>

                                        {/* Delete */}
                                        <button
                                            onClick={() => removeIngredientLine(line.id)}
                                            className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}

                                {ingredientLines.length === 0 && (
                                    <div className="text-center py-12 bg-dark-900/50 rounded-lg border-2 border-dashed border-dark-700">
                                        <Package size={48} className="mx-auto mb-3 text-slate-600" />
                                        <p className="text-slate-400">Nenhum insumo adicionado</p>
                                        <p className="text-sm text-slate-500 mt-1">
                                            Adicione insumos para calcular o custo do produto
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Total Cost Preview */}
                            {ingredientLines.length > 0 && (
                                <div className="flex justify-end items-center gap-4 pt-4 border-t border-dark-700">
                                    <span className="text-slate-400">Custo Total da Ficha Técnica:</span>
                                    <span className="text-2xl font-bold text-primary">
                                        R$ {totalCost.toFixed(2)}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab: Precificação */}
                    {activeTab === 'pricing' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Price Input */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Preço de Venda (R$) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={salePrice}
                                        onChange={(e) => setSalePrice(e.target.value)}
                                        placeholder="0,00"
                                        className="w-full px-4 py-3 text-2xl bg-dark-900 border border-dark-600 rounded-lg text-white focus:border-primary focus:outline-none"
                                    />
                                </div>

                                {/* Suggested Price */}
                                <div className="bg-dark-900 p-4 rounded-lg border border-dark-700">
                                    <p className="text-sm text-slate-400 mb-1">Preço Sugerido</p>
                                    <p className="text-2xl font-bold text-primary">
                                        R$ {suggestedPrice.toFixed(2)}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Markup: {biz.markup > 0 ? biz.markup.toFixed(2) + 'x' : 'N/A'} (CMV × Markup)
                                    </p>
                                    <button
                                        onClick={() => setSalePrice(suggestedPrice.toFixed(2))}
                                        className="mt-3 text-sm text-primary hover:text-primary/80 underline"
                                    >
                                        Usar preço sugerido
                                    </button>
                                </div>
                            </div>

                            {/* Analysis Cards — using pricing engine */}
                            {(() => {
                                const currentPrice = parseFloat(salePrice) || 0;
                                const m = computeProductMetrics({
                                    cmv: totalCost,
                                    salePrice: currentPrice,
                                    fixedCostPercent: biz.fixedCostPercent,
                                    variableCostPercent: biz.variableCostPercent,
                                    desiredProfitPercent: biz.desiredProfitPercent,
                                    totalFixedCosts: biz.totalFixedCosts,
                                    estimatedMonthlySales: biz.estimatedMonthlySales,
                                    averageMonthlyRevenue: biz.averageMonthlyRevenue,
                                    channels: biz.channels,
                                    fixedCostAllocationMode: biz.fixedCostAllocationMode,
                                    targetCmvPercent: biz.targetCmvPercent,
                                });
                                const cmvColor = m.cmvStatus === 'danger' ? 'text-red-400' : m.cmvStatus === 'warning' ? 'text-amber-400' : 'text-emerald-400';
                                const profitColor = m.marginStatus === 'danger' ? 'text-red-400' : m.marginStatus === 'warning' ? 'text-amber-400' : 'text-emerald-400';

                                return (
                                    <>
                                        {/* CMV + Margins grid */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className={`bg-dark-900 p-4 rounded-lg border ${m.cmvStatus === 'danger' ? 'border-red-500/40' : m.cmvStatus === 'warning' ? 'border-amber-500/40' : 'border-dark-700'}`}>
                                                <p className="text-sm text-slate-400 mb-1">CMV %</p>
                                                <p className={`text-lg font-semibold ${cmvColor}`}>
                                                    {m.cmvPercent.toFixed(1)}% {m.cmvStatus === 'healthy' ? '🟢' : m.cmvStatus === 'warning' ? '🟡' : '🔴'}
                                                </p>
                                                <p className="text-[10px] text-slate-600">meta ≤ {biz.targetCmvPercent}%</p>
                                            </div>

                                            <div className="bg-dark-900 p-4 rounded-lg border border-dark-700">
                                                <p className="text-sm text-slate-400 mb-1">Margem Bruta</p>
                                                <p className="text-lg font-semibold text-white">
                                                    {m.grossMarginPercent.toFixed(1)}%
                                                </p>
                                                <p className="text-[10px] text-slate-600">antes custos op.</p>
                                            </div>

                                            <div className="bg-dark-900 p-4 rounded-lg border border-dark-700">
                                                <p className="text-sm text-slate-400 mb-1">Margem Contribuição</p>
                                                <p className="text-lg font-semibold text-white">
                                                    {m.contributionMarginPercent.toFixed(1)}%
                                                </p>
                                                <p className="text-[10px] text-slate-600">após custos var.</p>
                                            </div>

                                            <div className="bg-dark-900 p-4 rounded-lg border border-dark-700">
                                                <p className="text-sm text-slate-400 mb-1">Lucro Estimado</p>
                                                <p className={`text-lg font-semibold ${profitColor}`}>
                                                    R$ {m.profitValue.toFixed(2)} ({m.profitPercent.toFixed(1)}%)
                                                </p>
                                                <p className="text-[10px] text-slate-600">
                                                    Custo fixo: {m.fixedCostMethod === 'revenue_based' ? 'faturamento' : 'por unidade'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Alert */}
                                        {m.marginStatus === 'warning' && currentPrice > 0 && (
                                            <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                                                <Calculator className="text-yellow-400 shrink-0" size={20} />
                                                <div>
                                                    <p className="text-yellow-400 font-medium">Atenção: Lucro abaixo do desejado</p>
                                                    <p className="text-sm text-yellow-400/80 mt-1">
                                                        Lucro de {m.profitPercent.toFixed(1)}% está abaixo do desejado ({biz.desiredProfitPercent}%).
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                        {m.marginStatus === 'danger' && currentPrice > 0 && (
                                            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                                                <Calculator className="text-red-400 shrink-0" size={20} />
                                                <div>
                                                    <p className="text-red-400 font-medium">⚠️ Produto com PREJUÍZO</p>
                                                    <p className="text-sm text-red-400/80 mt-1">
                                                        Revise o preço de venda ou reduza custos.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Per-Channel Ideal Prices */}
                                        {biz.channels.length > 0 && suggestedPrice > 0 && (
                                            <div className="bg-dark-900 p-4 rounded-lg border border-dark-700">
                                                <p className="text-sm text-blue-400 font-medium mb-3">Preço Ideal por Canal</p>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-emerald-400">Cardápio Próprio</span>
                                                        <span className="font-bold text-emerald-400">R$ {suggestedPrice.toFixed(2)}</span>
                                                    </div>
                                                    {computeAllChannelPrices(suggestedPrice, biz.channels).map(cp => (
                                                        <div key={cp.channelId} className="flex justify-between text-sm">
                                                            <span className="text-slate-300">{cp.channelName} <span className="text-xs text-slate-500">({cp.totalTaxRate.toFixed(1)}%)</span></span>
                                                            <span className="font-bold text-blue-400">R$ {cp.idealPrice.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-dark-700 bg-dark-800/50">
                    <div className="text-sm text-slate-400">
                        {editingProduct ? `ID: ${editingProduct.id}` : 'Novo produto'}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                        >
                            {saving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <Save size={20} />
                                    Salvar Produto
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
