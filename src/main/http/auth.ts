/**
 * Aplicação de `auth` como header/query (EP-07-T02) — docs/file-format.md §4.
 *
 * Roda depois da resolução de variáveis (EP-06): quem monta `HttpRequestSpec` já
 * substituiu `{{token}}` etc. antes de chegar aqui, então este módulo só decide onde o
 * valor final entra — nunca manipula `{{...}}`. Também é onde a herança (EP-07-T01)
 * precisa já estar resolvida: `spec.auth` chega aqui como um tipo concreto (nunca
 * `"inherit"`); se ainda assim chegar, é tratado como `"none"` — melhor não autenticar
 * do que aplicar herança errada na hora de montar a request de fato.
 *
 * Nunca loga `spec` nem o header/query gerado — um `Authorization`/API key vazando em
 * log ou mensagem de erro é o cenário que EP-07-T02 explicitamente proíbe.
 */

import type { HttpRequestSpec, KeyValueEntry } from "@shared";

function hasManualAuthorizationHeader(headers: KeyValueEntry[]): boolean {
  return headers.some(header => header.enabled && header.name.toLowerCase() === "authorization");
}

function withAuthorizationHeader(spec: HttpRequestSpec, value: string): HttpRequestSpec {
  return {
    ...spec,
    headers: [...spec.headers, { name: "Authorization", value, enabled: true }],
  };
}

/**
 * Header/query configurados por `spec.auth`, aplicados a uma cópia de `spec` — nunca
 * muta o objeto recebido. Um `Authorization` definido à mão em `spec.headers` vence
 * qualquer `bearer`/`basic` configurado (docs/backlog/EP-07-autenticacao.md,
 * EP-07-T02): a UI que já montou esse header explicitamente sabe o que está fazendo.
 */
export function applyAuth(spec: HttpRequestSpec): HttpRequestSpec {
  const auth = spec.auth;

  if (auth.type === "none" || auth.type === "inherit") return spec;

  if (hasManualAuthorizationHeader(spec.headers) && auth.type !== "apikey") return spec;

  switch (auth.type) {
    case "bearer": {
      const token = auth.bearer.token;
      return token ? withAuthorizationHeader(spec, `Bearer ${token}`) : spec;
    }
    case "basic": {
      const { username, password } = auth.basic;
      if (!username && !password) return spec;
      // `Buffer.from(str, "utf-8")` codifica os bytes UTF-8 antes do base64 — uma senha
      // não-ASCII (ex. acentuada) precisa disso; `btoa` ingênuo trata a string como
      // Latin-1 e corrompe qualquer byte fora desse intervalo.
      const encoded = Buffer.from(`${username}:${password}`, "utf-8").toString("base64");
      return withAuthorizationHeader(spec, `Basic ${encoded}`);
    }
    case "apikey": {
      const { key, value, in: location } = auth.apikey;
      if (!key) return spec;
      if (location === "query") {
        return { ...spec, query: [...spec.query, { name: key, value, enabled: true }] };
      }
      return { ...spec, headers: [...spec.headers, { name: key, value, enabled: true }] };
    }
  }
}
