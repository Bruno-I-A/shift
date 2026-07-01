# Handoff: Shift Systems — Site v2 "mar aberto"

## Overview

Site de marketing da **Shift Systems** (sistemas sob medida, automações e agentes de IA).

A v2 é um redesign completo sobre três decisões:

1. **Multi-página com funil.** A v1 tinha 11 seções em uma página só, com conteúdo duplicado. A v2 separa em páginas e desenha um **caminho para o lead**: home → diagnóstico (quiz) → resultado → WhatsApp. Cada página tem um único CTA primário, sempre apontando para o diagnóstico.
2. **Paleta "mar aberto".** Sai o roxo neon + preto (padrão saturado do nicho); entra navy oceânico profundo + laranja-sol + dourado. **A logo permanece roxa** (`#B56BFF`) — é o único elemento roxo do site, o que a destaca ainda mais.
3. **Zero efeitos pesados.** Sem WebGL/three.js, sem GSAP/Lenis, sem React, sem boot screen, sem cursor customizado, sem noise/scan-lines. O fundo é gradiente CSS estático. Animações são transform/opacity de 200–400ms. A energia vem da velocidade.

Há referências mínimas a One Piece (tema "rota/navegação"), desenhadas para serem invisíveis a quem não conhece — ver seção **Easter eggs**.

## Estrutura de páginas

| Página             | Papel no funil                                                        |
|--------------------|-----------------------------------------------------------------------|
| `index.html`       | Home enxuta: hero + "a rota" (4 paradas) + problema + 3 destaques + CTA |
| `solucoes.html`    | 6 builds por área (vendas, operação, financeiro, atendimento, gestão, sistema interno) + integrações |
| `processo.html`    | Timeline das 4 etapas + posicionamento ("menos improviso. mais sistema.") |
| `diagnostico.html` | **Centro do funil** — quiz "log pose": 4 perguntas → tesouro (horas/semana) + rota + CTA WhatsApp pré-preenchido |
| `contato.html`     | WhatsApp / Instagram / e-mail + ponte de volta pro diagnóstico          |
| `404.html`         | "essa ilha não está na sua rota."                                       |
| `privacidade.html` | LGPD (recolorida para a nova paleta)                                    |

Assets compartilhados: `assets/site.css` (tokens + componentes) e `assets/site.js` (header, menu mobile, reveal, contadores, spotlight, easter egg). Header e footer são duplicados por página (protótipo estático, sem build step).

## Design tokens

| Token          | Hex                        | Uso                                    |
|----------------|----------------------------|----------------------------------------|
| `navy`         | `#0A1428`                  | Fundo base                             |
| `navy-2`       | `#0E1D3A`                  | Superfície elevada                     |
| `accent`       | `#FF6B35`                  | CTA / acento primário (laranja-sol)    |
| `accent-deep`  | `#E8501C`                  | Fim de gradiente de botão              |
| `gold`         | `#FFC93D`                  | Eyebrows, chips de stack, "tesouro"    |
| `paper`        | `#F6F5F1`                  | Texto claro (nunca branco puro)        |
| `purple`       | `#B56BFF`                  | **Somente a logo** (e o ponto do wordmark) |

Fundo `.page-bg`: gradientes radiais estáticos — azul-oceano no topo, brilho laranja/dourado no horizonte inferior (pôr-do-sol).

Tipografia: **Geist** (títulos/corpo) + **Geist Mono** (eyebrows, tags, meta) — inalterada da v1, é a voz da marca. Todo o copy em lowercase, exceto nomes de marca.

Botão primário: gradiente laranja com texto escuro `#1A0A03`. Eyebrow: mono dourado com tracking 0.24em.

## A logo — "Sliced S"

Mesma da v1, intocada: dois slabs horizontais + diagonal, tudo `#B56BFF`, com glow roxo e micro-animação `shift-loop` (5s). Não substituir.

## O funil ("a rota")

O lead segue paradas numeradas, exibidas na home como uma linha de navegação com um ponto dourado "velejando" (`.sail-dot`):

1. **diagnóstico** (`diagnostico.html`) — quiz de 4 perguntas
2. **a solução certa** (`solucoes.html`)
3. **construção** (`processo.html`)
4. **mar aberto** (`contato.html`)

### Quiz "log pose" (diagnostico.html)

- 4 perguntas (área caótica → tamanho do time → controle atual → maior dor), uma por tela, com progresso em waypoints.
- Estimativa do "tesouro" (horas/semana recuperadas): `(base da área + bônus do método de controle) × fator do time`. Bases: atendimento 12, vendas 10, financeiro 8, operação 14. Fatores: solo 0.6 / 2–5 ×1 / 6–15 ×1.6 / 16+ ×2.2. Bônus: WhatsApp 4 / planilhas 3 / demais 2.
- Resultado mostra dor, o que construir primeiro e stack provável (dados herdados do DiagnosticLab da v1).
- CTA final: `wa.me/5554984184808` com mensagem pré-preenchida contendo as respostas — o lead chega na conversa já qualificado.

## Easter eggs (One Piece, minimalistas)

- **5 cliques na logo** (janela de 2,5s) → um chapéu de palha aparece sobre o S e os CTAs/eyebrows ficam dourados por 6s (`html.op-mode`).
- Quiz chama-se **log pose** (eyebrow + bússola no estado "calibrando").
- Resultado do quiz: **"seu tesouro: ~Xh por semana de volta"**.
- **404**: "essa ilha não está na sua rota."
- Rodapé: "feito em mar aberto".

Regra: nenhuma referência explícita em navegação ou etapas do processo — o cliente B2B não deve perceber nada além de um tema náutico sutil.

## Interações

- **Reveal**: IntersectionObserver, 400ms, translateY(20px) → 0. `.stagger` com delays de 40–340ms.
- **Contadores**: `[data-count-to]`, easing cúbico, 1400ms, disparo em threshold 0.5.
- **Spotlight**: `.spot` segue o cursor via `--mx/--my` (dourado + laranja).
- **Header**: pílula com blur ao rolar > 24px (max-w 80rem → 64rem).
- **Menu mobile**: overlay full-screen, fecha por link, backdrop ou Esc. Alvos de toque ≥ 44px.
- `prefers-reduced-motion` desativa todas as animações.

## Produção (se for portar para um framework)

- Next.js 14+ / Astro com Tailwind em build próprio (o protótipo usa CDN).
- Self-host Geist/Geist Mono.
- Extrair header/footer para componentes compartilhados.
- O quiz é vanilla JS (~100 linhas em `diagnostico.html`) — portar como componente com estado local; não precisa de backend.
- Confirmar contatos reais: WhatsApp `+55 54 98418-4808`, Instagram `@shift_systemss`, e-mail `hello@shift.systems`.

## Arquivos

| Caminho              | Papel                                        |
|----------------------|----------------------------------------------|
| `index.html` … `404.html` | Páginas (estáticas, Tailwind CDN)       |
| `assets/site.css`    | Tokens, componentes, keyframes               |
| `assets/site.js`     | Comportamento compartilhado (vanilla)        |
| `favicon.svg`        | Marca (roxa)                                 |
| `v1_backup/`         | Versão anterior completa (referência)        |
| `promo/`             | Materiais de divulgação (Remotion) — não faz parte do site |
