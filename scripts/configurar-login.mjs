/**
 * Gera o que o login precisa: o hash da senha e o segredo da sessão.
 *
 *   npm run configurar-login
 *
 * Roda na sua máquina. Pede a senha duas vezes sem mostrar, e imprime as duas
 * variáveis para colar no Easypanel. A senha em si não sai daqui: só o hash.
 *
 * Trocar ADMIN_SENHA_HASH ou SESSAO_SEGREDO derruba toda sessão aberta — é o
 * jeito de "sair de todos os lugares".
 */
import { randomBytes } from "node:crypto";

import { gerarHashDeSenha } from "../src/lib/segredos.ts";
import { perguntarOculto } from "./perguntar.mjs";

const senha = await perguntarOculto("Senha do painel (12+ caracteres): ");
if (senha.length < 12) {
  console.error("Curta demais. Use 12 caracteres ou mais — uma frase serve.");
  process.exit(1);
}
if ((await perguntarOculto("Repita a senha: ")) !== senha) {
  console.error("As duas não conferem. Nada foi gerado.");
  process.exit(1);
}

const hash = await gerarHashDeSenha(senha);
const segredo = randomBytes(48).toString("base64url");

console.log("\nCole estas duas no Easypanel (Ambiente do serviço). Elas não são mostradas de novo:\n");
console.log(`ADMIN_SENHA_HASH=${hash}`);
console.log(`SESSAO_SEGREDO=${segredo}`);
console.log("\nE ADMIN_EMAIL com o e-mail que você vai digitar no login.");
