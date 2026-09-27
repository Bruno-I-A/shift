/**
 * Um PostgreSQL de verdade por teste, em memória, via PGlite.
 *
 * As migrações rodam como dono (o usuário padrão do PGlite) e, antes de
 * devolver a conexão, o teste assume o papel `shift_crm_app` — o mesmo da
 * produção. Assim um GRANT esquecido em `001-estrutura.sql` quebra o teste em
 * vez de quebrar a primeira tela depois do deploy.
 */
import { PGlite } from "@electric-sql/pglite";

import type { Consulta } from "@/lib/consulta";
// O mesmo script que roda no boot da imagem.
import { migrar } from "../scripts/migrar.mjs";

export function adaptar(db: PGlite): Consulta {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      // Sem parâmetros o SQL pode ter vários comandos (os arquivos de migração),
      // e só o `exec` do PGlite aceita isso. É o que o `pg` faz sozinho.
      if (!params || params.length === 0) {
        const resultados = await db.exec(sql);
        return { rows: (resultados.at(-1)?.rows ?? []) as T[] };
      }
      const { rows } = await db.query<T>(sql, params);
      return { rows };
    },
  };
}

export async function bancoDeTeste() {
  const db = await PGlite.create();
  await db.exec("create role shift_crm_app nologin");
  await migrar(adaptar(db), () => {});
  await db.exec("set role shift_crm_app");
  return { db, tx: adaptar(db) };
}
