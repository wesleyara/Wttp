/** Geradores de JavaScript (ClickLocal #46): `fetch` e `axios`, ambos em ESM com top-level await. */

import type { NormalizedRequest } from "./normalize";

const lit = (value: string): string => JSON.stringify(value);

function headersObject(headers: [string, string][], indent: string): string | null {
  if (headers.length === 0) return null;
  const lines = headers.map(([name, value]) => `${indent}  ${lit(name)}: ${lit(value)},`);
  return `{\n${lines.join("\n")}\n${indent}}`;
}

function basicHeader(basic: { username: string; password: string }): string {
  const credentials = `${basic.username}:${basic.password}`;
  // `btoa` só entende latin-1; a engine codifica em UTF-8 (`applyAuth`), então texto fora de
  // ASCII passa pelo `TextEncoder` antes — o mesmo header que o Wttp manda.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(credentials)) return `"Basic " + btoa(${lit(credentials)})`;
  return `"Basic " + btoa(String.fromCharCode(...new TextEncoder().encode(${lit(credentials)})))`;
}

/** Corpo como expressão JS, mais as linhas que precisam vir antes da chamada. */
function bodyParts(request: NormalizedRequest): {
  imports: string[];
  setup: string[];
  expression: string | null;
} {
  const { body } = request;
  const bodyless = request.method === "GET" || request.method === "HEAD";
  if (body.type === "none") return { imports: [], setup: [], expression: null };
  if (bodyless) {
    return {
      imports: [],
      setup: [
        `// TODO: ${request.method} requests can't carry a body in fetch/axios — body omitted.`,
      ],
      expression: null,
    };
  }
  switch (body.type) {
    case "text":
      return { imports: [], setup: [], expression: lit(body.text) };
    case "urlencoded": {
      const pairs = body.fields.map(([n, v]) => `[${lit(n)}, ${lit(v)}]`).join(", ");
      return { imports: [], setup: [], expression: `new URLSearchParams([${pairs}])` };
    }
    case "multipart": {
      const setup = ["const form = new FormData();"];
      for (const field of body.fields) {
        if (field.type === "file") {
          setup.push(
            `// TODO: attach the file at ${lit(field.value)} as ${lit(field.name)} ` +
              '(fs.openAsBlob in Node, an <input type="file"> in the browser).',
          );
        } else {
          setup.push(`form.append(${lit(field.name)}, ${lit(field.value)});`);
        }
      }
      return { imports: [], setup, expression: "form" };
    }
    case "binary":
      return {
        imports: ['import { readFileSync } from "node:fs";'],
        setup: [],
        expression: `readFileSync(${lit(body.path)})`,
      };
  }
}

export function toFetch(request: NormalizedRequest): string {
  const { imports, setup, expression } = bodyParts(request);
  const headers = [...request.headers];
  const options: string[] = [`  method: ${lit(request.method)},`];
  if (request.basic) {
    options.push(`  headers: {`);
    for (const [name, value] of headers) options.push(`    ${lit(name)}: ${lit(value)},`);
    options.push(`    "Authorization": ${basicHeader(request.basic)},`);
    options.push(`  },`);
  } else {
    const object = headersObject(headers, "  ");
    if (object) options.push(`  headers: ${object},`);
  }
  if (expression) options.push(`  body: ${expression},`);

  return [
    ...(imports.length ? [...imports, ""] : []),
    ...(setup.length ? [...setup, ""] : []),
    `const response = await fetch(${lit(request.url)}, {`,
    ...options,
    "});",
    "",
    "console.log(response.status, await response.text());",
    "",
  ].join("\n");
}

export function toAxios(request: NormalizedRequest): string {
  const { imports, setup, expression } = bodyParts(request);
  const options: string[] = [
    `  method: ${lit(request.method.toLowerCase())},`,
    `  url: ${lit(request.url)},`,
  ];
  const object = headersObject(request.headers, "  ");
  if (object) options.push(`  headers: ${object},`);
  if (request.basic) {
    options.push(
      `  auth: { username: ${lit(request.basic.username)}, password: ${lit(request.basic.password)} },`,
    );
  }
  if (expression) options.push(`  data: ${expression},`);

  return [
    'import axios from "axios";',
    ...imports,
    "",
    ...(setup.length ? [...setup, ""] : []),
    "const response = await axios({",
    ...options,
    "});",
    "",
    "console.log(response.status, response.data);",
    "",
  ].join("\n");
}
