import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

export function OfflinePage() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <WifiOff aria-hidden="true" className="size-7" />
      </span>
      <h1 className="mt-6 font-serif text-3xl font-semibold tracking-tight">
        {t("offline.title")}
      </h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">{t("offline.body")}</p>
      <Button type="button" className="mt-6" onClick={() => window.location.reload()}>
        {t("offline.retry")}
      </Button>
    </section>
  );
}
