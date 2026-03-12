-- ============================================================
-- 16 - Flag de bloqueio de compra em customers
--
-- Objetivo:
--   Adicionar um campo no cadastro de clientes para bloquear
--   compras daquele cliente (ex.: inadimplente, interno, teste).
--
-- Uso:
--   Rodar este script no SQL Editor do Supabase, no mesmo
--   projeto deste site.
-- ============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN customers.is_blocked IS
  'Se true, o cliente está bloqueado para novas compras (B2B / B2C).';

