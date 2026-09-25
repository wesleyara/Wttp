/** Gerador de Go `net/http` (ClickLocal #46). */

import type { NormalizedRequest } from "./normalize";

// Literal de string do Go: as sequências de escape de `JSON.stringify` são todas válidas em Go.
const lit = (value: string): string => JSON.stringify(value);

export function toGo(request: NormalizedRequest): string {
  const imports = new Set(["fmt", "io", "net/http"]);
  const before: string[] = [];
  let bodyExpr = "nil";

  const { body } = request;
  switch (body.type) {
    case "none":
      break;
    case "text":
      imports.add("strings");
      bodyExpr = "body";
      before.push(`body := strings.NewReader(${lit(body.text)})`);
      break;
    case "urlencoded":
      imports.add("net/url");
      imports.add("strings");
      bodyExpr = "strings.NewReader(form.Encode())";
      before.push("form := url.Values{}");
      for (const [n, v] of body.fields) before.push(`form.Add(${lit(n)}, ${lit(v)})`);
      break;
    case "multipart":
      imports.add("bytes");
      imports.add("mime/multipart");
      bodyExpr = "&payload";
      before.push("var payload bytes.Buffer", "writer := multipart.NewWriter(&payload)");
      for (const field of body.fields) {
        if (field.type === "file") {
          imports.add("os");
          before.push(
            `if file, err := os.Open(${lit(field.value)}); err == nil {`,
            `\tpart, _ := writer.CreateFormFile(${lit(field.name)}, ${lit(field.value)})`,
            "\tio.Copy(part, file)",
            "\tfile.Close()",
            "} else {",
            "\tpanic(err)",
            "}",
          );
        } else {
          before.push(`writer.WriteField(${lit(field.name)}, ${lit(field.value)})`);
        }
      }
      before.push("writer.Close()");
      break;
    case "binary":
      imports.add("os");
      bodyExpr = "file";
      before.push(
        `file, err := os.Open(${lit(body.path)})`,
        "if err != nil {",
        "\tpanic(err)",
        "}",
        "defer file.Close()",
      );
      break;
  }

  const setup: string[] = [];
  for (const [name, value] of request.headers) {
    setup.push(`req.Header.Add(${lit(name)}, ${lit(value)})`);
  }
  if (
    body.type === "urlencoded" &&
    !request.headers.some(([n]) => n.toLowerCase() === "content-type")
  ) {
    setup.push('req.Header.Set("Content-Type", "application/x-www-form-urlencoded")');
  }
  if (body.type === "multipart") {
    setup.push('req.Header.Set("Content-Type", writer.FormDataContentType())');
  }
  if (request.basic) {
    setup.push(`req.SetBasicAuth(${lit(request.basic.username)}, ${lit(request.basic.password)})`);
  }

  const indent = (lines: string[]): string[] => lines.map(line => `\t${line}`);
  const sortedImports = [...imports].sort();

  return [
    "package main",
    "",
    "import (",
    ...sortedImports.map(name => `\t${lit(name)}`),
    ")",
    "",
    "func main() {",
    ...indent(before),
    `\treq, err := http.NewRequest(${lit(request.method)}, ${lit(request.url)}, ${bodyExpr})`,
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    ...indent(setup),
    "",
    "\tresp, err := http.DefaultClient.Do(req)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "\tdefer resp.Body.Close()",
    "",
    "\tdata, _ := io.ReadAll(resp.Body)",
    "\tfmt.Println(resp.Status, string(data))",
    "}",
    "",
  ].join("\n");
}
