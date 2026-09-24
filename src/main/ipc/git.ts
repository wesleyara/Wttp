import type { GitRootPayload } from "@shared";

import { getGitInfo, getGitStatus } from "../git/git";
import { DomainError } from "./errors";
import { registerHandler } from "./registry";

function assertRoot(payload: GitRootPayload): void {
  if (!payload || typeof payload.root !== "string" || payload.root.length === 0) {
    throw new DomainError("INVALID_PAYLOAD", "git channels need the workspace root");
  }
}

export function registerGitHandlers(): void {
  registerHandler("git:info", payload => {
    assertRoot(payload);
    return getGitInfo(payload.root);
  });
  registerHandler("git:status", payload => {
    assertRoot(payload);
    return getGitStatus(payload.root);
  });
}
