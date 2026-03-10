/**
 * Testa a conexão ao Supabase (SELECT 1). Uso: npm run supabase:test-connection
 */
const { connect } = require('./supabase-connection');

async function main() {
  const result = await connect();
  if (result.error) {
    console.error('Conexão falhou:', result.error);
    if (result.hint) console.error('\n' + result.hint);
    process.exit(1);
  }
  const { client, method } = result;
  try {
    const res = await client.query('SELECT 1 AS ok');
    console.log('Conexão OK (método:', method + ').', res.rows?.[0]?.ok === 1 ? 'SELECT 1 = 1' : '');
  } catch (e) {
    console.error('Erro ao executar SELECT 1:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
