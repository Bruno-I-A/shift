import "server-only";

import * as z from "zod";

import { ErroDeDominio } from "./dominio";

/**
 * Modelos de mensagem da Cloud API: o único jeito de a Shift falar com um
 * contato fora da janela de 24 horas — retomar um atendimento, avisar um
 * cliente que o projeto mudou de fase, cobrar um retorno.
 *
 * Quem aprova o modelo é a Meta, e a categoria decide o preço: utilidade
 * (aviso ligado a algo que o cliente pediu) custa bem menos que marketing
 * (oferta, prospecção). A Meta reclassifica o que tiver tom de venda.
 *
 * Listar e criar exigem a permissão `whatsapp_business_management` no token;
 * enviar usa a mesma `whatsapp_business_messaging` das respostas comuns.
 */

export type CategoriaModelo = "UTILITY" | "MARKETING";

export interface ModeloWhatsApp {
  id: string;
  nome: string;
  categoria: string;
  idioma: string;
  status: string;
  /** Texto do corpo, com as variáveis {{1}}, {{2}}… */
  texto: string;
  variaveis: number;
}

export { NOME_CATEGORIA, NOME_STATUS } from "./rotulos-modelos";

// -----------------------------------------------------------------------------
// Regras puras (testáveis sem rede)
// -----------------------------------------------------------------------------

/**
 * Quantas variáveis o texto usa. Exige a sequência {{1}}, {{2}}… sem buraco:
 * a Meta recusa {{1}} e {{3}} sem {{2}}, e o envio precisaria adivinhar a ordem.
 */
export function contarVariaveis(texto: string): number {
  const numeros = [...new Set([...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  numeros.forEach((n, i) => {
    if (n !== i + 1) throw new ErroDeDominio(`As variáveis precisam ir de {{1}} em diante, sem pular número (achei {{${n}}}).`);
  });
  return numeros.length;
}

export function renderizarModelo(texto: string, valores: string[]): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] ?? `{{${n}}}`);
}

const esquemaNovoModelo = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Dê um nome ao modelo.")
    .max(512)
    .regex(/^[a-z0-9_]+$/, "Nome só com letras minúsculas, números e _ (ex.: atualizacao_projeto)."),
  categoria: z.enum(["UTILITY", "MARKETING"], { error: "Escolha a categoria." }),
  texto: z.string().trim().min(1, "Escreva o texto do modelo.").max(1024, "O texto vai até 1024 caracteres."),
  exemplos: z.array(z.string().trim().max(200)).default([]),
});

export type NovoModelo = z.infer<typeof esquemaNovoModelo>;

/**
 * As regras que a Meta aplica na aprovação, conferidas antes de enviar: um
 * modelo recusado volta dias depois, e o erro raramente diz o porquê.
 */
export function validarNovoModelo(entrada: unknown): NovoModelo {
  const lido = esquemaNovoModelo.safeParse(entrada);
  if (!lido.success) throw new ErroDeDominio(lido.error.issues[0]?.message ?? "Modelo inválido.");
  const modelo = lido.data;
  const variaveis = contarVariaveis(modelo.texto);
  if (/^\{\{\d+\}\}/.test(modelo.texto) || /\{\{\d+\}\}[.!?]?$/.test(modelo.texto)) {
    throw new ErroDeDominio("A Meta recusa modelo que começa ou termina com variável. Ponha texto antes e depois.");
  }
  if (/\}\}\s*\{\{/.test(modelo.texto)) {
    throw new ErroDeDominio("Duas variáveis seguidas são recusadas pela Meta. Separe com texto.");
  }
  const exemplos = modelo.exemplos.slice(0, variaveis);
  if (exemplos.length < variaveis || exemplos.some((e) => !e)) {
    throw new ErroDeDominio("Cada variável precisa de um exemplo: é o que a Meta usa para aprovar.");
  }
  return { ...modelo, exemplos };
}

// -----------------------------------------------------------------------------
// Cloud API
// -----------------------------------------------------------------------------

function configuracao() {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  const telefone = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  const conta = process.env.WHATSAPP_META_WABA_ID;
  const versao = process.env.WHATSAPP_META_GRAPH_VERSION;
  if (!token || !telefone || !versao) throw new ErroDeDominio("Cloud API do WhatsApp não configurada.");
  if (!/^v\d+\.\d+$/.test(versao)) throw new ErroDeDominio("WHATSAPP_META_GRAPH_VERSION inválida.");
  return { token, telefone, conta, versao };
}

