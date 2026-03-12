/**
 * Remove SKUs que começam com "SFI" do Supabase
 * depois de já tentar corrigi-los via WooCommerce.
 *
 * Lógica:
 *  - Conta quantos produtos (ativos e inativos) ainda têm sku ILIKE 'SFI%'.
 *  - Lista alguns exemplos para conferência rápida.
 *  - Faz UPDATE products SET sku = NULL onde sku ILIKE 'SFI%'.
 *  - Mostra novamente o total restante (deve ir a zero).
 *
 * Uso:
 *   node scripts/clear-remaining-sfi-skus.js
 *
 * Requer:
 *   - .env com SUPABASE_DB_POOLER_URL ou SUPABASE_DB_URL
 *   - (opcional) SUPABASE_ACCESS_TOKEN para conexão automática
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
    console.log('🔍 Verificando produtos com SKU iniciando em "SFI"...');
    const before = await client.query(
      `SELECT id, name, sku, is_active
       FROM products
       WHERE sku ILIKE 'SFI%'
       ORDER BY is_active DESC, name
       LIMIT 50`
    );
    const countBeforeRes = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM products
       WHERE sku ILIKE 'SFI%'`
    );
    const countBefore = countBeforeRes.rows[0]?.count || 0;

    console.log(`Encontrados ${countBefore} produtos com SKU SFI (mostrando até 50):`);
    before.rows.forEach((p) => {
      console.log(` - [${p.is_active ? 'ativo ' : 'inativo'}] ${p.name} | SKU atual: ${p.sku}`);
    });

    if (!countBefore) {
      console.log('✅ Nenhum SKU iniciando com "SFI" encontrado. Nada para fazer.');
      return;
    }

    console.log('\n🧹 Limpando SKUs que começam com "SFI"... (definindo sku como string vazia "")');
    const upd = await client.query(
      `UPDATE products
       SET sku = '',
           updated_at = now()
       WHERE sku ILIKE 'SFI%'`
    );
    console.log(`UPDATE concluído. Linha(s) afetadas: ${upd.rowCount}`);

    const countAfterRes = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM products
       WHERE sku ILIKE 'SFI%'`
    );
    const countAfter = countAfterRes.rows[0]?.count || 0;

    console.log(`\n✅ SKUs "SFI" restantes após limpeza: ${countAfter}`);
    if (countAfter === 0) {
      console.log('Todos os produtos agora estão sem SKU começando com "SFI".');
    } else {
      console.warn('⚠️ Ainda restam alguns registros com SKU SFI (verifique filtros/coluna).');
    }
  } catch (err) {
    console.error('Erro geral no script:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

