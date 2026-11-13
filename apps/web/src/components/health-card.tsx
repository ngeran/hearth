import { healthResponseSchema } from "@hearth/shared";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function HealthCard() {
  const { t, i18n } = useTranslation();
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await api.api.v1.health.$get();

      if (!response.ok) {
        throw new Error("Health check failed");
      }

      return healthResponseSchema.parse(await response.json());
    },
    retry: 1,
    staleTime: 30_000,
  });

  const checkedAt = healthQuery.data
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeStyle: "short" }).format(
        new Date(healthQuery.data.timestamp * 1_000),
      )
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-card border bg-card p-4 text-card-foreground shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span
          className={
            healthQuery.isError
              ? "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive"
              : "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary-brand/15 text-secondary"
          }
        >
          {healthQuery.isPending ? (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          ) : healthQuery.isError ? (
            <CircleX aria-hidden="true" className="size-5" />
          ) : (
            <CircleCheck aria-hidden="true" className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("status.title")}
          </h2>
          <p className="mt-1 font-semibold">
            {healthQuery.isPending
              ? t("status.loading")
              : healthQuery.isError
                ? t("status.error")
                : t("status.ok")}
          </p>
          {healthQuery.isSuccess ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">{t("status.okDescription")}</p>
              {checkedAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("status.lastChecked", { time: checkedAt })}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      {healthQuery.isError ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void healthQuery.refetch()}
        >
          {t("status.retry")}
        </Button>
      ) : null}
    </div>
  );
}
