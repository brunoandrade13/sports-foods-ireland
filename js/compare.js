/**
 * SFI Compare Page — Side-by-side product comparison
 */
(function() {
'use strict';

const grid = document.getElementById('compareGrid');
const empty = document.getElementById('compareEmpty');
const table = document.getElementById('compareTable');
if (!grid) return;

function fmt(n) { return '€' + Number(n).toFixed(2); }

async function loadCompareProducts() {
    const ids = JSON.parse(localStorage.getItem('sfi_compare_products') || '[]');
    
    if (!ids.length) {
        if (empty) empty.style.display = 'block';
        if (table) table.style.display = 'none';
        return;
    }

    // Load products
    let products = window.sfiProducts || [];
    if (!products.length) {
        try {
            const res = await fetch('dados.json');
            products = await res.json();
        } catch(e) { return; }
    }

    const items = ids.map(id => products.find(p => p.id == id)).filter(Boolean);
    if (!items.length) {
        if (empty) empty.style.display = 'block';
        if (table) table.style.display = 'none';
        return;
    }

    if (empty) empty.style.display = 'none';
    if (table) table.style.display = 'block';

    const rows = [
        { label: '', render: p => `<img src="${p.imagem || 'img/placeholder.jpg'}" alt="${p.nome}" style="width:120px;height:120px;object-fit:contain">` },
        { label: 'Product', render: p => `<strong>${p.nome}</strong>` },
        { label: 'Price', render: p => `<span style="color:var(--color-primary);font-weight:700">${fmt(p.preco)}</span>` },
        { label: 'Original Price', render: p => p.preco_original ? `<s>${fmt(p.preco_original)}</s>` : '—' },
        { label: 'Category', render: p => p.categoria || '—' },
        { label: 'Brand', render: p => p.marca || '—' },
        { label: 'Description', render: p => (p.descricao || '—').substring(0, 120) },
        { label: '', render: p => `<button class="btn-account-primary" onclick="addToCart({id:${p.id},nome:'${p.nome.replace(/'/g,"\\'")}',preco:${p.preco},imagem:'${p.imagem||''}',quantidade:1})">Add to Cart</button>
            <button class="btn-account-outline" onclick="removeCompare(${p.id})" style="margin-top:6px">Remove</button>` }
    ];

    const cols = items.length + 1;
    grid.style.gridTemplateColumns = `140px repeat(${items.length}, 1fr)`;
    grid.innerHTML = rows.map(row => {
        return `<div class="compare-label">${row.label}</div>` +
            items.map(p => `<div class="compare-cell">${row.render(p)}</div>`).join('');
    }).join('');
}

window.removeCompare = function(id) {
    let ids = JSON.parse(localStorage.getItem('sfi_compare_products') || '[]');
    ids = ids.filter(i => i != id);
    localStorage.setItem('sfi_compare_products', JSON.stringify(ids));
    loadCompareProducts();
};

window.clearCompare = function() {
    localStorage.setItem('sfi_compare_products', '[]');
};

window.loadCompareProducts = loadCompareProducts;
loadCompareProducts();
})();
