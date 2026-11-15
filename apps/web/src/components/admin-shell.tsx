import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Bug, House, Users } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet } from "react-router-dom";
import { PageError, PageLoading } from "@/components/page-states";
import { fetchAdminOverview } from "@/lib/admin";
import { ApiRequestError } from "@/lib/me";
import { cn } from "@/lib/utils";
import { NotFoundRoute } from "@/routes/not-found-route";

const tabs = [
  { to: "/admin", labelKey: "admin.tabs.overview", icon: BarChart3, end: true },
  { to: "/admin/users", labelKey: "admin.tabs.users", icon: Users, end: false },
  { to: "/admin/rooms", labelKey: "admin.tabs.rooms", icon: House, end: false },
  { to: "/admin/errors", labelKey: "admin.tabs.errors", icon: Bug, end: false },
] as const;

/**
 * Admin chrome and the fail-closed gate: a 404 from the overview probe means
 * the caller is not allowlisted, and they see the same not-found page as any
 * unknown route. The overview query is shared with the child route by key.
 */
export function AdminShell() {
  const { t } = useTranslation();
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: fetchAdminOverview,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    document.title = t("admin.title");
  }, [t]);

  if (overview.isPending) {
    return <PageLoading label={t("common.loading")} />;
  }

  if (overview.isError) {
    if (overview.error instanceof ApiRequestError && overview.error.status === 404) {
      return <NotFoundRoute />;
    }

    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-10">
        <PageError
          title={t("common.errorTitle")}
          body={t("common.errorBody")}
          actionLabel={t("common.retry")}
          onAction={() => overview.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-surface/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-5">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-control text-sm font-medium text-on-surface-variant hover:text-on-surface"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t("admin.back")}
          </Link>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-headline-lg">{t("admin.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("admin.overview.subtitle")}</p>
            </div>
          </div>

          <nav aria-label={t("admin.title")} className="mt-5">
            <ul className="flex flex-wrap gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;

                return (
                  <li key={tab.to}>
                    <NavLink
                      to={tab.to}
                      end={tab.end}
                      className={({ isActive }) =>
                        cn(
                          "flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-surface-container-high text-primary"
                            : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                        )
                      }
                    >
                      <Icon aria-hidden="true" className="size-4" />
                      <span>{t(tab.labelKey)}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-5 py-8">
        <Outlet />
      </main>
    </div>
  );
}
