# Preços B2B: WooCommerce, QuickBooks e Supabase

Este documento resume **onde** o preço de venda B2B/wholesale existe no **WooCommerce** e no **QuickBooks**, e **o que o Supabase sincroniza** atualmente. Muitos produtos ficam sem preço B2B no Supabase porque essa informação não é puxada automaticamente das fontes.

---

## 1. Supabase (produtos)

- **Campo:** `products.wholesale_price_eur`
- **Uso:** Preço de venda B2B em EUR. No admin e no portal B2B, quando existe e é &lt; preço retail, é usado para clientes wholesale.
- **Situação:** Hoje é preenchido manualmente no admin ou por import. **Não há sync automático** a partir do WooCommerce nem do QuickBooks para este campo.

---

## 2. WooCommerce

### Onde pode estar o preço B2B

- **Meta / plugins:** O preço wholesale costuma vir de plugins (ex.: Wholesale Suite, Wholesale for WooCommerce, B2B for WooCommerce).
- **Meta keys comuns (dependem do plugin):**
  - Wholesale Suite: muitas vezes `_wholesale_price`, `_wwp_wholesale_price`, ou por role em meta do produto.
  - B2B oficial: preços por “customer type” ou tabelas/opções do plugin.
- **REST API:** Produtos têm `meta_data` (array de `{ key, value }`). O preço B2B costuma estar em alguma dessas keys. Para saber qual usar, é preciso ver qual plugin de wholesale está ativo no site e consultar a documentação desse plugin.

### O que o projeto faz hoje

- Existe **sync de pedidos** do WooCommerce (`woo-sync-orders`), não de produtos.
- O admin diz “Wholesale price from WooCommerce”, mas **não há função** que leia produtos do WooCommerce e atualize `wholesale_price_eur` no Supabase.
- Conclusão: **preços B2B do WooCommerce não são sincronizados** para o Supabase hoje.

### Como passar a ter

1. Confirmar no WooCommerce qual plugin de B2B/wholesale está em uso e qual **meta key** guarda o preço wholesale por produto (e por variação, se for o caso).
2. Criar uma Edge Function (ou job) que:
   - Chame a REST API do WooCommerce (ex.: `GET /wp-json/wc/v3/products` e variações).
   - Para cada produto (e variação), leia o `meta_data` e encontre a key de wholesale.
   - Faça o match com `products` no Supabase (por SKU, `legacy_id` ou outro identificador).
   - Atualize `wholesale_price_eur` (e, se existir, um campo de preço por variante).

---

## 3. QuickBooks

### Onde está o preço de venda

- **Item:** Na API do QuickBooks Online, cada **Item** tem:
  - **UnitPrice:** preço de venda “padrão” (um valor por item).
  - **PurchaseCost:** custo de compra (este **já é sincronizado** para `cost_price_eur` no Supabase pelo `qb-sync-products`).
- **Price Levels:** No QuickBooks **Desktop** (Premier/Enterprise) existem “Price Levels” (ex.: Retail, Wholesale, Distributor), com preços diferentes por item. No **QuickBooks Online** a API REST **não expõe** Price Levels da mesma forma; na prática costuma haver só um preço de venda por item (UnitPrice).

### O que o projeto faz hoje

- **qb-sync-products** atualiza no Supabase:
  - `cost_price_eur` (PurchaseCost)
  - `qb_item_id`, vendor, barcode, tax codes, etc.
- **Não** atualiza:
  - Preço de venda retail (`price_eur`)
  - Preço B2B/wholesale (`wholesale_price_eur`)

Ou seja: mesmo o **UnitPrice** (preço de venda no QB) **não é sincronizado** para o Supabase. Se no QuickBooks existir só um preço por item, esse seria o “preço de venda”; se quiserem usar esse valor como B2B no Supabase, seria preciso mapear para `wholesale_price_eur` ou para `price_eur`, conforme a regra de negócio.

### Como passar a ter

1. **Só um preço no QB (UnitPrice):**  
   No `qb-sync-products`, ao fazer o match do Item com o produto no Supabase, ler `item.UnitPrice` e:
   - atualizar `price_eur` (retail), ou  
   - atualizar `wholesale_price_eur` (se esse for o único preço e for considerado B2B), ou  
   - atualizar os dois com o mesmo valor, conforme definição.

2. **QuickBooks Desktop com Price Levels:**  
   Se usarem QB Desktop e tiverem um “Price Level” específico para B2B/wholesale, seria necessário usar a API/connector do QB Desktop (ex.: QBXML) para ler esses níveis e, num script ou função, preencher `wholesale_price_eur` no Supabase com o preço do nível B2B.

---

## 4. Resumo: produtos com preço B2B diferente que “não temos”

| Fonte        | Tem preço B2B? | Sincronizado para Supabase? | Observação |
|-------------|----------------|-----------------------------|------------|
| **WooCommerce** | Sim (via meta/plugin) | **Não** | Precisamos de sync de produtos + meta wholesale |
| **QuickBooks**  | UnitPrice = 1 preço; Price Levels só QB Desktop | **Não** | Podemos sync UnitPrice; Price Level exige QB Desktop |

Os produtos que “têm preço diferente no WooCommerce ou no QuickBooks e a gente não tem” são, na prática:
- **Todos** os que dependem do preço B2B do WooCommerce (até existir sync de produtos + meta).
- **Todos** os que dependem do preço de venda (e eventual B2B) do QuickBooks (até o sync passar a gravar UnitPrice e, se for o caso, preço do Price Level no Supabase).

No admin, em **Stock Management**, o relatório **“Produtos sem preço B2B”** lista os produtos ativos em que `wholesale_price_eur` está vazio ou zero — são os que precisam ser preenchidos manualmente ou via novo sync (WooCommerce e/ou QuickBooks).
