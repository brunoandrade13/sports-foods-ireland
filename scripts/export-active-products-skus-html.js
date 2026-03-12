/**
 * Gera um HTML simples com todos os produtos ATIVOS do Supabase
 * (nome do produto + SKU), para conferência de cadastro.
 *
 * Uso: node scripts/export-active-products-skus-html.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
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
      SELECT name, sku
      FROM products
      WHERE is_active = true
      ORDER BY name;
    `;
    const res = await client.query(sql);
    const rows = res.rows || [];

    let html = '<table border="1" cellspacing="0" cellpadding="4">\n';
    html += '  <thead><tr><th>Produto</th><th>SKU</th></tr></thead>\n  <tbody>\n';
    for (const r of rows) {
      const name = (r.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const sku = (r.sku || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += `    <tr><td>${name}</td><td>${sku}</td></tr>\n`;
    }
    html += '  </tbody>\n</table>\n';

    const outPath = path.join(__dirname, '../docs/ACTIVE-PRODUCTS-SKUS.html');
    fs.writeFileSync(outPath, html, 'utf8');
    console.log('HTML gerado em:', outPath);
  } catch (err) {
    console.error('Erro ao gerar HTML de produtos ativos:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

