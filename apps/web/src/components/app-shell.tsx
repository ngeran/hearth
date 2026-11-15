import { BedDouble, Heart, LogIn, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet } from "react-router-dom";

import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OfflinePage } from "@/components/offline-page";
import { UpdatePrompt } from "@/components/update-prompt";
import { useSession } from "@/lib/auth-client";
import { useMe } from "@/lib/use-me";
import { useOnlineStatus } from "@/lib/use-online-status";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/matches", labelKey: "nav.matches", icon: Heart },
  { to: "/rooms", labelKey: "nav.rooms", icon: BedDouble },
  { to: "/messages", labelKey: "nav.messages", icon: MessageCircle },
  { to: "/profile", labelKey: "nav.profile", icon: UserRound },
] as const;

const adminNavItem = { to: "/admin", labelKey: "nav.admin", icon: ShieldCheck } as const;

export function AppShell() {
  const { t, i18n } = useTranslation();
  const isOnline = useOnlineStatus();
  const session = useSession();
  const me = useMe(Boolean(session.data));
  const year = new Intl.NumberFormat(i18n.resolvedLanguage).format(new Date().getFullYear());
  const copyright = t("footer.copyright", { year });
  const signedIn = Boolean(session.data);
  const visibleNavItems = me.data?.isAdmin ? [...navItems, adminNavItem] : navItems;
  const identity =
    me.data?.profile.displayName ?? session.data?.user.name ?? session.data?.user.email ?? "";

  useEffect(() => {
    document.title = t("meta.title");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t("meta.description"));
  }, [t]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-control focus:bg-card focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-card-foreground focus:shadow-soft"
      >
        {t("a11y.skipToContent")}
      </a>

      <div className="mx-auto flex min-h-dvh w-full max-w-7xl">
        <aside className="hidden w-72 shrink-0 flex-col border-r bg-surface/60 px-5 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh">
          <Link
            to="/"
            aria-label={t("nav.home")}
            className="flex min-h-11 items-center gap-3 rounded-control px-2"
          >
            <BrandMark />
            <span className="text-headline-lg">Hearth</span>
          </Link>

          <nav aria-label={t("nav.label")} className="mt-8">
            <ul className="space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;

                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-surface-container-high text-primary"
                            : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                        )
                      }
                    >
                      <Icon aria-hidden="true" className="size-5" />
                      <span>{t(item.labelKey)}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-auto space-y-4">
            <Link
              to={signedIn ? "/profile" : "/sign-in"}
              className="flex min-h-11 items-center gap-3 rounded-control border bg-card px-3 py-2 text-sm transition-colors hover:bg-surface-container-high"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-secondary">
                {signedIn ? (
                  <UserRound aria-hidden="true" className="size-5" />
                ) : (
                  <LogIn aria-hidden="true" className="size-5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {signedIn ? identity : t("nav.signIn")}
                </span>
                {signedIn ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {t("nav.account")}
                  </span>
                ) : null}
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
            </div>
            <p className="px-1 text-xs text-muted-foreground">{copyright}</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b bg-surface/85 backdrop-blur-xl lg:hidden">
            <div className="flex h-16 items-center justify-between gap-3 px-4">
              <Link
                to="/"
                aria-label={t("nav.home")}
                className="flex min-h-11 items-center gap-2 rounded-control"
              >
                <BrandMark className="size-8" />
                <span className="text-headline-md">Hearth</span>
              </Link>
              <div className="flex items-center gap-1">
                <LanguageSwitcher />
                <Link
                  to={signedIn ? "/profile" : "/sign-in"}
                  aria-label={signedIn ? t("nav.account") : t("nav.signIn")}
                  className="flex size-11 items-center justify-center rounded-control text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  {signedIn ? (
                    <UserRound aria-hidden="true" className="size-5" />
                  ) : (
                    <LogIn aria-hidden="true" className="size-5" />
                  )}
                </Link>
              </div>
            </div>
          </header>

          <main
            id="main"
            tabIndex={-1}
            className="flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12"
          >
            {isOnline ? <Outlet /> : <OfflinePage />}
            <footer className="mt-16 border-t pt-5 text-xs text-muted-foreground">
              {copyright}
            </footer>
          </main>
        </div>
      </div>

      <nav
        aria-label={t("nav.label")}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div
          className={cn(
            "mx-auto grid max-w-md gap-1 px-2 py-2",
            visibleNavItems.length > navItems.length ? "grid-cols-5" : "grid-cols-4",
          )}
        >
          {visibleNavItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-control px-2 text-xs font-medium transition-colors",
                    isActive ? "text-primary" : "text-on-surface-variant hover:text-on-surface",
                  )
                }
              >
                <Icon aria-hidden="true" className="size-5" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      <UpdatePrompt />
    </div>
  );
}
