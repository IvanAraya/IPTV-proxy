#!/usr/bin/env bash
set -e

PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer

# Instalar dependencias sin que puppeteer descargue Chrome en el postinstall
PUPPETEER_CACHE_DIR=$PUPPETEER_CACHE_DIR PUPPETEER_SKIP_DOWNLOAD=true npm install

# Limpiar carpeta de Chrome incompleta que pueda venir del cache de Render
rm -rf "$PUPPETEER_CACHE_DIR/chrome"

# Instalar Chrome limpiamente
PUPPETEER_CACHE_DIR=$PUPPETEER_CACHE_DIR npx puppeteer browsers install chrome
