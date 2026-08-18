import { detectImportFormat, parseCurlToRequest, previewImport, runImport } from "../importers";
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
      resolutions: payload.resolutions,
    }),
  );
  registerHandler("import:parseCurl", payload => parseCurlToRequest(payload.content));
  registerHandler("import:preview", payload =>
    previewImport({ format: payload.format, content: payload.content }),
  );
}
