/**
 * Unifica produtos Tailwind Endurance Fuel e Tailwind Recover Mix em um cadastro cada,
 * com variantes por sabor (Flavor) e migra o stock.
 * Uso: node scripts/unify-tailwind-products.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');
const { connect } = require('./supabase-connection');

function uuidv4() {
  return crypto.randomUUID();
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Extrai o sabor do nome do produto */
function extractFlavor(name, productType) {
  if (productType === 'endurance') {
    // "Tailwind Endurance Fuel Mandarin Flavour" -> Mandarin
    const m = name.match(/Tailwind\s+Endurance\s+Fuel\s+(.+?)(?:\s+Flavour?)?$/i);
    return m ? m[1].trim() : name.replace(/^Tailwind\s+Endurance\s+Fuel\s+/i, '').replace(/\s+Flavour?$/i, '').trim();
  }
  if (productType === 'recover') {
    // "Tailwind Recovery New Mix Chocolate" ou "Tailwind New Recover Mix X"
    const m = name.match(/(?:Tailwind\s+(?:Recovery\s+)?(?:New\s+)?(?:Recover\s+)?Mix\s+(.+)|Tailwind\s+.+Mix\s+(.+))$/i);
    const part = m ? (m[1] || m[2] || '').trim() : '';
    if (part) return part;
    const words = name.split(/\s+/);
    return words[words.length - 1] || name;
  }
  return name;
}

