#!/usr/bin/env bash
# Sobe a imagem do site e confere as respostas que importam em produção.
set -euo pipefail

docker run -d --name site -p 8080:8080 shift-site >/dev/null
trap 'docker logs site; docker rm -f site >/dev/null' EXIT

for _ in $(seq 1 20); do
  curl -fsS -o /dev/null http://localhost:8080/ && break
  sleep 1
done

falhou=0
confere() { # descrição, esperado, obtido
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FALHA $1: esperado '$2', veio '$3'"; falhou=1; fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

confere "página inicial" 200 "$(status http://localhost:8080/)"
confere "página com .html" 200 "$(status http://localhost:8080/diagnostico.html)"
confere "página sem .html" 200 "$(status http://localhost:8080/diagnostico)"
confere "rota inexistente dá 404" 404 "$(status http://localhost:8080/nao-existe)"
confere "404 usa a página do site" 1 "$(curl -s http://localhost:8080/nao-existe | grep -qi 'shift' && echo 1 || echo 0)"
confere "arquivo oculto fechado" 404 "$(status http://localhost:8080/.openai/hosting.json)"
confere "www vai para o domínio sem www" 301 "$(status -H 'Host: www.shiftsys.com.br' http://localhost:8080/processo.html)"
confere "destino do www" "https://shiftsys.com.br/processo.html" \
  "$(curl -s -o /dev/null -w '%{redirect_url}' -H 'Host: www.shiftsys.com.br' http://localhost:8080/processo.html)"
confere "robots.txt" 200 "$(status http://localhost:8080/robots.txt)"
confere "cache curto nos assets" 1 \
  "$(curl -sI http://localhost:8080/assets/site.css | grep -ci 'cache-control: max-age=3600')"
confere "nosniff" 1 "$(curl -sI http://localhost:8080/ | grep -ci 'x-content-type-options: nosniff')"
confere "diagnóstico aponta para o CRM" 1 \
  "$(curl -s http://localhost:8080/diagnostico.html | grep -c 'https://crm.shiftsys.com.br/api/leads')"

exit $falhou
