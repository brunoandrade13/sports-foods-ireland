const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
async function run() {
  const { data: p } = await supabase.from('products').select('*');
  console.log(`Total products: ${p.length}`);
  
  const hasIsActive = Object.keys(p[0] || {}).includes('is_active');
  console.log(`Has count is_active column: ${hasIsActive}`);
  
  if (hasIsActive) {
    const activeCount = p.filter(x => x.is_active).length;
    console.log(`Current active count: ${activeCount}`);
  }
  
  // Try to find how to differentiate the 259 valid products
  const withImages = p.filter(x => x.image_url && x.image_url.includes('img/produtos-279')).length;
  console.log(`With img/produtos-279: ${withImages}`);
  
  // Group by created_at maybe? Or source?
}
run();