async function main() {
  const result = await connect();
  if (result.error) {
    console.error('Erro de conexão:', result.error);
    if (result.hint) console.error(result.hint);
    process.exit(1);
  }

  const client = result.client;
  const method = result.method;
  console.log('Conectado via', method);

  try {
    // 1) Garantir que existe variant_type "Flavor"
    let flavorTypeId;
    const vtRes = await client.query(
      "SELECT id FROM variant_types WHERE slug = 'flavor' LIMIT 1"
    );
    if (vtRes.rows.length === 0) {
      try {
        await client.query(
          "INSERT INTO variant_types (name, slug, sort_order) VALUES ('Flavor', 'flavor', 3) ON CONFLICT (slug) DO NOTHING"
        );
      } catch (_) {}
      const again = await client.query("SELECT id FROM variant_types WHERE slug = 'flavor' LIMIT 1");
      flavorTypeId = again.rows[0]?.id;
      if (!flavorTypeId) {
        console.error('Não foi possível obter variant_type Flavor.');
        process.exit(1);
      }
    } else {
      flavorTypeId = vtRes.rows[0].id;
    }
    console.log('Variant type Flavor id:', flavorTypeId);

    // 2) Marca Tailwind
    const brandRes = await client.query(
      "SELECT id, name FROM brands WHERE name ILIKE '%Tailwind%' LIMIT 1"
    );
    if (brandRes.rows.length === 0) {
      console.error('Marca Tailwind não encontrada.');
      process.exit(1);
    }
    const brandId = brandRes.rows[0].id;
    console.log('Brand Tailwind:', brandRes.rows[0].name, brandId);

    // 3) Produtos Tailwind Endurance Fuel e Recover/Recovery Mix
    const productsRes = await client.query(
      `SELECT p.id, p.sku, p.name, p.slug, p.description, p.short_description,
              p.price_eur, p.price_gbp, p.cost_price_eur, p.compare_at_price_eur, p.compare_at_price_gbp,
              p.brand_id, p.category_id, p.subcategory_id, p.image_url, p.stock_quantity,
              p.track_inventory, p.low_stock_threshold
       FROM products p
       WHERE p.brand_id = $1
         AND (p.name ILIKE '%Endurance Fuel%' OR p.name ILIKE '%Recover%' OR p.name ILIKE '%Recovery%')
         AND p.is_active = true
       ORDER BY p.name`,
      [brandId]
    );

    const all = productsRes.rows || [];
    const endurance = all.filter((p) => p.name.toLowerCase().includes('endurance fuel'));
    const recover = all.filter(
      (p) =>
        p.name.toLowerCase().includes('recover') ||
        p.name.toLowerCase().includes('recovery')
    );

    console.log('Endurance Fuel encontrados:', endurance.length);
    console.log('Recover/Recovery Mix encontrados:', recover.length);

    const newProductIds = [];
    const oldIdsToDeactivate = [];

    // 4) Unificar Tailwind Endurance Fuel
    if (endurance.length > 0) {
      const first = endurance[0];
      const baseSlug = 'tailwind-endurance-fuel';
      const baseSku = 'SFI-TW-EF';

      // Verificar se já existe produto unificado
      let unifiedId = null;
      const existing = await client.query(
        "SELECT id FROM products WHERE slug = $1 AND is_active = true",
        [baseSlug]
      );
      if (existing.rows.length > 0) {
        unifiedId = existing.rows[0].id;
        console.log('Produto unificado Endurance Fuel já existe:', unifiedId);
      } else {
        const newId = uuidv4();
        await client.query(
          `INSERT INTO products (
            id, sku, name, slug, description, short_description,
            price_eur, price_gbp, cost_price_eur, compare_at_price_eur, compare_at_price_gbp,
            brand_id, category_id, subcategory_id, image_url,
            stock_quantity, track_inventory, low_stock_threshold, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, true, $16, true)`,
          [
            newId,
            baseSku,
            'Tailwind Endurance Fuel',
            baseSlug,
            first.description,
            first.short_description || 'Endurance fuel with multiple flavor options.',
            first.price_eur,
            first.price_gbp,
            first.cost_price_eur,
            first.compare_at_price_eur,
            first.compare_at_price_gbp,
            brandId,
            first.category_id,
            first.subcategory_id,
            first.image_url,
            first.low_stock_threshold ?? 5,
          ]
        );
        unifiedId = newId;
        newProductIds.push(newId);
        console.log('Criado produto Tailwind Endurance Fuel', newId);
      }

      // Separar sabores normais e cafeinados (cafeinados -> produto único "Tailwind Endurance Fuel Caffeinated")
      const enduranceNormal = [];
      const enduranceCaffeinated = [];
      for (const p of endurance) {
        const flavor = extractFlavor(p.name, 'endurance');
        if (!flavor) continue;
        if (/caffeinated|cafeinado/i.test(flavor) || /caffeinated|cafeinado/i.test(p.name)) {
          enduranceCaffeinated.push({ ...p, flavor });
        } else {
          enduranceNormal.push({ ...p, flavor });
        }
      }

      // Variantes normais no Tailwind Endurance Fuel
      for (let i = 0; i < enduranceNormal.length; i++) {
        const p = enduranceNormal[i];
        const flavor = p.flavor;
        const existingVar = await client.query(
          'SELECT id FROM product_variants WHERE product_id = $1 AND label = $2 AND is_active = true',
          [unifiedId, flavor]
        );
        if (existingVar.rows.length > 0) {
          await client.query(
            'UPDATE product_variants SET stock = stock + $1, updated_at = now() WHERE id = $2',
            [p.stock_quantity || 0, existingVar.rows[0].id]
          );
          console.log('  Variante atualizada:', flavor, '+', p.stock_quantity, 'unidades');
        } else {
          await client.query(
            `INSERT INTO product_variants (product_id, variant_type_id, label, price, stock, is_default, is_active, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
            [
              unifiedId,
              flavorTypeId,
              flavor,
              p.price_eur,
              p.stock_quantity || 0,
              i === 0,
              i,
            ]
          );
          console.log('  Variante criada:', flavor, 'stock', p.stock_quantity);
        }
        oldIdsToDeactivate.push(p.id);
      }

      // Produto "Tailwind Endurance Fuel Caffeinated" com suas variantes
      if (enduranceCaffeinated.length > 0) {
        const firstCaf = enduranceCaffeinated[0];
        const slugCaf = 'tailwind-endurance-fuel-caffeinated';
        let cafProductId = null;
        const existingCaf = await client.query(
          "SELECT id FROM products WHERE slug = $1 AND is_active = true LIMIT 1",
          [slugCaf]
        );
        if (existingCaf.rows.length > 0) {
          cafProductId = existingCaf.rows[0].id;
          console.log('Produto Tailwind Endurance Fuel Caffeinated já existe:', cafProductId);
        } else {
          cafProductId = uuidv4();
          await client.query(
            `INSERT INTO products (id, sku, name, slug, description, short_description,
              price_eur, price_gbp, cost_price_eur, compare_at_price_eur, compare_at_price_gbp,
              brand_id, category_id, subcategory_id, image_url, stock_quantity, track_inventory, low_stock_threshold, is_active)
             VALUES ($1, 'SFI-TW-EF-CAF', 'Tailwind Endurance Fuel Caffeinated', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, true, $14, true)`,
            [
              cafProductId,
              slugCaf,
              firstCaf.description,
              firstCaf.short_description || 'Endurance fuel with caffeine, multiple flavors.',
              firstCaf.price_eur,
              firstCaf.price_gbp,
              firstCaf.cost_price_eur,
              firstCaf.compare_at_price_eur,
              firstCaf.compare_at_price_gbp,
              brandId,
              firstCaf.category_id,
              firstCaf.subcategory_id,
              firstCaf.image_url,
              firstCaf.low_stock_threshold ?? 5,
            ]
          );
          newProductIds.push(cafProductId);
          console.log('Criado produto Tailwind Endurance Fuel Caffeinated');
        }
        for (let i = 0; i < enduranceCaffeinated.length; i++) {
          const p = enduranceCaffeinated[i];
          const flavor = p.flavor;
          const existingVar = await client.query(
            'SELECT id FROM product_variants WHERE product_id = $1 AND label = $2 AND is_active = true',
            [cafProductId, flavor]
          );
          if (existingVar.rows.length > 0) {
            await client.query(
              'UPDATE product_variants SET stock = stock + $1, updated_at = now() WHERE id = $2',
              [p.stock_quantity || 0, existingVar.rows[0].id]
            );
            console.log('  [Caffeinated] Variante atualizada:', flavor, '+', p.stock_quantity);
          } else {
            await client.query(
              `INSERT INTO product_variants (product_id, variant_type_id, label, price, stock, is_default, is_active, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
              [cafProductId, flavorTypeId, flavor, p.price_eur, p.stock_quantity || 0, i === 0, i]
            );
            console.log('  [Caffeinated] Variante criada:', flavor, 'stock', p.stock_quantity);
          }
          oldIdsToDeactivate.push(p.id);
        }
      }
    }

    // 5) Unificar Tailwind New Recover Mix
    if (recover.length > 0) {
      const first = recover[0];
      const baseSlug = 'tailwind-new-recover-mix';
      const baseSku = 'SFI-TW-RM';

      let unifiedId = null;
      const existing = await client.query(
        "SELECT id FROM products WHERE slug = $1 AND is_active = true",
        [baseSlug]
      );
      if (existing.rows.length > 0) {
        unifiedId = existing.rows[0].id;
        console.log('Produto unificado Recover Mix já existe:', unifiedId);
      } else {
        const newId = uuidv4();
        await client.query(
          `INSERT INTO products (
            id, sku, name, slug, description, short_description,
            price_eur, price_gbp, cost_price_eur, compare_at_price_eur, compare_at_price_gbp,
            brand_id, category_id, subcategory_id, image_url,
            stock_quantity, track_inventory, low_stock_threshold, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, true, $16, true)`,
          [
            newId,
            baseSku,
            'Tailwind New Recover Mix',
            baseSlug,
            first.description,
            first.short_description || 'Recovery mix with multiple flavor options.',
            first.price_eur,
            first.price_gbp,
            first.cost_price_eur,
            first.compare_at_price_eur,
            first.compare_at_price_gbp,
            brandId,
            first.category_id,
            first.subcategory_id,
            first.image_url,
            first.low_stock_threshold ?? 5,
          ]
        );
        unifiedId = newId;
        newProductIds.push(newId);
        console.log('Criado produto Tailwind New Recover Mix', newId);
      }

      // "20 Serv" fica como produto único, não variante
      const recoverVariants = recover.filter((p) => {
        const flavor = extractFlavor(p.name, 'recover');
        return flavor && !/^20\s*Serv/i.test(flavor);
      });
      const recover20Only = recover.filter((p) => {
        const flavor = extractFlavor(p.name, 'recover');
        return flavor && /^20\s*Serv/i.test(flavor);
      });

      for (const p of recover20Only) {
        const slug20 = 'tailwind-new-recover-mix-20-serv';
        const existing20 = await client.query(
          "SELECT id FROM products WHERE slug = $1 AND is_active = true LIMIT 1",
          [slug20]
        );
        if (existing20.rows.length > 0) {
          const cur = await client.query(
            'SELECT stock_quantity FROM products WHERE id = $1',
            [existing20.rows[0].id]
          );
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
            [p.stock_quantity || 0, existing20.rows[0].id]
          );
          console.log('  Produto 20 Serv atualizado, +', p.stock_quantity);
        } else {
          const newId = uuidv4();
          const first = recover[0];
          await client.query(
            `INSERT INTO products (id, sku, name, slug, description, short_description,
              price_eur, price_gbp, cost_price_eur, brand_id, category_id, subcategory_id, image_url,
              stock_quantity, track_inventory, low_stock_threshold, is_active)
             VALUES ($1, 'SFI-TW-RM-20', 'Tailwind New Recover Mix 20 Serv', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, $13, true)`,
            [
              newId,
              slug20,
              first.description,
              first.short_description || 'Recovery mix 20 servings.',
              first.price_eur,
              first.price_gbp,
              first.cost_price_eur,
              brandId,
              first.category_id,
              first.subcategory_id,
              first.image_url,
              p.stock_quantity || 0,
              first.low_stock_threshold ?? 5,
            ]
          );
          newProductIds.push(newId);
          console.log('  Produto único criado: Tailwind New Recover Mix 20 Serv, stock', p.stock_quantity);
        }
        oldIdsToDeactivate.push(p.id);
      }

      for (let i = 0; i < recoverVariants.length; i++) {
        const p = recoverVariants[i];
        const flavor = extractFlavor(p.name, 'recover');
        if (!flavor) continue;

        const existingVar = await client.query(
          'SELECT id FROM product_variants WHERE product_id = $1 AND label = $2 AND is_active = true',
          [unifiedId, flavor]
        );
        if (existingVar.rows.length > 0) {
          await client.query(
            'UPDATE product_variants SET stock = stock + $1, updated_at = now() WHERE id = $2',
            [p.stock_quantity || 0, existingVar.rows[0].id]
          );
          console.log('  Variante atualizada:', flavor, '+', p.stock_quantity);
        } else {
          await client.query(
            `INSERT INTO product_variants (product_id, variant_type_id, label, price, stock, is_default, is_active, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
            [
              unifiedId,
              flavorTypeId,
              flavor,
              p.price_eur,
              p.stock_quantity || 0,
              i === 0,
              i,
            ]
          );
          console.log('  Variante criada:', flavor, 'stock', p.stock_quantity);
        }
        oldIdsToDeactivate.push(p.id);
      }
    }

    // 6) Desativar produtos antigos (mantém histórico em order_items)
    for (const id of oldIdsToDeactivate) {
      await client.query('UPDATE products SET is_active = false WHERE id = $1', [id]);
    }
    console.log('Produtos antigos desativados:', oldIdsToDeactivate.length);

    console.log('\nConcluído. Produtos unificados com variantes por sabor e stock migrado.');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
