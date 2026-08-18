import { detectImportFormat, parseCurlToRequest, runImport } from "../importers";
import { registerHandler } from "./registry";

export function registerImportHandlers(): void {
  registerHandler("import:detect", payload =>
    detectImportFormat(payload.content, payload.filename),
  );
  registerHandler("import:run", payload =>
    runImport({
      format: payload.format,
      content: payload.content,
      root: payload.root,
      targetPath: payload.targetPath,
    }),
  );
  registerHandler("import:parseCurl", payload => parseCurlToRequest(payload.content));
}
