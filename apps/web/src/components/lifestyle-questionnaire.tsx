import {
  LIFESTYLE_ANSWER_LEVELS,
  LIFESTYLE_DIMENSIONS,
  LIFESTYLE_QUESTIONS,
  type LifestyleAnswers,
} from "@hearth/shared";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/** Questions grouped per dimension, in the presentation order of the mockups. */
const QUESTIONS_BY_DIMENSION = LIFESTYLE_DIMENSIONS.map((dimension) => ({
  dimension,
  questions: LIFESTYLE_QUESTIONS.filter((question) => question.dimension === dimension),
}));

/**
 * The ten lifestyle questions as five dimension fieldsets with three neutral
 * radio options each. Controlled: answers live in the parent so they survive
 * step navigation even before they are complete enough to enter the form.
 */
export function LifestyleQuestionnaire({
  idPrefix,
  answers,
  onChange,
  showErrors = false,
}: {
  idPrefix: string;
  /** Partial while answering; the shared schema only accepts all ten at once. */
  answers: Partial<LifestyleAnswers>;
  onChange: (answers: Partial<LifestyleAnswers>) => void;
  /** Highlight unanswered questions after a failed continue attempt. */
  showErrors?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {QUESTIONS_BY_DIMENSION.map(({ dimension, questions }) => (
        <fieldset key={dimension}>
          <legend className="text-sm font-medium text-foreground">
            {t(`lifestyle.dimensions.${dimension}`)}
          </legend>
          <div className="mt-3 space-y-5">
            {questions.map((question) => {
              const selected = answers[question.id];
              const unanswered = selected === undefined;
              const questionTextId = `${idPrefix}-${question.id}-question`;

              return (
                <div key={question.id} className="space-y-2">
                  <p
                    id={questionTextId}
                    className={cn(
                      "text-sm leading-relaxed",
                      showErrors && unanswered ? "font-medium text-error" : "text-foreground",
                    )}
                  >
                    {t(`lifestyle.questions.${question.id}.label`)}
                  </p>
                  <div className="grid gap-2">
                    {LIFESTYLE_ANSWER_LEVELS.map((level) => {
                      const active = selected === level;

                      return (
                        <label
                          key={level}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 text-sm transition-colors has-[:focus-visible]:border-primary-container",
                            active
                              ? "border-transparent bg-surface-container-highest text-on-surface"
                              : "border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container",
                            showErrors && unanswered && !active && "border-error",
                          )}
                        >
                          <input
                            type="radio"
                            name={`${idPrefix}-${question.id}`}
                            value={level}
                            checked={active}
                            onChange={() => onChange({ ...answers, [question.id]: level })}
                            aria-invalid={showErrors && unanswered ? true : undefined}
                            aria-describedby={questionTextId}
                            className="sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full border",
                              active ? "border-secondary" : "border-outline-variant",
                            )}
                          >
                            {active ? (
                              <span className="size-2.5 rounded-full bg-secondary" />
                            ) : null}
                          </span>
                          <span>{t(`lifestyle.questions.${question.id}.options.${level}`)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
