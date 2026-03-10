-- ============================================================
-- DIAGNÓSTICO: Produtos Tailwind (ativos e inativos)
-- Verifica se ainda existem no banco os produtos antigos com
-- tamanhos (500g, 1kg, 2kg etc.) e seus preços/estoques.
-- Executar no SQL Editor do Supabase.
-- ============================================================

-- 1) Listar todos os produtos da marca Tailwind
SELECT
  p.id,
  p.is_active,
  p.name,
  p.sku,
  p.price_eur,
  p.stock_quantity,
  p.slug
FROM products p
JOIN brands b ON b.id = p.brand_id
WHERE b.name ILIKE '%Tailwind%'
ORDER BY p.is_active DESC, p.name;

-- 2) Produtos Tailwind INATIVOS (os que foram unificados - podem ter tamanho no nome/SKU)
SELECT
  p.id,
  p.name,
  p.sku,
  p.price_eur,
  p.stock_quantity
FROM products p
JOIN brands b ON b.id = p.brand_id
WHERE b.name ILIKE '%Tailwind%'
  AND p.is_active = false
ORDER BY p.name;

-- 3) Variantes atuais dos produtos unificados Tailwind (só sabor hoje)
SELECT
  pv.id,
  p.name AS product_name,
  pv.label AS variant_label,
  pv.price,
  pv.stock,
  vt.slug AS variant_type
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
JOIN brands b ON b.id = p.brand_id
LEFT JOIN variant_types vt ON vt.id = pv.variant_type_id
WHERE b.name ILIKE '%Tailwind%'
  AND pv.is_active = true
ORDER BY p.name, pv.sort_order, pv.label;
