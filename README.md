# Handoff: Shift Systems — Landing Page

## Overview

Marketing landing page for **Shift Systems**, a tech company building custom software, automations, and AI agents for businesses that want to scale operations.

The page is built around a single bold positioning statement — **"empresas lentas perdem dinheiro."** — and walks the visitor through (a) the cost of manual operations, (b) the five services Shift offers, (c) the engagement process, (d) brand positioning, (e) a final CTA.

The visual language is provocative, technical, and premium: near-black background, neon purple as the only chromatic accent, glassmorphism cards, lots of subtle animation that signals "this is a working system, not a brochure."

The brand mark is the **Sliced S** — a custom monogram (two horizontal slabs connected by a diagonal stroke). It must not be substituted with a stock S logo.

## About the Design Files

The files bundled here (`Shift Systems Landing.html` + the `landing/` folder) are **design references created in HTML** — a working prototype showing intended look, behavior, motion, and content. They are NOT production code to ship directly.

The task is to **recreate these designs in your target codebase** (Next.js, Astro, Remix, etc.) using its established patterns, libraries, and conventions. If no codebase exists yet, choose the most appropriate framework — **Next.js 14+ with Tailwind CSS** is the recommended default since the prototype is already structured that way.

The prototype uses Tailwind via CDN and inline React+Babel for fast iteration. In production:
- Move Tailwind to a proper build pipeline
- Convert the JSX files to real `.tsx` modules
- Replace the hand-rolled `useReveal` / `Counter` / `Typed` hooks with battle-tested equivalents (e.g. `framer-motion` for reveal/scroll animations, custom hooks for counters)
- Self-host fonts (Geist + Geist Mono) instead of using Google Fonts CDN

## Fidelity

**High-fidelity (hifi).** The prototype contains the final colors, typography, spacing, content, and intended motion. Recreate pixel-perfect using your codebase's libraries.

---

## Brand & Design Tokens

### Colors

| Token            | Hex                          | Usage                                        |
|------------------|------------------------------|----------------------------------------------|
| `ink`            | `#08080b`                    | Page background base                         |
| `ink2`           | `#0e0e13`                    | Slightly elevated dark surface               |
| `purple`         | `#B56BFF`                    | Primary accent (neon purple)                 |
| `purple-deep`    | `#8A4DCC`                    | Secondary purple, button gradient end        |
| `purple-glow`    | `rgba(181,107,255,0.55)`     | All glow filters / drop-shadows              |
| `paper`          | `#f6f5f1`                    | Light text (warm off-white, not pure white)  |

White is **never** pure `#FFFFFF` — always `paper` (`#f6f5f1`) or transparency over the dark base. Text opacity scale: `text-white/45` (subdued), `text-white/55` (secondary), `text-white/65` (body), `paper` (primary).

Page background is a layered radial gradient (defined as `.page-bg`):
```css
background:
  radial-gradient(1100px 700px at 80% -10%, rgba(181,107,255,0.18), transparent 60%),
  radial-gradient(800px 600px at -10% 30%, rgba(138,77,204,0.10), transparent 60%),
  radial-gradient(900px 700px at 50% 110%, rgba(181,107,255,0.10), transparent 60%),
  #08080b;
```

### Typography

- **Headings & wordmark:** Geist (weights 400, 500, 600, 700)
- **Body:** Geist (400, 500)
- **Eyebrows, labels, meta, code-like UI:** Geist Mono (400, 500)

Type scale (Tailwind classes):

| Use            | Mobile         | Desktop                  |
|----------------|----------------|--------------------------|
| Hero headline  | `text-[44px]`  | `text-7xl` / `text-[88px]` lg |
| Section title  | `text-4xl`     | `text-6xl` / `text-7xl` lg    |
| Card title     | `text-2xl`     | `text-2xl`               |
| Body large     | `text-lg`      | `text-xl`                |
| Body           | `text-base`    | `text-lg`                |
| Meta / eyebrow | `text-[10px]` to `text-xs` | same          |

The display class:
```css
.display {
  font-family: 'Geist';
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 0.95;
  text-wrap: balance;
}
```

Eyebrow class (mono, 0.24em tracking, uppercase, purple).

All copy is intentionally lowercase except brand names. Preserve this — it's part of the tone.

### Spacing

