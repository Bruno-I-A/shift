import { createMcpHandler } from "@modelcontextprotocol/server";

import { emTransacao } from "@/lib/banco";
import { autenticarAgente } from "@/lib/crm";
import { PREFIXO_TOKEN } from "@/lib/segredos";
import { criarServidorMcp } from "@/mcp/servidor";

/**
 * O endpoint MCP: `https://crm.shiftsys.com.br/api/mcp`.
 *
 * Sem estado entre requisições — nada a perder numa reimplantação. Atende a
 * revisão 2026-07-28 do protocolo e, para clientes que ainda falam a de 2025,
 * cai no modo sem sessão do próprio SDK.
 *
 * O SDK não confere chave nenhuma: `authInfo` é só repassado. A conferência é
 * aqui, antes de qualquer coisa chegar a ele.
 */

export const dynamic = "force-dynamic";

const atendente = createMcpHandler(
  (ctx) => criarServidorMcp(ctx.authInfo?.clientId ?? "desconhecido", emTransacao),
  {
    legacy: "stateless",
    onerror: (erro) => console.error("[mcp]", erro.message),
  },
);

function recusar(mensagem: string) {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: mensagem }, id: null },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="shift-crm"' } },
  );
}

async function atender(pedido: Request): Promise<Response> {
  const token = /^Bearer\s+(\S+)$/i.exec(pedido.headers.get("authorization") ?? "")?.[1];
  if (!token?.startsWith(PREFIXO_TOKEN)) {
    return recusar("Falta a chave do CRM. Gere uma em /agentes e envie como Authorization: Bearer.");
  }

  const agente = await emTransacao((tx) => autenticarAgente(tx, token));
  if (!agente) return recusar("Chave do CRM inválida ou revogada.");

  return atendente.fetch(pedido, {
    authInfo: { token, clientId: agente.nome, scopes: [] },
  });
}

export { atender as GET, atender as POST, atender as DELETE };
