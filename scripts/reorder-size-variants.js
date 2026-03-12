/**
 * Reorganiza variantes de produtos por ordem de tamanho
 * (ex.: XS, S, M, L, XL, 500g, 1kg, 2kg, One Size, etc.).
 *
 * Lógica:
 * - Lê todas as linhas de product_variants + variant_types.
 * - Agrupa por (product_id, parent_variant_id, variant_type.slug).
 * - Para cada grupo em que as labels parecem "tamanho",
 *   recalcula o sort_order na sequência correta.
 *
 * Uso:
 *   node scripts/reorder-size-variants.js
 *
 * Requer:
 *   - .env com SUPABASE_DB_POOLER_URL ou SUPABASE_DB_URL (+ SUPABASE_ACCESS_TOKEN)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connect } = require('./supabase-connection');

function normalize(str) {
  return (str || '').toString().trim();
}

// Retorna um "rank" numérico para o tamanho; quanto menor, mais cedo aparece.
function getSizeRank(label) {
  const raw = normalize(label);
  if (!raw) return null;
  const s = raw.toLowerCase();

  // Tamanhos de roupa
  const clothingOrder = [
    'xxs',
    'xs',
    'extra small',
    'small',
    's',
    'medium',
    'm',
    'large',
    'l',
    'xl',
    'extra large',
    'xxl',
    '2xl',
    '3xl',
  ];
  const clothingIndex = clothingOrder.findIndex(k => s === k || s.includes(k));
  if (clothingIndex >= 0) return clothingIndex;

  // One size
  if (s.includes('one size') || s === 'os') return 50;

  // Tamanhos numéricos com g / kg / ml / l
  const sizeMatch = s.match(/(\d+(?:\.\d+)?)(\s*)(kg|g|ml|l)\b/);
  if (sizeMatch) {
    const num = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[3];
    if (unit === 'kg' || unit === 'l') {
      return 100 + num * 1000; // 0.5kg → 100 + 500
    }
    return 100 + num; // 500g, 750ml etc.
  }

  // "Serv" / "Servings"
  const servMatch = s.match(/(\d+)\s*serv/i);
  if (servMatch) {
    const num = parseInt(servMatch[1], 10) || 0;
    return 200 + num;
  }

  return null;
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
    console.log('Carregando variantes de produtos...');
    const { rows } = await client.query(`
      SELECT
        pv.id,
        pv.product_id,
        pv.parent_variant_id,
        pv.label,
        pv.sort_order,
        vt.slug AS variant_slug
      FROM product_variants pv
      LEFT JOIN variant_types vt ON vt.id = pv.variant_type_id
      ORDER BY pv.product_id, COALESCE(pv.parent_variant_id, pv.id), pv.sort_order, pv.label
    `);

    if (!rows.length) {
      console.log('Nenhuma variante encontrada.');
      return;
    }

    // Agrupar por produto + parent + tipo
    const groups = new Map();
    for (const v of rows) {
      const key = [
        v.product_id,
        v.parent_variant_id ? v.parent_variant_id : 'ROOT',
        v.variant_slug || 'unknown',
      ].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(v);
    }

    let totalGroupsTouched = 0;
    let totalVariantsReordered = 0;

    for (const [key, list] of groups.entries()) {
      // Apenas grupos com 2+ variantes fazem sentido para ordenar
      if (list.length < 2) continue;

      // Calcular rank de tamanho para cada label
      const withRank = list.map(v => ({
        ...v,
        rank: getSizeRank(v.label),
      }));

      const valid = withRank.filter(v => v.rank !== null);
      // Se menos da metade tem rank, provavelmente não é um grupo de tamanhos
      if (valid.length < 2 || valid.length < list.length / 2) continue;

      // Ordenar por rank, desempate por label
      withRank.sort((a, b) => {
        if (a.rank === null && b.rank === null) {
          return normalize(a.label).localeCompare(normalize(b.label));
        }
        if (a.rank === null) return 1;
        if (b.rank === null) return -1;
        if (a.rank !== b.rank) return a.rank - b.rank;
        return normalize(a.label).localeCompare(normalize(b.label));
      });

      totalGroupsTouched++;
      // Reatribuir sort_order sequencialmente dentro do grupo
      for (let i = 0; i < withRank.length; i++) {
        const v = withRank[i];
        if (v.sort_order !== i) {
          await client.query(
            'UPDATE product_variants SET sort_order = $1 WHERE id = $2',
            [i, v.id]
          );
          totalVariantsReordered++;
        }
      }
    }

    console.log('\nResumo:');
    console.log('  Grupos de variantes reordenados:', totalGroupsTouched);
    console.log('  Variantes com sort_order ajustado:', totalVariantsReordered);
    console.log('Concluído. Abra o modal de produto para conferir a nova ordem.');
  } catch (e) {
    console.error('Erro geral:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