Section padding: `py-28 md:py-36` vertical, `px-6 md:px-12 lg:px-20` horizontal. Max content width: `max-w-7xl` (centered).

Card padding: `p-7` (28px). Larger cards: `p-10 md:p-16 lg:p-20`.

### Radii

- Cards / inputs: `rounded-2xl` (1rem / 16px)
- Buttons / chips / pills: `rounded-full`
- Large feature cards: `rounded-3xl` (1.5rem)
- Icon containers: `rounded-xl` (12px)

### Borders

- Glass cards: `1px solid rgba(255,255,255,0.08)` → hover `rgba(181,107,255,0.35)`
- Purple chips: `1px solid rgba(181,107,255,0.25)`
- Section dividers: `.hr-grad` — a 1px horizontal gradient strip (transparent → white/0.18 → transparent)

### Shadows

- Primary button: `0 12px 40px -10px rgba(181,107,255,0.55), inset 0 1px 0 rgba(255,255,255,0.25)`
- Card ring glow: `0 0 60px 0 rgba(181,107,255,0.4)` (used sparingly on small purple dots)
- Header pill (scrolled state): `0 8px 40px -12px rgba(0,0,0,0.6)`

### Glassmorphism

```css
.glass {
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(12px);
}
.glass:hover {
  border-color: rgba(181,107,255,0.35);
  background: linear-gradient(180deg, rgba(181,107,255,0.06), rgba(255,255,255,0.02));
}
.glass-strong { /* same but blur(16px) and higher opacity */ }
```

---

## The Logo Mark — "Sliced S"

A custom monogram. Two horizontal slabs joined by a diagonal stroke. The diagonal IS the "shift."

SVG (100×100 viewBox):
```html
<svg viewBox="0 0 100 100" fill="none">
  <rect x="26" y="18" width="60" height="14" rx="2" fill="#B56BFF" />   <!-- top slab, aligned right -->
  <path d="M38 32 L62 68" stroke="#B56BFF" stroke-width="14" />          <!-- diagonal -->
  <rect x="14" y="68" width="60" height="14" rx="2" fill="#B56BFF" />   <!-- bottom slab, aligned left -->
</svg>
```

Apply a drop-shadow glow proportional to size: `drop-shadow(0 0 ${size * 0.18}px rgba(181,107,255,0.55))`. Disable the glow on light backgrounds.

In the header, the mark uses a continuous micro-shift animation (`@keyframes shift-loop`) — the top and bottom slabs nudge 2px apart and back every ~5s. Subtle but signature.

**Wordmark lockup:** `Shift` in Geist 600, a purple `.`, then `SYSTEMS` in Geist Mono 400 with 0.3em tracking, uppercase, ~55% opacity, baseline-aligned with the wordmark.

---

## Page Structure

The page is a single scrolling document with a fixed header and these sections in order:

1. **Hero** (`#inicio`)
2. **Provocative / problem framing** (`#problema`)
3. **Solutions** (`#solucoes`)
4. **Process** (`#processo`)
5. **Positioning quote**
6. **Final CTA** (`#contato`)
7. **Footer**

### 1. Header

Fixed top, full width. Two states:

- **At top (scrollY ≤ 24px):** Inline, `max-w-7xl`, transparent, no border.
- **Scrolled (scrollY > 24px):** Centered pill, `max-w-5xl`, background `#0b0b10` at 85% opacity with `backdrop-blur-2xl`, `border-white/8`, `rounded-full`, drop shadow `0 8px 40px -12px rgba(0,0,0,0.6)`. The transition between states is 300ms.

Contents (left → center → right):
- **Left:** MarkA (24px) + wordmark "Shift. SYSTEMS"
- **Center (absolute positioned, `left-1/2 -translate-x-1/2`):** Nav links — `início`, `soluções`, `processo`, `contato`. Each link is `text-sm text-white/65`, hover `text-white` with `bg-white/[0.04]` rounded-full background fill.
- **Right:** Primary CTA "automatizar minha empresa" with arrow icon. Pill-shaped, purple gradient.

Mobile: nav hidden, CTA shrinks to "começar".

### 2. Hero

Vertical padding: `pt-32 sm:pt-40 md:pt-48 pb-20 md:pb-32`.

Layout: 12-column grid (`lg:grid-cols-12`). Text takes `lg:col-span-7`, visual `lg:col-span-5`. Stacked on mobile.

