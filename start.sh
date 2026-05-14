#!/usr/bin/env bash
set -e

CACHE_DIR="${PUPPETEER_CACHE_DIR:-/opt/render/project/src/.cache/puppeteer}"

CHROME_EXEC="${PUPPETEER_EXECUTABLE_PATH:-}"

if [ -z "$CHROME_EXEC" ] || [ ! -f "$CHROME_EXEC" ]; then
  echo "[start] Instalando chrome-headless-shell..."
  rm -rf "$CACHE_DIR/chrome-headless-shell"
  ./node_modules/.bin/puppeteer browsers install chrome-headless-shell

  CHROME_EXEC=$(find "$CACHE_DIR" -name "chrome-headless-shell" -type f 2>/dev/null | head -1)
  if [ -z "$CHROME_EXEC" ]; then
    echo "[start] ERROR: chrome-headless-shell no encontrado tras instalación"
    exit 1
  fi
  echo "[start] Instalado en: $CHROME_EXEC"
  export PUPPETEER_EXECUTABLE_PATH="$CHROME_EXEC"
else
  echo "[start] chrome-headless-shell ya disponible: $CHROME_EXEC"
fi

echo "[start] Iniciando servidor..."
node src/server.js
