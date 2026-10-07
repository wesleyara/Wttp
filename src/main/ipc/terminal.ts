import {
  killSession,
  resizeSession,
  spawnSession,
  TerminalSessionError,
  writeSession,
} from "../terminal/sessions";
import { openTerminal, TerminalUnavailableError } from "../terminal/terminal";
import { DomainError } from "./errors";
import { registerHandler } from "./registry";
import { readSettings } from "./settings";

function sessionError(error: unknown): unknown {
  if (error instanceof TerminalUnavailableError || error instanceof TerminalSessionError) {
    return new DomainError("ENOENT", error.message);
  }
  return error;
}

function assertId(id: unknown): asserts id is number {
  if (typeof id !== "number" || !Number.isInteger(id)) {
    throw new DomainError("INVALID_PAYLOAD", "terminal channels need a session id");
  }
}

export function registerTerminalHandlers(): void {
  registerHandler("terminal:open", async payload => {
    if (!payload || typeof payload.root !== "string" || payload.root.length === 0) {
      throw new DomainError("INVALID_PAYLOAD", "terminal:open needs the workspace root");
    }
    const { terminalCommand } = await readSettings();
    try {
      await openTerminal(payload.root, terminalCommand);
    } catch (error) {
      throw sessionError(error);
    }
  });

  registerHandler("terminal:spawn", async (payload, event) => {
    if (!payload || typeof payload.root !== "string" || payload.root.length === 0) {
      throw new DomainError("INVALID_PAYLOAD", "terminal:spawn needs the workspace root");
    }
    const { terminalShell } = await readSettings();
    const sender = event.sender;
    try {
      // O shell pode emitir antes de o renderer receber a resposta do spawn — o
      // renderer guarda a saída até a aba existir.
      const { id, shell } = await spawnSession(
        { cwd: payload.root, cols: payload.cols, rows: payload.rows, shell: terminalShell },
        sender,
        {
          onData: (sessionId, data) => {
            if (!sender.isDestroyed()) sender.send("terminal:data", { id: sessionId, data });
          },
          onExit: (sessionId, exitCode) => {
            if (!sender.isDestroyed()) sender.send("terminal:exit", { id: sessionId, exitCode });
          },
        },
      );
      return { id, shell };
    } catch (error) {
      throw sessionError(error);
    }
  });

  registerHandler("terminal:write", (payload, event) => {
    assertId(payload?.id);
    try {
      writeSession(payload.id, event.sender, String(payload.data));
    } catch (error) {
      throw sessionError(error);
    }
  });

  registerHandler("terminal:resize", (payload, event) => {
    assertId(payload?.id);
    try {
      resizeSession(payload.id, event.sender, payload.cols, payload.rows);
    } catch (error) {
      throw sessionError(error);
    }
  });

  registerHandler("terminal:kill", (id, event) => {
    assertId(id);
    killSession(id, event.sender);
  });
}
