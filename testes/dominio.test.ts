import { describe, expect, it } from "vitest";

import { gerarSlug, normalizarRepositorio } from "@/lib/dominio";
import { conferirSenha, gerarHashDeSenha } from "@/lib/segredos";

describe("normalizarRepositorio", () => {
  it.each([
    ["git@github.com:Bruno-I-A/Guilda.git", "github.com/bruno-i-a/guilda"],
    ["https://github.com/Bruno-I-A/guilda", "github.com/bruno-i-a/guilda"],
    ["https://github.com/bruno-i-a/guilda.git/", "github.com/bruno-i-a/guilda"],
    ["https://usuario:senha@github.com/bruno-i-a/guilda.git", "github.com/bruno-i-a/guilda"],
    ["ssh://git@github.com/bruno-i-a/guilda.git", "github.com/bruno-i-a/guilda"],
    ["github.com/bruno-i-a/guilda/tree/main", "github.com/bruno-i-a/guilda"],
  ])("%s", (entrada, esperado) => {
    expect(normalizarRepositorio(entrada)).toBe(esperado);
  });

  it("recusa o que não tem dono e nome", () => {
    expect(normalizarRepositorio("guilda")).toBeNull();
    expect(normalizarRepositorio("github.com/bruno-i-a")).toBeNull();
    expect(normalizarRepositorio("")).toBeNull();
  });
});

describe("gerarSlug", () => {
  it("tira acento, espaço e pontuação", () => {
    expect(gerarSlug("Reforma Tributária")).toBe("reforma-tributaria");
    expect(gerarSlug("  Padaria & Café — Centro ")).toBe("padaria-cafe-centro");
  });
});

describe("senha do painel", () => {
  it("confere a certa e recusa a errada", async () => {
    const hash = await gerarHashDeSenha("mar aberto 2026");
    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(hash).not.toContain("$");
    expect(await conferirSenha("mar aberto 2026", hash)).toBe(true);
    expect(await conferirSenha("mar aberto 2027", hash)).toBe(false);
    expect(await conferirSenha("qualquer", "lixo")).toBe(false);
  });
});
