/**
 * Lista produtos que ficaram sem marca / categoria / subcategoria.
 *
 * Uso:
 *   node scripts/find-products-missing-taxonomy.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connect } = require('./supabase-connection');

async function main() {
  const result = await connect();
  if (result.error) {
    console.error('Erro de conexão Supabase:', result.error);
    if (result.hint) console.error(result.hint);
    process.exit(1);
  }
  const client = result.client;

  try {
    const { rows } = await client.query(`
      SELECT
        id,
        name,
        sku,
        brand_id,
        category_id,
        subcategory_id
      FROM products
      WHERE brand_id IS NULL
         OR category_id IS NULL
         OR subcategory_id IS NULL
      ORDER BY name
      LIMIT 200
    `);

    if (!rows.length) {
      console.log('✅ Nenhum produto com marca/categoria/subcategoria faltando.');
      return;
    }

    console.log('Produtos com taxonomia incompleta (primeiros 200):');
    rows.forEach(p => {
      console.log({
        id: p.id,
        name: p.name,
        sku: p.sku,
        brand_id: p.brand_id,
        category_id: p.category_id,
        subcategory_id: p.subcategory_id,
      });
    });
  } catch (e) {
    console.error('Erro ao buscar produtos incompletos:', e.message);
  } finally {
    await client.end();
  }
}

main();

