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
  },
});
