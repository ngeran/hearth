import {
  deriveHabitTags,
  type MatchItem,
  type ProfileSnapshot,
  type RoomDetails,
  scoreCompatibility,
} from "@hearth/shared";
import { BedDouble, Pencil, Plus, X } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CompatibilityReport } from "@/components/compatibility-report";
import { PageError, PageLoading } from "@/components/page-states";
import { RoomCard } from "@/components/room-card";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { roomPhotoUrl } from "@/lib/rooms";
import { useMe } from "@/lib/use-me";
import { useMyRooms, useRoom, useRooms } from "@/lib/use-rooms";

// Literal photo slots (0–3 photos per listing) — used as stable list keys.
const PHOTO_SLOTS = [0, 1, 2] as const;

/**
 * Turns a room listing into the MatchItem shape CompatibilityReport expects:
 * the M3 engine runs client-side against the lister's answers (same pure
 * function the worker used for the score), and the lister's logistics ride
 * on the details payload so no second endpoint is needed.
 */
function reportMatchItem(room: RoomDetails, myAnswers: MatchItem["lifestyleAnswers"]): MatchItem {
  const compatibility = scoreCompatibility(myAnswers, room.lifestyleAnswers);
  return {
    userId: room.lister.userId,
    displayName: room.lister.displayName,
    areaLabel: room.areaLabel,
    lifeStage: room.lifeStage,
    seeking: room.seeking,
    budgetMin: room.budgetMin,
    budgetMax: room.budgetMax,
    moveInFrom: room.moveInFrom,
    moveInTo: room.moveInTo,
    campusId: room.campusId,
    hasRoom: true,
    score: compatibility.score,
    tier: compatibility.tier,
    dimensionScores: compatibility.dimensionScores,
    sharedQuestions: [...compatibility.sharedQuestions],
    frictionQuestions: [...compatibility.frictionQuestions],
    habitTags: deriveHabitTags(room.lifestyleAnswers),
    lifestyleAnswers: room.lifestyleAnswers,
  };
}

export function RoomsRoute() {
  const { t } = useTranslation();
  const session = useSession();
  const me = useMe(Boolean(session.data));
  const rooms = useRooms(Boolean(me.data?.complete));
  const mine = useMyRooms(Boolean(session.data));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.title = t("rooms.title");
  }, [t]);

  // Same focus contract as the matches overlay: focus starts inside, Tab is
  // trapped, Escape closes, and focus returns to the card that opened it.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!selectedId || !overlay || overlay.getClientRects().length === 0) return;
    overlay.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
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
  }, [selectedId]);

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
          <BedDouble aria-hidden="true" className="size-7" />
        </span>
        <h1 className="mt-6 text-display-lg-mobile">{t("rooms.title")}</h1>
        <p className="mt-3 text-base text-muted-foreground">{t("rooms.incomplete")}</p>
        <Button type="button" className="mt-6" asChild>
          <Link to="/onboarding">{t("common.continue")}</Link>
        </Button>
      </section>
    );
  }

  const myListings = mine.data?.rooms ?? [];
  const activeOwn = myListings.find((room) => room.status === "active");
  const latestOwn = myListings[0] ?? null;
  const items = rooms.data?.rooms ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header>
        <h1 className="text-display-lg-mobile">{t("rooms.title")}</h1>
        <p className="mt-2 text-base text-muted-foreground">{t("rooms.tagline")}</p>
      </header>

      {activeOwn ? (
        <section className="flex flex-wrap items-center gap-3 rounded-card border bg-card p-4 shadow-soft">
          {/* activeOwn is active by construction — withdrawn listings surface
              only through the footnote below. */}
          <span className="rounded-full bg-secondary-container px-2.5 py-0.5 text-xs text-on-secondary-container">
            {t("rooms.status.active")}
          </span>
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-on-surface">
            {activeOwn.title}
          </span>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/rooms/edit">
              <Pencil aria-hidden="true" className="size-4" />
              {t("common.edit")}
            </Link>
          </Button>
        </section>
      ) : (
        <section className="flex flex-wrap items-center gap-3 rounded-card border bg-surface-container-low p-4">
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-on-surface">
              {t("rooms.createPrompt.title")}
            </span>
            <span className="mt-1 block text-sm text-on-surface-variant">
              {t("rooms.createPrompt.body")}
            </span>
          </span>
          <Button type="button" asChild>
            <Link to="/rooms/edit">
              <Plus aria-hidden="true" className="size-4" />
              {t("rooms.createPrompt.action")}
            </Link>
          </Button>
        </section>
      )}

      {rooms.isPending ? (
        <PageLoading label={t("common.loading")} />
      ) : rooms.isError ? (
        <PageError
          title={t("common.errorTitle")}
          body={t("common.errorBody")}
          actionLabel={t("common.retry")}
          onAction={() => rooms.refetch()}
        />
      ) : items.length === 0 ? (
        <section className="mx-auto max-w-xl py-10 text-center sm:py-16">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface-container-high text-secondary">
            <BedDouble aria-hidden="true" className="size-7" />
          </span>
          <h2 className="mt-6 text-display-lg-mobile">{t("rooms.empty.title")}</h2>
          <p className="mt-3 text-base text-muted-foreground">{t("rooms.empty.body")}</p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              selected={room.id === selectedId}
              onSelect={(id) => {
                lastTriggerRef.current = document.activeElement as HTMLElement | null;
                setSelectedId(id);
              }}
            />
          ))}
        </ul>
      )}

      {selectedId && (
        <RoomDetailsOverlay
          roomId={selectedId}
          meProfile={me.data.profile}
          onClose={() => setSelectedId(null)}
          overlayRef={overlayRef}
        />
      )}

      {latestOwn && !activeOwn && (
        <p className="text-xs text-on-surface-variant">
          {t("rooms.myListing.title")}: {latestOwn.title} · {t(`rooms.status.${latestOwn.status}`)}
        </p>
      )}
    </div>
  );
}