**Text column:**
- Eyebrow row: pulsing purple dot (animate-ping) + "Shift / Systems · 2026" in mono
- Headline (display class, 44px mobile → 88px lg):
  > empresas lentas  
  > [perdem in white/45] [dinheiro. in purple with text-shadow]
- Subtitle (`text-xl md:text-2xl text-white/75`): "sistemas, automações e inteligência artificial para empresas que querem parar de operar no improviso."
- Support text (`text-base md:text-lg text-white/55`): "a Shift Systems transforma processos manuais, atendimento desorganizado e tarefas repetitivas em tecnologia simples, inteligente e escalável."
- CTA buttons: Primary "quero acelerar meu negócio →" + Ghost "ver soluções". On mobile both stack full-width.
- Trust strip (`text-xs font-mono text-white/40 uppercase`): "tempo médio · 2-6 semanas" • "stack sob medida"

**Visual column — "system graph":**
A composition of 4 floating cards showing live-updating data. Each card has the `.floaty` animation (gentle 6s up/down translateY).

- **Entrada (top-left, w-58%)** — "atendimento WhatsApp", live conversation counter that increments every 2.2s, pulsing dot indicator
- **Núcleo / Shift Engine (center-right, w-72%)** — the central card. Mark + "núcleo" label, "Shift Engine" name, 12-segment progress bar that fills cyclically (one segment lights up every 280ms), percentage display
- **Saída / dashboard (bottom-left, w-55%)** — 7 vertical bars whose heights randomly shift every 1.6s. The rightmost bar is always solid purple; right-half bars are lower-opacity purple; left-half are white/0.18. Below: "▲ +X% vs ontem" delta.
- **Activity log (bottom-right, w-62%)** — vertical scrolling log of fake system events ("agente-vendas → lead qualificado", "webhook → CRM atualizado · 200 OK", etc.) using `@keyframes scroll-up` infinite loop.

Connecting them: three Bezier-curve SVG paths with animated `stroke-dashoffset` (data-flow effect). Two orbital particles rotate around the center.

**Mobile fallback:** The 4 cards become a 2-col grid stacked below the hero text (Engine full-width, Entrada + Dashboard side-by-side, Activity full-width). Connecting lines and orbitals hidden.

### 3. Provocative (`#problema`)

`/ 01 — O custo do improviso`

Title:
> se sua empresa ainda depende de planilhas, retrabalho e WhatsApp bagunçado, [ela já está atrasada in white/40][.]

Three glass cards in `md:grid-cols-3`, each with:
- Number tag (`/ 01`, `/ 02`, `/ 03`)
- Icon (top-right, line-only, no AI clichés — see icon set below)
- Title
- Body paragraph
- `.hr-grad` divider
- Stat with animated counter (counts up on intersection):
  - 40% dos leads · nunca recebem retorno
  - 2h por dia · gastas em cópia-e-cola
  - decisões no escuro · baseadas em achismo

Each card has a cursor-following purple spotlight (`.spot`) and a shimmer sweep on hover (`.shimmer::after` with `@keyframes shimmer-sweep`).

### 4. Solutions (`#solucoes`)

`/ 02 — Soluções`

Title:
> tecnologia sob medida para fazer sua empresa rodar melhor[.]

Bento-style grid (`md:grid-cols-3`). Five cards, two of which span 2 columns (`md:col-span-2`):

| # | Title              | Tags                                              | Span |
|---|--------------------|---------------------------------------------------|------|
| 1 | sistemas sob medida | web app, multi-usuário, login + permissões       | 2    |
| 2 | automações          | n8n, webhooks, gatilhos                          | 1    |
| 3 | agentes de IA       | atendimento, vendas, qualificação                | 1    |
| 4 | dashboards          | BI sob medida, tempo real                        | 1    |
| 5 | integrações         | WhatsApp API, CRMs, bancos de dados, ERP         | 2    |

Each card: purple-tinted icon box (44px square, rounded-xl, purple border + bg, purple icon). Icon scales up + rotates 3° on group hover. Below: title, body, then a row of mono-cased tag chips. Tag chips get purple border on hover.

### 5. Process (`#processo`)

`/ 03 — Como trabalhamos`

Title:
> do problema ao sistema [funcionando in white/40][.]

Intro: "quatro etapas, sem mistério. cada uma com entregáveis claros e prazos definidos."

