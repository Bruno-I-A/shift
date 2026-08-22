# Handoff: Shift Systems — Site v2 "mar aberto"

## Overview

Site de marketing da **Shift Systems** (sistemas sob medida, automações, agentes de IA e sites-funil).

A v2 é um redesign completo sobre três decisões:

1. **Multi-página com funil.** A v1 tinha 11 seções em uma página só, com conteúdo duplicado. A v2 separa em páginas e desenha um **caminho para o lead**: home → diagnóstico (quiz) → resultado → WhatsApp. Cada página tem um único CTA primário, sempre apontando para o diagnóstico.
2. **Paleta "mar aberto".** Sai o roxo neon + preto (padrão saturado do nicho); entra navy oceânico profundo + dourado-âmbar. **A logo permanece roxa** (`#B56BFF`) — é o único elemento roxo do site, o que a destaca ainda mais.
3. **Zero efeitos pesados.** Sem WebGL/three.js, sem GSAP/Lenis, sem React, sem boot screen, sem cursor customizado, sem noise/scan-lines. O fundo é gradiente CSS estático. Animações são transform/opacity de 200–400ms. A energia vem da velocidade. **Sem exceções** — ver *Interações · o que já foi tentado e cortado*.

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
| `privacidade.html` | LGPD — inclui nota de que o quiz roda só no navegador                   |
| `termos.html`      | Termos de uso (site institucional, diagnóstico ilustrativo, PI, foro)   |

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

**Pisos de legibilidade (não descer abaixo disso):**

- Tamanho renderizado mínimo: **11px**. Não existe `text-[9px]` nem `text-[10px]` no site.
- Opacidade mínima para texto: **`/55`** (6,13:1 sobre o navy). `/40` marca 3,80:1 e reprova em AA; `/35`
  marca 3,19:1. Ambos foram eliminados.
- O h1 do hero é dimensionado pela **coluna** (`container-type: inline-size` em `.hero-col` +
  `clamp(2.5rem, 10.9cqi, 5rem)` em `.hero-title`), não pela viewport. Dimensionar por viewport fazia o tipo
  subir para 80px enquanto a coluna ainda tinha 631px, e a manchete quebrava em 3 linhas a 1280px e 4 a 1100px.
  Sem `<br>` rígido — o `text-wrap: balance` escolhe a quebra. Resultado: 2 linhas de 390px a 1440px.
- Alvo de toque no celular: **44×44** mínimo, inclusive nos links de lista do rodapé.

**Ênfase em títulos:** apague o *setup*, acenda a *carga útil* — nunca o contrário. O padrão antigo escurecia
justamente a palavra que carregava o argumento ("Operação manual **trava** crescimento" apagava o verbo),
deixando o olho varrer quase a afirmação oposta. Um título por página usa o device.

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

- **Entrada do site** (uma vez por load, só transform/opacity): header desce (`header-drop`, 550ms) e o hero revela em coreografia (`d1`, `d3`–`d6`). A `.dawn-sweep` foi removida — um facho genérico cruzando a tela não pertencia a marca nenhuma.
- **O mar** (só na home): ver seção dedicada abaixo.
- **Painel da engine**: as peças internas montam em cascata (`.boot`, `.boot-cascade`, 0,2s–0,6s), penduradas no reveal do próprio painel — não no load. Assim funciona igual no desktop e no celular, onde o painel está abaixo da dobra.
- **Zero loops perpétuos no hero.** O único movimento ambiente do site é o barquinho da rota (`sail-x`).
- **Reveal**: IntersectionObserver, 400ms, translateY(20px) → 0. `.stagger` com delays de 40–340ms.
- **Rota que se desenha**: `[data-draw]` escala de 0 → 1 (1.4s) quando entra na tela; o barquinho só aparece depois que a linha desenha.
- **Barra de progresso de leitura**: `#scroll-progress` fixa no topo (gradiente âmbar→dourado), atualizada via rAF.
- **Contadores**: `[data-count-to]`, easing cúbico, 1400ms, disparo em threshold 0.5.
- **Shift engine**: painel leve no hero da home, com segmentos de progresso, barras e log de eventos gerados em JS vanilla.
- **Spotlight**: `.spot` segue o cursor via `--mx/--my` (dourado + âmbar).
- **Header**: pílula com blur ao rolar > 24px (max-w 80rem → 64rem).
- **Menu mobile**: overlay full-screen, fecha por link, backdrop ou Esc. Alvos de toque ≥ 44px.
- `prefers-reduced-motion` desativa todas as animações (inclusive entrada, barquinho e rota desenhada).

### O mar (hero da home)

A metáfora "mar aberto" existia só como copy — rota, paradas, log pose, tesouro — e nunca como forma. O mar é
a primeira vez que ela vira desenho. Fica **atrás** do conteúdo: o texto está legível no primeiro quadro.

- **A luz sobe** (`.sea`, 1,25s): a camada entra de `scaleY(0.4)` a 1 com fade, ancorada na base.
- **A linha do horizonte** (`.sea-line`, 1,15s): se abre do centro pra fora. É a única aresta dura do efeito.
- **Luz na água** (`.sea-band` ×3): massas borradas (`filter: blur(64px)`) à deriva em 26s/37s/48s com
  `alternate` — nunca `linear`, senão salta no fim do ciclo. É o único movimento perpétuo do hero.
