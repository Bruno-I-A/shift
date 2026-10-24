"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { emTransacao } from "@/lib/banco";
import * as crm from "@/lib/crm";
import * as instagram from "@/lib/instagram";
import { ErroDeDominio, IDS_ETAPA, IDS_ETAPA_LEAD, IDS_TIPO } from "@/lib/dominio";
import { excluirLeadComHistorico, mudarEtapaDoLead, mudarModoAtendimentoWhatsApp } from "@/lib/leads";
import { enviarTextoMeta } from "@/lib/whatsapp";
import { enviarModeloHumano, enviarRespostaHumana } from '@/lib/whatsapp-manual';
import { criarModeloMeta, enviarModeloMeta, listarModelosMeta } from '@/lib/modelos-whatsapp';
import { apagarArquivos } from "@/lib/midia";
import { conferirSenha, iguais } from "@/lib/segredos";
import {
  credenciaisDoAdmin,
  encerrarSessao,
  exigirSessao,
  iniciarSessao,
  ipDoPedido,
} from "@/lib/sessao";

/**
 * As ações do painel. Toda Server Action é um endpoint que qualquer um pode
 * chamar direto, sem passar pela página — por isso cada uma confere a sessão
 * de novo, e valida a entrada como se viesse de fora (porque vem).
 */

/**
 * `valores` volta com o que foi digitado quando a ação falha: o React limpa o
 * formulário depois de toda ação, e sem isto um erro de validação apagaria o
 * cadastro inteiro.
 */
export type Resultado = { erro?: string; ok?: string; valores?: Record<string, string> } | undefined;

function mensagemDe(erro: unknown): string {
  if (erro instanceof ErroDeDominio) return erro.message;
  if (erro instanceof z.ZodError) return erro.issues[0]?.message ?? "Dados inválidos.";
  console.error("[acao]", erro);
  return "Algo deu errado do nosso lado. Nada foi gravado.";
}

