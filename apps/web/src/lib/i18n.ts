import type { SupportedLanguage } from "@hearth/shared";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import el from "@/locales/el.json";
import en from "@/locales/en.json";

export const LANGUAGE_STORAGE_KEY = "hearth.language";

export function normalizeLanguage(language: string | undefined): SupportedLanguage {
  return language?.toLowerCase().startsWith("el") ? "el" : "en";
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      el: { translation: el },
    },
    supportedLngs: ["en", "el"],
    fallbackLng: "en",
    load: "languageOnly",
    returnNull: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      convertDetectedLanguage: (language) => normalizeLanguage(language),
    },
  });

function syncDocumentLanguage(language: string) {
  document.documentElement.lang = normalizeLanguage(language);
}

i18n.on("languageChanged", syncDocumentLanguage);
syncDocumentLanguage(i18n.resolvedLanguage ?? "en");

export default i18n;
