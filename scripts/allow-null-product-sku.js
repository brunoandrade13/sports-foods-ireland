/**
 * Remove a restrição NOT NULL da coluna products.sku no Supabase,
 * para permitir produtos sem SKU (quando apenas as variantes têm SKU).
 *
 * Uso:
 *   node scripts/allow-null-product-sku.js
 *
 * Requer:
 *   - .env configurado para conexão (SUPABASE_DB_POOLER_URL ou SUPABASE_DB_URL + SUPABASE_ACCESS_TOKEN)
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
    console.log('Verificando definição atual de products.sku...');
    const col = await client.query(
      `SELECT is_nullable
       FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = 'sku'`
    );
    console.log('Antes:', col.rows[0]);

    console.log('Executando: ALTER TABLE products ALTER COLUMN sku DROP NOT NULL;');
    await client.query('ALTER TABLE products ALTER COLUMN sku DROP NOT NULL;');

    const after = await client.query(
      `SELECT is_nullable
       FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = 'sku'`
    );
    console.log('Depois:', after.rows[0]);

    console.log('✅ Coluna products.sku agora permite valor NULL.');
  } catch (e) {
    console.error('Erro ao alterar coluna products.sku:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

