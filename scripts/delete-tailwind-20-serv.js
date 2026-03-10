/**
 * Desativa o produto "Tailwind New Recover Mix 20 Serv" no Supabase,
 * mantendo o histórico (não dá DELETE, apenas is_active = false e stock = 0).
 *
 * Uso: node scripts/delete-tailwind-20-serv.js
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
    const targetName = 'Tailwind New Recover Mix 20 Serv';
    const targetSlug = 'tailwind-new-recover-mix-20-serv';

    console.log('Procurando produto para desativar...');
    const res = await client.query(
      `UPDATE products
         SET is_active = false,
             stock_quantity = 0,
             updated_at = now()
       WHERE slug = $1
          OR name = $2
       RETURNING id, name, slug, is_active, stock_quantity`,
      [targetSlug, targetName]
    );

    if (res.rows.length === 0) {
      console.log('Nenhum produto encontrado com esse nome/slug.');
    } else {
      console.log('Produto desativado no Supabase:');
      res.rows.forEach(r => {
        console.log(`- id=${r.id} | name=${r.name} | slug=${r.slug} | is_active=${r.is_active} | stock=${r.stock_quantity}`);
      });
    }
  } catch (err) {
    console.error('Erro ao desativar produto:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

