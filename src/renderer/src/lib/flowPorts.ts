/**
 * "Portas" do canvas de flow (ClickLocal #58) — puro. Entradas são as `{{variáveis}}` que uma
 * request usa; saídas são os campos da última resposta conhecida dela.
 */

import type { FlowResponseSample, RequestFile, WorkspaceNode } from "@shared";

import { type BodyField, listBodyFields, type ValueSource } from "@shared/flowMapping";

/** Nomes de `{{variável}}` usados por uma request, na ordem em que aparecem, sem repetir. */
export function requestVariables(data: RequestFile): string[] {
  const texts: string[] = [data.url];
  for (const list of [data.pathParams, data.query, data.headers]) {
    for (const entry of list ?? []) {
      if (entry.enabled) texts.push(entry.name, entry.value);
    }
  }
  const auth = data.auth;
  if (auth?.type === "bearer") texts.push(auth.bearer.token);
  if (auth?.type === "basic") texts.push(auth.basic.username, auth.basic.password);
  if (auth?.type === "apikey") texts.push(auth.apikey.key, auth.apikey.value);
  const body = data.body;
  if (body?.type === "json") texts.push(body.json);
  if (body?.type === "raw") texts.push(body.raw);
  if (body?.type === "urlencoded") {
    for (const entry of body.urlencoded) if (entry.enabled) texts.push(entry.name, entry.value);
  }
  if (body?.type === "multipart") {
    for (const entry of body.multipart) if (entry.enabled) texts.push(entry.name, entry.value);
  }

  const names: string[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)) {
      const name = match[1];
      if (!name.startsWith("$") && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** A request em `path` na árvore, se existe e é válida. */
export function findRequestData(nodes: WorkspaceNode[], path: string): RequestFile | null {
  for (const node of nodes) {
    if (node.kind === "request") {
      if (node.path === path) return node.data;
    } else if (path.startsWith(`${node.path}/`)) {
      return findRequestData(node.children, path);
    }
  }
  return null;
}

export interface OutputPort {
  id: string;
  label: string;
  preview: string;
  source: ValueSource;
}

const MAX_HEADER_PORTS = 4;

/** As portas de saída de uma resposta: status, alguns headers e os campos do JSON. */
export function outputPorts(sample: FlowResponseSample | undefined): OutputPort[] {
  if (!sample) return [];
  const ports: OutputPort[] = [
    { id: "status", label: "status", preview: String(sample.status), source: { kind: "status" } },
  ];
  for (const header of sample.headers.slice(0, MAX_HEADER_PORTS)) {
    ports.push({
      id: `header:${header.name}`,
      label: header.name,
      preview: header.value.length > 24 ? `${header.value.slice(0, 23)}…` : header.value,
      source: { kind: "header", name: header.name },
    });
  }
  let fields: BodyField[] = [];
  try {
    fields = listBodyFields(JSON.parse(sample.body));
  } catch {
    // Corpo que não é JSON: só status e headers viram porta.
  }
  for (const field of fields) {
    ports.push({
      id: `body:${field.path}`,
      label: field.path,
      preview: field.preview,
      source: { kind: "body", path: field.path },
    });
  }
  return ports;
}
