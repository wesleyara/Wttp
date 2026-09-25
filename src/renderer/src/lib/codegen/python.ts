/** Gerador de Python `requests` (ClickLocal #46). */

import type { NormalizedRequest } from "./normalize";

const lit = (value: string): string => JSON.stringify(value);

export function toPython(request: NormalizedRequest): string {
  const args: string[] = [`    ${lit(request.method)},`, `    ${lit(request.url)},`];
  const notes: string[] = [];

  if (request.headers.length > 0) {
    const rows = request.headers.map(([n, v]) => `        ${lit(n)}: ${lit(v)},`);
    args.push(`    headers={\n${rows.join("\n")}\n    },`);
    const names = request.headers.map(([n]) => n.toLowerCase());
    if (new Set(names).size !== names.length) {
      notes.push("# NOTE: repeated header names collapse into one entry in a Python dict.");
    }
  }
  if (request.basic) {
    args.push(`    auth=(${lit(request.basic.username)}, ${lit(request.basic.password)}),`);
  }

  const { body } = request;
  switch (body.type) {
    case "none":
      break;
    case "text":
      // `.encode()` — `requests` codifica `str` como latin-1, que quebra qualquer texto fora dele.
      args.push(`    data=${lit(body.text)}.encode("utf-8"),`);
      break;
    case "urlencoded": {
      const rows = body.fields.map(([n, v]) => `        (${lit(n)}, ${lit(v)}),`);
      args.push(`    data=[\n${rows.join("\n")}\n    ],`);
      break;
    }
    case "multipart": {
      const rows = body.fields.map(field =>
        field.type === "file"
          ? `        (${lit(field.name)}, open(${lit(field.value)}, "rb")),`
          : `        (${lit(field.name)}, (None, ${lit(field.value)})),`,
      );
      args.push(`    files=[\n${rows.join("\n")}\n    ],`);
      break;
    }
    case "binary":
      args.push(`    data=open(${lit(body.path)}, "rb"),`);
      break;
  }

  return [
    "import requests",
    "",
    ...(notes.length ? [...notes, ""] : []),
    "response = requests.request(",
    ...args,
    ")",
    "",
    "print(response.status_code, response.text)",
    "",
  ].join("\n");
}
