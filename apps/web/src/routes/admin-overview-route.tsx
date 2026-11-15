import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { PageError, PageLoading } from "@/components/page-states";
import { fetchAdminErrors, fetchAdminOverview } from "@/lib/admin";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border bg-card p-5 shadow-soft">
      <p className="text-label-md text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-display-lg-mobile">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AdminOverviewRoute() {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.resolvedLanguage);
  const dateTime = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: fetchAdminOverview,
    retry: false,
    staleTime: 30_000,
  });
  const recentErrors = useQuery({
    queryKey: ["admin", "errors", "recent"],
    queryFn: () => fetchAdminErrors({ limit: 5 }),
    retry: false,
  });

  useEffect(() => {
    document.title = t("admin.title");
  }, [t]);

  if (overview.isPending) {
    return <PageLoading label={t("common.loading")} />;
  }

  if (overview.isError) {
    return (
      <PageError
        title={t("common.errorTitle")}
        body={t("common.errorBody")}
        actionLabel={t("common.retry")}
        onAction={() => overview.refetch()}
      />
    );
  }

  const data = overview.data;

  const cards = [
    {
      label: t("admin.overview.users.total"),
      value: data.users.total,
      hint: t("admin.overview.hints.week", { count: number.format(data.users.registered7d) }),
    },
    {
      label: t("admin.overview.users.online"),
      value: data.users.online,
      hint: t("admin.overview.hints.online"),
    },
    {
      label: t("admin.overview.users.complete"),
      value: data.users.completeProfiles,
      hint: t("admin.overview.hints.onboarded"),
    },
    {
      label: t("admin.overview.users.verified"),
      value: data.users.academicVerified,
      hint: t("admin.overview.hints.verified"),
    },
    { label: t("admin.overview.users.today"), value: data.users.registeredToday },
    {
      label: t("admin.overview.rooms.active"),
      value: data.rooms.active,
      hint: t("admin.overview.hints.listingsTotal", { count: number.format(data.rooms.total) }),
    },
    { label: t("admin.overview.matches.impressions"), value: data.matches.impressions7d },
    { label: t("admin.overview.matches.successful"), value: data.matches.successfulPairs },
    { label: t("admin.overview.matches.unsuccessful"), value: data.matches.unsuccessfulPairs },
    { label: t("admin.overview.chat.active"), value: data.chat.active7d },
    { label: t("admin.overview.push.subscriptions"), value: data.push.subscriptions },
    {
      label: t("admin.overview.errors.last24h"),
      value: data.errors.last24h,
      hint: t("admin.overview.hints.errorsWeek", { count: number.format(data.errors.last7d) }),
    },
  ];

  return (
    <div className="space-y-8">
      <section aria-label={t("admin.title")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={number.format(card.value)}
              {...(card.hint ? { hint: card.hint } : {})}
            />
          ))}
        </div>
      </section>

      <section className="rounded-card border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-title-md">{t("admin.overview.recentErrors")}</h2>
          <Link to="/admin/errors" className="text-sm font-medium text-primary hover:underline">
            {t("admin.overview.viewAll")}
          </Link>
        </div>

        {recentErrors.isPending ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : recentErrors.isError ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("common.errorBody")}</p>
        ) : recentErrors.data.errors.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.overview.noErrors")}</p>
        ) : (
          <ul className="mt-3 divide-y">
            {recentErrors.data.errors.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span className="text-xs text-muted-foreground">
                  {dateTime.format(new Date(event.createdAt * 1000))}
                </span>
                <span className="font-mono text-xs">
                  {event.method} {event.route}
                </span>
                <span className="text-xs text-muted-foreground">{event.status}</span>
                <span className="text-sm">{event.errorName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
