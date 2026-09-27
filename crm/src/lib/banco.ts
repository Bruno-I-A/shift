import "server-only";

import { Pool } from "pg";

import type { Consulta } from "./consulta";

/**
 * Acesso ao PostgreSQL.
 *
 * Um `DATABASE_URL`, apontando para `shift_crm_app` — **não** para o dono do
 * banco nem para o usuário que o Easypanel entrega. É esse papel que torna o
 * histórico só de escrita: a aplicação não tem UPDATE nem DELETE em
 * `crm.evento` e `crm.sessao`. Conectada como dono, as permissões continuariam
 * escritas e simplesmente deixariam de valer, sem erro nenhum.
 *
 * Por isso a premissa é conferida contra o banco na primeira consulta, e a
 * resposta errada derruba a requisição (Cerebro: "Um papel de banco só, e o
 * DATABASE_URL apontando para ele").
 */

function precisa(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Falta a variável de ambiente ${nome}. Ver README.md.`);
  return valor;
}

// Em `globalThis` por causa do recarregamento a quente: sem isso, cada edição
// em desenvolvimento criaria um pool novo até o banco recusar conexões.
const deposito = globalThis as unknown as { poolCrm?: Pool };

function pool(): Pool {
  if (deposito.poolCrm) return deposito.poolCrm;

  const novo = new Pool({
    connectionString: precisa("DATABASE_URL"),
    ssl: process.env.BANCO_SSL === "sim" ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.BANCO_MAX_CONEXOES ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Só em desenvolvimento com o PGlite (`npm run banco:local`), que tem um
  // usuário só: assume o papel da aplicação para que as permissões valham
  // também ali. Em produção fica vazio e quem define o papel é a URL.
  const papel = process.env.BANCO_PAPEL;
  if (papel) {
    if (!/^[a-z_]+$/.test(papel)) throw new Error("BANCO_PAPEL inválido.");
    novo.on("connect", (cliente) => {
      cliente.query(`set role ${papel}`).catch((erro) => console.error("[banco] set role:", erro.message));
    });
  }

  novo.on("error", (erro) => console.error("[banco] conexão ociosa falhou:", erro.message));
  deposito.poolCrm = novo;
  return novo;
}

let conferencia: Promise<void> | null = null;

async function conferirPapel(): Promise<void> {
  if (conferencia) return conferencia;

  conferencia = (async () => {
    const { rows } = await pool().query<{ usuario: string; poderoso: boolean; dono: boolean }>(
      `select current_user as usuario,
              r.rolsuper or r.rolbypassrls as poderoso,
              coalesce((select n.nspowner = r.oid from pg_namespace n where n.nspname = 'crm'), false) as dono
         from pg_roles r where r.rolname = current_user`,
    );
    const papel = rows[0];
    if (!papel || papel.poderoso || papel.dono) {
      throw new Error(
        `Recusando operar: o DATABASE_URL conecta como "${papel?.usuario}", que é superusuário ` +
          `ou dono do schema crm. Use o papel shift_crm_app — ver README.md.`,
      );
    }
  })();

  // Falha transitória de rede não pode deixar a conferência marcada para sempre.
  conferencia.catch(() => {
    conferencia = null;
  });
  return conferencia;
}

/**
 * A única porta para o banco: abre transação, executa, confirma. No erro,
 * desfaz. Nunca devolve a conexão, só o resultado.
 */
export async function emTransacao<T>(executar: (tx: Consulta) => Promise<T>): Promise<T> {
  await conferirPapel();
  const cliente = await pool().connect();
  const tx: Consulta = {
    query: async <R,>(sql: string, params?: unknown[]) => {
      const { rows } = await cliente.query(sql, params);
      return { rows: rows as R[] };
    },
  };

  try {
    await cliente.query("begin");
    const resultado = await executar(tx);
    await cliente.query("commit");
    return resultado;
  } catch (erro) {
    await cliente.query("rollback").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

/** Para a rota de saúde: em que ponto o banco está, sem expor nada além disso. */
export async function estadoDoBanco(): Promise<{ migracoes: string[] }> {
  const { rows } = await pool().query<{ arquivo: string }>(
    "select arquivo from crm.migracao order by arquivo",
  );
  return { migracoes: rows.map((r) => r.arquivo) };
}
