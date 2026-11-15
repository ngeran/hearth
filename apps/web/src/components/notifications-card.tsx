import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/me";
import {
  disablePushNotifications,
  enablePushNotifications,
  getCurrentPushSubscription,
} from "@/lib/push";

export function NotificationsCard() {
  const { t } = useTranslation();
  const [supported] = useState(
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
  );
  const [mode, setMode] = useState<"checking" | "default" | "denied" | "enabled" | "unavailable">(
    "checking",
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!supported) {
      return;
    }
    let cancelled = false;
    const check = async () => {
      const subscription = await getCurrentPushSubscription();
      if (cancelled) {
        return;
      }
      if (subscription) {
        setMode("enabled");
      } else if (Notification.permission === "denied") {
        setMode("denied");
      } else {
        setMode("default");
      }
    };
    void check().catch(() => {
      if (!cancelled) {
        setMode("default");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const enable = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await enablePushNotifications();
      setMode(result === "enabled" ? "enabled" : "denied");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 503) {
        setMode("unavailable");
      } else {
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await disablePushNotifications();
      setMode("default");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-card border bg-card p-5 text-card-foreground shadow-soft sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-secondary">
          <Bell aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="text-headline-md">{t("notifications.title")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("notifications.body")}
          </p>
        </div>
      </div>

      {!supported ? (
        <p className="text-sm text-muted-foreground">{t("notifications.unsupported")}</p>
      ) : mode === "checking" ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : mode === "denied" ? (
        <p className="text-sm text-muted-foreground">{t("notifications.denied")}</p>
      ) : mode === "unavailable" ? (
        <p className="text-sm text-muted-foreground">{t("notifications.unavailable")}</p>
      ) : mode === "enabled" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-secondary">{t("notifications.enabled")}</p>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void disable()}>
            {busy ? t("common.saving") : t("notifications.disable")}
          </Button>
        </div>
      ) : (
        <Button type="button" disabled={busy} onClick={() => void enable()}>
          {busy ? t("common.saving") : t("notifications.enable")}
        </Button>
      )}

      {failed ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t("common.errorBody")}
        </p>
      ) : null}
    </section>
  );
}
