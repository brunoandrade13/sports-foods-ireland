/**
 * Desativa todos os produtos ICEBEiN / Icebein no Supabase,
 * para que não apareçam mais na loja (mantendo histórico).
 *
 * Uso: node scripts/deactivate-icebein.js
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
    console.log('Desativando produtos ICEBEiN / Icebein...');
    const res = await client.query(
      `UPDATE products
         SET is_active = false,
             stock_quantity = 0,
             updated_at = now()
       WHERE name ILIKE '%icebein%'
          OR slug ILIKE '%icebein%'
       RETURNING id, name, slug, is_active, stock_quantity`,
      []
    );

    if (res.rows.length === 0) {
      console.log('Nenhum produto ICEBEiN encontrado pelo nome/slug.');
    } else {
      console.log('Produtos desativados:');
      res.rows.forEach(r => {
        console.log(`- id=${r.id} | name=${r.name} | slug=${r.slug} | is_active=${r.is_active} | stock=${r.stock_quantity}`);
      });
    }
  } catch (err) {
    console.error('Erro ao desativar produtos ICEBEiN:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