Vertical timeline. A single vertical 1px gradient line on the left (`from-transparent via-purple/40 to-transparent`), with a small purple dot (`.travel-dot`) animating top-to-bottom on a 5s loop.

Four steps, each as a row of `md:grid-cols-12`:
- **Left (col-span-2):** 80×80 glass square with `rounded-2xl`, mono number (01–04) in purple. Hover: an expanding outer ring (`border-purple/30` scaling to 125% with opacity transition).
- **Right (col-span-10):** Glass card with step name + delivery chips (purple bg/border) on the top row, then body paragraph.

Steps:
1. **diagnóstico** — chips: "mapa de gargalos", "ROI estimado"
2. **mapeamento** — chips: "blueprint técnico", "cronograma"
3. **desenvolvimento** — chips: "releases semanais", "ambiente de teste"
4. **evolução** — chips: "suporte", "novas features"

### 6. Positioning

A single oversized glass-strong card (`rounded-3xl`, `p-10 md:p-16 lg:p-20`) with the Mark watermark at 500px in the top-right at 7% opacity.

`/ 04 · posicionamento`

Title:
> tecnologia não precisa [impressionar in white/40 italic light].  
> precisa [resolver in purple][.]

Body: "nosso foco é criar soluções digitais que reduzem esforço operacional, organizam processos e ajudam empresas a crescerem com mais controle."

Divider (`.hr-grad`).

Sub-eyebrow: "princípio"
Sub-display:
> [menos in white/45] improviso[.]  
> [mais in white/45] sistema[.]  
> [mais in white/45] resultado[.]

### 7. CTA (`#contato`)

Full-bleed section. Background: large pulsing purple aurora (`.aurora` keyframe) + three concentric expanding rings (`border-purple/20`, `border-purple/10`, `border-purple/5`) + `.grid-overlay`.

Pill badge at top: pulsing dot + "vagas abertas · 2026" eyebrow.

Headline (centered):
> o manual custa mais caro  
> do que você imagina[.]

Subtitle (centered): "vamos identificar onde sua empresa está perdendo tempo e transformar isso em sistema, automação ou IA."

CTA row (centered): Primary button "falar com a Shift →" linking to WhatsApp + small text "resposta em < 24h".

### 8. Footer

Three columns (`md:grid-cols-12`):
- **col-span-6:** Mark (40px) + "Shift. Systems" wordmark + mono tagline "sistemas · ia · automações" + description paragraph
- **col-span-3:** Eyebrow "navegação" + link list (início, soluções, processo, contato)
- **col-span-3:** Eyebrow "contato" + Instagram (`@shift_systemss`), WhatsApp, email links

Hr-grad divider, then bottom strip with copyright + version tag, both `text-xs font-mono uppercase text-white/40`.

---

## Interactions & Behavior

### Scroll reveal
Elements with `.reveal` class fade up 24px on intersection (`opacity 0 → 1`, `translateY(24px) → 0`, 900ms ease). Use an IntersectionObserver with `threshold: 0.15` and unobserve after triggering. In production, use `framer-motion` or `react-intersection-observer`.

### Counter animation
Stats with `<Counter to={X} />` count from 0 → X over 1600ms using `1 - (1-p)^3` easing, triggered on intersection (threshold 0.5). Decimals controlled via prop.

### Header
Toggles `scrolled` state on `window.scrollY > 24`. Width animates from `max-w-7xl` to `max-w-5xl`, background/border/blur appear.

