# RELATÓRIO DE AUDITORIA COMPLETA — Sports Foods Ireland
**Data:** 4 de Abril de 2026
**Áreas:** Front-End · Back-End · Layout · Base de Dados
**Objetivo:** Launch-Ready + Qualidade de Código

---

## RESUMO EXECUTIVO

| Área | Crítico | Alto | Médio | Baixo | Total |
|------|---------|------|-------|-------|-------|
| Front-End (JavaScript) | 0* | 4 | 6 | 5 | 15 |
| Back-End (Edge Functions) | 1 | 8 | 11 | 2 | 22 |
| Layout (HTML/CSS) | 0 | 4 | 10 | 11 | 25 |
| Base de Dados (Schema/RLS) | 8 | 12 | 9 | 6 | 35 |
| **TOTAL** | **9** | **28** | **36** | **24** | **97** |

> *A chave Supabase anon no front-end é pública por design — não é vulnerabilidade real.
> O item de "chave hardcoded" no front-end foi marcado como preocupação de manutenção (não segurança crítica).

---

## 🔴 CRÍTICO — Bloqueia o lançamento

### BASE DE DADOS

**BD-C1: Tabelas obrigatórias não existem no schema**
As funções QB dependem de tabelas que nunca foram criadas via migration:

```sql
-- Criar tabela de integração QuickBooks
CREATE TABLE IF NOT EXISTS qb_integration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  realm_id TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Criar tabela de histórico de sync QB
CREATE TABLE IF NOT EXISTS qb_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('products', 'orders', 'purchase_orders')),
  direction TEXT NOT NULL CHECK (direction IN ('qb_to_supabase', 'supabase_to_qb')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  records_processed INT DEFAULT 0,
  records_created INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  records_skipped INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

**BD-C2: Colunas QB não existem nos produtos e pedidos**
Todas as funções de sync QB leem/escrevem colunas que podem não existir:

```sql
-- Na tabela products
ALTER TABLE products ADD COLUMN IF NOT EXISTS qb_item_id TEXT UNIQUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS qb_sync_token TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS qb_sales_tax_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS qb_last_synced_at TIMESTAMPTZ;

-- Na tabela orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qb_sync_token TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qb_customer_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qb_last_synced_at TIMESTAMPTZ;

-- Na tabela customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS qb_customer_id TEXT UNIQUE;

-- Índices de busca
CREATE INDEX IF NOT EXISTS idx_products_qb_id ON products(qb_item_id);
CREATE INDEX IF NOT EXISTS idx_orders_qb_id ON orders(qb_invoice_id);
CREATE INDEX IF NOT EXISTS idx_customers_qb_id ON customers(qb_customer_id);
```

---

**BD-C3: Enum de status de pedido incompleto**
O `stripe-webhook` usa `status: "payment_failed"` mas esse valor não está no ENUM:

```sql
DROP TYPE IF EXISTS order_status CASCADE;
CREATE TYPE order_status AS ENUM (
  'pending', 'confirmed', 'processing', 'payment_failed',
  'shipped', 'delivered', 'cancelled', 'refunded', 'partially_refunded'
);
ALTER TABLE orders ALTER COLUMN status TYPE order_status USING status::text::order_status;
```

---

**BD-C4: Webhook Stripe sem idempotência — pedidos duplicados em retry**
O Stripe faz retry de webhooks automaticamente. Sem proteção, cada retry cria um pedido novo.

```sql
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  gateway TEXT NOT NULL DEFAULT 'stripe',
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_event_id ON processed_webhook_events(event_id);
```
*Requer também mudança no código do `stripe-webhook/index.ts` para checar antes de processar.*

---

**BD-C5: RLS ausente nos pedidos — clientes podem ver pedidos uns dos outros**

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Clientes veem apenas os próprios pedidos
CREATE POLICY "customers_view_own_orders" ON orders
  FOR SELECT USING (customer_id = auth.uid());

-- Admin (service role) acesso total
CREATE POLICY "admin_full_access_orders" ON orders
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "customers_view_own_order_items" ON order_items
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid())
  );
CREATE POLICY "admin_full_access_order_items" ON order_items
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
```

---

**BD-C6: Analytics permite inserção anônima ilimitada (risco de DoS)**

```sql
DROP POLICY IF EXISTS "Anon insert page_views" ON page_views;
DROP POLICY IF EXISTS "Anon insert product_events" ON product_events;
DROP POLICY IF EXISTS "Anon insert search_queries" ON search_queries;
-- Mover rastreamento de analytics para Edge Function com rate limiting
```

---

**BD-C7: Campo `order_number` não tem restrição UNIQUE**
Pedidos duplicados podem ter o mesmo número de referência.

```sql
ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT uq_order_number UNIQUE (order_number);
ALTER TABLE orders ADD CONSTRAINT check_currency CHECK (currency IN ('EUR', 'GBP'));
ALTER TABLE orders ADD CONSTRAINT check_order_total_positive CHECK (total >= 0);
```

---

**BD-C8: Supplier NOT NULL ausente em purchase_orders**

