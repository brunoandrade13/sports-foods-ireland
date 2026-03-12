/**
 * Corrige SKUs que começam com "SFI" no Supabase usando o SKU correto do WooCommerce.
 *
 * Lógica:
 *  - Busca todos os produtos ativos no Supabase com sku ILIKE 'SFI%'.
 *  - Para cada produto, faz uma busca no WooCommerce por nome (parâmetro ?search=).
 *  - Tenta encontrar o melhor match por nome normalizado.
 *  - Se encontrar um produto Woo com SKU não vazio e diferente do atual,
 *    atualiza products.sku no Supabase para o SKU do Woo.
 *
 * Uso: node scripts/fix-sfi-skus-from-woo.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https = require('https');
const { connect } = require('./supabase-connection');

const WOO_URL = (process.env.WOOCOMMERCE_URL || process.env.WOO_URL || '').replace(/\/$/, '');
const WOO_CK = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOO_CK || '';
const WOO_CS = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOO_CS || '';

if (!WOO_URL || !WOO_CK || !WOO_CS) {
  console.error('Erro: variáveis do WooCommerce não configuradas (WOOCOMMERCE_URL / CONSUMER_KEY / CONSUMER_SECRET).');
  process.exit(1);
}

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, ' ')     // só letras/números
    .trim();
}

function wooRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, WOO_URL);
    const auth = Buffer.from(`${WOO_CK}:${WOO_CS}`).toString('base64');
    const options = {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    };
    const req = https.request(url, options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Woo API ${res.statusCode}: ${body.slice(0, 200)}`));
        }
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const result = await connect();
  if (result.error) {
    console.error('Erro de conexão Supabase:', result.error);
    if (result.hint) console.error(result.hint);
    process.exit(1);
  }
  const client = result.client;

  try {
    console.log('Carregando produtos ativos com SKU iniciando em "SFI"...');
    const { rows } = await client.query(
      `SELECT id, name, slug, sku
       FROM products
       WHERE is_active = true
         AND sku ILIKE 'SFI%' 
       ORDER BY name`
    );
    console.log(`Encontrados ${rows.length} produtos com SKU SFI.`);

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const p of rows) {
      const currentSku = p.sku || '';
      const name = p.name || '';
      const search = encodeURIComponent(name);
      const path = `/wp-json/wc/v3/products?per_page=20&search=${search}`;

      console.log(`\nProcurando no Woo: "${name}" (sku atual: ${currentSku})`);

      let list;
      try {
        list = await wooRequest(path);
      } catch (e) {
        console.error(`  Erro ao consultar Woo para "${name}":`, e.message);
        skipped++;
        continue;
      }

      if (!Array.isArray(list) || list.length === 0) {
        console.log('  Nenhum produto encontrado no Woo para esse nome.');
        notFound++;
        continue;
      }

      const targetNorm = normalize(name);
      let best = null;
      let bestScore = -1;

      list.forEach(prod => {
        const wooName = prod.name || '';
        const wooNorm = normalize(wooName);
        let score = 0;
        if (wooNorm === targetNorm) score = 3;
        else if (wooNorm.includes(targetNorm) || targetNorm.includes(wooNorm)) score = 2;
        else if (wooNorm && targetNorm && wooNorm.split(' ').some(w => targetNorm.includes(w))) score = 1;

        if (score > bestScore) {
          bestScore = score;
          best = prod;
        }
      });

      if (!best || bestScore <= 0) {
        console.log('  Nenhum match de nome forte encontrado entre candidatos do Woo.');
        notFound++;
        continue;
      }

      const wooSku = (best.sku || '').trim();
      const wooName = best.name || '';
      console.log(`  Melhor match Woo: "${wooName}" (id=${best.id}, sku="${wooSku}", score=${bestScore})`);

      if (!wooSku) {
        console.log('  WooCommerce SKU vazio, nada para copiar.');
        skipped++;
        continue;
      }

      if (wooSku === currentSku) {
        console.log('  SKU já igual ao do Woo, pulando.');
        skipped++;
        continue;
      }

      try {
        await client.query(
          `UPDATE products
           SET sku = $1,
               updated_at = now()
           WHERE id = $2`,
          [wooSku, p.id]
        );
        updated++;
        console.log(`  ✅ Atualizado SKU de "${currentSku}" para "${wooSku}".`);
      } catch (e) {
        console.error('  Erro ao atualizar SKU no Supabase:', e.message);
        skipped++;
      }
    }

    console.log('\nResumo:');
    console.log('  Atualizados:', updated);
    console.log('  Ignorados (sem alteração ou erro leve):', skipped);
    console.log('  Sem match no Woo:', notFound);
  } catch (err) {
    console.error('Erro geral:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

