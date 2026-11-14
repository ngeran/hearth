import { Heart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { CompatibilityReport } from "@/components/compatibility-report";
import { MatchCard } from "@/components/match-card";
import { PageError, PageLoading } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { useMatches } from "@/lib/use-matches";
import { useMe } from "@/lib/use-me";

/**
 * The matches list with its compatibility report: one column on mobile (the
 * report opens as a full-screen overlay), list plus sticky report pane on
 * desktop. Matching is compute-on-read, so this view always reflects profiles
 * as they are right now.
 */
export function MatchesRoute() {
  const { t } = useTranslation();
  const session = useSession();
  const me = useMe(Boolean(session.data));
  const matches = useMatches(Boolean(me.data?.complete));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.title = t("matches.title");
  }, [t]);

  // Keep the desktop report pane useful without extra copy: preselect the
  // first (best) match, and drop a selection that disappeared from the list.
  useEffect(() => {
    const items = matches.data?.matches;
    if (!items || items.length === 0) return;
    if (!items.some((match) => match.userId === selectedId)) {
      setSelectedId(items[0]?.userId ?? null);
    }
  }, [matches.data, selectedId]);

  // Escape closes the mobile report overlay; focus starts inside it, Tab is
  // trapped while it is open, and focus returns to the card that opened it.
  // On desktop the overlay div is rendered but CSS-hidden (lg:hidden), and a
  // hidden element has no client rects — so focus management stays mobile-only.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!reportOpen || !overlay || overlay.getClientRects().length === 0) return;
    overlay.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReportOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const currentOverlay = overlayRef.current;
      if (!currentOverlay) return;
      const focusable = currentOverlay.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      if (!first) return;
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === currentOverlay)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      lastTriggerRef.current?.focus();
    };
  }, [reportOpen]);

  if (me.isPending) {
    return <PageLoading label={t("common.loading")} />;
  }

  if (me.isError) {
    return (
      <PageError
        title={t("common.errorTitle")}
        body={t("common.errorBody")}
        actionLabel={t("common.retry")}
        onAction={() => me.refetch()}
      />
    );
  }

  if (!me.data?.complete) {
    return (
      <section className="mx-auto max-w-xl py-10 text-center sm:py-16">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface-container-high text-secondary">
          <Heart aria-hidden="true" className="size-7" />
        </span>
        <h1 className="mt-6 text-display-lg-mobile">{t("matches.title")}</h1>
        <p className="mt-3 text-base text-muted-foreground">{t("matches.incomplete")}</p>
        <Button type="button" className="mt-6" asChild>
          <Link to="/onboarding">{t("common.continue")}</Link>
        </Button>
      </section>
    );
  }

  if (matches.isPending) {
    return <PageLoading label={t("common.loading")} />;
  }

  if (matches.isError) {
    return (
      <PageError
        title={t("common.errorTitle")}
        body={t("common.errorBody")}
        actionLabel={t("common.retry")}
        onAction={() => matches.refetch()}
      />
    );
  }

  const items = matches.data?.matches ?? [];
  const selected = items.find((match) => match.userId === selectedId) ?? null;

  if (items.length === 0) {
    return (
      <section className="mx-auto max-w-xl py-10 text-center sm:py-16">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface-container-high text-secondary">
          <Heart aria-hidden="true" className="size-7" />
        </span>
        <h1 className="mt-6 text-display-lg-mobile">{t("matches.empty.title")}</h1>
        <p className="mt-3 text-base text-muted-foreground">{t("matches.empty.body")}</p>
      </section>
    );
  }

  return (
    <>
      <h1 className="sr-only">{t("matches.title")}</h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <ul className="space-y-3">
          {items.map((match) => (
            <MatchCard
              key={match.userId}
              match={match}
              selected={match.userId === selectedId}
              onSelect={(userId) => {
                lastTriggerRef.current =
                  document.activeElement instanceof HTMLElement ? document.activeElement : null;
                setSelectedId(userId);
                setReportOpen(true);
              }}
            />
          ))}
        </ul>

        {selected && me.data.profile.lifestyle ? (
          <aside className="hidden self-start lg:sticky lg:top-10 lg:block lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
            <CompatibilityReport me={me.data.profile} match={selected} />
          </aside>
        ) : null}
      </div>

      {selected && reportOpen && me.data.profile.lifestyle ? (
        <div
          ref={overlayRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={t("matches.report.title")}
          className="fixed inset-0 z-50 overflow-y-auto bg-background p-4 pb-28 lg:hidden"
        >
          <div className="mx-auto max-w-xl">
            <CompatibilityReport
              me={me.data.profile}
              match={selected}
              onClose={() => setReportOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
