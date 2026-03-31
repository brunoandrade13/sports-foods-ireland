#!/bin/bash
# ============================================================
# SFI Deploy Script — Prepara pacote para upload ao servidor
# Uso: bash deploy.sh
# ============================================================
set -e

SITE_DIR="/Users/test/Desktop/sport/website-sfi-novo"
DEPLOY_DIR="/Users/test/Desktop/sport/sfi-deploy-package"

echo "🚀 SFI Deploy — Preparando pacote de produção"
echo ""

# Limpar deploy anterior
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# ============================================================
# 1. COPIAR APENAS ARQUIVOS DE PRODUÇÃO
# ============================================================
echo "📁 Copiando arquivos de produção..."

# HTML pages
cp "$SITE_DIR"/*.html "$DEPLOY_DIR/"
echo "  ✓ $(ls "$SITE_DIR"/*.html | wc -l | tr -d ' ') HTML pages"

# CSS (apenas minificados + critical + reviews)
mkdir -p "$DEPLOY_DIR/css"
cp "$SITE_DIR/css/sfi-styles.min.css" "$DEPLOY_DIR/css/"
cp "$SITE_DIR/css/critical.css" "$DEPLOY_DIR/css/"
cp "$SITE_DIR/css/reviews.css" "$DEPLOY_DIR/css/"
echo "  ✓ 3 CSS files"

# JS (apenas .min.js + dados.json + dados-slim.json)
mkdir -p "$DEPLOY_DIR/js"
cp "$SITE_DIR"/js/*.min.js "$DEPLOY_DIR/js/"
cp "$SITE_DIR/js/dados.json" "$DEPLOY_DIR/js/"
cp "$SITE_DIR/js/dados-slim.json" "$DEPLOY_DIR/js/"
echo "  ✓ $(ls "$DEPLOY_DIR"/js/*.min.js | wc -l | tr -d ' ') JS min files + 2 JSON data"

# Images
cp -r "$SITE_DIR/img" "$DEPLOY_DIR/img"
echo "  ✓ img/ directory"

# Remover PNGs que têm versão WebP (economiza ~58MB no servidor)
echo "  🗜️  Removendo PNGs redundantes (já convertidos para WebP)..."
removed=0
for webp_file in "$DEPLOY_DIR/img/"*.webp; do
    png_file="${webp_file%.webp}.png"
    if [ -f "$png_file" ]; then
        rm "$png_file"
        removed=$((removed + 1))
    fi
done
echo "  ✓ $removed PNGs redundantes removidos do pacote de deploy"

# Root files
cp "$SITE_DIR/robots.txt" "$DEPLOY_DIR/"
cp "$SITE_DIR/sitemap.xml" "$DEPLOY_DIR/"
cp "$SITE_DIR/sitemap-images.xml" "$DEPLOY_DIR/"
cp "$SITE_DIR/llms.txt" "$DEPLOY_DIR/"
cp "$SITE_DIR/sw.js" "$DEPLOY_DIR/"
cp "$SITE_DIR/favicon.ico" "$DEPLOY_DIR/"
cp "$SITE_DIR/site.webmanifest" "$DEPLOY_DIR/"
cp "$SITE_DIR/.htaccess" "$DEPLOY_DIR/"
echo "  ✓ robots.txt, sitemap.xml, sitemap-images.xml, llms.txt, sw.js, favicon.ico, site.webmanifest, .htaccess"

# B2B portal
cp -r "$SITE_DIR/b2b" "$DEPLOY_DIR/b2b"
echo "  ✓ b2b/ directory"

# Admin (se quiser incluir)
cp -r "$SITE_DIR/admin" "$DEPLOY_DIR/admin"
echo "  ✓ admin/ directory"

# ============================================================
# 2. VERIFICAÇÕES DE SEGURANÇA
# ============================================================
echo ""
echo "🔒 Verificações de segurança..."

# Garantir que .env NÃO está no pacote
if [ -f "$DEPLOY_DIR/.env" ]; then
    rm "$DEPLOY_DIR/.env"
    echo "  ⚠️  .env removido do pacote!"
fi

# Garantir que dev-archive NÃO está no pacote
if [ -d "$DEPLOY_DIR/dev-archive" ]; then
    rm -rf "$DEPLOY_DIR/dev-archive"
    echo "  ⚠️  dev-archive/ removido do pacote!"
fi

# Garantir que JS source (não-minificados) NÃO estão no pacote
find "$DEPLOY_DIR/js" -name "*.js" ! -name "*.min.js" ! -name "*.json" -delete 2>/dev/null
echo "  ✓ Apenas .min.js no pacote (source files removidos)"

# Garantir que node_modules NÃO está
rm -rf "$DEPLOY_DIR/node_modules" 2>/dev/null

# Remover arquivos de desenvolvimento
rm -f "$DEPLOY_DIR/package.json" "$DEPLOY_DIR/package-lock.json" 2>/dev/null
rm -rf "$DEPLOY_DIR/.git" "$DEPLOY_DIR/.venv" "$DEPLOY_DIR/__pycache__" 2>/dev/null
rm -rf "$DEPLOY_DIR/.claude" "$DEPLOY_DIR/.cursor" "$DEPLOY_DIR/.agent" 2>/dev/null
rm -f "$DEPLOY_DIR/.DS_Store" 2>/dev/null
rm -f "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/LICENSE" "$DEPLOY_DIR/README.md" 2>/dev/null
echo "  ✓ Arquivos de desenvolvimento removidos"

# ============================================================
# 3. RELATÓRIO FINAL
# ============================================================
echo ""
echo "📊 Pacote de deploy pronto:"
echo "  📂 Local: $DEPLOY_DIR"
echo "  📄 Arquivos: $(find "$DEPLOY_DIR" -type f | wc -l | tr -d ' ')"
echo "  💾 Tamanho: $(du -sh "$DEPLOY_DIR" | cut -f1)"
echo ""
echo "============================================================"
echo "📋 PRÓXIMOS PASSOS:"
echo "============================================================"
echo ""
echo "1. Acessar o cPanel/painel do teu hosting"
echo "2. Ir ao File Manager → public_html/"
echo "3. Fazer BACKUP da pasta atual do WordPress"
echo "4. Fazer upload de TODOS os arquivos de:"
echo "   $DEPLOY_DIR"
echo "   para a pasta public_html/ do servidor"
echo ""
echo "⚠️  IMPORTANTE: NÃO fazer upload do .env!"
echo "⚠️  O .htaccess vai proteger arquivos sensíveis automaticamente"
echo "============================================================"