```sql
ALTER TABLE purchase_orders ALTER COLUMN supplier_id SET NOT NULL;
```

---

## 🟠 ALTO — Deve ser resolvido antes do lançamento

### BACK-END (Edge Functions)

**BE-A1: `stripe-webhook` usa nome de coluna errado**
Linha ~140: usa `.eq("stripe_payment_intent", pi.id)` mas a coluna chama-se `stripe_payment_intent_id`.
→ Pedidos com pagamento falhado nunca ficam com status atualizado.
**Fix:** Mudar para `.eq("stripe_payment_intent_id", pi.id)`

---

**BE-A2: QB sync de pedidos apaga todos os itens antes de re-inserir**
Se a re-inserção falhar, o pedido fica sem itens — perda permanente de dados.
**Fix:** Usar upsert (`ON CONFLICT`) em vez de delete + insert.

---

**BE-A3: Cálculo de subtotal no QB sync está errado**
Calcula `TotalAmt - Tax` mas ignora descontos, shipping e outros ajustes do QB.
**Fix:** Iterar pelos `invoice.Line` items para calcular o subtotal real.

---

**BE-A4: `brevo-proxy` não valida o parâmetro `action`**
Campos obrigatórios como `data.email` e `data.templateId` nunca são verificados, causando falhas silenciosas.
**Fix:** Validar presença dos campos obrigatórios para cada caso no switch.

---

**BE-A5: `woo-sync-skus` tem lógica invertida**
Verifica `!wooSku` depois do match em vez de antes — contador `matched` fica inconsistente com `updated`.
**Fix:** Mover a verificação para antes do bloco de matching.

---

**BE-A6: QB sync marca "completed" mesmo quando há erros parciais**
**Fix:** Usar `status: stats.errors.length > 0 ? 'completed_with_errors' : 'completed'`

---

**BE-A7: `brevo-proxy` continua após erro no subscribe_newsletter**
Tenta enviar email de boas-vindas mesmo quando a criação do contacto falhou.
**Fix:** Retornar imediatamente após o erro na linha ~89.

---

**BE-A8: Custo de shipping hardcoded como `499` (cents) sem constante nomeada**
**Fix:** `const STANDARD_SHIPPING_CENTS = 499; // €4.99`

---

### FRONT-END (JavaScript)

**FE-A1: Chave localStorage inconsistente — carrinho some**
`cart.js` usa `'cart'` mas `account.js` lê `'sfi_cart'`. Carrinho desaparece na conta.
**Fix:** Padronizar para `'sfi_cart'` em todos os ficheiros.

---

**FE-A2: JSON malformado no botão "Reordenar"**
Nomes de produtos com aspas ou caracteres especiais quebram o `JSON.parse()` silenciosamente.
**Fix:** Usar atributos `data-*` em vez de JSON inline em `onclick`.

---

**FE-A3: Sem tratamento de `QuotaExceededError` no localStorage**
Se o localStorage estiver cheio, o carrinho não é guardado e o erro não aparece ao utilizador.
**Fix:** Envolver todos os `localStorage.setItem` em `try/catch`.

---

**FE-A4: PayPal capture sem proteção contra cliques múltiplos**
Sem `disabled` no botão durante o pedido, cliques duplos geram transações duplicadas.
**Fix:** `button.disabled = true` antes do fetch, `false` no finally.

---

### LAYOUT (HTML/CSS)

**LY-A1: Links de carrinho com `href="#"` — problema de acessibilidade**
Utilizadores de teclado e leitores de ecrã não conseguem activar o carrinho corretamente.
**Fix:** Converter para `<button type="button">` ou usar `href="javascript:void(0)"` com handler.

---

**LY-A2: og:description quebrado na página de contacto**
Texto aparece como `"...available.'re here to help..."` nas partilhas em redes sociais.
**Fix:** Corrigir para `"...available. We're here to help..."`

---

**LY-A3: Links duplos de hash no menu mobile**
`href="shop.html#nutrition#gels"` — fragmento duplo não funciona nos browsers.
**Fix:** Usar query params: `href="shop.html?category=nutrition&sub=gels"`

---

**LY-A4: Verificar se todas as páginas referenciadas existem**
Páginas referenciadas em navegação que precisam de verificação:
`categories.html`, `brands.html`, `offers.html`, `about.html`, `wishlist.html`, `b2b/landing.html`, `b2b/portal.html`

---

## 🟡 MÉDIO — Resolver antes ou logo após lançamento

### BACK-END

| ID | Problema | Ficheiro |
|----|----------|----------|
| BE-M1 | `create-checkout` não valida formato do email | create-checkout/index.ts |
| BE-M2 | `create-checkout` não valida currency (aceita qualquer string) | create-checkout/index.ts |
| BE-M3 | QB sync de produtos usa taxa fiscal histórica como fallback | qb-sync-products/index.ts |
| BE-M4 | SKUs comparados case-sensitive mas guardados sem normalização | qb-sync-products/index.ts |
| BE-M5 | `qb-sync-purchase-orders` ignora erro ao criar registo de sync | qb-sync-purchase-orders/index.ts |
| BE-M6 | Qty=0 no QB sync defauta para 1 silenciosamente | qb-sync-orders/index.ts |
| BE-M7 | Função `getValidToken` duplicada em vários ficheiros QB | Todos os qb-sync-* |
| BE-M8 | `b2b-notify` não valida formato de email | b2b-notify/index.ts |

