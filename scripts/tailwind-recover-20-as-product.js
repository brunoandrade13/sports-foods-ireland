/**
 * Separa a variante "20 Serv" do Tailwind New Recover Mix como produto único.
 * Uso: node scripts/tailwind-recover-20-as-product.js
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
    // 1) Produto Tailwind New Recover Mix
    const prodRes = await client.query(
      `SELECT id, sku, name, slug, description, short_description, price_eur, price_gbp,
              cost_price_eur, compare_at_price_eur, compare_at_price_gbp,
              brand_id, category_id, subcategory_id, image_url, low_stock_threshold
       FROM products WHERE slug = 'tailwind-new-recover-mix' AND is_active = true LIMIT 1`
    );
    if (prodRes.rows.length === 0) {
      console.error('Produto Tailwind New Recover Mix não encontrado.');
      process.exit(1);
    }
    const parent = prodRes.rows[0];

    // 2) Variante "20 Serv"
    const varRes = await client.query(
      `SELECT id, label, price, stock FROM product_variants
       WHERE product_id = $1 AND (label ILIKE '%20%Serv%' OR label = '20 Serv') AND is_active = true LIMIT 1`,
      [parent.id]
    );
    if (varRes.rows.length === 0) {
      console.error('Variante "20 Serv" não encontrada no Tailwind New Recover Mix.');
      process.exit(1);
    }
    const variant = varRes.rows[0];
    const stock = Number(variant.stock) || 0;
    const priceEur = variant.price != null ? Number(variant.price) : parent.price_eur;
    const priceGbp = parent.price_gbp;

    // 3) Criar produto único "Tailwind New Recover Mix 20 Serv"
    const newId = crypto.randomUUID();
    const newSku = 'SFI-TW-RM-20';
    const newSlug = 'tailwind-new-recover-mix-20-serv';
    const newName = 'Tailwind New Recover Mix 20 Serv';

    await client.query(
      `INSERT INTO products (
        id, sku, name, slug, description, short_description,
        price_eur, price_gbp, cost_price_eur, compare_at_price_eur, compare_at_price_gbp,
        brand_id, category_id, subcategory_id, image_url,
        stock_quantity, track_inventory, low_stock_threshold, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true, $17, true)`,
      [
        newId,
        newSku,
        newName,
        newSlug,
        parent.description,
        parent.short_description || 'Recovery mix 20 servings.',
        priceEur,
        priceGbp,
        parent.cost_price_eur,
        parent.compare_at_price_eur,
        parent.compare_at_price_gbp,
        parent.brand_id,
        parent.category_id,
        parent.subcategory_id,
        parent.image_url,
        stock,
        parent.low_stock_threshold ?? 5,
      ]
    );
    console.log('Criado produto único:', newName, 'SKU', newSku, 'stock', stock);

    // 4) Remover variante "20 Serv" (desativar)
    await client.query(
      'UPDATE product_variants SET is_active = false, stock = 0, updated_at = now() WHERE id = $1',
      [variant.id]
    );
    console.log('Variante "20 Serv" removida do Tailwind New Recover Mix.');

    console.log('Concluído.');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
