/**
 * Exporta todos os produtos ATIVOS do Supabase (tabela products)
 * com: id, name, slug, sku.
 *
 * Uso: node scripts/export-active-products-skus.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connect } = require('./supabase-connection');

async function main() {
  const result = await connect();
  if (result.error) {
    console.error('Erro de conexão:', result.error);
    if (result.hint) console.error(result.hint);
    process.exit(1);
  }
  const client = result.client;

  try {
    const sql = `
      SELECT id, name, slug, sku
      FROM products
      WHERE is_active = true
      ORDER BY name;
    `;
    const res = await client.query(sql);
    const rows = res.rows || [];

    console.log('id,name,slug,sku');
    for (const r of rows) {
      const name = (r.name || '').replace(/"/g, '""');
      const slug = (r.slug || '').replace(/"/g, '""');
      const sku = (r.sku || '').replace(/"/g, '""');
      console.log(`"${r.id}","${name}","${slug}","${sku}"`);
    }
  } catch (err) {
    console.error('Erro ao exportar produtos ativos:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

