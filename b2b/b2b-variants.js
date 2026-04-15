/* B2B Variant Modal — Sports Foods Ireland */
(function(){if(document.getElementById('b2b-vm-css'))return;var s=document.createElement('style');s.id='b2b-vm-css';
s.textContent='.b2b-vm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .2s}.b2b-vm-overlay.show{opacity:1}.b2b-vm{background:#fff;border-radius:12px;max-width:420px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);transform:translateY(20px);transition:transform .25s}.b2b-vm-overlay.show .b2b-vm{transform:translateY(0)}.b2b-vm-header{display:flex;align-items:center;gap:14px;padding:18px 20px;border-bottom:1px solid #e2e8f0;position:relative}.b2b-vm-header img{width:64px;height:64px;object-fit:contain;border-radius:8px;background:#f5f5f5}.b2b-vm-name{font-size:.95rem;font-weight:600;color:#1e293b}.b2b-vm-price{font-size:1rem;font-weight:700;color:#1B4332;margin-top:2px}.b2b-vm-close{position:absolute;top:12px;right:14px;width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:18px;color:#666;cursor:pointer;display:flex;align-items:center;justify-content:center}.b2b-vm-body{padding:18px 20px}.b2b-vm-label{font-size:.8rem;font-weight:600;color:#636E72;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}.b2b-vm-opts{display:flex;flex-wrap:wrap;gap:8px}.b2b-vm-opt{padding:8px 16px;border:2px solid #e0e0e0;border-radius:8px;background:#fff;cursor:pointer;font-size:.88rem;color:#333;transition:all .15s}.b2b-vm-opt:hover{border-color:#2D6A4F;background:#f0faf4}.b2b-vm-opt.selected{border-color:#2D6A4F;background:#e8f5ee;color:#1a5c3a;font-weight:600}.b2b-vm-opt.disabled{opacity:.4;pointer-events:none}.b2b-vm-footer{padding:14px 20px;border-top:1px solid #e2e8f0;display:flex;gap:10px}.b2b-vm-footer button{flex:1;padding:12px;border:none;border-radius:8px;font-size:.95rem;font-weight:600;cursor:pointer}.b2b-vm-cancel{background:#f0f0f0;color:#666}.b2b-vm-add{background:#2D6A4F;color:#fff;opacity:.4;pointer-events:none}.b2b-vm-add.active{opacity:1;pointer-events:auto}';
document.head.appendChild(s)})();

var _b2bVarCache = {};
window.b2bFetchVariants = async function(lid) {
  if (_b2bVarCache[lid] !== undefined) return _b2bVarCache[lid];
  try {
    var U = 'https://styynhgzrkyoioqjssuw.supabase.co';
    var K = 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH';
    var r = await fetch(U + '/rest/v1/products?legacy_id=eq.' + lid + '&select=id,product_variants(id,label,price,wholesale_price,stock,is_default,sort_order,variant_types(name,slug))&product_variants.is_active=eq.true&product_variants.order=sort_order.asc', { headers: { 'apikey': K, 'Authorization': 'Bearer ' + K } });
    var a = await r.json();
    var pv = (a && a[0] && a[0].product_variants) || [];
    if (!pv.length) { _b2bVarCache[lid] = null; return null; }
    var g = {};
    pv.forEach(function(v) {
      var t = v.variant_types || { name: 'Option', slug: 'option' };
      var k = t.slug || 'option';
      if (!g[k]) g[k] = { type: t.name, slug: k, options: [] };
      g[k].options.push({ id: v.id, label: v.label, price: (v.wholesale_price > 0 ? v.wholesale_price : v.price), stock: v.stock });
    });
    var res = Object.values(g);
    _b2bVarCache[lid] = res;
    return res;
  } catch (e) { _b2bVarCache[lid] = null; return null; }
};

