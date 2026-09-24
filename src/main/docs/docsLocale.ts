import type { AppSettings } from "@shared";

/**
 * Locale da documentação a abrir a partir do main (menu Help) — mesma regra do renderer
 * (`i18n/index.ts`): `"system"`/ausente segue o idioma do SO, com fallback em `en`.
 */
export function resolveDocsLocale(
  language: AppSettings["language"],
  systemLocale: string,
): "en" | "pt-BR" {
  if (language === "en" || language === "pt-BR") return language;
  return systemLocale.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}
