/**
 * Reassocia os reviews dos produtos Tailwind antigos (desativados) aos novos produtos
 * unificados e atualiza rating/review_count nos produtos.
 * Uso: node scripts/tailwind-reviews-to-new-products.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connect } = require('./supabase-connection');

function isCaffeinated(name) {
  return /caffeinated|cafeinado/i.test(name);
}
function is20Serv(name) {
  return /20\s*serv/i.test(name);
}

async function main() {
  const result = await connect();
  if (result.error) {
    console.error('Erro de conexão:', result.error);
    if (result.hint) console.error(result.hint);
    process.exit(1);
  }

  const client = result.client;
  console.log('Conectado via', result.method);

  try {
    // 1) IDs dos novos produtos (ativos)
    const newProducts = await client.query(
      `SELECT id, slug, name FROM products WHERE is_active = true AND slug IN (
        'tailwind-endurance-fuel',
        'tailwind-endurance-fuel-caffeinated',
        'tailwind-new-recover-mix',
        'tailwind-new-recover-mix-20-serv'
      )`
    );
    const bySlug = {};
    (newProducts.rows || []).forEach((p) => { bySlug[p.slug] = p; });
    const idEndurance = bySlug['tailwind-endurance-fuel']?.id;
    const idEnduranceCaf = bySlug['tailwind-endurance-fuel-caffeinated']?.id;
    const idRecoverMix = bySlug['tailwind-new-recover-mix']?.id;
    const idRecover20 = bySlug['tailwind-new-recover-mix-20-serv']?.id;

    if (!idEndurance && !idEnduranceCaf && !idRecoverMix && !idRecover20) {
      console.error('Nenhum dos novos produtos Tailwind encontrado.');
      process.exit(1);
    }

    // 2) Produtos antigos Tailwind (desativados) que tinham Endurance Fuel ou Recover/Recovery
    const brandRes = await client.query(
      "SELECT id FROM brands WHERE name ILIKE '%Tailwind%' LIMIT 1"
    );
    if (brandRes.rows.length === 0) {
      console.error('Marca Tailwind não encontrada.');
      process.exit(1);
    }
    const brandId = brandRes.rows[0].id;

    const oldRes = await client.query(
      `SELECT id, name FROM products
       WHERE brand_id = $1 AND is_active = false
         AND (name ILIKE '%Endurance Fuel%' OR name ILIKE '%Recover%' OR name ILIKE '%Recovery%')`,
      [brandId]
    );
    const oldProducts = oldRes.rows || [];

    let totalMoved = 0;

    for (const old of oldProducts) {
      let newId = null;
      if (old.name.includes('Endurance Fuel')) {
        newId = isCaffeinated(old.name) ? idEnduranceCaf : idEndurance;
      } else if (old.name.includes('Recover') || old.name.includes('Recovery')) {
        newId = is20Serv(old.name) ? idRecover20 : idRecoverMix;
      }
      if (!newId) continue;

      const up = await client.query(
        'UPDATE reviews SET product_id = $1, updated_at = now() WHERE product_id = $2 RETURNING id',
        [newId, old.id]
      );
      const n = up.rowCount || 0;
      if (n > 0) {
        console.log(`  ${old.name} -> ${n} review(s) movidos`);
        totalMoved += n;
      }
    }

    console.log('Total de reviews reassociados:', totalMoved);

    // 3) Atualizar rating e review_count nos produtos (caso a tabela tenha essas colunas)
    const productIds = [idEndurance, idEnduranceCaf, idRecoverMix, idRecover20].filter(Boolean);
    for (const pid of productIds) {
      const hasCols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'products' AND column_name IN ('rating', 'review_count')
      `);
      if (hasCols.rows.length < 2) break;

      await client.query(
        `UPDATE products SET
          rating = (SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0) FROM reviews WHERE product_id = $1 AND review_status = 'approved'),
          review_count = (SELECT COUNT(*)::int FROM reviews WHERE product_id = $1 AND review_status = 'approved')
         WHERE id = $1`,
        [pid]
      );
    }
    console.log('Rating e review_count atualizados nos produtos.');

    // 4) Zerar rating/review_count nos produtos antigos (opcional)
    for (const old of oldProducts) {
      await client.query(
        `UPDATE products SET rating = 0, review_count = 0 WHERE id = $1`,
        [old.id]
      ).catch(() => {});
    }

    console.log('Concluído.');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
