#!/usr/bin/env bash
set -e

CACHE_DIR="${PUPPETEER_CACHE_DIR:-/opt/render/project/src/.cache/puppeteer}"

echo "[start] PUPPETEER_CACHE_DIR=${PUPPETEER_CACHE_DIR}"
echo "[start] CACHE_DIR=${CACHE_DIR}"

CHROME_EXEC=$(node -e "const p=require('puppeteer');try{console.log(p.executablePath())}catch(e){console.log('')}" 2>/dev/null)
echo "[start] executablePath esperado: ${CHROME_EXEC}"
echo "[start] Existe: $([ -f "$CHROME_EXEC" ] && echo SI || echo NO)"

if [ -z "$CHROME_EXEC" ] || [ ! -f "$CHROME_EXEC" ]; then
  echo "[start] Limpiando e instalando Chrome..."
  rm -rf "$CACHE_DIR/chrome"
  ./node_modules/.bin/puppeteer browsers install chrome 2>&1
  echo "[start] Exit code: $?"
  echo "[start] Contenido de $CACHE_DIR:"
  find "$CACHE_DIR" -type f 2>/dev/null || echo "(vacío)"
else
  echo "[start] Chrome ya disponible, saltando instalación"
fi

echo "[start] Iniciando servidor..."
node src/server.js
