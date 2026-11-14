import type { MatchItem, MatchTier } from "@hearth/shared";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/** Tier accent reused by the score badge; only existing theme tokens, no new colors. */
const tierBadgeClasses = {
  "strong-overlap": "border-primary/40 bg-primary/15 text-primary",
  "worth-a-chat": "border-secondary/40 bg-secondary/15 text-secondary",
  "likely-friction": "border-outline-variant bg-surface-container-high text-on-surface-variant",
} as const satisfies Record<MatchTier, string>;

function initialsOf(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * One entry in the matches list. The whole card is a single button: it selects
 * the match on desktop (sticky report pane) and opens the report overlay on
 * mobile. M3 shows initials avatars only — no photos of others yet.
 */
export function MatchCard({
  match,
  selected = false,
  onSelect,
}: {
  match: MatchItem;
  selected?: boolean;
  onSelect: (userId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(match.userId)}
        className={cn(
          "flex w-full items-center gap-4 rounded-card border bg-card p-4 text-left shadow-soft transition-colors hover:bg-surface-container-high/40",
          selected && "border-primary bg-surface-container-high/40",
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-sm font-bold text-secondary uppercase"
        >
          {initialsOf(match.displayName)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-foreground">{match.displayName}</span>
          <span className="block truncate text-sm text-muted-foreground">{match.areaLabel}</span>
          {match.habitTags.length > 0 ? (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {match.habitTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 py-0.5 text-xs text-on-surface-variant"
                >
                  {t(`lifestyle.tags.${tag}`)}
                </span>
              ))}
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-bold tabular-nums",
              tierBadgeClasses[match.tier],
            )}
          >
            {match.score}%
          </span>
          <span className="text-xs text-muted-foreground">
            {t(`matches.tiers.${match.tier}.name`)}
          </span>
          <ChevronRight aria-hidden="true" className="size-4 text-on-surface-variant" />
        </span>

        {/* The visible "82%" is decorative; this carries the full meaning for AT. */}
        <span className="sr-only">{t("matches.scoreLabel", { value: match.score })}</span>
      </button>
    </li>
  );
}
