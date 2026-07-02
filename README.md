# Handoff: Shift Systems — Site v2 "mar aberto"

## Overview

Site de marketing da **Shift Systems** (sistemas sob medida, automações, agentes de IA e sites-funil).

A v2 é um redesign completo sobre três decisões:

1. **Multi-página com funil.** A v1 tinha 11 seções em uma página só, com conteúdo duplicado. A v2 separa em páginas e desenha um **caminho para o lead**: home → diagnóstico (quiz) → resultado → WhatsApp. Cada página tem um único CTA primário, sempre apontando para o diagnóstico.
2. **Paleta "mar aberto".** Sai o roxo neon + preto (padrão saturado do nicho); entra navy oceânico profundo + dourado-âmbar. **A logo permanece roxa** (`#B56BFF`) — é o único elemento roxo do site, o que a destaca ainda mais.
3. **Zero efeitos pesados.** Sem WebGL/three.js, sem GSAP/Lenis, sem React, sem boot screen, sem cursor customizado, sem noise/scan-lines. O fundo é gradiente CSS estático. Animações são transform/opacity de 200–400ms. A energia vem da velocidade.

Há referências mínimas a One Piece (tema "rota/navegação"), desenhadas para serem invisíveis a quem não conhece — ver seção **Easter eggs**.

## Estrutura de páginas

| Página             | Papel no funil                                                        |
|--------------------|-----------------------------------------------------------------------|
| `index.html`       | Home enxuta: hero + "a rota" (4 paradas) + problema + 3 destaques + CTA |
| `solucoes.html`    | Site-funil em destaque + 6 builds por área (vendas, operação, financeiro, atendimento, gestão, sistema interno) + integrações |
| `processo.html`    | Timeline das 4 etapas + posicionamento ("menos improviso. mais sistema.") |
| `diagnostico.html` | **Centro do funil** — quiz "log pose": 4 perguntas → tesouro (horas/semana) + rota + CTA WhatsApp pré-preenchido |
| `contato.html`     | WhatsApp / Instagram / e-mail + ponte de volta pro diagnóstico          |
| `404.html`         | "Essa ilha não está na sua rota."                                       |
| `privacidade.html` | LGPD (recolorida para a nova paleta)                                    |

Assets compartilhados: `assets/site.css` (tokens + componentes) e `assets/site.js` (header, menu mobile, reveal, contadores, spotlight, painel "shift engine", easter egg). Header e footer são duplicados por página (protótipo estático, sem build step).

## Design tokens

| Token          | Hex                        | Uso                                    |
|----------------|----------------------------|----------------------------------------|
| `navy`         | `#0A1428`                  | Fundo base                             |
| `navy-2`       | `#0E1D3A`                  | Superfície elevada                     |
| `accent`       | `#F2A63D`                  | CTA / acento primário (âmbar)          |
| `accent-deep`  | `#D4841A`                  | Fim de gradiente de botão              |
| `gold`         | `#FFC93D`                  | Eyebrows, chips de stack, "tesouro"    |
| `paper`        | `#F6F5F1`                  | Texto claro (nunca branco puro)        |
| `purple`       | `#B56BFF`                  | **Somente a logo** (e o ponto do wordmark) |

Fundo `.page-bg`: gradientes radiais estáticos — azul-oceano no topo, brilho âmbar/dourado no horizonte inferior (pôr-do-sol).

Tipografia: **Geist** (títulos/corpo) + **Geist Mono** (eyebrows, tags, meta) — inalterada da v1, é a voz da marca. Copy principal em sentence case; navegação, tags e metadados visuais podem manter lowercase/uppercase mono.

Botão primário: gradiente âmbar com texto escuro `#1A0A03`. Eyebrow: mono dourado com tracking 0.24em.

## A logo — "Sliced S"

Mesma da v1, intocada: dois slabs horizontais + diagonal, tudo `#B56BFF`, com glow roxo e micro-animação `shift-loop` (5s). Não substituir.

## O funil ("a rota")

O lead segue paradas numeradas, exibidas na home como uma linha de navegação com um ponto dourado "velejando" (`.sail-dot`):

1. **diagnóstico** (`diagnostico.html`) — quiz de 4 perguntas
2. **a solução certa** (`solucoes.html`) — incluindo site-funil quando aquisição é o gargalo
3. **construção** (`processo.html`)
4. **mar aberto** (`contato.html`)

### Quiz "log pose" (diagnostico.html)

- 4 perguntas (área caótica → tamanho do time → controle atual → urgência), uma por tela, com progresso em waypoints.
- Estimativa do "tesouro" (horas/semana recuperadas): `(base da área + bônus do método de controle) × fator do time`. Bases: atendimento 12, vendas 10, financeiro 8, operação 14. Fatores: solo 0.6 / 2–5 ×1 / 6–15 ×1.6 / 16+ ×2.2. Bônus: WhatsApp 4 / planilhas 3 / demais 2.
- Resultado mostra dor, prioridade, o que construir primeiro e stack provável (dados herdados do DiagnosticLab da v1).
- CTA final: `wa.me/5554984184808` com mensagem pré-preenchida contendo as respostas — o lead chega na conversa já qualificado.

## Easter eggs (One Piece, minimalistas)

- **5 cliques na logo** (janela de 2,5s) → um chapéu de palha aparece sobre o S e os CTAs/eyebrows ficam dourados por 6s (`html.op-mode`).
- **Digitar "nakama"** em qualquer página → mesmo modo chapéu de palha, por 10s.
- **Console do navegador**: recado "Procura-se: operação manual. Recompensa: suas horas de volta." + a dica do nakama.
- Quiz chama-se **log pose** (eyebrow + bússola no estado "calibrando").
- Resultado do quiz: **"Seu tesouro: ~Xh por semana de volta"**.
- **Barquinho dourado** veleja a linha da rota na home (substituiu o ponto).
- Log do shift engine ocasionalmente mostra `log pose → rota recalibrada`.
- **404**: "Essa ilha não está na sua rota." + "recompensa pela captura: 0 berries".
- Rodapé: "feito em mar aberto".

Regra: nenhuma referência explícita em navegação ou etapas do processo — o cliente B2B não deve perceber nada além de um tema náutico sutil.

## Interações

- **Entrada do site** (uma vez por load, só transform/opacity): header desce (`header-drop`, 550ms), varredura de luz dourada cruza a tela (`.dawn-sweep`, 1.2s, removida do DOM após 2,5s) e o hero revela em coreografia (classes `d1`–`d6`, delays de 50–440ms).
- **Reveal**: IntersectionObserver, 400ms, translateY(20px) → 0. `.stagger` com delays de 40–340ms.
- **Rota que se desenha**: `[data-draw]` escala de 0 → 1 (1.4s) quando entra na tela; o barquinho só aparece depois que a linha desenha.
- **Barra de progresso de leitura**: `#scroll-progress` fixa no topo (gradiente âmbar→dourado), atualizada via rAF.
- **Contadores**: `[data-count-to]`, easing cúbico, 1400ms, disparo em threshold 0.5.
- **Shift engine**: painel leve no hero da home, com segmentos de progresso, barras e log de eventos gerados em JS vanilla.
- **Spotlight**: `.spot` segue o cursor via `--mx/--my` (dourado + âmbar).
- **Header**: pílula com blur ao rolar > 24px (max-w 80rem → 64rem).
- **Menu mobile**: overlay full-screen, fecha por link, backdrop ou Esc. Alvos de toque ≥ 44px.
- `prefers-reduced-motion` desativa todas as animações (inclusive entrada, barquinho e rota desenhada).

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
