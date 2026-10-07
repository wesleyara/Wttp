/**
 * Validação do grafo de um flow antes de rodar (ClickLocal #57/#59): o que o arquivo
 * sozinho não garante — requests que existem, "poll until" com um nó anterior de verdade.
 * Pura: recebe a árvore já lida.
 */

import type { FlowFile, FlowValidationIssue, WorkspaceTree } from "@shared";

import { findRequest } from "../runner/plan";

/** Nó por onde a execução começa. */
export function startNodeId(flow: FlowFile): string | null {
  return flow.start ?? flow.nodes[0]?.id ?? null;
}

export function validateFlowGraph(tree: WorkspaceTree, flow: FlowFile): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  if (flow.nodes.length === 0)
    issues.push({ message: "the flow has no nodes — drag a request onto the canvas first" });

  const byId = new Map(flow.nodes.map(node => [node.id, node]));
  for (const node of flow.nodes) {
    if (node.type === "request" && (!node.request || !findRequest(tree, node.request))) {
      issues.push({
        nodeId: node.id,
        message: `node "${node.id}" points to "${node.request ?? ""}", which doesn't exist or isn't a valid request`,
      });
    }
    if (node.type === "pollUntil") {
      const incoming = (flow.edges ?? []).filter(edge => edge.to === node.id);
      const previous = incoming.length === 1 ? byId.get(incoming[0].from) : undefined;
      if (previous?.type !== "request") {
        issues.push({
          nodeId: node.id,
          message: `"poll until" node "${node.id}" needs exactly one request node right before it — it re-runs that request until the condition matches`,
        });
      }
    }
  }
  return issues;
}
