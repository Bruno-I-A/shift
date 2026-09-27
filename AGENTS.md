# Shift

Dois projetos independentes num repositório só. Entre na pasta do que vai mexer
e leia o `AGENTS.md`/`README.md` de lá:

- `site/` — site institucional estático (shiftsys.com.br).
- `crm/` — CRM interno em Next.js (crm.shiftsys.com.br).

O que liga os dois: `site/diagnostico.html` (`sendLead`) manda o lead para
`crm/src/app/api/leads`. O formato é contrato entre as pastas: mude os dois
lados no mesmo commit.
