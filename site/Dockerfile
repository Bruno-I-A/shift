# =============================================================================
# Imagem do site institucional (shiftsys.com.br), para o Easypanel.
#
# O site é estático: o Node só compila (Tailwind + cópia para dist/), e quem
# serve é um nginx sem root. O HTTPS e o domínio são do Traefik do Easypanel;
# este contêiner só responde HTTP na porta 8080 da rede interna.
# =============================================================================

FROM node:22-alpine AS compilacao
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# A variante "unprivileged" roda como usuário comum e escuta na 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilacao /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
