import { ChevronDown, Languages } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { LANGUAGE_STORAGE_KEY, normalizeLanguage } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const selectId = useId();
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage);

  const handleChange = (language: string) => {
    const nextLanguage = normalizeLanguage(language);

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // Language still changes for this session when storage is unavailable.
    }

    void i18n.changeLanguage(nextLanguage);
  };

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={selectId}>
        {t("header.language")}
      </label>
      <Languages
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <select
        id={selectId}
        value={currentLanguage}
        onChange={(event) => handleChange(event.target.value)}
        className="h-11 w-32 appearance-none rounded-control border border-border bg-surface py-2 pr-8 pl-9 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
      >
        <option value="en">{t("header.languageOption.en")}</option>
        <option value="el">{t("header.languageOption.el")}</option>
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
