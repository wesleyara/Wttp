/** Parser de um único header `Set-Cookie` (a engine já entrega um por linha — nunca dobrados). */

export interface ParsedCookie {
  name: string;
  value: string;
  attributes: Record<string, string | true>;
}

export function parseSetCookieHeader(headerValue: string): ParsedCookie {
  const [nameValue, ...attrParts] = headerValue
    .split(";")
    .map(part => part.trim())
    .filter(part => part !== "");

  const eqIndex = nameValue?.indexOf("=") ?? -1;
  const name = eqIndex === -1 ? (nameValue ?? "") : nameValue.slice(0, eqIndex);
  const value = eqIndex === -1 ? "" : nameValue.slice(eqIndex + 1);

  const attributes: Record<string, string | true> = {};
  for (const attr of attrParts) {
    const index = attr.indexOf("=");
    if (index === -1) attributes[attr] = true;
    else attributes[attr.slice(0, index)] = attr.slice(index + 1);
  }

  return { name, value, attributes };
}