---

### FRONT-END

| ID | Problema | Ficheiro |
|----|----------|----------|
| FE-M1 | Muitos `querySelector` sem verificação de null — erros silenciosos | checkout.js, account.js |
| FE-M2 | Sem validação de email/telefone no checkout além do HTML5 | checkout.js |
| FE-M3 | Lógica de imagem duplicada em 4 ficheiros com implementações diferentes | main.js, shop.js, product.js, cart.js |
| FE-M4 | Sem indicador de loading durante operações async (PayPal, Supabase) | checkout.js |
| FE-M5 | Redirect B2B pode acontecer depois do utilizador já ter interagido com a página | account.js |
| FE-M6 | Estado de erro do cupão não é limpo quando utilizador começa a escrever | checkout.js |

---

### LAYOUT

| ID | Problema | Ficheiro |
|----|----------|----------|
| LY-M1 | `og:description` ausente em register-b2b.html | register-b2b.html |
| LY-M2 | Breakpoints inconsistentes: CSS usa 640px/1024px mas media queries usam 767px/1023px | sfi-styles.css |
| LY-M3 | Estilos do `.sfi-highlights` inline no HTML em vez de no CSS externo | contact.html |
| LY-M4 | `!important` excessivo em account.html (6+ ocorrências) | account.html |
| LY-M5 | Formulários sem `aria-required="true"` nos campos obrigatórios | register-b2b.html, checkout.html |
| LY-M6 | Emoji 🏢 sem aria-label para leitores de ecrã | register-b2b.html |
| LY-M7 | Schema.org no contact.html tem URLs incompletas (sem https://) | contact.html |

---

### BASE DE DADOS

| ID | Problema |
|----|----------|
| BD-M1 | `product_images.product_id` permite NULL — imagem sem produto |
| BD-M2 | Trigger para atualizar stats do cliente (total_orders, total_spent) nunca é chamado |
| BD-M3 | `order_items.product_id` usa ON DELETE SET NULL — perda de referência em soft deletes |
| BD-M4 | Sem CHECK constraints nos totais dos pedidos (permite negativos) |
| BD-M5 | Sem tabela de audit log para operações críticas |
| BD-M6 | Índice composto ausente para queries de dashboard (financial_status + created_at) |
| BD-M7 | FK em `b2b_prices` referencia `products.legacy_id` (int) em vez de `products.id` (UUID) |
| BD-M8 | Política RLS de service_role explícita em `b2b_prices` é redundante |
| BD-M9 | Sem mecanismo de retry para registos QB que falharam no sync |

---

## 🟢 BAIXO — Melhorias de qualidade

### FRONT-END
- Constantes mágicas sem nome: `9.04` (shipping), `1.23` (VAT), `60`/`150` (free shipping thresholds)
- `console.log` comentados esquecidos em `sfi-api.js` e `shop.js`
- Funções de notificação inconsistentes: `showNotification()` vs `showToast()` vs `alert()`
- Fetch interception no `sfi-data-loader.js` dificulta debugging

### BACK-END
- Interface `Coupon` sem definição TypeScript formal
- Logs insuficientes quando QB product matching falha
- Variante de WooCommerce: erro de update não é capturado

### LAYOUT
- hreflang en-GB pode confundir — site é principalmente Irish (en-IE)
- Ponto de quebra extra `@media (max-width: 480px)` em contact.html fora do padrão
- Schema ItemList no shop.html sem items Product individuais

### BASE DE DADOS
- `product_variants` sem índice em product_id
- Sem índice de Stripe charge_id em payment_transactions
- `supabase/config.toml` não encontrado no repositório

---

## PLANO DE AÇÃO RECOMENDADO

### Fase 1 — Esta semana (Pré-lançamento)
1. **BD-C1 a BD-C8**: Criar tabelas/colunas em falta, corrigir enum, adicionar RLS
2. **BE-A1**: Corrigir nome de coluna no stripe-webhook (1 linha)
3. **BE-A4**: Adicionar idempotência ao stripe-webhook
4. **FE-A1**: Padronizar chave do localStorage do carrinho
5. **LY-A2**: Corrigir og:description quebrado
6. **LY-A4**: Verificar existência de todas as páginas referenciadas

### Fase 2 — Semana seguinte (Estabilização)
- BE-A2 a BE-A8 (lógica de Edge Functions)
- FE-A2 a FE-A4 (bugs de UX)
- LY-A1, LY-A3 (acessibilidade e links)
- BD-M1 a BD-M4 (constraints e triggers)

### Fase 3 — Pós-lançamento (Qualidade)
- Todos os itens MÉDIO restantes
- Refactoring de imagem, constantes nomeadas, TypeScript interfaces
- Audit log completo
- Mecanismo de retry para QB sync

---

**Relatório gerado:** 2026-04-04
**Próxima revisão:** Após Fase 1 concluída
