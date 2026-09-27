/**
 * Um PostgreSQL de verdade para desenvolver, sem Docker e sem instalar nada:
 * o PGlite (Postgres compilado para WebAssembly) servido numa porta local.
 *
 *   npm run banco:local        (deixe rodando; Ctrl+C para parar)
 *
 * Os dados ficam em `.banco-local/`. Apagar a pasta recomeça do zero.
 *
 * O PGlite tem um usuário só, superusuário. O app assume `shift_crm_app` com
 * `BANCO_PAPEL` (ver .env.exemplo), para que as permissões valham também aqui —
 * senão um GRANT esquecido só apareceria em produção.
 *
 * Limite: o PGlite tem uma sessão só por baixo, então use BANCO_MAX_CONEXOES=1.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { migrar } from "./migrar.mjs";

const PORTA = Number(process.env.PORTA_BANCO_LOCAL ?? 54330);

const db = await PGlite.create("./.banco-local");
await db.exec(`
  do $$ begin
    if not exists (select from pg_roles where rolname = 'shift_crm_app') then
      create role shift_crm_app nologin;
    end if;
  end $$;
`);

const consulta = {
  async query(sql, params) {
    if (!params || params.length === 0) {
      const resultados = await db.exec(sql);
      return { rows: resultados.at(-1)?.rows ?? [] };
    }
    return db.query(sql, params);
  },
};
const novas = await migrar(consulta);
console.log(`[banco-local] ${novas} migração(ões) aplicada(s)`);

const servidor = new PGLiteSocketServer({ db, host: "127.0.0.1", port: PORTA });
await servidor.start();
console.log(`[banco-local] ouvindo em 127.0.0.1:${PORTA} — Ctrl+C para parar`);

async function parar() {
  await servidor.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", parar);
process.on("SIGTERM", parar);