const texto = (max: number) => z.string().trim().max(max, `Até ${max} caracteres.`);
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Até ${max} caracteres.`)
    .optional()
    .transform((v) => v || null);
const url = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\/\S+$/.test(v), "Link precisa começar com http:// ou https://.");

// -----------------------------------------------------------------------------
// Entrada
// -----------------------------------------------------------------------------

export async function entrar(_: Resultado, form: FormData): Promise<Resultado> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const ip = await ipDoPedido();

  const bloqueado = await emTransacao((tx) => crm.entradaBloqueada(tx, ip));
  if (bloqueado) {
    return {
      erro: `Muitas tentativas. Espere ${crm.JANELA_TENTATIVAS_MIN} minutos e tente de novo.`,
      valores: { email },
    };
  }

  const admin = credenciaisDoAdmin();
  // As duas conferências sempre rodam: responder mais rápido para e-mail
  // errado diria a quem tenta qual e-mail existe.
  const senhaOk = await conferirSenha(senha, admin.hash);
  const emailOk = iguais(email, admin.email.trim().toLowerCase());

  if (!senhaOk || !emailOk) {
    await emTransacao((tx) => crm.registrarFalhaDeEntrada(tx, ip));
    return { erro: "E-mail ou senha não conferem.", valores: { email } };
  }

  await emTransacao((tx) => crm.limparFalhasDeEntrada(tx, ip));
  await iniciarSessao();
  redirect("/");
}

export async function sair() {
  await encerrarSessao();
  redirect("/entrar");
}

// -----------------------------------------------------------------------------
// Projetos
// -----------------------------------------------------------------------------

const esquemaProjeto = z.object({
  nome: texto(200).min(1, "Dê um nome ao projeto."),
  cliente: opcional(200),
  tipo: z.enum(IDS_TIPO, { error: "Escolha o tipo do projeto." }),
  repositorio: opcional(300),
  urlProducao: url,
  urlPrevia: url,
  stack: opcional(300),
  notaCerebro: opcional(300),
});

const campos = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

export async function criarProjeto(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirSessao();
  let slug: string;
  try {
    const dados = esquemaProjeto
      .extend({ etapa: z.enum(IDS_ETAPA).default("descoberta") })
      .parse(campos(form));
    slug = (await emTransacao((tx) => crm.criarProjeto(tx, dados, "bruno"))).slug;
  } catch (erro) {
    return { erro: mensagemDe(erro), valores: campos(form) };
  }
  revalidatePath("/", "layout");
  redirect(`/projetos/${slug}`);
}

export async function editarProjeto(slug: string, _: Resultado, form: FormData): Promise<Resultado> {
  await exigirSessao();
  try {
    const dados = esquemaProjeto.parse(campos(form));
    await emTransacao((tx) => crm.atualizarProjeto(tx, slug, dados, "bruno"));
  } catch (erro) {
    return { erro: mensagemDe(erro), valores: campos(form) };
  }
  revalidatePath("/", "layout");
  redirect(`/projetos/${slug}`);
}

export async function mudarEtapa(slug: string, etapa: string): Promise<Resultado> {
  await exigirSessao();
  try {
    const para = z.enum(IDS_ETAPA).parse(etapa);
    await emTransacao((tx) => crm.mudarEtapa(tx, slug, para, "bruno"));
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
  revalidatePath("/", "layout");
}

export async function arquivar(slug: string, arquivado: boolean): Promise<Resultado> {
  await exigirSessao();
  try {
    await emTransacao((tx) => crm.definirArquivado(tx, slug, arquivado, "bruno"));
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
  revalidatePath("/", "layout");
}

// -----------------------------------------------------------------------------
// Propostas e tarefas
// -----------------------------------------------------------------------------

export async function decidirProposta(id: string, decisao: "aceita" | "recusada"): Promise<Resultado> {
  await exigirSessao();
  try {
    const escolha = z.enum(["aceita", "recusada"]).parse(decisao);
    await emTransacao((tx) => crm.decidirProposta(tx, id, escolha, "bruno"));
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
  revalidatePath("/", "layout");
}

export async function criarTarefa(slug: string, _: Resultado, form: FormData): Promise<Resultado> {
  await exigirSessao();
  try {
    const titulo = texto(300).min(1, "Escreva a tarefa.").parse(form.get("titulo") ?? "");
    await emTransacao((tx) => crm.criarTarefa(tx, slug, titulo, "bruno"));
  } catch (erro) {
    return { erro: mensagemDe(erro), valores: campos(form) };
  }
  revalidatePath("/", "layout");
  return { ok: "Tarefa criada." };
}

export async function alternarTarefa(id: string, concluir: boolean): Promise<Resultado> {
  await exigirSessao();
  try {
    await emTransacao(async (tx) => {
      if (concluir) await crm.concluirTarefa(tx, id, "bruno");
      else await crm.reabrirTarefa(tx, id, "bruno");
    });
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
  revalidatePath("/", "layout");
}

// -----------------------------------------------------------------------------
// Leads
// -----------------------------------------------------------------------------

export async function mudarEtapaLead(id: string, etapa: string): Promise<Resultado> {
  await exigirSessao();
  try {
    const para = z.enum(IDS_ETAPA_LEAD).parse(etapa);
    await emTransacao((tx) => mudarEtapaDoLead(tx, id, para, "bruno"));
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
  revalidatePath("/", "layout");
}

export async function excluirLead(id: string): Promise<Resultado> {
  await exigirSessao();
  try {
    const leadId = z.uuid().parse(id);
    await emTransacao((tx) => excluirLeadComHistorico(tx, leadId, "bruno"));
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
  revalidatePath("/", "layout");
  return { ok: "Lead excluído com todo o histórico." };
}

export async function mudarModoWhatsApp(id: string, modo: string): Promise<Resultado> {
  await exigirSessao();
  try {
    const valido = z.enum(["agente", "humano"]).parse(modo);
    const leadId = z.uuid().parse(id);
    await emTransacao((tx) => mudarModoAtendimentoWhatsApp(tx, leadId, valido));
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
  revalidatePath("/leads");
  revalidatePath("/whatsapp");
}

export async function responderWhatsApp(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirSessao();
  const dados = z.object({ leadId: z.uuid(), pedidoId: z.uuid(), texto: texto(4000).min(1, 'Escreva uma mensagem.') }).safeParse(campos(form));
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Mensagem inválida.', valores: campos(form) };
  try {
    const resultado = await enviarRespostaHumana(emTransacao, enviarTextoMeta, dados.data);
    revalidatePath('/whatsapp');
    revalidatePath('/leads');
    return resultado.estado === 'erro' ? { erro: resultado.mensagem, valores: campos(form) } : { ok: resultado.mensagem };
  } catch (erro) {
    return { erro: erro instanceof ErroDeDominio ? erro.message : 'Não foi possível preparar o envio.', valores: campos(form) };
  }
}

export async function enviarModeloWhatsApp(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirSessao();
  const valores = campos(form);
  const dados = z.object({
    leadId: z.uuid(), pedidoId: z.uuid(),
    modelo: z.string().min(1, 'Escolha um modelo.'),
    parametros: z.array(z.string()),
  }).safeParse({ ...valores, parametros: form.getAll('parametro').map(String) });
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? 'Envio inválido.', valores };
  try {
    // O texto e a aprovação vêm da Meta, não da tela: o histórico mostra o que
    // o cliente recebeu, e modelo recusado ou pausado não sai.
    const [nome, idioma] = dados.data.modelo.split('|');
    const modelo = (await listarModelosMeta()).find(m => m.nome === nome && m.idioma === idioma);
    if (!modelo) return { erro: 'Modelo não encontrado na Meta.', valores };
    if (modelo.status !== 'APPROVED') return { erro: 'Esse modelo ainda não foi aprovado pela Meta.', valores };
    const resultado = await enviarModeloHumano(emTransacao, enviarModeloMeta, {
      leadId: dados.data.leadId, pedidoId: dados.data.pedidoId,
      modelo: { nome: modelo.nome, idioma: modelo.idioma, texto: modelo.texto },
      parametros: dados.data.parametros.slice(0, modelo.variaveis),
    });
    revalidatePath('/whatsapp');
    return resultado.estado === 'erro' ? { erro: resultado.mensagem, valores } : { ok: resultado.mensagem };
  } catch (erro) {
    return { erro: erro instanceof ErroDeDominio || erro instanceof z.ZodError ? mensagemDe(erro) : 'Não foi possível enviar o modelo.', valores };
  }
}

export async function criarModeloWhatsApp(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirSessao();
  const valores = campos(form);
  try {
    const criado = await criarModeloMeta({
      nome: valores.nome, categoria: valores.categoria, texto: valores.texto,
      exemplos: form.getAll('exemplo').map(String),
    });
    revalidatePath('/whatsapp/modelos');
    return { ok: criado.status === 'APPROVED' ? 'Modelo criado e já aprovado.' : 'Modelo enviado para a Meta. A aprovação costuma sair em minutos, às vezes em horas.' };
  } catch (erro) {
    return { erro: mensagemDe(erro), valores };
  }
}

// -----------------------------------------------------------------------------
// Chaves do MCP
// -----------------------------------------------------------------------------

export type ResultadoChave = { erro?: string; token?: string; nome?: string } | undefined;

export async function gerarChave(_: ResultadoChave, form: FormData): Promise<ResultadoChave> {
  await exigirSessao();
  try {
    const { agente, token } = await emTransacao((tx) => crm.criarAgente(tx, String(form.get("nome") ?? "")));
    revalidatePath("/agentes");
    return { token, nome: agente.nome };
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
}

export async function revogarChave(id: string): Promise<Resultado> {
  await exigirSessao();
  try {
    await emTransacao((tx) => crm.revogarAgente(tx, id));
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
  revalidatePath("/agentes");
}

// -----------------------------------------------------------------------------
// Instagram
// -----------------------------------------------------------------------------

/** O mesmo esqueleto das outras ações: sessão, entrada conferida, erro em português. */
async function acaoDePublicacao(id: string, executar: (id: string) => Promise<string[] | void>): Promise<Resultado> {
  await exigirSessao();
  try {
    const arquivos = await executar(z.uuid().parse(id));
    // Depois do commit: se apagar falhar, sobra arquivo no volume, não buraco no banco.
    if (arquivos?.length) await apagarArquivos(arquivos).catch(() => console.error("[instagram] arquivos ficaram no volume."));
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
  revalidatePath("/", "layout");
}

export async function aprovarPublicacao(id: string): Promise<Resultado> {
  return acaoDePublicacao(id, (valido) => emTransacao((tx) => instagram.aprovarPublicacao(tx, valido, "bruno")));
}

export async function cancelarPublicacao(id: string): Promise<Resultado> {
  return acaoDePublicacao(id, (valido) => emTransacao((tx) => instagram.cancelarPublicacao(tx, valido)));
}

export async function tentarPublicacaoDeNovo(id: string): Promise<Resultado> {
  return acaoDePublicacao(id, (valido) => emTransacao((tx) => instagram.tentarDeNovo(tx, valido)));
}

export async function publicarAgora(id: string): Promise<Resultado> {
  return acaoDePublicacao(id, (valido) => emTransacao((tx) => instagram.publicarAgora(tx, valido)));
}

export async function desconectarInstagram(): Promise<Resultado> {
  await exigirSessao();
  try {
    await emTransacao(instagram.desconectarConta);
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }
  revalidatePath("/instagram");
}
