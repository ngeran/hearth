import { Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

export function NotFoundRoute() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-muted text-secondary">
        <Compass aria-hidden="true" className="size-7" />
      </span>
      <h1 className="mt-6 font-serif text-3xl font-semibold tracking-tight">
        {t("notFound.title")}
      </h1>
      <p className="mt-3 text-base text-muted-foreground">{t("notFound.body")}</p>
      <Button asChild className="mt-6">
        <Link to="/">{t("notFound.action")}</Link>
      </Button>
    </section>
  );
}
