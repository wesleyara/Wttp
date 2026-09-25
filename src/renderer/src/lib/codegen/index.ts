import { type CurlOptions, type CurlRequest, toCurl } from "./curl";
import { toGo } from "./go";
import { toHttpie } from "./httpie";
import { toAxios, toFetch } from "./javascript";
import { normalizeRequest } from "./normalize";
import { toPython } from "./python";

/** Linguagens do modal "Generate code" (ClickLocal #46), na ordem exibida. */
export const CODEGEN_LANGUAGES = ["curl", "fetch", "axios", "python", "go", "httpie"] as const;
export type CodegenLanguage = (typeof CODEGEN_LANGUAGES)[number];

export const DEFAULT_CODEGEN_LANGUAGE: CodegenLanguage = "curl";

export function isCodegenLanguage(value: unknown): value is CodegenLanguage {
  return typeof value === "string" && (CODEGEN_LANGUAGES as readonly string[]).includes(value);
}

/** Linguagem do `WCodeEditor` para o realce — só o que o editor empacota (JS); o resto vai como texto. */
export function editorLanguageFor(language: CodegenLanguage): "javascript" | "text" {
  return language === "fetch" || language === "axios" ? "javascript" : "text";
}

/**
 * Gera o snippet de `language` a partir da mesma request resolvida e da mesma máscara de
 * segredos do "Copy as cURL": nada secreto sai a não ser com `maskSecrets: false`.
 */
export function generateCode(
  language: CodegenLanguage,
  request: CurlRequest,
  options: CurlOptions = {},
): string {
  if (language === "curl") return toCurl(request, options);
  const normalized = normalizeRequest(request, options);
  switch (language) {
    case "fetch":
      return toFetch(normalized);
    case "axios":
      return toAxios(normalized);
    case "python":
      return toPython(normalized);
    case "go":
      return toGo(normalized);
    case "httpie":
      return toHttpie(normalized);
  }
}
