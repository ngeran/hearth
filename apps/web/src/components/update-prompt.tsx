import { registerSW } from "virtual:pwa-register";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

export function UpdatePrompt() {
  const { t } = useTranslation();
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateServiceWorker = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateServiceWorker.current = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
    });
  }, []);

  useEffect(() => {
    if (!offlineReady) {
      return;
    }

    const timer = window.setTimeout(() => setOfflineReady(false), 6_000);
    return () => window.clearTimeout(timer);
  }, [offlineReady]);

  if (!needRefresh && !offlineReady) {
    return null;
  }

  const dismiss = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  const refresh = () => {
    setNeedRefresh(false);
    void updateServiceWorker.current?.(true);
  };

  return (
    <section
      aria-live="polite"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-card border bg-card p-4 text-card-foreground shadow-soft lg:inset-x-auto lg:right-6 lg:bottom-6 lg:mx-0"
    >
      <h2 className="text-title-md">
        {needRefresh ? t("pwa.updateTitle") : t("pwa.offlineReady")}
      </h2>
      {needRefresh ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("pwa.updateBody")}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {needRefresh ? (
          <Button type="button" size="sm" onClick={refresh}>
            {t("pwa.updateAction")}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
          {t("pwa.dismiss")}
        </Button>
      </div>
    </section>
  );
}
