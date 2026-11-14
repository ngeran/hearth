import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";

export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-control focus:bg-card focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-card-foreground focus:shadow-soft"
      >
        {t("a11y.skipToContent")}
      </a>

      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link
          to="/"
          aria-label={t("nav.home")}
          className="flex min-h-11 items-center gap-2 rounded-control"
        >
          <BrandMark className="size-9" />
          <span className="text-headline-md">Hearth</span>
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-xl px-4 pt-2 pb-20 sm:px-6">
        {children}
      </main>
    </div>
  );
}
