# Remoção de Watermark Veo e Concatenação de Vídeos para Instagram Reels

## Resumo da Tarefa
Você possui 4 clips gerados pelo Veo com watermark no canto inferior direito (~8% do frame) e deseja:
1. Remover o watermark de cada clip
2. Concatenar os 4 clips em um único vídeo
3. Redimensionar para Instagram Reels (9:16, 1080x1920)
4. Garantir que o vídeo final tenha 20 segundos

## Abordagem

### Opção 1: Crop + Escala (Recomendada para Remoção de Watermark)

Se o watermark ocupa ~8% do frame inferior direito, você pode usar crop para remover essa área:

```bash
# Variáveis
CLIPS_DIR="$HOME/Desktop/sport/marketing/videos/clips"
OUTPUT_DIR="$CLIPS_DIR/processed"
mkdir -p "$OUTPUT_DIR"

# Passo 1: Remover watermark de cada clip usando crop
# Assumindo que o watermark está nos últimos ~8% da altura (canto inferior direito)
# Se o vídeo é 1920x1080, cortamos para 1920x992 (removendo ~88 pixels)

for i in 1 2 3 4; do
  ffmpeg -i "$CLIPS_DIR/v3_clip${i}.mp4" \
    -vf "crop=1920:992:0:0" \
    -c:a aac -b:a 128k \
    "$OUTPUT_DIR/v3_clip${i}_no_watermark.mp4"
done
```

### Opção 2: Delogo com Máscara (Mais Preciso)

Se você conhece a localização exata do watermark:

```bash
# Remover watermark usando delogo (máscara no canto inferior direito)
for i in 1 2 3 4; do
  ffmpeg -i "$CLIPS_DIR/v3_clip${i}.mp4" \
    -vf "delogo=x=1750:y=1000:w=170:h=80:show=0" \
    -c:a aac -b:a 128k \
    "$OUTPUT_DIR/v3_clip${i}_no_watermark.mp4"
done
```

*Ajuste os valores de `x`, `y`, `w`, `h` conforme necessário para sua situação específica.*

### Passo 2: Criar Arquivo de Concatenação

```bash
# Criar arquivo concat.txt
cat > "$OUTPUT_DIR/concat.txt" << EOF
file '$OUTPUT_DIR/v3_clip1_no_watermark.mp4'
file '$OUTPUT_DIR/v3_clip2_no_watermark.mp4'
file '$OUTPUT_DIR/v3_clip3_no_watermark.mp4'
file '$OUTPUT_DIR/v3_clip4_no_watermark.mp4'
EOF
```

### Passo 3: Concatenar os Clips

```bash
# Concatenar os 4 clips
ffmpeg -f concat -safe 0 -i "$OUTPUT_DIR/concat.txt" \
  -c copy \
  "$OUTPUT_DIR/concatenated.mp4"
```

### Passo 4: Redimensionar para Instagram Reels (9:16, 1080x1920)

```bash
# Redimensionar com pillar-boxing (barras pretas nas laterais)
ffmpeg -i "$OUTPUT_DIR/concatenated.mp4" \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 128k \
  "$OUTPUT_DIR/final_reels.mp4"
```

## Script Completo (Automação)

```bash
#!/bin/bash

# Configuração
CLIPS_DIR="$HOME/Desktop/sport/marketing/videos/clips"
OUTPUT_DIR="$CLIPS_DIR/processed"
FINAL_OUTPUT="$CLIPS_DIR/final_reels_20s.mp4"

# Criar diretório de saída
mkdir -p "$OUTPUT_DIR"

# Passo 1: Remover watermark
echo "Removendo watermark dos clips..."
for i in 1 2 3 4; do
  echo "Processando clip $i..."
  ffmpeg -i "$CLIPS_DIR/v3_clip${i}.mp4" \
    -vf "crop=1920:992:0:0" \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 128k \
    "$OUTPUT_DIR/v3_clip${i}_no_watermark.mp4"
done

# Passo 2: Criar arquivo de concatenação
echo "Preparando concatenação..."
cat > "$OUTPUT_DIR/concat.txt" << EOF
file '$OUTPUT_DIR/v3_clip1_no_watermark.mp4'
file '$OUTPUT_DIR/v3_clip2_no_watermark.mp4'
file '$OUTPUT_DIR/v3_clip3_no_watermark.mp4'
file '$OUTPUT_DIR/v3_clip4_no_watermark.mp4'
EOF

# Passo 3: Concatenar
echo "Concatenando clips..."
ffmpeg -f concat -safe 0 -i "$OUTPUT_DIR/concat.txt" \
  -c copy \
  "$OUTPUT_DIR/concatenated.mp4"

# Passo 4: Redimensionar para Instagram Reels
echo "Redimensionando para Instagram Reels (9:16, 1080x1920)..."
ffmpeg -i "$OUTPUT_DIR/concatenated.mp4" \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 128k \
  "$FINAL_OUTPUT"

echo "Vídeo final criado em: $FINAL_OUTPUT"
```

## Notas Importantes

### Sobre a Duração de 20 Segundos
- Se os 4 clips tiverem durações diferentes, a concatenação manterá a duração total deles
- Se você quiser exatamente 20 segundos, ajuste com `-t 20` durante a concatenação:
```bash
ffmpeg -f concat -safe 0 -i concat.txt \
  -t 20 \
  -c copy \
  concatenated.mp4
```

### Qualidade vs. Tamanho
- `crf 23`: qualidade padrão (17-28, onde 17 é melhor)
- `preset`: fast/medium/slow (mais lento = melhor qualidade)
- Para Instagram, crf 22-23 é recomendado

### Alternativas para Remover Watermark
1. **Crop**: Remove a área com watermark (mais simples)
2. **Delogo**: Tenta preencher a área (melhor resultado visual)
3. **Subtração de Frames**: Se o watermark é transparente, use composição de camadas

### Validação
Verifique o vídeo final:
```bash
ffprobe "$FINAL_OUTPUT"
```

## Requisitos
- FFmpeg instalado: `sudo apt-get install ffmpeg` (Linux) ou `brew install ffmpeg` (macOS)
- Espaço em disco suficiente para vídeos intermediários
- Permissões de escrita na pasta ~/Desktop/sport/marketing/videos/clips