window.b2bShowVariantModal = function(pI, vG, onC) {
  var prev = document.getElementById('b2bVarOvl');
  if (prev) prev.remove();
  var cur = '\u20ac';
  var img = pI.image || '';
  if (img && !img.startsWith('http') && !img.startsWith('../')) img = '../' + img;
  if (!img) img = '../img/placeholder.webp';
  var sel = null;
  var ov = document.createElement('div');
  ov.id = 'b2bVarOvl';
  ov.className = 'b2b-vm-overlay';
  var bH = vG.map(function(g, gi) {
    var h = gi > 0 ? ' style="display:none"' : '';
    return '<div class="b2b-vm-group" data-gi="' + gi + '"' + h + '><div class="b2b-vm-label">' + g.type + '</div><div class="b2b-vm-opts">' +
      g.options.map(function(o) {
        var d = o.stock != null && o.stock <= 0;
        return '<button class="b2b-vm-opt' + (d ? ' disabled' : '') + '" data-vid="' + o.id + '" data-lbl="' + (o.label || '') + '" data-pr="' + (o.price || '') + '"' + (d ? ' disabled' : '') + '>' + (o.label || '') + (d ? ' (Backorder)' : '') + '</button>';
      }).join('') + '</div></div>';
  }).join('');
  var sn = (pI.name || 'Product').replace(/</g, '&lt;');
  ov.innerHTML = '<div class="b2b-vm"><button class="b2b-vm-close">&times;</button><div class="b2b-vm-header"><img src="' + img + '" alt=""><div><div class="b2b-vm-name">' + sn + '</div><div class="b2b-vm-price" id="bvPr">' + cur + Number(pI.price || 0).toFixed(2) + '</div></div></div><div class="b2b-vm-body">' + bH + '</div><div class="b2b-vm-footer"><button class="b2b-vm-cancel">Cancel</button><button class="b2b-vm-add">Add to Cart</button></div></div>';
  document.body.appendChild(ov);
  requestAnimationFrame(function() { ov.classList.add('show'); });
  var ab = ov.querySelector('.b2b-vm-add');
  function cls() { ov.classList.remove('show'); setTimeout(function() { ov.remove(); }, 250); }
  ov.querySelector('.b2b-vm-close').onclick = cls;
  ov.querySelector('.b2b-vm-cancel').onclick = cls;
  ov.addEventListener('click', function(e) { if (e.target === ov) cls(); });
  ov.addEventListener('click', function(e) {
    var o = e.target.closest('.b2b-vm-opt');
    if (!o || o.disabled) return;
    var gr = o.closest('.b2b-vm-group');
    if (!gr) return;
    gr.querySelectorAll('.b2b-vm-opt').forEach(function(b) { b.classList.remove('selected'); });
    o.classList.add('selected');
    var gi = parseInt(gr.dataset.gi), ag = ov.querySelectorAll('.b2b-vm-group');
    if (gi + 1 < ag.length) {
      ag[gi + 1].style.display = '';
      for (var i = gi + 1; i < ag.length; i++) {
        ag[i].querySelectorAll('.b2b-vm-opt').forEach(function(b) { b.classList.remove('selected'); });
        if (i > gi + 1) ag[i].style.display = 'none';
      }
    }
    var lg = ag[ag.length - 1], ls = lg.querySelector('.b2b-vm-opt.selected');
    if (ls) {
      sel = { id: ls.dataset.vid, label: ls.dataset.lbl, price: parseFloat(ls.dataset.pr) || pI.price };
      ab.classList.add('active');
    } else {
      sel = null;
      ab.classList.remove('active');
    }
  });
  ab.addEventListener('click', function() { if (!sel) return; cls(); if (typeof onC === 'function') onC(sel); });
};

window.b2bAddWithVariants = async function(id, name, price, image) {
  var v = await window.b2bFetchVariants(id);
  if (v && v.length > 0 && v.some(function(g) { return g.options && g.options.length > 0; })) {
    window.b2bShowVariantModal({ name: name, price: price, image: image }, v, function(s) {
      if (typeof addToCart === 'function') {
        addToCart(id, 1, { nome: name + ' \u2014 ' + s.label, preco: s.price || price, imagem: image, variant: s.label, variantId: s.id });
        if (typeof B2B !== 'undefined' && B2B.toast) B2B.toast('Added to cart');
      }
    });
  } else {
    if (typeof addToCart === 'function') {
      addToCart(id, 1, { nome: name, preco: price, imagem: image });
      if (typeof B2B !== 'undefined' && B2B.toast) B2B.toast('Added to cart');
    }
  }
};
