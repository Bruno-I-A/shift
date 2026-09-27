import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["testes/**/*.test.ts"],
    // O PGlite leva alguns segundos para subir a primeira vez em cada arquivo.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Só o compilador básico de WebAssembly (Liftoff). O otimizador do V8, ao
    // compilar o PGlite, pede mais memória do que esta máquina às vezes tem
    // livre, e o processo morre com "Fatal process out of memory: Zone" —
    // mensagem que não aponta para o teste nem para o PGlite. O Liftoff deixa
    // os testes um pouco mais lentos e nunca estourou.
    execArgv: ["--liftoff-only"],
  },
});
