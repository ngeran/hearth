import {
  COMPAT_CHAT_THRESHOLD,
  COMPAT_STRONG_THRESHOLD,
  LIFESTYLE_DIMENSIONS,
  LIFESTYLE_QUESTIONS,
  type MatchItem,
  type MatchTier,
  type ProfileSnapshot,
} from "@hearth/shared";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const tierTextClasses = {
  "strong-overlap": "text-primary",
  "worth-a-chat": "text-secondary",
  "likely-friction": "text-on-surface-variant",
} as const satisfies Record<MatchTier, string>;

type AlignmentState = "align" | "partial" | "differ";

const alignmentGlyphs = {
  align: "●",
  partial: "◐",
  differ: "○",
} as const satisfies Record<AlignmentState, string>;

const alignmentTextClasses = {
  align: "text-primary",
  partial: "text-secondary",
  differ: "text-muted-foreground",
} as const satisfies Record<AlignmentState, string>;

/** Locale-neutral placeholder when a logistics value is missing. */
const MISSING = "—";

function formatBudget(min: number | null, max: number | null): string {
  if (min === null && max === null) return MISSING;
  if (min === null) return `€${max}`;
  if (max === null) return `€${min}`;
  return `€${min} – €${max}`;
}

function formatMoveIn(from: string | null, to: string | null, locale: string): string {
  const format = new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const fromLabel = from ? format.format(new Date(`${from}T00:00:00Z`)) : null;
  const toLabel = to ? format.format(new Date(`${to}T00:00:00Z`)) : null;
  if (fromLabel && toLabel) return `${fromLabel} – ${toLabel}`;
  return fromLabel ?? toLabel ?? MISSING;
}

/**
 * "Why you two might work": the compatibility tier, the logistics that made
 * this match eligible, and per lifestyle dimension both sides' option labels
 * with an alignment mark. Dimension alignment reuses the score thresholds so
 * the marks always agree with the tier the member sees.
 */
export function CompatibilityReport({
  me,
  match,
  heading = "h2",
  onClose,
}: {
  me: ProfileSnapshot;
  match: MatchItem;
  /** Heading level of the report title, so it fits the surrounding outline. */
  heading?: "h2" | "h3";
  onClose?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const Heading = heading;

  return (
    <div className="rounded-card border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <Heading className="text-headline-lg">{t("matches.report.title")}</Heading>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <p className="text-display-lg-mobile font-bold tabular-nums sm:text-display-lg">
          <span aria-hidden="true">{match.score}%</span>
          <span className="sr-only">{t("matches.scoreLabel", { value: match.score })}</span>
        </p>
        <p className="min-w-0">
          <span className={cn("block text-sm font-semibold", tierTextClasses[match.tier])}>
            {t(`matches.tiers.${match.tier}.name`)}
          </span>
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {t(`matches.tiers.${match.tier}.description`)}
          </span>
        </p>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground uppercase">
            <th scope="col" className="sr-only">
              {t("matches.report.title")}
            </th>
            <th scope="col" className="pb-2 font-semibold">
              {t("matches.report.you")}
            </th>
            <th scope="col" className="pb-2 font-semibold">
              {match.displayName}
            </th>
          </tr>
        </thead>
        <tbody className="align-top">
          <tr className="border-t border-outline-variant">
            <th scope="row" className="py-2 pr-3 text-left font-medium text-muted-foreground">
              {t("matches.report.area")}
            </th>
            <td className="py-2 pr-3">{me.areaLabel ?? MISSING}</td>
            <td className="py-2">{match.areaLabel ?? MISSING}</td>
          </tr>
          <tr className="border-t border-outline-variant">
            <th scope="row" className="py-2 pr-3 text-left font-medium text-muted-foreground">
              {t("matches.report.budget")}
            </th>
            <td className="py-2 pr-3">{formatBudget(me.budgetMin, me.budgetMax)}</td>
            <td className="py-2">{formatBudget(match.budgetMin, match.budgetMax)}</td>
          </tr>
          <tr className="border-t border-outline-variant">
            <th scope="row" className="py-2 pr-3 text-left font-medium text-muted-foreground">
              {t("matches.report.moveIn")}
            </th>
            <td className="py-2 pr-3">{formatMoveIn(me.moveInFrom, me.moveInTo, locale)}</td>
            <td className="py-2">{formatMoveIn(match.moveInFrom, match.moveInTo, locale)}</td>
          </tr>
        </tbody>
      </table>

      <dl className="mt-6 space-y-3 text-sm">
        {LIFESTYLE_DIMENSIONS.map((dimension) => {
          const value = match.dimensionScores[dimension];
          const state: AlignmentState =
            value >= COMPAT_STRONG_THRESHOLD
              ? "align"
              : value >= COMPAT_CHAT_THRESHOLD
                ? "partial"
                : "differ";

          return (
            <div key={dimension}>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t(`lifestyle.dimensions.${dimension}`)}</dt>
                <dd className="flex items-center gap-2">
                  <span aria-hidden="true" className={alignmentTextClasses[state]}>
                    {alignmentGlyphs[state]}
                  </span>
                  <span className="sr-only">{t(`matches.report.${state}`)}</span>
                  <span className="tabular-nums text-muted-foreground">{value}%</span>
                </dd>
              </div>
              {LIFESTYLE_QUESTIONS.filter((question) => question.dimension === dimension).map(
                (question) => {
                  const mine = me.lifestyle?.answers[question.id];
                  const theirs = match.lifestyleAnswers[question.id];
                  return (
                    <p key={question.id} className="mt-1 text-xs text-muted-foreground">
                      {t(`lifestyle.questions.${question.id}.label`)}
                      {" — "}
                      {t("matches.report.you")}:
                      {mine === undefined
                        ? ` ${MISSING}`
                        : ` ${t(`lifestyle.questions.${question.id}.options.${mine}`)}`}
                      {" · "}
                      {match.displayName}:
                      {theirs === undefined
                        ? ` ${MISSING}`
                        : ` ${t(`lifestyle.questions.${question.id}.options.${theirs}`)}`}
                    </p>
                  );
                },
              )}
            </div>
          );
        })}
      </dl>

      {match.sharedQuestions.length > 0 ? (
        <section className="mt-6">
          <h3 className="text-headline-md">{t("matches.report.sharedHeading")}</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {match.sharedQuestions.map((questionId) => (
              <li
                key={questionId}
                className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
              >
                {t(`lifestyle.questions.${questionId}.label`)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {match.frictionQuestions.length > 0 ? (
        <section className="mt-6">
          <h3 className="text-headline-md">{t("matches.report.differHeading")}</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {match.frictionQuestions.map((questionId) => (
              <li
                key={questionId}
                className="rounded-full border border-outline-variant bg-surface-container-high px-2.5 py-0.5 text-xs text-on-surface-variant"
              >
                {t(`lifestyle.questions.${questionId}.label`)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
