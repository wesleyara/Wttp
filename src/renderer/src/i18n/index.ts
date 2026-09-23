import { createI18n } from "vue-i18n";

import { en } from "./en";
import { ptBR } from "./pt-BR";

export type AppLocale = "en" | "pt-BR";

/** `navigator.language` → um dos locales suportados, com fallback em `en` (EP-08.1-T06). */
export function resolveSystemLocale(): AppLocale {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("pt")
    ? "pt-BR"
    : "en";
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveSystemLocale(),
  fallbackLocale: "en",
  messages: { en, "pt-BR": ptBR },
});

/** `AppSettings.language` ("system"/"en"/"pt-BR") → o locale a aplicar no plugin. */
export function applyLanguageSetting(setting: "system" | "en" | "pt-BR" | undefined): void {
  const locale = !setting || setting === "system" ? resolveSystemLocale() : setting;
  i18n.global.locale.value = locale;
}
