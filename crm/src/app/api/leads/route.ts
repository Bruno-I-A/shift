import { emTransacao } from "@/lib/banco";
import { ErroDeDominio } from "@/lib/dominio";
import { lerEnvioDoSite, receberLead, registrarEnvio } from "@/lib/leads";
import { assinar } from "@/lib/segredos";

/**
 * Onde o diagnóstico do site entrega o lead: `POST https://crm.shiftsys.com.br/api/leads`.
 *
 * É a única escrita pública do CRM. Três travas antes do banco:
 *   1. Origem: navegador em outro site recebe 403. (Cliente fora do navegador
 *      não manda Origin e passa daqui — por isso existe a trava 3.)
 *   2. Formato: `lerEnvioDoSite` exige nome, WhatsApp e consentimento.
 *   3. Limite: 5 envios por IP por hora e 100 no total, contados no banco.
 *
 * O site manda o corpo como `text/plain`, de propósito: assim o navegador não
 * faz a requisição de preflight (OPTIONS), que o `fetch` com `keepalive` do
 * quiz não suporta em todo navegador. O corpo continua sendo JSON.
 */

export const dynamic = "force-dynamic";

const LIMITE_BYTES = 16_000;

function origensPermitidas(): string[] {
  return (process.env.ORIGENS_SITE ?? "https://shiftsys.com.br,https://www.shiftsys.com.br")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function cors(origem: string | null): Record<string, string> {
  return origem && origensPermitidas().includes(origem)
    ? { "Access-Control-Allow-Origin": origem, Vary: "Origin" }
    : { Vary: "Origin" };
}

function responder(status: number, corpo: Record<string, unknown>, origem: string | null) {
  return Response.json(corpo, { status, headers: cors(origem) });
}

export function OPTIONS(pedido: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...cors(pedido.headers.get("origin")),
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(pedido: Request) {
  const origem = pedido.headers.get("origin");
  if (origem && !origensPermitidas().includes(origem)) {
    return responder(403, { erro: "Origem não autorizada." }, origem);
  }

  const bruto = await pedido.text();
  if (bruto.length > LIMITE_BYTES) return responder(413, { erro: "Envio grande demais." }, origem);

  let dados;
  try {
    dados = lerEnvioDoSite(JSON.parse(bruto));
  } catch (erro) {
    const mensagem = erro instanceof ErroDeDominio ? erro.message : "Corpo precisa ser JSON.";
    return responder(422, { erro: mensagem }, origem);
  }

  // O IP vira um HMAC antes de tocar o banco: basta para contar, e o endereço
  // de quem preencheu o quiz não fica guardado em lugar nenhum.
  const ip = pedido.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
  const chave = assinar(ip, `envio.${process.env.SESSAO_SEGREDO ?? ""}`);

  const resultado = await emTransacao(async (tx) => {
    if (!(await registrarEnvio(tx, chave))) return null;
    return receberLead(tx, dados);
  });
  if (!resultado) return responder(429, { erro: "Muitos envios. Tente mais tarde." }, origem);

  return responder(201, { ok: true }, origem);
}
