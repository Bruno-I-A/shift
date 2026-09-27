#!/bin/sh
# =============================================================================
# Entrada do contêiner: migra, depois sobe o servidor.
#
# O passo de migração mora aqui, e não num comando no Console, para acontecer
# em toda subida sem depender de alguém lembrar (Cerebro: "Migração entra no
# entrypoint da imagem, não em passo manual").
#
# `set -e`: se o migrar.mjs sair diferente de zero, o contêiner não sobe.
# Sem DATABASE_URL_MIGRACAO ele avisa e sai com zero — o app sobe e o
# /api/saude diz o que falta.
# =============================================================================
set -e

node /app/scripts/migrar.mjs

exec "$@"
