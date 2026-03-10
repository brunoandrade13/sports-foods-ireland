const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
async function run() {
  const { data: o } = await supabase.from('orders').select('*').limit(1);
  const { data: c } = await supabase.from('customers').select('*').limit(1);
  console.log('Orders cols:', Object.keys(o[0] || {}));
  console.log('Customers cols:', Object.keys(c[0] || {}));
}
run();
