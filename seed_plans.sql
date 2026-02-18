-- Seed Plans
INSERT INTO plans (id, name, price, features, limits)
VALUES (
        1,
        'Free',
        0,
        '["Até 10 Produtos", "Até 5 Insumos", "1 Usuário"]',
        '{"products": 10, "ingredients": 5, "users": 1}'
    ),
    (
        2,
        'Pro',
        49.90,
        '["Até 50 Produtos", "Até 20 Insumos", "3 Usuários"]',
        '{"products": 50, "ingredients": 20, "users": 3}'
    ),
    (
        3,
        'Premium',
        99.90,
        '["Produtos Ilimitados", "Insumos Ilimitados", "Usuários Ilimitados"]',
        '{"products": -1, "ingredients": -1, "users": -1}'
    ) ON CONFLICT (id) DO
UPDATE
SET name = EXCLUDED.name,
    price = EXCLUDED.price,
    features = EXCLUDED.features,
    limits = EXCLUDED.limits;
-- Ensure companies have a subscription (default to Free if missing)
INSERT INTO subscriptions (
        company_id,
        plan_id,
        status,
        current_period_start,
        current_period_end
    )
SELECT id,
    1,
    'active',
    now(),
    now() + interval '100 years'
FROM companies c
WHERE NOT EXISTS (
        SELECT 1
        FROM subscriptions s
        WHERE s.company_id = c.id
    );