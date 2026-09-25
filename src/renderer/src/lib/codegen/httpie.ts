/** Gerador de HTTPie (ClickLocal #46). */

import type { NormalizedRequest } from "./normalize";

import { shellQuote } from "./curl";

/** `=`, `:`, `@`, `;` e `\` numa chave de item do HTTPie são separadores — precisam de barra invertida. */
function escapeKey(key: string): string {
  return key.replace(/([\\=:@;])/g, "\\$1");
}

export function toHttpie(request: NormalizedRequest): string {
  const flags: string[] = ["--follow"];
  const items: string[] = [];
  const { body } = request;

  if (request.basic) {
    flags.push("--auth", shellQuote(`${request.basic.username}:${request.basic.password}`));
  }

  switch (body.type) {
    case "none":
      break;
    case "text":
      flags.push("--raw", shellQuote(body.text));
      break;
    case "urlencoded":
      flags.push("--form");
      for (const [n, v] of body.fields) items.push(shellQuote(`${escapeKey(n)}=${v}`));
      break;
    case "multipart":
      flags.push("--multipart");
      for (const field of body.fields) {
        items.push(
          shellQuote(
            field.type === "file"
              ? `${escapeKey(field.name)}@${field.value}`
              : `${escapeKey(field.name)}=${field.value}`,
          ),
        );
      }
      break;
    case "binary":
      // O corpo vem do stdin: `--ignore-stdin` seria o oposto do que se quer aqui.
      break;
  }

  const headerItems = request.headers.map(([name, value]) =>
    // `Nome;` manda o header vazio; `Nome:` o removeria.
    shellQuote(value === "" ? `${escapeKey(name)};` : `${escapeKey(name)}:${value}`),
  );

  const parts = [
    "http",
    ...flags,
    request.method,
    shellQuote(request.url),
    ...headerItems,
    ...items,
  ];
  const command = parts.join(" \\\n  ");
  return body.type === "binary" ? `${command} \\\n  < ${shellQuote(body.path)}\n` : `${command}\n`;
}
