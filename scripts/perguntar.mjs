import readline from "node:readline";

/**
 * Pergunta no terminal sem mostrar o que é digitado. Para senha e URL com
 * senha: o que aparece na tela aparece também em gravação de tela, histórico
 * de terminal compartilhado e print mandado para quem está ajudando.
 */
export function perguntarOculto(pergunta) {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (texto) => {
      if (texto.includes(pergunta)) rl.output.write(pergunta);
    };
    rl.question(pergunta, (resposta) => {
      rl.close();
      process.stdout.write("\n");
      resolver(resposta);
    });
  });
}
