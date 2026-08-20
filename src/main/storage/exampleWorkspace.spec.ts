import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { scanWorkspace } from "./tree";

// Validação pontual de EP-11-T05 (workspace de exemplo em examples/postman-echo-demo) contra
// o parser/validador reais — não faz parte da suíte permanente do projeto.
const ROOT = resolve(__dirname, "../../../examples/postman-echo-demo");

describe("examples/httpbin-demo", () => {
  it("é um workspace válido, sem nenhum nó marcado como inválido", async () => {
    const tree = await scanWorkspace(ROOT);
    const invalid: unknown[] = [];
    const walk = (nodes: typeof tree.children): void => {
      for (const node of nodes) {
        if ("invalid" in node && node.invalid) invalid.push(node);
        if ("children" in node && node.children) walk(node.children);
      }
    };
    walk(tree.children);
    expect(invalid).toEqual([]);
    expect(tree.children.map(c => c.name).sort()).toEqual(["Auth flow", "Basics"]);
  });
});
