import {
  deriveLifestyleArchetype,
  LIFESTYLE_DIMENSIONS,
  LIFESTYLE_QUESTIONS,
  type LifestyleProfile,
} from "@hearth/shared";
import { useTranslation } from "react-i18next";

/**
 * "What we learned about you": the derived archetype plus one plain-language
 * line per dimension, built from the member's own chosen option labels so
 * there is no separate summary wording to keep in sync. Shown right after
 * answering and on the profile page.
 */
export function LifestyleSummary({
  profile,
  heading = "h2",
}: {
  profile: LifestyleProfile;
  /** Heading level of the summary title, so it fits the surrounding outline. */
  heading?: "h2" | "h3";
}) {
  const { t } = useTranslation();
  const archetype = deriveLifestyleArchetype(profile.answers);
  const Heading = heading;

  return (
    <div className="rounded-control border bg-surface-container-lowest p-4">
      <Heading className="text-headline-md">{t("lifestyle.summary.title")}</Heading>
      <p className="mt-3 text-xs font-semibold tracking-wide text-secondary uppercase">
        {t("lifestyle.summary.archetypeLabel")}
      </p>
      <p className="mt-1 text-lg font-semibold text-foreground">
        {t(`lifestyle.archetypes.${archetype}.name`)}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {t(`lifestyle.archetypes.${archetype}.description`)}
      </p>
      <dl className="mt-4 space-y-2 text-sm">
        {LIFESTYLE_DIMENSIONS.map((dimension) => {
          const questions = LIFESTYLE_QUESTIONS.filter(
            (question) => question.dimension === dimension,
          );

          return (
            <div key={dimension} className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">
                {t(`lifestyle.dimensions.${dimension}`)}
              </dt>
              <dd className="font-medium text-foreground">
                {questions
                  .map((question) =>
                    t(`lifestyle.questions.${question.id}.options.${profile.answers[question.id]}`),
                  )
                  .join(" · ")}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">{t("lifestyle.summary.changeHint")}</p>
    </div>
  );
}
