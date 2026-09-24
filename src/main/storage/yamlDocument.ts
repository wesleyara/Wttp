import { Document, isMap, isSeq } from "yaml";

/**
 * Constrói o YAML a partir de um objeto já na ordem de chaves canônica — a ordem de
 * inserção do JS é preservada pelo `yaml`, então quem chama isto já decidiu a ordem
 * (arch-docs/file-format.md §6, regra 2). `flowArrayPaths` marca os arrays cujos itens devem
 * virar mapas flow (`{ name: a, value: b }`), como nos exemplos de `query`/`headers`.
 */
export function buildDocument(
  orderedFields: Record<string, unknown>,
  flowArrayPaths: readonly (readonly string[])[] = [],
): Document {
  const doc = new Document();
  doc.contents = doc.createNode(orderedFields);

  for (const path of flowArrayPaths) {
    const node = doc.getIn(path, true);
    if (isSeq(node)) {
      for (const item of node.items) {
        if (isMap(item)) item.flow = true;
      }
    }
  }

  return doc;
}

export function stringifyDocument(doc: Document): string {
  return doc.toString({ lineWidth: 0 });
}

/** Monta um objeto só com as chaves de `order` presentes em `source`, na ordem dada. */
export function orderFields(
  source: Record<string, unknown>,
  order: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of order) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}
