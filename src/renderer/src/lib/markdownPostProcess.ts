import { rewriteAttachmentsInHtml } from "./markdownAttachments";
import { substituteVariablesInHtml } from "./markdownVars";

/**
 * O único gancho `sanitize` do `md-editor-v3` para o HTML da prévia (EP-12): anexos de
 * `attachments/` viram `<img>`/`<video>` carregáveis e `{{variáveis}}` viram o valor do
 * environment ativo. Editor, leitura e tela cheia passam todos por aqui.
 */
export function postProcessMarkdownHtml(
  html: string,
  variableValues: Record<string, string>,
): string {
  return substituteVariablesInHtml(rewriteAttachmentsInHtml(html), variableValues);
}