function RoomDetailsOverlay({
  roomId,
  meProfile,
  onClose,
  overlayRef,
}: {
  roomId: string;
  meProfile: ProfileSnapshot;
  onClose: () => void;
  overlayRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  const room = useRoom(roomId, true);

  // The pending/error branches also carry the overlay ref, so the focus trap
  // in RoomsRoute is live from the first paint; when the data branch replaces
  // them React drops the focused node — park focus back on the dialog.
  useEffect(() => {
    if (room.status !== "success") return;
    if (document.activeElement === document.body) overlayRef.current?.focus();
  }, [room.status, overlayRef]);

  if (room.isPending) {
    return (
      <div
        ref={overlayRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("rooms.viewDetails")}
        className="fixed inset-0 z-50 overflow-y-auto bg-background p-4 pb-28"
      >
        <div className="mx-auto my-8 max-w-2xl">
          <PageLoading label={t("common.loading")} />
        </div>
      </div>
    );
  }

  if (room.isError || !room.data) {
    return (
      <div
        ref={overlayRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("rooms.viewDetails")}
        className="fixed inset-0 z-50 overflow-y-auto bg-background p-4 pb-28"
      >
        <div className="mx-auto my-8 max-w-2xl">
          <PageError
            title={t("common.errorTitle")}
            body={t("common.errorBody")}
            actionLabel={t("common.retry")}
            onAction={() => room.refetch()}
          />
          <div className="mt-4 text-center">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const data = room.data;

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={data.title}
      className="fixed inset-0 z-50 overflow-y-auto bg-background p-4 pb-28"
    >
      <div className="mx-auto my-8 max-w-2xl rounded-card border bg-card p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-headline-lg">{data.title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        </div>

        {data.photoCount > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {PHOTO_SLOTS.filter((slot) => slot < data.photoCount).map((slot) => (
              <img
                key={slot}
                src={roomPhotoUrl(data.id, slot, data.updatedAt)}
                alt={data.title}
                loading="lazy"
                className="aspect-square w-full rounded-control object-cover"
              />
            ))}
          </div>
        )}

        <p className="mt-4 text-sm text-on-surface-variant">{data.areaLabel}</p>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
          <span className="rounded-full bg-surface-container-low px-2.5 py-0.5 font-medium text-on-surface">
            {t("rooms.card.rent", { rent: data.rentEur })}
            {data.billsIncluded && ` · ${t("rooms.card.billsIncluded")}`}
          </span>
        </div>

        <section className="mt-6">
          <h3 className="text-headline-sm">{t("rooms.details.about")}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-on-surface">{data.description}</p>
        </section>

        <p className="mt-4 text-sm text-on-surface-variant">
          {t("rooms.details.lister")}:{" "}
          <span className="font-medium text-on-surface">{data.lister.displayName}</span>
          {data.lister.verified && ` · ${t("rooms.card.verified")}`}
        </p>

        {meProfile.lifestyle && (
          <div className="mt-6">
            <CompatibilityReport
              me={meProfile}
              match={reportMatchItem(data, meProfile.lifestyle.answers)}
              heading="h3"
            />
          </div>
        )}
      </div>
    </div>
  );
}
