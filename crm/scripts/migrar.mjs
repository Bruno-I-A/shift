/**
 * Aplica as migrações pendentes de `banco/sql`. Roda no boot da imagem, antes
 * do servidor — ver `docker-entrypoint.sh`.
 *
 *   node scripts/migrar.mjs
 *
 * Mesmo desenho do Beto Galina e da Guilda (Cerebro: "Migração entra no
 * entrypoint da imagem, não em passo manual"):
 *
 * - Sem `DATABASE_URL_MIGRACAO`, avisa e sai com zero. O app sobe e a rota
 *   /api/saude diz o que falta. Bloquear aqui derrubaria justamente o lugar
 *   onde se descobre a variável ausente.
 * - Com a variável, qualquer falha sai diferente de zero e o contêiner não
 *   sobe. Código novo sobre banco velho serve erro em página que parece pronta.
 * - Uma transação por arquivo. Se o segundo falha, o primeiro fica aplicado e
 *   registrado, e a próxima subida recomeça dali.
 * - Arquivo alterado depois de aplicado avisa e não bloqueia.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const PASTA_SQL = join(dirname(fileURLToPath(import.meta.url)), "..", "banco", "sql");

const impressao = (sql) => createHash("sha256").update(sql, "utf8").digest("hex").slice(0, 16);

export function listarArquivos() {
  return readdirSync(PASTA_SQL)
    .filter((nome) => /^\d{3}-[a-z0-9-]+\.sql$/.test(nome))
    .sort();
}

export async function migrar(cliente, log = console.log) {
  // Em desenvolvimento o PGlite tem uma sessão só, e o servidor pode tê-la
  // deixado com `set role shift_crm_app`. Em produção não muda nada.
  await cliente.query("reset role");

  await cliente.query("create schema if not exists crm");
  await cliente.query(`
    create table if not exists crm.migracao (
      arquivo text primary key,
      impressao text not null,
      aplicada_em timestamptz not null default now()
    )
  `);

  const { rows } = await cliente.query("select arquivo, impressao from crm.migracao");
  const aplicadas = new Map(rows.map((r) => [r.arquivo, r.impressao]));
  let novas = 0;

  for (const arquivo of listarArquivos()) {
    const sql = readFileSync(join(PASTA_SQL, arquivo), "utf8");
    const marca = impressao(sql);
    const registrada = aplicadas.get(arquivo);

    if (registrada !== undefined) {
      if (registrada !== marca) {
        console.warn(`[migrar] AVISO: ${arquivo} mudou depois de aplicado. O banco não mudou.`);
      }
      continue;
    }

    await cliente.query("begin");
    try {
      await cliente.query(sql);
      await cliente.query("insert into crm.migracao (arquivo, impressao) values ($1, $2)", [
        arquivo,
        marca,
      ]);
      await cliente.query("commit");
    } catch (erro) {
      await cliente.query("rollback").catch(() => {});
      throw new Error(`${arquivo}: ${erro.message}${erro.position ? ` (posição ${erro.position})` : ""}`);
    }

    log(`[migrar] aplicada ${arquivo}`);
    novas += 1;
  }

  // Depois das migrações, porque é a primeira delas que cria o papel no
  // schema. A rota de saúde lê esta tabela para dizer em que ponto o banco está.
  await cliente.query("grant select on crm.migracao to shift_crm_app");
  return novas;
}

const executadoDireto = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (executadoDireto) {
  const url = process.env.DATABASE_URL_MIGRACAO;

  if (!url) {
    console.warn(
      "[migrar] DATABASE_URL_MIGRACAO ausente: nenhuma migração foi conferida.\n" +
        "[migrar] O app sobe assim mesmo — veja /api/saude.",
    );
    process.exit(0);
  }

  const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  try {
    await cliente.connect();
    const { rows } = await cliente.query("select current_user as papel, current_database() as banco");
    const novas = await migrar(cliente);
    console.log(
      novas === 0
        ? `[migrar] nada pendente em "${rows[0].banco}" (como ${rows[0].papel})`
        : `[migrar] ${novas} migração(ões) aplicada(s) em "${rows[0].banco}"`,
    );
  } catch (erro) {
    console.error(`[migrar] FALHOU: ${erro.message}`);
    console.error("[migrar] O app não vai subir: código novo sobre banco velho serve erro em página");
    console.error("[migrar] que parece pronta, e ninguém investiga o que parece pronto.");
    process.exitCode = 1;
  } finally {
    await cliente.end().catch(() => {});
  }
}
