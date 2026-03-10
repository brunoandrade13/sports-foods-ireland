# Tailwind: variantes Sabor + Tamanho no Supabase

Os produtos Tailwind (Endurance Fuel, Endurance Fuel Caffeinated, New Recover Mix) foram unificados por **sabor**. Os cadastros antigos (produtos individuais) tinham **três tamanhos** por sabor (ex.: 500g, 1kg, 2kg) com preços e estoques diferentes. Este documento descreve como verificar se esses dados ainda existem no banco e como inseri-los no cadastro novo como variantes **Sabor / Tamanho**.

## 1. Verificar se os dados de tamanho ainda existem

No **Supabase → SQL Editor**, execute o ficheiro:

- `docs/supabase-upgrade/14-tailwind-variants-diagnostic.sql`

Isso lista:

- Todos os produtos Tailwind (ativos e inativos)
- Os produtos **inativos** (os que foram unificados), com nome, SKU, preço e stock
- As variantes atuais dos produtos unificados (hoje só por sabor)

Se nos inativos aparecerem nomes ou SKUs com **500g, 1kg, 2kg** (ou Small/Medium/Large, 20 Serv), esses dados podem ser migrados para variantes compostas.

## 2. Inserir variantes Sabor / Tamanho no cadastro novo

O script Node lê os produtos Tailwind **inativos**, extrai **sabor** e **tamanho** do nome/SKU, e cria/atualiza variantes no produto unificado com rótulo `"Sabor / Tamanho"` (ex.: `Mandarin / 500g`, `Chocolate / 1kg`), com o **preço** e **stock** do produto inativo.

**Requisitos:** `.env` com `SUPABASE_DB_POOLER_URL` ou `SUPABASE_DB_URL` (e opcionalmente `SUPABASE_ACCESS_TOKEN` para conexão direta).

```bash
node scripts/tailwind-add-size-variants.js
```

O script:

1. Garante que existe o tipo de variante **Flavor & Size** (`slug`: `flavor-size`).
2. Para cada produto Tailwind inativo (Endurance Fuel, Caffeinated, Recover Mix):
   - Extrai **sabor** e **tamanho** do nome e do SKU (ex.: 500g, 1kg, 2kg, Small, Medium, Large, 20 Serv).
   - Se não houver tamanho, usa **"Standard"** (ex.: `Mandarin / Standard`).
3. Para cada par (sabor, tamanho), insere ou atualiza uma linha em `product_variants` com:
   - `label` = `"Sabor / Tamanho"`
   - `price` e `stock` do produto inativo
   - `variant_type_id` = tipo **Flavor & Size**.
4. Para não duplicar na loja: desativa e zera stock das variantes **só-sabor** (tipo Flavor) quando já existir variante composta para esse sabor.

Assim, o produto unificado fica com variantes por **Sabor** e **Tamanho**, cada uma com preço e stock corretos.

## 3. Estrutura no Supabase

- **`variant_types`**: passa a existir um tipo com `slug = 'flavor-size'` (ex.: nome "Flavor & Size").
- **`product_variants`**: cada variante vendável é uma linha com:
  - `variant_type_id` = id do tipo `flavor-size`
  - `label` = `"Sabor / Tamanho"` (ex.: `Lemon / 500g`, `Chocolate / 2kg`)
  - `price`, `stock`, `product_id` como já existem

Não é necessária nova tabela: uma variante composta é uma única linha com `label` composto.

## 4. Frontend

O frontend em `js/product.js` já trata variantes com rótulo no formato `"X / Y"` (ex.: Sabor / Tamanho) em `renderCompoundVariants`: primeiro nível (ex.: sabor), segundo nível (ex.: tamanho), com stock e preço por combinação. Desde que a API devolva `product_variants` com `label` no formato `"Sabor / Tamanho"`, a seleção em cascata e o preço/stock corretos são exibidos.

## 5. Resumo

| Passo | O quê |
|-------|--------|
| 1 | Executar `14-tailwind-variants-diagnostic.sql` no Supabase para ver produtos inativos e variantes atuais |
| 2 | Executar `node scripts/tailwind-add-size-variants.js` para criar variantes Sabor/Tamanho a partir dos inativos |
| 3 | Na loja, o produto Tailwind passa a mostrar opções por Sabor e Tamanho com preços e stocks corretos |

Se no diagnóstico não aparecerem tamanhos nos nomes/SKUs dos inativos, os tamanhos podem ter estado noutra fonte (ex.: WooCommerce). Nesse caso é preciso alinhar os tamanhos (ex.: 500g, 1kg, 2kg) e, se for caso, ajustar o script para ler dessa fonte ou para criar variantes “Standard” e depois editar manualmente no admin.
