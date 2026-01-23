CREATE OR REPLACE VIEW product_costs_view AS
SELECT p.id,
    p.name,
    p.category,
    p.sale_price,
    p.active,
    p.last_sales_qty,
    p.last_sales_total,
    p.average_sale_price,
    COALESCE(
        sum((pi.quantity * i.cost_per_unit)),
        (0)::numeric
    ) AS cmv,
    (
        p.sale_price - COALESCE(
            sum((pi.quantity * i.cost_per_unit)),
            (0)::numeric
        )
    ) AS gross_margin,
    CASE
        WHEN (p.sale_price > (0)::numeric) THEN round(
            (
                (
                    (
                        p.sale_price - COALESCE(
                            sum((pi.quantity * i.cost_per_unit)),
                            (0)::numeric
                        )
                    ) / p.sale_price
                ) * (100)::numeric
            ),
            2
        )
        ELSE (0)::numeric
    END AS margin_percent
FROM products p
    LEFT JOIN product_ingredients pi ON p.id = pi.product_id
    LEFT JOIN ingredients i ON pi.ingredient_id = i.id
GROUP BY p.id,
    p.name,
    p.category,
    p.sale_price,
    p.active,
    p.last_sales_qty,
    p.last_sales_total,
    p.average_sale_price;