-- ============================================================
-- 17 - Preço específico por cliente e produto
--
-- Objetivo:
--   Permitir cadastrar um preço especial para um cliente
--   específico em um produto (e opcionalmente por variante).
--
-- Uso:
--   Rodar este script no SQL Editor do Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  price_eur numeric(10,2) NOT NULL,
  price_gbp numeric(10,2),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpp_product ON customer_product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_cpp_customer ON customer_product_prices(customer_id);
CREATE INDEX IF NOT EXISTS idx_cpp_variant ON customer_product_prices(variant_id);

-- Um preço ativo por combinação produto+cliente+variante
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cpp_active
  ON customer_product_prices(product_id, customer_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active = true;

COMMENT ON TABLE customer_product_prices IS
  'Preços especiais negociados por cliente e produto (opcionalmente por variante).';

