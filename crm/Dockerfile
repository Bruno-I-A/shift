# =============================================================================
# Imagem do CRM, para o Easypanel. Mesmo desenho do Beto Galina: três estágios,
# e a imagem final leva só o servidor, as migrações e os scripts de operação.
# =============================================================================

FROM node:22-alpine AS dependencias
WORKDIR /app
# Só os manifestos primeiro: enquanto não mudarem, esta camada é reaproveitada.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS compilacao
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS execucao
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Processo de servidor não roda como root.
RUN addgroup --system --gid 1001 nextjs \
 && adduser --system --uid 1001 --ingroup nextjs nextjs

COPY --from=compilacao --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=compilacao --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=compilacao --chown=nextjs:nextjs /app/public ./public

# Migrações e scripts de operação. O `pg` que eles importam já vem no
# standalone, porque o servidor também usa.
COPY --chown=nextjs:nextjs banco/sql ./banco/sql
COPY --chown=nextjs:nextjs scripts/migrar.mjs scripts/configurar-banco.mjs scripts/perguntar.mjs ./scripts/

COPY docker-entrypoint.sh /usr/local/bin/entrada.sh
RUN chmod +x /usr/local/bin/entrada.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/saude >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/entrada.sh"]
CMD ["node", "server.js"]
