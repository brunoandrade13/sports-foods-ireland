/**
 * Diagnóstico de variantes de um produto específico.
 * Uso:
 *   node scripts/debug-product-variants.js "Fitletic Mini Sports Belt"
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connect } = require('./supabase-connection');

async function main() {
  const nameSearch = process.argv[2] || '';
  if (!nameSearch) {
    console.error('Informe parte do nome do produto. Ex.: node scripts/debug-product-variants.js "Fitletic Mini Sports Belt"');
    process.exit(1);
  }

  const result = await connect();
  if (result.error) {
    console.error('Erro de conexão:', result.error);
    if (result.hint) console.error(result.hint);
    process.exit(1);
  }
  const client = result.client;

  try {
    console.log('Procurando produto com nome ILIKE %' + nameSearch + '% ...');
    const prodRes = await client.query(
      `SELECT id, name, sku, price_eur, wholesale_price_eur, category_id, brand_id
       FROM products
       WHERE name ILIKE $1
       ORDER BY is_active DESC, name
       LIMIT 5`,
      ['%' + nameSearch + '%']
    );
    if (prodRes.rows.length === 0) {
      console.log('Nenhum produto encontrado.');
      return;
    }

    for (const p of prodRes.rows) {
      console.log('\n=== Produto ===');
      console.log('id:', p.id);
      console.log('name:', p.name);
      console.log('sku:', p.sku);
      console.log('price_eur:', p.price_eur, 'wholesale_price_eur:', p.wholesale_price_eur);

      const varRes = await client.query(
        `SELECT id, product_id, label, variant_type_id, price, stock, sku, sort_order, is_default
         FROM product_variants
         WHERE product_id = $1
         ORDER BY sort_order, label`,
        [p.id]
      );
      console.log('--- Variants (' + varRes.rows.length + ') ---');
      varRes.rows.forEach(v => {
        console.log({
          id: v.id,
          label: v.label,
          price: v.price,
          stock: v.stock,
          sku: v.sku,
          sort_order: v.sort_order,
          is_default: v.is_default,
        });
      });
    }
  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    await client.end();
  }
}

main();

