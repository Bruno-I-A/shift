/**
 * O mínimo que as funções do CRM precisam de uma conexão: mandar SQL com
 * parâmetros e receber linhas.
 *
 * Em produção é um cliente do `pg` dentro de uma transação (ver `banco.ts`);
 * nos testes é o PGlite. As funções de `crm.ts` recebem sempre uma `Consulta`
 * já dentro da transação e nunca abrem nem fecham uma — quem decide o limite
 * da transação é quem chama.
 */
export interface Consulta {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
