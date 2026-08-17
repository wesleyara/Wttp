/**
 * `methodToken` e `statusToken` — a mesma função por trás do `WMethodBadge`, da árvore
 * de collections e da barra de URL (docs/backlog/EP-02-design-system.md EP-02-T02).
 *
 * Vivem no renderer, não em `@shared`: `@shared` é compilado nos três bundles e só pode
 * conter `type`/`interface` (docs/conventions.md), e nada aqui roda fora do renderer.
 *
 * Retornam a classe Tailwind **completa**, não só o sufixo do token: o scanner do
 * Tailwind extrai classes por regex sobre texto bruto, então `` `text-${token}` ``
 * montado em outro arquivo nunca seria encontrado e a cor não seria gerada no CSS.
 * design-system.md §3 é explícito — cor de método/status é sempre texto, nunca fundo —
 * por isso não há necessidade de retornar variantes `bg-`/`border-`.
 */

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Classe Tailwind de texto para um método HTTP. Método desconhecido cai em `neutral`. */
export function methodToken(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-method-get";
    case "POST":
      return "text-method-post";
    case "PUT":
      return "text-method-put";
    case "PATCH":
      return "text-method-patch";
    case "DELETE":
      return "text-method-delete";
    default:
      return "text-method-neutral";
  }
}

export type StatusRange = "2xx" | "3xx" | "4xx" | "5xx" | "error";

/** Classe Tailwind de texto para um código de status. `null` = erro de rede. */
export function statusToken(code: number | null): string {
  if (code === null) return "text-status-error";
  if (code >= 200 && code < 300) return "text-status-2xx";
  if (code >= 300 && code < 400) return "text-status-3xx";
  if (code >= 400 && code < 500) return "text-status-4xx";
  if (code >= 500 && code < 600) return "text-status-5xx";
  return "text-status-error";
}
