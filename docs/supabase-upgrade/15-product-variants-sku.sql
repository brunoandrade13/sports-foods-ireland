-- ============================================================
-- 15 - SKU por variante de produto
-- 
-- Objetivo:
-- - Permitir que cada variante (`product_variants`) tenha seu
--   próprio SKU, diferente do SKU do produto pai.
-- - Esse campo será usado para produtos em que cada opção
--   (ex.: sabor + tamanho) possui um código específico.
--
-- Uso:
-- - Rodar este script no SQL Editor do Supabase, no mesmo
--   projeto onde estão as tabelas `products` e `product_variants`.
-- ============================================================

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS sku text;

COMMENT ON COLUMN product_variants.sku IS
  'SKU específico desta variante (por exemplo, cada combinação sabor/tamanho com seu próprio código).';