function contaExigida(conta: string | undefined): string {
  if (!conta || !/^\d{5,30}$/.test(conta)) {
    throw new ErroDeDominio(
      "Falta WHATSAPP_META_WABA_ID: o ID da conta do WhatsApp Business, no Gerenciador do WhatsApp.",
    );
  }
  return conta;
}

async function erroDaMeta(resposta: Response, acao: string): Promise<ErroDeDominio> {
  // A mensagem da Meta é útil (motivo da recusa) e não carrega segredo nosso;
  // mesmo assim vai cortada, e só a parte de texto.
  let detalhe = "";
  try {
    const corpo = (await resposta.json()) as { error?: { message?: string; error_user_msg?: string } };
    detalhe = (corpo.error?.error_user_msg || corpo.error?.message || "").slice(0, 300);
  } catch {
    /* corpo sem JSON */
  }
  if (resposta.status === 403 || /permission/i.test(detalhe)) {
    return new ErroDeDominio(
      `A Meta negou ${acao}: o token do CRM precisa da permissão whatsapp_business_management.`,
    );
  }
  return new ErroDeDominio(`A Meta recusou ${acao} (${resposta.status})${detalhe ? `: ${detalhe}` : "."}`);
}

const esquemaListagem = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      category: z.string(),
      language: z.string(),
      components: z.array(z.object({ type: z.string(), text: z.string().optional() })).default([]),
    }),
  ),
});

export async function listarModelosMeta(): Promise<ModeloWhatsApp[]> {
  const { token, conta, versao } = configuracao();
  const waba = contaExigida(conta);
  const resposta = await fetch(
    `https://graph.facebook.com/${versao}/${encodeURIComponent(waba)}/message_templates?fields=id,name,status,category,language,components&limit=100`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12_000), cache: "no-store" },
  );
  if (!resposta.ok) throw await erroDaMeta(resposta, "a lista de modelos");
  const lido = esquemaListagem.safeParse(await resposta.json());
  if (!lido.success) throw new ErroDeDominio("A Meta devolveu a lista de modelos num formato inesperado.");
  return lido.data.data.map((m) => {
    const texto = m.components.find((c) => c.type === "BODY")?.text ?? "";
    let variaveis = 0;
    try {
      variaveis = contarVariaveis(texto);
    } catch {
      variaveis = (texto.match(/\{\{\d+\}\}/g) ?? []).length;
    }
    return { id: m.id, nome: m.name, categoria: m.category, idioma: m.language, status: m.status, texto, variaveis };
  });
}

export async function criarModeloMeta(entrada: unknown): Promise<{ id: string; status: string }> {
  const modelo = validarNovoModelo(entrada);
  const { token, conta, versao } = configuracao();
  const waba = contaExigida(conta);
  const corpo = {
    name: modelo.nome,
    language: "pt_BR",
    category: modelo.categoria,
    components: [
      {
        type: "BODY",
        text: modelo.texto,
        ...(modelo.exemplos.length ? { example: { body_text: [modelo.exemplos] } } : {}),
      },
    ],
  };
  const resposta = await fetch(`https://graph.facebook.com/${versao}/${encodeURIComponent(waba)}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(12_000),
  });
  if (!resposta.ok) throw await erroDaMeta(resposta, "o modelo");
  const lido = z.object({ id: z.string(), status: z.string().optional() }).safeParse(await resposta.json());
  if (!lido.success) throw new ErroDeDominio("A Meta não confirmou a criação do modelo.");
  return { id: lido.data.id, status: lido.data.status ?? "PENDING" };
}

/** Envia um modelo aprovado. Devolve o id da mensagem na Meta. */
export async function enviarModeloMeta(
  whatsapp: string,
  modelo: { nome: string; idioma: string },
  parametros: string[],
): Promise<string> {
  const { token, telefone, versao } = configuracao();
  const corpo = {
    messaging_product: "whatsapp",
    to: whatsapp,
    type: "template",
    template: {
      name: modelo.nome,
      language: { code: modelo.idioma },
      ...(parametros.length
        ? { components: [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  };
  const resposta = await fetch(`https://graph.facebook.com/${versao}/${encodeURIComponent(telefone)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(12_000),
  });
  if (!resposta.ok) throw await erroDaMeta(resposta, "o envio do modelo");
  const lido = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(200) })).min(1) }).safeParse(
    await resposta.json(),
  );
  if (!lido.success) throw new ErroDeDominio("A Meta não confirmou o envio do modelo.");
  return lido.data.messages[0].id;
}
