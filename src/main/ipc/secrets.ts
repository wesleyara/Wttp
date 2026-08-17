import { deleteSecret, getSecret, getSecretStorageStatus, setSecret } from "../secrets/store";
import { getActiveWorkspaceRoot } from "../storage/activeWorkspace";
import { DomainError } from "./errors";
import { registerHandler } from "./registry";

/** `secret:*` sempre atua no workspace atualmente aberto — não recebe `root` no payload. */
function requireActiveWorkspaceRoot(): string {
  const root = getActiveWorkspaceRoot();
  if (!root) throw new DomainError("ENOENT", "no workspace is open");
  return root;
}

export function registerSecretHandlers(): void {
  registerHandler("secret:get", payload => getSecret(requireActiveWorkspaceRoot(), payload.key));

  registerHandler("secret:set", payload =>
    setSecret(requireActiveWorkspaceRoot(), payload.key, payload.value),
  );

  registerHandler("secret:delete", payload =>
    deleteSecret(requireActiveWorkspaceRoot(), payload.key),
  );

  registerHandler("secret:status", () => getSecretStorageStatus());
}
