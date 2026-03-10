/**
 * Separa as variantes cafeinadas do Tailwind Endurance Fuel num produto único
 * "Tailwind Endurance Fuel Caffeinated" com as suas variantes (sabores).
 * Uso: node scripts/tailwind-endurance-caffeinated-as-product.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');
const { connect } = require('./supabase-connection');

async function main() {
  const result = await connect();
  if (result.error) {
    console.error('Erro de conexão:', result.error);
    if (result.hint) console.error(result.hint);
    process.exit(1);
  }

  const client = result.client;
  console.log('Conectado via', result.method);

  try {
    // 1) Produto Tailwind Endurance Fuel
    const prodRes = await client.query(
      `SELECT id, sku, name, slug, description, short_description, price_eur, price_gbp,
              cost_price_eur, compare_at_price_eur, compare_at_price_gbp,
              brand_id, category_id, subcategory_id, image_url, low_stock_threshold
       FROM products WHERE slug = 'tailwind-endurance-fuel' AND is_active = true LIMIT 1`
    );
    if (prodRes.rows.length === 0) {
      console.error('Produto Tailwind Endurance Fuel não encontrado.');
      process.exit(1);
    }
    const parent = prodRes.rows[0];

    // 2) Variantes cafeinadas (label contém "caffeinated" / "cafeinado")
    const varRes = await client.query(
      `SELECT pv.id, pv.label, pv.price, pv.stock, pv.variant_type_id, pv.sort_order
       FROM product_variants pv
       WHERE pv.product_id = $1 AND pv.is_active = true
         AND (pv.label ILIKE '%caffeinated%' OR pv.label ILIKE '%cafeinado%')`,
      [parent.id]
    );
    const caffeinatedVariants = varRes.rows || [];
    if (caffeinatedVariants.length === 0) {
      console.log('Nenhuma variante cafeinada encontrada no Tailwind Endurance Fuel.');
      process.exit(0);
    }

    // 3) Criar produto "Tailwind Endurance Fuel Caffeinated"
    const newProductId = crypto.randomUUID();
    const newSku = 'SFI-TW-EF-CAF';
    const newSlug = 'tailwind-endurance-fuel-caffeinated';
    const newName = 'Tailwind Endurance Fuel Caffeinated';

    await client.query(
      `INSERT INTO products (
        id, sku, name, slug, description, short_description,
        price_eur, price_gbp, cost_price_eur, compare_at_price_eur, compare_at_price_gbp,
        brand_id, category_id, subcategory_id, image_url,
        stock_quantity, track_inventory, low_stock_threshold, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, true, $16, true)`,
      [
        newProductId,
        newSku,
        newName,
        newSlug,
        parent.description,
        parent.short_description || 'Endurance fuel with caffeine, multiple flavors.',
        parent.price_eur,
        parent.price_gbp,
        parent.cost_price_eur,
        parent.compare_at_price_eur,
        parent.compare_at_price_gbp,
        parent.brand_id,
        parent.category_id,
        parent.subcategory_id,
        parent.image_url,
        parent.low_stock_threshold ?? 5,
      ]
    );
    console.log('Criado produto:', newName, 'SKU', newSku);

    // 4) Criar variantes no novo produto (mesmo label, price, stock) e desativar nas originais
    for (let i = 0; i < caffeinatedVariants.length; i++) {
      const v = caffeinatedVariants[i];
      await client.query(
        `INSERT INTO product_variants (product_id, variant_type_id, label, price, stock, is_default, is_active, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
        [
          newProductId,
          v.variant_type_id,
          v.label,
          v.price,
          v.stock ?? 0,
          i === 0,
          i,
        ]
      );
      console.log('  Variante criada:', v.label, 'stock', v.stock ?? 0);

      await client.query(
        'UPDATE product_variants SET is_active = false, stock = 0, updated_at = now() WHERE id = $1',
        [v.id]
      );
    }
    console.log('Variantes cafeinadas removidas do Tailwind Endurance Fuel original.');
    console.log('Concluído.');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