- **O título entra na direção da leitura** (`.hero-title`, 0,72s): wipe de `clip-path` da esquerda pra direita.
  O h1 saiu do `.reveal` e virou animação CSS pura — no hero ele sempre está em tela, e assim não depende do
  IntersectionObserver disparar (a auditoria mostrou que sem callback o título ficava invisível pra sempre).

**Três coisas que quebraram no caminho — não desfaça sem querer:**

1. **Nada de geometria dura.** A primeira versão usava faixas retas de 1px como "luz na água". Num layout de
   largura cheia, linha reta atravessando conteúdo lê como borda, não como água — cortava os CTAs ao meio.
   Só massa borrada funciona. A única exceção é a linha do horizonte, e ela fica onde não cruza nada.
2. **A máscara precisa apagar TODAS as bordas da camada**, não só o topo. Com máscara só no topo, a caixa
   da `.sea` aparecia como um retângulo mais claro.
3. **Ancoragem diferente no celular.** Empilhado, o hero é muito mais alto que a tela e a luz caía inteira
   abaixo da dobra — no aparelho por onde chega a maior parte do tráfego. Abaixo de 1024px a camada é ancorada
   no topo com `height: 100svh`, então o brilho termina exatamente na dobra, onde a linha do horizonte o corta.
   Por isso a `.sea-line` é irmã da `.sea`, não filha: precisa de ancoragem independente.

**Teto de luz:** as alphas do mar somam um fundo composto de pico em torno de (80, 70, 55). Acima disso o texto
que fica sobre a luz começa a reprovar em AA — a 30% mais forte, o meta row do hero caía para 3,18:1. O meta row
do hero está em `/75` justamente porque fica sobre a parte mais clara. Se aumentar a luz, recalcule.

### O que já foi tentado e cortado

**Ignição / singularidade (2026-08-22) — construída, medida, removida.** Uma coreografia de entrada de ~2,2s
só na home: um ponto de luz pulsava, colapsava e detonava; a onda abria um véu navy; um grafo de nós se
desenhava; o hero emergia; o painel montava por último. Removida no mesmo dia após auditoria. Os motivos,
para que ninguém reconstrua isso:

- **660ms com nada acima de 5% de visibilidade.** Tela escura, um ponto laranja, sem spinner e sem skeleton:
  a única leitura disponível é "não carregou". Foi implementada com opacidade em vez de loader, o que não muda
  nada para o olho — era boot screen.
- **A ordem de revelação saía invertida.** A origem estava centrada no painel (74%/50%), então a abertura
  descobria a tela por distância até esse ponto: painel 700ms → título 760ms → CTA 800ms → header 820ms.
  A coisa decorativa aparecia primeiro.
- **No celular o conceito nem existia.** Abaixo de 768px o véu tinha `mask-image: none` e virava uma folha
  navy opaca. Título só a 98% aos 1240ms — no dispositivo por onde chega o tráfego de Instagram.
- **O grafo custava caro e aparecia por 140ms.** Ficava completo aos 1460ms, sumia aos 2160ms, a 42% de
  opacidade em `z-index: 40` — por cima do conteúdo, e no celular por cima do CTA primário.
- **A metáfora era de outra marca.** Singularidade, big bang e topologia de nós falam de nascimento súbito de
  inteligência. A Shift promete o oposto: tirar o drama da semana do cliente. E grafo de nós é como um
  desenvolvedor desenha um sistema, não como uma dona de clínica pensa a empresa dela.
- **Contradizia a decisão 3 no lugar mais visível possível.** Uma empresa que vende eficiência operacional
  fazendo o visitante esperar por um show de luzes.

O que sobrou disso: a cascata `.boot` do painel, rependurada no reveal normal e retimada para 0,2s–0,6s.
É a única parte que expressava o produto — um sistema entrando no ar.

**Telemetria animada no painel do hero (removida junto).** A barra "Sincronizando operação" enchia e voltava a
zero a cada 3,64s, para sempre; as sete barras se reembaralhavam a cada 1,6s; o log despejava eventos falsos a
cada 2,2s. Uma sincronização que reinicia eternamente é a assinatura visual de uma integração quebrada, e o
desconto de credibilidade contaminava os números reais da página. Hoje o painel preenche uma vez, com dados
fixos, e está rotulado como ilustração.

## Legal / cookies

- **Privacidade** (`privacidade.html`): LGPD completa. A seção 06 declara que o site **não usa cookies de rastreamento hoje** — manter fiel à realidade.
- **Termos de uso** (`termos.html`): institucional; deixa claro que o diagnóstico é estimativa ilustrativa, não proposta vinculante.
- **Quiz**: linha de transparência abaixo do card ("Suas respostas não são salvas…") — as respostas rodam 100% no navegador.
- **Banner de cookies**: pronto porém **desativado** em `site.js`. Para ligar (quando adicionar GA/Meta Pixel), inclua antes do site.js: `<script>window.SHIFT_ENABLE_COOKIE_BANNER = true;</script>` e carregue os scripts de medição apenas se `window.shiftConsent() === 'all'`. A escolha persiste em `localStorage['shift-consent']` e dispara o evento `shift:consent`. Alternativa sem banner: Vercel Analytics (cookieless).

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