### Hero "system graph"
- Dashboard bars update every 1600ms with `Math.max(25, Math.min(98, v + (Math.random() * 30 - 15)))`
- Engine progress increments every 280ms, cycles 0–12
- Conversation counter increments by 0–2 every 2200ms
- SVG paths have `<animate>` tag on `stroke-dashoffset` (or use CSS keyframes if SVG doesn't support `<animate>` in target framework)
- Each floaty card has `animation-delay` offset so they don't move in sync

### Card hover
- Border becomes purple/35
- Background gains purple/6 tint
- Spotlight follows cursor (sets `--mx`, `--my` CSS vars on mousemove)
- Shimmer band sweeps left-to-right once (1.2s ease)

### Logo micro-shift
Top + bottom slabs of the Mark animate `translate(2px, -1px)` and `translate(-2px, 1px)` every 5s with the bottom slab in reverse — creates a subtle pulse echoing the "shift" idea.

### Process travel dot
A 7px purple dot travels top→bottom along the vertical connector line on a 5s linear loop, fading in/out at the endpoints.

### Aurora keyframe
Used on CTA + various ambient elements:
```css
@keyframes aurora {
  0%, 100% { opacity: 0.25; transform: scale(1); }
  50%      { opacity: 0.45; transform: scale(1.08); }
}
```

---

## Responsive Breakpoints

Tailwind defaults are used throughout:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px (key breakpoint — hero visual switches from stacked-grid to absolute-positioned floating)
- `xl`: 1280px

Test the hero specifically at `~1024px`, `~768px`, and `~390px` (iPhone). The mobile hero visual is a 2-column grid below the text.

---

## Icon Set

All icons are line-only SVG (strokeWidth 1.5, round caps/joins, 24×24 viewBox). They live in `components.jsx` as `Icon.{Pulse, Stack, Flow, Spark, Bars, Link, Alert, Eye, Arrow}`. Reuse these — do not substitute with Lucide/Heroicons unless visually identical.

**Do not use:** robot icons, brain icons, sparkle/AI clichés, gradient blobs.

---

## State Management

This is a marketing page. No persistent state, no auth. The only React state is local UI:
- Header `scrolled`
- Hero visual `bars`, `prog`, `convos`
- Per-card `--mx`, `--my` CSS vars

No data fetching. No backend.

---

## Accessibility Notes

- All interactive elements use semantic `<a>` and `<button>`. Keep this.
- Focus states are NOT styled in the prototype — add visible focus rings in production (`focus-visible:ring-2 focus-visible:ring-purple/50`).
- Animations should respect `prefers-reduced-motion`. Add a global wrapper:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
- Color contrast on the deep-purple/black background should be verified for body text — currently white/65 on near-black passes WCAG AA at the body sizes used, but verify any text smaller than 14px.
- The animated activity log and bars should be hidden from screen readers (`aria-hidden="true"`).

---

## Assets

- **Fonts:** Geist + Geist Mono (Google Fonts in prototype, self-host in production from [vercel.com/font](https://vercel.com/font))
- **Logo:** The Sliced S mark is custom SVG in `components.jsx` — copy it directly, do not redraw
- **No image assets** are used. All visuals are CSS, SVG, or layout primitives.

---

## Content / Copy

All Portuguese, all lowercase. Real WhatsApp number and Instagram handle in footer need to be confirmed by the client before launch. Currently using:
- Instagram: `@shift_systemss`
- WhatsApp: `https://wa.me/5511999990000` (placeholder)
- Email: `hello@shift.systems`

---

## Files in this Bundle

| Path                              | Purpose                                                    |
|-----------------------------------|------------------------------------------------------------|
| `Shift Systems Landing.html`      | Entry point — Tailwind config, CSS keyframes, font imports |
| `landing/components.jsx`          | `MarkA`, `Wordmark`, `Section`, buttons, `Counter`, `Typed`, `useReveal`, `useSpotlight`, `Icon` set |
| `landing/sections.jsx`            | `Header`, `Hero`, `HeroVisual`, `Provocative`, `Solutions`, `Process`, `Positioning`, `CTA`, `Footer` |
| `landing/app.jsx`                 | Root `<App>` that composes all sections                    |

---

## Recommended Implementation Plan

1. **Set up Next.js 14+ with Tailwind.** Extend the Tailwind config with the color tokens above.
2. **Self-host Geist + Geist Mono** via `next/font`.
3. **Port the SVG mark** to a `<Logo />` component with an `animate` prop.
4. **Recreate the global CSS** (page-bg, glass, .display, keyframes) in a `globals.css`.
5. **Build the layout shell** (Header + Footer wrapping `{children}`) in `app/layout.tsx`.
6. **Build each section as its own component** in `components/sections/`. Match the order in `app/page.tsx`.
7. **Replace the hand-rolled hooks** with `framer-motion` (`useInView`, `useMotionValue`, `useTransform`) for reveal + counter animations. The Hero visual's "live" feel can stay as-is with `useEffect` + `setInterval`.
8. **Test responsive** at 390 / 768 / 1024 / 1280 / 1920.
9. **Add `prefers-reduced-motion` support.**
10. **Replace placeholder contact info** with real values from the client.
