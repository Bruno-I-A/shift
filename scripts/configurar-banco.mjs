/**
 * Prepara o banco na VPS, uma vez: dois papéis, o banco e as migrações.
 *
 *   node scripts/configurar-banco.mjs
 *
 * Rode pelo Console do serviço no Easypanel (lá a rede interna alcança o
 * Postgres) ou na sua máquina com túnel SSH. Ele pede a URL de administrador —
 * a que o Easypanel mostra no serviço do Postgres — sem ecoar na tela.
 *
 * O que faz:
 *   1. cria `shift_crm_owner` (dono das estruturas) e `shift_crm_app` (o que o
 *      site usa, sem poder sobre estrutura), com senhas geradas aqui;
 *   2. cria o banco `shift_crm`, de dono `shift_crm_owner`, fechado para os
 *      outros bancos da mesma instância (Cerebro: "Um Postgres, um banco por
 *      cliente");
 *   3. aplica as migrações — o passo seguinte, feito por ele mesmo, para a
 *      senha do dono não precisar atravessar um copiar-colar;
 *   4. imprime as duas URLs **uma vez**, para colar no Easypanel.
 *
 * Se os papéis já existem, para sem mudar nada.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";

import { migrar } from "./migrar.mjs";
import { perguntarOculto } from "./perguntar.mjs";

const BANCO = "shift_crm";
const DONO = "shift_crm_owner";
const APP = "shift_crm_app";

const urlAdmin = process.env.DATABASE_URL_ADMIN || (await perguntarOculto("URL de administrador do Postgres: "));
if (!/^postgres(ql)?:\/\//.test(urlAdmin)) {
  console.error("Isso não parece uma URL do Postgres (postgres://usuario:senha@host:5432/banco).");
  process.exit(1);
}

function urlPara(papel, senha) {
  const url = new URL(urlAdmin);
  url.username = papel;
  url.password = senha;
  url.pathname = `/${BANCO}`;
  return url.toString();
}

const admin = new pg.Client({ connectionString: urlAdmin, connectionTimeoutMillis: 10_000 });
await admin.connect();

try {
  const { rows } = await admin.query("select rolname from pg_roles where rolname = any($1)", [[DONO, APP]]);
  if (rows.length > 0) {
    console.error(`Já existem: ${rows.map((r) => r.rolname).join(", ")}. Nada foi alterado.`);
    console.error("Se é para recomeçar, apague o banco e os papéis à mão antes.");
    process.exit(1);
  }

  // base64url só tem letras, números, - e _: cabe entre aspas simples no SQL e
  // na URL sem precisar de escape nenhum.
  const senhaDono = randomBytes(24).toString("base64url");
  const senhaApp = randomBytes(24).toString("base64url");

  await admin.query(`create role ${DONO} login password '${senhaDono}'`);
  await admin.query(`create role ${APP} login password '${senhaApp}'`);
  await admin.query(`create database ${BANCO} owner ${DONO}`);
  console.log(`[configurar] papéis e banco "${BANCO}" criados`);

  const adminNoBanco = new URL(urlAdmin);
  adminNoBanco.pathname = `/${BANCO}`;
  const noBanco = new pg.Client({ connectionString: adminNoBanco.toString() });
  await noBanco.connect();
  try {
    await noBanco.query(`revoke all on database ${BANCO} from public`);
    await noBanco.query(`grant connect on database ${BANCO} to ${APP}`);
    await noBanco.query("revoke create on schema public from public");
  } finally {
    await noBanco.end();
  }

  const dono = new pg.Client({ connectionString: urlPara(DONO, senhaDono) });
  await dono.connect();
  try {
    const novas = await migrar(dono);
    console.log(`[configurar] ${novas} migração(ões) aplicada(s)`);
  } finally {
    await dono.end();
  }

  console.log("\nCole as duas no Easypanel, em Ambiente do serviço do CRM. Elas não são mostradas de novo;");
  console.log("se perder, troque a senha do papel no Postgres e monte a URL de novo.\n");
  console.log(`DATABASE_URL=${urlPara(APP, senhaApp)}`);
  console.log(`DATABASE_URL_MIGRACAO=${urlPara(DONO, senhaDono)}`);
} finally {
  await admin.end();
}
