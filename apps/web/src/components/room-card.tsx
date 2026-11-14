import type { RoomListItem } from "@hearth/shared";
import { BadgeCheck, BedDouble, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { roomPhotoUrl } from "@/lib/rooms";
import { cn } from "@/lib/utils";

const PHOTO_SLOTS = [0, 1, 2] as const;

function formatAvailableFrom(date: string, language: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parsed);
}

/**
 * Browse card for an active room listing. Mirrors the mockup #10 household
 * card minus the deferred pieces (vibe meters, multi-member households):
 * photo strip, verified badge, logistics chips and the compatibility score
 * the M3 engine computes against the viewer.
 */
export function RoomCard({
  room,
  selected,
  onSelect,
}: {
  room: RoomListItem;
  selected?: boolean;
  onSelect: (roomId: string) => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(room.id)}
        className={cn(
          "flex w-full flex-col gap-3 rounded-card border bg-card p-4 text-left shadow-soft transition-colors hover:bg-surface-container-high/40",
          selected && "border-primary bg-surface-container-high/40",
        )}
      >
        <div className="grid grid-cols-3 gap-2">
          {PHOTO_SLOTS.map((slot) =>
            slot < room.photoCount ? (
              <img
                key={slot}
                src={roomPhotoUrl(room.id, slot, room.createdAt)}
                alt=""
                loading="lazy"
                className="aspect-square w-full rounded-control object-cover"
              />
            ) : (
              <span
                key={slot}
                className="flex aspect-square w-full items-center justify-center rounded-control bg-surface-container-low text-on-surface-variant"
                aria-hidden="true"
              >
                {slot === 0 && <BedDouble className="size-6" />}
              </span>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-on-surface">{room.title}</span>
          {room.lister.verified && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary-container px-2 py-0.5 text-xs text-on-secondary-container">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              {t("rooms.card.verified")}
            </span>
          )}
        </div>

        <p className="text-sm text-on-surface-variant">{room.areaLabel}</p>

        <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
          <span className="rounded-full bg-surface-container-low px-2.5 py-0.5 font-medium text-on-surface">
            {t("rooms.card.rent", { rent: room.rentEur })}
            {room.billsIncluded && ` · ${t("rooms.card.billsIncluded")}`}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-low px-2.5 py-0.5">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {t("rooms.card.availableFrom", {
              date: formatAvailableFrom(room.availableFrom, i18n.language),
            })}
          </span>
          {room.score !== null && (
            <span className="ml-auto rounded-full bg-surface-container-low px-2.5 py-0.5 font-medium text-secondary">
              {t("rooms.card.match", { value: room.score })}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
