# Shift Systems — site institucional

Site estático multipágina da Shift Systems, posicionado em torno da transformação AI-first de empresas de todos os setores.

## Posicionamento

A Shift conecta IA aos sistemas que o cliente já usa e constrói a estrutura que falta quando não há integração ou quando a operação depende de planilhas e WhatsApp. A oferta é organizada em quatro níveis de maturidade: executa, opera, analisa e recomenda. Decisões com impacto continuam sob aprovação humana.

## Páginas

| Arquivo | Papel |
| --- | --- |
| `index.html` | Home: urgência do mercado, IA na gestão (processos, equipes, decisões, clientes), níveis, áreas, objeções e diagnóstico |
| `processo.html` | Seis passos de implantação e modelo comercial |
| `solucoes.html` | Soluções organizadas pelos quatro níveis e pela base técnica |
| `segmentos.html` | Exemplos por setor: seis setores gerais e três detalhados (contabilidade, advocacia, imobiliárias) |
| `diagnostico.html` | Diagnóstico interativo de seis perguntas |
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

O diagnóstico mantém as respostas no navegador. Nome, empresa e WhatsApp são opcionais. O `CRM_ENDPOINT` já está configurado para `https://crm.shiftsys.com.br/api/leads`; nenhum POST é feito sem consentimento explícito. O resultado e o WhatsApp funcionam mesmo quando o CRM não existe ou falha.

Nunca coloque segredo, token ou chave no endpoint ou no JavaScript do site: todo código enviado ao navegador é público.

## Contatos publicados

- WhatsApp: `+55 54 98418-4808`
- Instagram: `@shift_systemss`
- E-mail: `hello@shift.systems`

O e-mail e o domínio devem ser confirmados antes de eventual troca para `contato@shiftsys.com.br`.
