/** Classificação de `Content-Type` para o painel de resposta (EP-03-T07). */

function baseType(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isTextual(contentType: string): boolean {
  const type = baseType(contentType);
  return (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/xml" ||
    type === "application/javascript" ||
    type === "application/x-www-form-urlencoded" ||
    /\+(json|xml)$/.test(type)
  );
}

export function isImage(contentType: string): boolean {
  return baseType(contentType).startsWith("image/");
}

export function isPdf(contentType: string): boolean {
  return baseType(contentType) === "application/pdf";
}

export function isHtml(contentType: string): boolean {
  return baseType(contentType) === "text/html";
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "application/json": "response.json",
  "text/html": "response.html",
  "application/xml": "response.xml",
  "text/xml": "response.xml",
  "text/plain": "response.txt",
  "text/css": "response.css",
  "application/javascript": "response.js",
  "application/pdf": "response.pdf",
  "image/png": "response.png",
  "image/jpeg": "response.jpg",
  "image/gif": "response.gif",
  "image/webp": "response.webp",
  "image/svg+xml": "response.svg",
};

export function suggestedFileName(contentType: string): string {
  return EXTENSION_BY_TYPE[baseType(contentType)] ?? "response.bin";
}
