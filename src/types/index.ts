export interface Product {
    id: number;
    name: string;
    sale_price: number;
    description?: string;
    image_url?: string;
    active: boolean;
    created_at?: string;
    category?: string;
    cost_price?: number;
    last_sales_qty?: number;
    last_sales_total?: number;
    average_sale_price?: number;
    is_combo?: boolean;
}

export interface Ingredient {
    id: number;
    name: string;
    unit: string;
    cost_per_unit: number;
    created_at?: string;
    category?: 'Insumo' | 'Embalagem' | 'Acompanhamento';
}

export interface ProductIngredient {
    id: number;
    product_id: number;
    ingredient_id: number;
    quantity: number;
    ingredient?: Ingredient;
}

export interface ProductCombo {
    id: number;
    parent_product_id: number;
    child_product_id: number;
    quantity: number;
    child_product?: Product; // For fetching details
}

export interface ProductWithCost extends Product {
    cmv: number;
    gross_margin: number;
    margin_percent: number;
}

export interface FixedCost {
    id: number;
    name: string;
    monthly_value: number;
    category: string;
    config?: {
        daily_rate?: number;
        qty_people?: number;
        days_worked?: number;
        base_salary?: number;
        thirteenth?: number;
        vacation?: number;
        fgts?: number;
        unit_cost?: number;
        monthly_qty?: number;
        product_id?: number;
    };
    created_at?: string;
}

export interface Channel {
    id: number;
    name: string;
    fee_percentage: number;
    active: boolean;
    created_at?: string;
}

export interface Fee {
    id: number;
    name: string;
    percentage: number;
    created_at?: string;
}

export interface BusinessSettings {
    id: number;
    desired_profit_percent: number;
    platform_tax_rate: number;
    monthly_revenue: {
        jan: number;
        feb: number;
        mar: number;
        apr: number;
        may: number;
        jun: number;
        jul: number;
        aug: number;
        sep: number;
        oct: number;
        nov: number;
        dec: number;
    };
}
