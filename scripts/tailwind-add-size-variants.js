/**
 * A partir dos produtos Tailwind INATIVOS (que tinham tamanhos individuais),
 * extrai sabor + tamanho + preço + estoque e insere variantes compostas
 * "Sabor / Tamanho" nos produtos unificados no Supabase.
 *
 * Uso: node scripts/tailwind-add-size-variants.js
 * Requer: .env com SUPABASE_DB_POOLER_URL ou SUPABASE_DB_URL (e opcional SUPABASE_ACCESS_TOKEN)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connect } = require('./supabase-connection');

/** Extrai o tamanho do nome ou SKU (500g, 1kg, 2kg, Small, Medium, Large, 20 Serv, etc.) */
function extractSize(name, sku) {
  const text = [name, sku].filter(Boolean).join(' ');
  if (!text) return null;
  const m = text.match(/\b(500\s*g|500g|1\s*kg|1kg|2\s*kg|2kg|Small|Medium|Large|20\s*Serv(?:ings)?)\b/i);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  if (/\b500\b/.test(text) && /g\b/i.test(text)) return '500g';
  if (/\b1\s*k/i.test(text) || /\b1k\b/i.test(text)) return '1kg';
  if (/\b2\s*k/i.test(text) || /\b2k\b/i.test(text)) return '2kg';
  return null;
}

/** Extrai o sabor do nome (para Endurance Fuel). Remove tamanho antes. */
function extractFlavorEndurance(name) {
  let n = name
    .replace(/Tailwind\s+Endurance\s+Fuel\s+/i, '')
    .replace(/\s+Flavour?$/i, '')
    .trim();
  n = n.replace(/\s*(500\s*g|500g|1\s*kg|1kg|2\s*kg|2kg|Small|Medium|Large|20\s*Serv(?:ings)?)\s*$/i, '').trim();
  return n || null;
}

/** Extrai o sabor do nome (para Recover Mix). Remove tamanho antes. */
function extractFlavorRecover(name) {
  let n = name
    .replace(/Tailwind\s+(?:Recovery\s+)?(?:New\s+)?(?:Recover\s+)?Mix\s+/i, '')
    .trim();
  if (/^20\s*Serv/i.test(n)) return null;
  n = n.replace(/\s*(500\s*g|500g|1\s*kg|1kg|2\s*kg|2kg|Small|Medium|Large)\s*$/i, '').trim();
  return n || null;
}

