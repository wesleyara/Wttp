/**
 * Raiz do workspace atualmente aberto. Existe só porque `secret:get`/`secret:set`
 * (EP-04-T06) foram especificados no IPC sem `root` no payload (diferente de
 * `node:*`, que recebe `root` explicitamente) — a store de segredos vive em
 * `<root>/.wttp/secrets.json`, então o handler precisa saber qual `root` é o atual.
 * Setado por `ipc/workspace.ts` a cada `workspace:open`/`workspace:create` bem-sucedido.
 */
let activeRoot: string | null = null;

export function setActiveWorkspaceRoot(root: string): void {
  activeRoot = root;
}

export function getActiveWorkspaceRoot(): string | null {
  return activeRoot;
}
