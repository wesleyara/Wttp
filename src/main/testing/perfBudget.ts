/**
 * Orçamento de tempo dos testes de desempenho. Um limite fixo em milissegundos que passa
 * na máquina de quem escreveu o teste reprova de forma intermitente nos runners
 * compartilhados do CI (Windows e macOS chegam a ser várias vezes mais lentos, com
 * antivírus e disco de rede). No CI o orçamento é multiplicado; localmente vale o número
 * escrito. A asserção continua pegando uma regressão de ordem de grandeza (algo que
 * passa de ms para segundos), que é o que esses testes existem para pegar.
 */
const CI_FACTOR = 5;

export function perfBudget(ms: number): number {
  return process.env.CI ? ms * CI_FACTOR : ms;
}
