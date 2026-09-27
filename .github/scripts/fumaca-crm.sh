#!/usr/bin/env bash
# Ensaia o deploy do CRM contra um PostgreSQL 17 de verdade:
#   1. configurar-banco.mjs cria papéis, banco e aplica as migrações (como no
#      Console do Easypanel);
#   2. o contêiner sobe com as URLs que ele gerou e o entrypoint confere as
#      migrações de novo;
#   3. /api/saude, /api/mcp e /api/leads respondem como devem.
set -euo pipefail

ADMIN=postgres://postgres:postgres@localhost:5432/postgres

# As senhas geradas vão para um arquivo, não para o log.
docker run --rm --network host -e DATABASE_URL_ADMIN="$ADMIN" shift-crm \
  node scripts/configurar-banco.mjs > configurar.txt
grep '^\[configurar\]' configurar.txt
DATABASE_URL=$(grep '^DATABASE_URL=' configurar.txt | cut -d= -f2-)
DATABASE_URL_MIGRACAO=$(grep '^DATABASE_URL_MIGRACAO=' configurar.txt | cut -d= -f2-)
echo "::add-mask::$DATABASE_URL"
echo "::add-mask::$DATABASE_URL_MIGRACAO"

docker run -d --name crm --network host \
  -e DATABASE_URL="$DATABASE_URL" \
  -e DATABASE_URL_MIGRACAO="$DATABASE_URL_MIGRACAO" \
  -e ADMIN_EMAIL=ci@shift.local \
  -e ADMIN_SENHA_HASH=scrypt:32768:8:1:c2FsZGVjaQ:aGFzaGRlY2k \
  -e SESSAO_SEGREDO=segredo-so-para-o-ci-com-mais-de-32-caracteres \
  -e APP_URL=http://localhost:3000 \
  shift-crm >/dev/null
trap 'docker logs crm; docker rm -f crm >/dev/null' EXIT

for _ in $(seq 1 30); do
  curl -fsS -o /dev/null http://localhost:3000/api/saude && break
  sleep 1
done

falhou=0
confere() { # descrição, esperado, obtido
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FALHA $1: esperado '$2', veio '$3'"; falhou=1; fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

saude=$(curl -s http://localhost:3000/api/saude)
echo "saúde: $saude"
confere "saúde ok" true "$(echo "$saude" | jq -r .ok)"
confere "três migrações aplicadas" 3 "$(echo "$saude" | jq '.banco.migracoes | length')"
confere "painel sem sessão vai para o login" 307 "$(status http://localhost:3000/)"
confere "MCP sem chave" 401 "$(status -X POST -H 'content-type: application/json' -d '{}' http://localhost:3000/api/mcp)"

lead() { # corpo, origem
  curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H 'content-type: text/plain;charset=UTF-8' -H "origin: $2" \
    --data "$1" http://localhost:3000/api/leads
}
corpo() { # whatsapp, autorizado
  cat <<JSON
{"respostas":{"segmento":"Escritório contábil","dor":"Conferência de documentos","prazo":"Agora"},
 "nivelCalculado":"Nível 2","ofertaRecomendada":"Operação assistida","processoSugerido":"Triagem",
 "nome":"Maria","empresa":"Contábil Maria","whatsapp":"$1",
 "consentimento":{"autorizado":$2,"dataHora":"2026-09-27T12:00:00Z"},"origem":"diagnostico-site"}
JSON
}

confere "lead com consentimento" 201 "$(lead "$(corpo '(54) 99999-1234' true)" https://shiftsys.com.br)"
confere "lead sem consentimento" 422 "$(lead "$(corpo '(54) 99999-1234' false)" https://shiftsys.com.br)"
confere "lead de outra origem" 403 "$(lead "$(corpo '(54) 99999-1234' true)" https://outro-site.com)"
confere "mesmo WhatsApp de novo" 201 "$(lead "$(corpo '54 99999 1234' true)" https://www.shiftsys.com.br)"
confere "terceiro envio do IP" 201 "$(lead "$(corpo '(54) 98888-0000' true)" https://shiftsys.com.br)"
confere "quarto envio do IP" 201 "$(lead "$(corpo '(54) 97777-0000' true)" https://shiftsys.com.br)"
confere "quinto envio do IP" 201 "$(lead "$(corpo '(54) 96666-0000' true)" https://shiftsys.com.br)"
confere "sexto envio do IP é barrado" 429 "$(lead "$(corpo '(54) 95555-0000' true)" https://shiftsys.com.br)"
confere "preflight devolve a origem do site" 1 \
  "$(curl -s -X OPTIONS -D - -o /dev/null -H 'origin: https://shiftsys.com.br' http://localhost:3000/api/leads \
     | grep -ci 'access-control-allow-origin: https://shiftsys.com.br')"

total=$(PGPASSWORD=postgres psql -h localhost -U postgres -d shift_crm -tAc "select count(*) from crm.lead")
confere "o mesmo WhatsApp virou um lead só (4 leads)" 4 "$total"
confere "IP não guardado em claro" 0 \
  "$(PGPASSWORD=postgres psql -h localhost -U postgres -d shift_crm -tAc "select count(*) from crm.envio_publico where chave in ('desconhecido','127.0.0.1')")"

exit $falhou
