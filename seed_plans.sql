-- Seed Plans (Phase 2: limits + flags + marketing)
INSERT INTO plans (id, name, price, description, features)
VALUES (
        'free',
        'Grátis',
        0,
        'Plano ideal para quem está começando',
        '{
      "limits": {
        "products": 15,
        "ingredients": 20,
        "combos": 0,
        "channels": 0,
        "history_days": 7,
        "users": 1
      },
      "flags": {
        "import_sales": false,
        "channels": false,
        "fees": false,
        "fixed_costs": false,
        "variable_costs": false,
        "combos": false,
        "cmv_analysis": true,
        "exports": false,
        "insights": false,
        "cost_simulation": false
      },
      "marketing": [
        "Até 15 produtos",
        "Ficha técnica e CMV básico",
        "Análise CMV (limitada)",
        "1 Usuário"
      ]
    }'::jsonb
    ),
    (
        'pro',
        'Profissional',
        49.90,
        'Para negócios em crescimento',
        '{
      "limits": {
        "products": 120,
        "ingredients": 200,
        "combos": 50,
        "channels": 5,
        "history_days": 180,
        "users": 1
      },
      "flags": {
        "import_sales": true,
        "channels": true,
        "fees": true,
        "fixed_costs": true,
        "variable_costs": true,
        "combos": true,
        "cmv_analysis": true,
        "exports": false,
        "insights": true,
        "cost_simulation": true
      },
      "marketing": [
        "Até 120 produtos",
        "Até 200 insumos",
        "Até 50 combos",
        "Até 5 canais de venda",
        "Importação de vendas",
        "Custos fixos e variáveis",
        "Taxas e canais",
        "Análise CMV completa",
        "Simulação de custos",
        "Insights de performance",
        "1 Usuário"
      ]
    }'::jsonb
    ),
    (
        'premium',
        'Premium',
        99.90,
        'Gestão completa sem limites',
        '{
      "limits": {
        "products": -1,
        "ingredients": -1,
        "combos": -1,
        "channels": -1,
        "history_days": -1,
        "users": -1
      },
      "flags": {
        "import_sales": true,
        "channels": true,
        "fees": true,
        "fixed_costs": true,
        "variable_costs": true,
        "combos": true,
        "cmv_analysis": true,
        "exports": true,
        "insights": true,
        "cost_simulation": true
      },
      "marketing": [
        "Produtos ilimitados",
        "Insumos ilimitados",
        "Combos ilimitados",
        "Canais ilimitados",
        "Histórico ilimitado",
        "Usuários ilimitados",
        "Importação de vendas",
        "Custos fixos e variáveis",
        "Taxas e canais",
        "Análise CMV completa",
        "Exportação de dados",
        "Simulação de custos",
        "Insights de performance",
        "Suporte prioritário"
      ]
    }'::jsonb
    ) ON CONFLICT (id) DO
UPDATE
SET name = EXCLUDED.name,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    features = EXCLUDED.features;
-- Ensure companies have a subscription (default to Free if missing)
INSERT INTO subscriptions (
        company_id,
        plan_id,
        status,
        current_period_start,
        current_period_end
    )
SELECT id,
    'free',
    'active',
    now(),
    now() + interval '100 years'
FROM companies c
WHERE NOT EXISTS (
        SELECT 1
        FROM subscriptions s
        WHERE s.company_id = c.id
    );