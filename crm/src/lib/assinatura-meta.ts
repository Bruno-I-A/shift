import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Compara segredos sem vazar, pelo tempo, quantos caracteres batem. */
export function segredoCorreto(recebido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/** Confere o `x-hub-signature-256` que a Meta manda em todo aviso de webhook. */
export function assinaturaMetaCorreta(recebida: string, corpo: string, segredo: string): boolean {
  const esperada = `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
  return segredoCorreto(recebida, esperada);
}

/** Resposta ao desafio de verificação (`hub.challenge`) com o token combinado. */
export function responderDesafioMeta(pedido: Request, esperado: string | undefined): Response {
  const url = new URL(pedido.url);
  const desafio = url.searchParams.get("hub.challenge");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  if (url.searchParams.get("hub.mode") !== "subscribe" || !desafio || !esperado || !segredoCorreto(token, esperado)) {
    return new Response(null, { status: 403 });
  }
  return new Response(desafio, { status: 200, headers: { "Content-Type": "text/plain" } });
}
