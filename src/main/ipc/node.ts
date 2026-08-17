import { deleteNode, moveNode, readNode, writeNode } from "../storage/tree";
import { registerHandler } from "./registry";

export function registerNodeHandlers(): void {
  registerHandler("node:read", payload => readNode(payload.root, payload.path));
  registerHandler("node:write", payload => writeNode(payload.root, payload.path, payload.node));
  registerHandler("node:move", payload =>
    moveNode(payload.root, payload.from, payload.to, payload.seq),
  );
  registerHandler("node:delete", payload => deleteNode(payload.root, payload.path));
}