async function main() {
  const result = await connect();
  if (result.error) {
    console.error('Erro de conexão:', result.error);
    if (result.hint) console.error(result.hint);
    process.exit(1);
  }
  const client = result.client;

  try {
    const brandRes = await client.query(
      "SELECT id FROM brands WHERE name ILIKE '%Tailwind%' LIMIT 1"
    );
    if (brandRes.rows.length === 0) {
      console.error('Marca Tailwind não encontrada.');
      process.exit(1);
    }
    const brandId = brandRes.rows[0].id;

    // Tipo de variante composta (Sabor + Tamanho)
    let compoundTypeId;
    const vtRes = await client.query(
      "SELECT id FROM variant_types WHERE slug = 'flavor-size' LIMIT 1"
    );
    if (vtRes.rows.length === 0) {
      await client.query(
        "INSERT INTO variant_types (name, slug, sort_order) VALUES ('Flavor & Size', 'flavor-size', 10) RETURNING id"
      );
      compoundTypeId = (await client.query("SELECT id FROM variant_types WHERE slug = 'flavor-size' LIMIT 1")).rows[0].id;
      console.log('Criado variant_type Flavor & Size:', compoundTypeId);
    } else {
      compoundTypeId = vtRes.rows[0].id;
    }

    // Produtos unificados (ativos) por slug
    const unifiedSlugs = [
      'tailwind-endurance-fuel',
      'tailwind-endurance-fuel-caffeinated',
      'tailwind-new-recover-mix',
    ];
    const unifiedRes = await client.query(
      `SELECT id, slug FROM products WHERE brand_id = $1 AND slug = ANY($2::text[]) AND is_active = true`,
      [brandId, unifiedSlugs]
    );
    const unifiedBySlug = {};
    unifiedRes.rows.forEach((r) => { unifiedBySlug[r.slug] = r.id; });

    // Produtos Tailwind INATIVOS
    const inactiveRes = await client.query(
      `SELECT id, name, sku, price_eur, stock_quantity
       FROM products p
       WHERE p.brand_id = $1 AND p.is_active = false
       ORDER BY p.name`,
      [brandId]
    );
    const inactive = inactiveRes.rows || [];
    console.log('Produtos Tailwind inativos encontrados:', inactive.length);

    let inserted = 0;
    let updated = 0;

    for (const row of inactive) {
      const name = row.name || '';
      const sku = row.sku || '';
      const price = row.price_eur != null ? parseFloat(row.price_eur) : null;
      const stock = parseInt(row.stock_quantity, 10) || 0;

      const size = extractSize(name, sku);
      const isEndurance = /Endurance\s+Fuel/i.test(name);
      const isCaffeinated = /caffeinated|cafeinado/i.test(name);
      const isRecover = /Recover|Recovery/i.test(name) && !/^20\s*Serv/i.test(name) && !/20\s*Serv(?:ings)?\s*$/i.test(name);

      let flavor;
      let productId;
      if (isEndurance && isCaffeinated) {
        productId = unifiedBySlug['tailwind-endurance-fuel-caffeinated'];
        flavor = extractFlavorEndurance(name);
      } else if (isEndurance) {
        productId = unifiedBySlug['tailwind-endurance-fuel'];
        flavor = extractFlavorEndurance(name);
      } else if (isRecover) {
        productId = unifiedBySlug['tailwind-new-recover-mix'];
        flavor = extractFlavorRecover(name);
      } else {
        continue;
      }

      if (!productId || !flavor) continue;

      const sizeLabel = size || 'Standard';
      const compoundLabel = `${flavor} / ${sizeLabel}`;

      const existing = await client.query(
        `SELECT id, stock, price FROM product_variants
         WHERE product_id = $1 AND label = $2 AND is_active = true LIMIT 1`,
        [productId, compoundLabel]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE product_variants SET stock = stock + $1, price = COALESCE($2, price), updated_at = now() WHERE id = $3`,
          [stock, price, existing.rows[0].id]
        );
        updated++;
        console.log('  Atualizado:', compoundLabel, 'stock +', stock, 'preço', price != null ? price : '(mantido)');
      } else {
        const sortOrder = inactive.indexOf(row);
        await client.query(
          `INSERT INTO product_variants (product_id, variant_type_id, label, price, stock, is_default, is_active, sort_order)
           VALUES ($1, $2, $3, $4, $5, false, true, $6)`,
          [productId, compoundTypeId, compoundLabel, price, stock, sortOrder]
        );
        inserted++;
        console.log('  Inserido:', compoundLabel, 'preço', price, 'stock', stock);
      }
    }

    // Opcional: desativar variantes só-sabor quando existir variante composta para esse sabor (evita duplicar na loja)
    const flavorTypeRes = await client.query("SELECT id FROM variant_types WHERE slug = 'flavor' LIMIT 1");
    const flavorTypeId = flavorTypeRes.rows[0]?.id;
    if (flavorTypeId) {
      for (const slug of unifiedSlugs) {
        const pid = unifiedBySlug[slug];
        if (!pid) continue;
        const compounds = await client.query(
          `SELECT DISTINCT split_part(label, ' / ', 1) AS flavor FROM product_variants WHERE product_id = $1 AND variant_type_id = $2 AND label LIKE '% / %' AND is_active = true`,
          [pid, compoundTypeId]
        );
        for (const { flavor } of compounds.rows) {
          await client.query(
            `UPDATE product_variants SET stock = 0, is_active = false WHERE product_id = $1 AND variant_type_id = $2 AND label = $3 AND is_active = true`,
            [pid, flavorTypeId, flavor]
          );
        }
      }
      console.log('Variantes antigas só-sabor desativadas onde existe variante Sabor/Tamanho.');
    }

    console.log('\nResumo: inseridas', inserted, 'variantes, atualizadas', updated, 'variantes.');
    console.log('Se os produtos inativos tinham apenas sabor (sem tamanho no nome/SKU), a variante fica "Sabor / Standard".');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
