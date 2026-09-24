import type { GitFileVersionsPayload, GitRootPayload } from "@shared";

import { checkoutBranch, createBranch, getBranches } from "../git/branches";
import { getChanges, getFileVersions, getGitInfo, getGitStatus, listRefs } from "../git/git";
import { commitStaged, discardPaths, initRepository, stagePaths, unstagePaths } from "../git/write";
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
  registerHandler("git:refs", payload => {
    assertRoot(payload);
    return listRefs(payload.root);
  });
  registerHandler("git:changes", payload => {
    assertRoot(payload);
    return getChanges(payload.root, payload.base);
  });
  registerHandler("git:fileVersions", (payload: GitFileVersionsPayload) => {
    assertRoot(payload);
    if (typeof payload.path !== "string" || payload.path.length === 0) {
      throw new DomainError("INVALID_PAYLOAD", "git:fileVersions needs a path");
    }
    return getFileVersions(payload.root, payload.path, payload.base, payload.from);
  });
  registerHandler("git:stage", payload => {
    assertRoot(payload);
    return stagePaths(payload.root, payload.paths);
  });
  registerHandler("git:unstage", payload => {
    assertRoot(payload);
    return unstagePaths(payload.root, payload.paths);
  });
  registerHandler("git:discard", payload => {
    assertRoot(payload);
    return discardPaths(payload.root, payload.paths);
  });
  registerHandler("git:commit", payload => {
    assertRoot(payload);
    return commitStaged(payload.root, payload.message);
  });
  registerHandler("git:init", payload => {
    assertRoot(payload);
    return initRepository(payload.root);
  });
  registerHandler("git:branches", payload => {
    assertRoot(payload);
    return getBranches(payload.root);
  });
  registerHandler("git:checkout", payload => {
    assertRoot(payload);
    return checkoutBranch(payload.root, payload.name, payload.track === true);
  });
  registerHandler("git:createBranch", payload => {
    assertRoot(payload);
    return createBranch(payload.root, payload.name);
  });
}
