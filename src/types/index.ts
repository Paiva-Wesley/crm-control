export interface Product {
    id: number;
    name: string;
    sale_price: number;
    description?: string;
    image_url?: string;
    active: boolean;
    created_at?: string;
    category?: string;
    is_combo?: boolean;
    company_id?: number;
    /** @deprecated Use sales table. Will be removed in Phase 2. */
    last_sales_qty?: number;
    /** @deprecated Use sales table. Will be removed in Phase 2. */
    last_sales_total?: number;
    /** @deprecated Use sales table. Will be removed in Phase 2. */
    average_sale_price?: number;
}

export interface Ingredient {
    id: number;
    company_id?: number;
    name: string;
    unit: string;
    cost_per_unit: number;
    created_at?: string;
    category?: 'Insumo' | 'Embalagem' | 'Acompanhamento';
    is_composite?: boolean;
    yield_quantity?: number | null;
}

export interface IngredientComponent {
    id?: number;
    parent_ingredient_id: number;
    child_ingredient_id: number;
    quantity: number;
    company_id?: string;
    ingredient?: Ingredient; // joined child ingredient
}

export interface ProductIngredient {
    id: number;
    company_id?: number;
    product_id: number;
    ingredient_id: number;
    quantity: number;
    ingredient?: Ingredient;
}

export interface ProductCombo {
    id: number;
    company_id?: number;
    parent_product_id: number;
    child_product_id: number;
    quantity: number;
    child_product?: Product; // For fetching details
}

export interface ProductProfitability extends Product {
    cmv: number;
    gross_profit: number;
    margin_percent: number;
}

// Deprecated or Alias for legacy support if needed, but better to use ProductProfitability
export interface ProductWithCost extends ProductProfitability { }

export interface FixedCost {
    id: number;
    company_id?: number;
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
    company_id?: number;
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
    company_id?: string;
    desired_profit_percent: number;
    platform_tax_rate: number;
    estimated_monthly_sales: number;
    fixed_cost_allocation_mode: 'revenue_based' | 'per_unit';
    target_cmv_percent: number;
    revenue_input_mode: 'single' | 'monthly';
    average_monthly_revenue_input: number;
}

export interface MonthlyRevenue {
    id: number;
    company_id: string;
    year: number;
    month: number; // 1-12
    revenue: number;
}

export interface Sale {
    id: number;
    company_id: string;
    product_id: number;
    quantity: number;
    sale_price: number;
    sold_at: string;
}

export interface Plan {
    id: number;
    name: string;
    price: number;
    features: string[];
    limits: {
        products: number;
        ingredients: number;
        users: number;
    };
    created_at?: string;
}

export interface Subscription {
    id: number;
    company_id: string;
    plan_id: number;
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    current_period_start: string;
    current_period_end: string;
    plan?: Plan;
}
