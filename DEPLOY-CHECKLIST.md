# SFI — Deploy Checklist (actualizado 31 Mar 2026)

## 🚀 COMO FAZER O DEPLOY

**Método recomendado — executar o script:**
```bash
bash /Users/test/Desktop/sport/website-sfi-novo/deploy.sh
```
O script cria automaticamente a pasta `sfi-deploy-package/` no Desktop com apenas os ficheiros de produção, remove os PNGs redundantes e faz todas as verificações de segurança.

**Depois do script:** fazer upload da pasta `sfi-deploy-package/` para `public_html/` no cPanel.

---

## ✅ VERIFICAÇÕES PRÉ-DEPLOY

### Performance
- [ ] Banners hero mobile funcionam correctamente (portrait no mobile)
- [ ] Imagens carregam em WebP (verificar no DevTools → Network)
- [ ] Lighthouse score > 90 (Performance, SEO, Accessibility)
- [ ] Testar no mobile (iPhone e Android)
- [ ] Service Worker regista sem erros no Console

### Funcionalidade
- [ ] Carrinho adiciona e remove produtos
- [ ] Checkout completa encomenda
- [ ] Email de confirmação chega (Brevo)
- [ ] Double opt-in newsletter funciona
- [ ] Login/registo de conta funciona
- [ ] Pesquisa de produtos retorna resultados
- [ ] Filtros da loja funcionam
- [ ] Página de produto carrega dados do Supabase
- [ ] Formulário de contacto envia email
- [ ] 404 page funciona (aceder URL inexistente)

### SEO
- [ ] Verificar no Google Rich Results Test: https://search.google.com/test/rich-results
- [ ] Submeter sitemap no Google Search Console
- [ ] Verificar Open Graph no Facebook Debugger: https://developers.facebook.com/tools/debug/
- [ ] Confirmar que llms.txt está acessível: https://www.sportsfoodsireland.ie/llms.txt

---

## 🚫 NÃO FAZER UPLOAD para o servidor

### Ficheiros sensíveis (ficam só locais):
- `.env` — credenciais Supabase
- `.env.example`
- `package.json` / `package-lock.json`
- `README.md` / `LICENSE`
- `.gitignore`
- `DEPLOY-CHECKLIST.md` (este ficheiro)

> O `.htaccess` já bloqueia estes ficheiros se forem enviados por engano.

### Directórios que NÃO vão para produção:
- `node_modules/`
- `dev-archive/`
- `scripts/`
- `test-pw/`
- `.git/`
- `.venv/`
- `__pycache__/`
- `.agent/` / `.cursor/`
- `_tmp_banners/`
- `automation/`
- `supabase/`
- `docs/`
- `templates/`

---

## ✅ O QUE VAI PARA O SERVIDOR

### HTML (todas as páginas)
```
index.html, shop.html, produto.html, cart.html, checkout.html,
about.html, contact.html, brands.html, offers.html, faq.html,
blog.html, blog-post.html, account.html, wishlist.html,
compare.html, tracking.html, categories.html, 404.html,
privacy.html, terms.html, cookies.html, returns.html,
shipping.html, register-b2b.html
```

### Raiz
```
.htaccess, robots.txt, sitemap.xml, sitemap-images.xml,
favicon.ico, site.webmanifest, llms.txt, sw.js
```

### CSS
```
css/sfi-styles.min.css (v=25), css/critical.css, css/reviews.css
```

### JS (apenas .min.js)
```
js/sfi-api.min.js, js/sfi-attribution.min.js, js/sfi-data-loader.min.js,
js/cart.min.js, js/product-card.min.js, js/main.min.js,
js/sfi-fixes.min.js, js/sfi-enhancements.min.js, js/sfi-analytics.min.js,
js/brevo-integration.min.js, js/product.min.js,
js/dados-slim.json, js/dados.json
```

### Imagens
```
img/ (todos os WebP — os PNGs que têm equivalente WebP são excluídos pelo deploy.sh)
```

### B2B Portal
```
b2b/ (portal.html, shop.html, produto.html, landing.html, *.js, *.min.js)
```

---

## 🔧 VERSÕES ACTUAIS

| Recurso | Versão | Data |
|---------|--------|------|
| CSS | sfi-styles.min.css?v=25 | 31 Mar 2026 |
| Service Worker | sfi-v2 | 31 Mar 2026 |
| main.min.js | v16 | 31 Mar 2026 |
| product.min.js | - | 31 Mar 2026 |
| Imagens | WebP optimizados | 31 Mar 2026 |

## 📊 DIMENSÕES DO DEPLOY

| Item | Tamanho |
|------|---------|
| HTML (30 páginas) | ~1.7MB raw / ~200KB gzip |
| CSS | 231KB raw / 38KB gzip |
| JS total (.min) | 293KB raw / 85KB gzip |
| Imagens (WebP apenas) | ~20MB (sem PNGs redundantes) |
| **Total estimado** | **~22MB** |

## 🖥️ REQUISITOS DO SERVIDOR

- PHP: não necessário (site estático + Supabase API)
- Apache com: `mod_rewrite`, `mod_headers`, `mod_deflate`, `mod_expires`
- HTTPS obrigatório (redirect HTTP→HTTPS automático via .htaccess)
- Supabase Project: `styynhgzrkyoioqjssuw`
