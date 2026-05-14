#!/usr/bin/env bash
set -e
echo "[start] Instalando Chrome..."
npx puppeteer browsers install chrome
echo "[start] Chrome listo. Iniciando servidor..."
node src/server.js
