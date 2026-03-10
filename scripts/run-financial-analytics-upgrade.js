/**
 * Aplica o SQL de Financial Analytics no Supabase (backfill + get_financial_report + get_financial_analytics).
 * Uso: npm run supabase:financial-analytics
 * Conexão via scripts/supabase-connection.js (sem browser).
 */
const fs = require('fs');
const path = require('path');
const { connect } = require('./supabase-connection');

async function main() {
  const result = await connect();
  if (result.error) {
    console.error('Erro: não foi possível ligar ao Supabase.', result.error);
    if (result.hint) console.error('\n' + result.hint);
    console.error('\nPara conexão direta sem browser:');
    console.error('  • Adicione SUPABASE_ACCESS_TOKEN no .env (criar em https://supabase.com/dashboard/account/tokens)');
    console.error('  • ou SUPABASE_DB_POOLER_URL (Dashboard → Connect → Session pooler)');
    process.exit(1);
  }

  const { client, method } = result;
  const sqlPath = path.join(__dirname, '../docs/supabase-upgrade/09-financial-analytics.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await client.query(sql);
    console.log('Sucesso: SQL aplicado (backfill + get_financial_report + get_financial_analytics).');
    console.log('Conexão usada:', method);
  } catch (err) {
    console.error('Erro ao executar SQL:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
