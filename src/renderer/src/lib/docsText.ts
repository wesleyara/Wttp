/**
 * Prepara o markdown de `docs` para o YAML (EP-12-T01). O serializer só consegue gravar um
 * bloco literal legível (`docs: |`) se o texto não terminar numa linha de puro espaço sem
 * quebra final — o auto-indent do editor deixa exatamente isso depois de um bloco de código
 * indentado, e o YAML cairia para uma string entre aspas, ilegível num diff. Só esse
 * sufixo invisível é removido; nada do markdown renderizado muda.
 */
export function normalizeDocs(text: string): string {
  return text.replace(/\n[ \t]+$/, "\n");
}
