# SHIFT — site institucional

Site institucional do Grupo Shift. SHIFT é a marca pública; a razão social permanece nos dados legais. O grupo implanta tecnologia e oferece educação prática em IA.

## Posicionamento

A Shift conecta IA aos sistemas que o cliente já usa e constrói a estrutura que falta quando não há integração ou quando a operação depende de planilhas e WhatsApp. A oferta é organizada em quatro níveis de maturidade: executa, opera, analisa e recomenda. Decisões com impacto continuam sob aprovação humana.

## Páginas

| Arquivo | Papel |
| --- | --- |
| `index.html` | Home: urgência do mercado, IA na gestão (processos, equipes, decisões, clientes), níveis, áreas, objeções e diagnóstico |
| `processo.html` | Seis passos de implantação e modelo comercial |
| `solucoes.html` | Soluções organizadas pelos quatro níveis e pela base técnica |
| `segmentos.html` | Exemplos por setor: seis setores gerais e três detalhados (contabilidade, advocacia, imobiliárias) |
| `diagnostico.html` | Diagnóstico operacional adaptativo de oito perguntas |
| `contato.html` | Canais de contato |
| `sites.html` | Presença digital como solução complementar |
| `privacidade.html` | Política de privacidade |
| `termos.html` | Termos de uso |
| `404.html` | Página de erro |

## Desenvolvimento

```bash
npm ci
npm run build
npm run dev
node scripts/check.mjs
```

`npm run build` compila o Tailwind e gera `dist/`. A configuração de hospedagem publica essa pasta.

Depois do build, `npm run test:journey` percorre as dez páginas em Chromium e testa o diagnóstico com um CRM simulado. Use `npx playwright-core install chromium` ou indique um Chrome instalado em `CHROMIUM_PATH`. O teste não envia leads nem abre o WhatsApp.

Na triagem, “Ainda não medimos” deixa tanto o tempo quanto a prioridade a confirmar. Não se presume um número mínimo de horas para esse caso.

## Identidade e acessibilidade

- Identidade aprovada em 09/10/2026: preto suave `#191918` e Linho `#EAE5DC`.
- Onça contínua junto ao nome SHIFT; assinatura estática, com versões para o site e favicon.
- `assets/brand-linho.css` centraliza os tokens e as superfícies da nova identidade.
- Fontes locais Geist, Geist Mono e Cormorant Garamond.
- Conteúdo acessível sem JavaScript e sem depender das animações de entrada.
- `prefers-reduced-motion` e o botão “Pausar movimento” são respeitados.
- Menu móvel usa foco controlado, `Escape`, `inert` e alvos de toque.
- A arte principal é recomposta para telas estreitas em vez de simplesmente desaparecer.

## Diagnóstico e dados

A terceira pergunta depende da área escolhida. O tempo é o esforço semanal declarado pela equipe multiplicado por quatro, sem promessa de economia. A triagem soma tempo (1–4), forma de controle (1–4), prazo (0–3) e equipe (0–3): abaixo de 6 é exploratória; de 6 a 8, relevante; a partir de 9, alta. A prioridade é enviada em respostas, não no campo histórico de maturidade.

O diagnóstico mantém as respostas no navegador. Nome, empresa e WhatsApp são opcionais. O `CRM_ENDPOINT` já está configurado para `https://crm.shiftsys.com.br/api/leads`; nenhum POST é feito sem consentimento explícito. O resultado e o WhatsApp funcionam mesmo quando o CRM não existe ou falha.

Nunca coloque segredo, token ou chave no endpoint ou no JavaScript do site: todo código enviado ao navegador é público.

## Contatos publicados

- WhatsApp: `+55 54 98418-4808`
- Instagram: `@shift.grupo`
- E-mail: `hello@shift.systems`

O e-mail e o domínio devem ser confirmados antes de eventual troca para `contato@shiftsys.com.br`.
