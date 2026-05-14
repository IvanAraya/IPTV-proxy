#!/usr/bin/env bash
set -e

CACHE_DIR="${PUPPETEER_CACHE_DIR:-/opt/render/project/src/.cache/puppeteer}"

# Obtener la ruta esperada del binario via Node
CHROME_EXEC=$(node -e "const p=require('puppeteer');try{console.log(p.executablePath())}catch(e){console.log('')}" 2>/dev/null)

if [ -z "$CHROME_EXEC" ] || [ ! -f "$CHROME_EXEC" ]; then
  echo "[start] Chrome no encontrado. Limpiando e instalando..."
  rm -rf "$CACHE_DIR/chrome"
  npx puppeteer browsers install chrome
  echo "[start] Chrome instalado en: $(find "$CACHE_DIR" -name chrome -type f 2>/dev/null | head -1)"
else
  echo "[start] Chrome ya disponible: $CHROME_EXEC"
fi

echo "[start] Iniciando servidor..."
node src/server.js
