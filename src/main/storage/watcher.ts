/**
 * Watcher de filesystem do workspace (EP-04-T05) — reflete edições feitas fora do app
 * (`git checkout`, editor externo) na UI. Observa a raiz inteira recursivamente,
 * ignora `.wttp/` e os arquivos temporários de `fsAtomic.ts` (`*.tmp-<hex>`), e
 * debounça rajadas de eventos (ex: `git checkout` mexe em dezenas de arquivos de uma
 * vez) num único `WorkspaceChangedEvent`.
 *
 * Escritas do próprio app não geram evento: cada uma passa por `writeTracker.markOwnWrite`
 * (via `fsAtomic.writeFileAtomic`, ou diretamente em `tree.ts` para os `fs.rename`/`fs.rm`
 * que não passam por ali) e `isOwnWrite` aqui filtra o evento antes de contá-lo como
 * externo — sem isso, todo save do próprio app disparava um `workspace:changed` e um
 * reload em loop.
 */

import type { WorkspaceChangedEvent } from "@shared";

import { type FSWatcher, watch as watchFs } from "node:fs";
import { join, sep } from "node:path";

import { scanWorkspace } from "./tree";
import { isOwnWrite } from "./writeTracker";

const DEBOUNCE_MS = 300;
const IGNORED_SEGMENTS = new Set([".wttp", ".git"]);
const TEMP_FILE_PATTERN = /\.tmp-[0-9a-f]+$/;

function isIgnored(filename: string): boolean {
  const segments = filename.split(sep);
  if (segments.some(segment => IGNORED_SEGMENTS.has(segment))) return true;
  return TEMP_FILE_PATTERN.test(segments[segments.length - 1] ?? "");
}

export interface WorkspaceWatcher {
  close(): void;
}

/**
 * Observa `root` e chama `onChange` (debounçado) sempre que algo muda fora de uma
 * escrita do próprio app. Lança se o filesystem não suportar `recursive: true`
 * (Linux exige um kernel recente o bastante para inotify recursivo) — quem chama
 * decide se isso impede abrir o workspace ou só desativa o live-reload.
 */
export function watchWorkspace(
  root: string,
  onChange: (event: WorkspaceChangedEvent) => void,
): WorkspaceWatcher {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let changedPaths = new Set<string>();

  const flush = (): void => {
    timer = null;
    const paths = [...changedPaths];
    changedPaths = new Set();
    if (paths.length === 0) return;

    scanWorkspace(root)
      .then(tree => onChange({ tree, changedPaths: paths }))
      .catch(() => {
        // Workspace pode ter sido apagado/movido durante o debounce — a próxima
        // rodada de eventos (ou o usuário reabrindo) tenta de novo.
      });
  };

  const fsWatcher: FSWatcher = watchFs(root, { recursive: true }, (_eventType, filename) => {
    if (!filename || isIgnored(filename)) return;

    const absPath = join(root, filename);
    if (isOwnWrite(absPath)) return;

    changedPaths.add(filename.split(sep).join("/"));
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });

  return {
    close(): void {
      if (timer) clearTimeout(timer);
      fsWatcher.close();
    },
  };
}
