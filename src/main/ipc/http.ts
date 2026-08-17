import { cancelHttpRequest, sendHttpRequest } from "../http/engine";
import { registerHandler } from "./registry";

export function registerHttpHandlers(): void {
  registerHandler("http:send", (spec, event) =>
    sendHttpRequest(spec, progress => event.sender.send("http:progress", progress)),
  );
  registerHandler("http:cancel", requestId => {
    cancelHttpRequest(requestId);
  });
}
