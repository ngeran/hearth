import {
  BIO_MAX_LENGTH,
  BIO_MIN_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  LIFE_STAGES,
  type LifeStage,
  type MeResponse,
  type OnboardingFormValues,
  onboardingFormSchema,
  PROFILE_LANGUAGES,
  type ProfilePatch,
  SEEKING_TYPES,
  type SeekingType,
} from "@hearth/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, type DefaultValues, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { AuthShell } from "@/components/auth-shell";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/form-controls";
import { PageError, PageLoading } from "@/components/page-states";
import { PhotoField } from "@/components/photo-field";
import { Button } from "@/components/ui/button";
import { LANGUAGE_STORAGE_KEY, normalizeLanguage } from "@/lib/i18n";
import { fetchCampuses, updateMe } from "@/lib/me";
import { useMe } from "@/lib/use-me";
import { cn } from "@/lib/utils";

const STEP_COUNT = 5;

// Static segment numbers for the progress indicator; the list never reorders.
const PROGRESS_SEGMENTS = Array.from({ length: STEP_COUNT }, (_, index) => index + 1);

const STEP_COPY = [
  { title: "onboarding.steps.about.title", body: "onboarding.steps.about.body" },
  { title: "onboarding.steps.location.title", body: "onboarding.steps.location.body" },
  { title: "onboarding.steps.timing.title", body: "onboarding.steps.timing.body" },
  { title: "onboarding.steps.living.title", body: "onboarding.steps.living.body" },
  { title: "onboarding.steps.finish.title", body: "onboarding.steps.finish.body" },
] as const;

const STEP_FIELDS: Array<Array<keyof OnboardingFormValues>> = [
  ["displayName", "ageConfirmed"],
  ["areaLabel", "campusId", "lifeStage"],
  ["moveInFrom", "moveInTo", "budgetMin", "budgetMax"],
  ["seeking", "bio"],
  ["language"],
];

type WizardErrorKey =
  | "onboarding.photoRequired"
  | "onboarding.saveFailed"
  | "onboarding.incomplete";

const lifeStageLabelKeys = {
  student: "profile.lifeStage.student",
  "first-time-mover": "profile.lifeStage.first-time-mover",
  independent: "profile.lifeStage.independent",
  other: "profile.lifeStage.other",
} as const satisfies Record<LifeStage, string>;

const seekingLabelKeys = {
  room: "profile.seeking.room",
  roommate: "profile.seeking.roommate",
  either: "profile.seeking.either",
} as const satisfies Record<SeekingType, string>;

const languageLabelKeys = {
  en: "header.languageOption.en",
  el: "header.languageOption.el",
} as const;

function defaultsFor(
  me: MeResponse,
  fallbackLanguage: "en" | "el",
): DefaultValues<OnboardingFormValues> {
  return {
    displayName: me.profile.displayName ?? "",
    areaLabel: me.profile.areaLabel ?? "",
    moveInFrom: me.profile.moveInFrom ?? "",
    moveInTo: me.profile.moveInTo ?? "",
    budgetMin: me.profile.budgetMin ?? 0,
    budgetMax: me.profile.budgetMax ?? 0,
    seeking: me.profile.seeking ?? "either",
    lifeStage: me.profile.lifeStage ?? "other",
    campusId: me.profile.campusId,
    language: me.profile.language ?? fallbackLanguage,
    bio: me.profile.bio ?? "",
    ageConfirmed: me.profile.ageConfirmed,
  };
}

function patchFor(
  values: OnboardingFormValues,
  keys: Array<keyof OnboardingFormValues>,
): ProfilePatch {
  // The keys are a subset of the validated form, so every value is a valid
  // patch field. This keeps the wizard saving one step at a time.
  return Object.fromEntries(keys.map((key) => [key, values[key]])) as ProfilePatch;
}

export function OnboardingRoute() {
  const { t } = useTranslation();
  const me = useMe();

  useEffect(() => {
    document.title = t("onboarding.title");
  }, [t]);

  if (me.isPending) {
    return (
      <AuthShell>
        <PageLoading label={t("common.loading")} />
      </AuthShell>
    );
  }

  if (me.isError || !me.data) {
    return (
      <AuthShell>
        <PageError
          title={t("common.errorTitle")}
          body={t("common.errorBody")}
          actionLabel={t("common.retry")}
          onAction={() => void me.refetch()}
        />
      </AuthShell>
    );
  }

  return <OnboardingWizard me={me.data} />;
}

function OnboardingWizard({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [photoUrl, setPhotoUrl] = useState(me.profile.photoUrl);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<WizardErrorKey | null>(null);
  const campuses = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: false });

  const {
    control,
    register,
    trigger,
    watch,
    getValues,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: defaultsFor(me, normalizeLanguage(i18n.resolvedLanguage)),
    mode: "onTouched",
  });

  const values = watch();

  // Move focus to the new step heading so screen readers announce the change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus whenever the step changes
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const changeLanguage = (language: string) => {
    const next = normalizeLanguage(language);

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // The in-memory language still changes.
    }

    void i18n.changeLanguage(next);
  };

  const next = async () => {
    setErrorKey(null);

    if (step === 0 && !photoUrl) {
      setErrorKey("onboarding.photoRequired");
      return;
    }

    const fields = STEP_FIELDS[step] ?? [];
    const valid = await trigger(fields);

    if (!valid) {
      return;
    }

    setSaving(true);

    try {
      const response = await updateMe(patchFor(getValues(), fields));
      queryClient.setQueryData(["me"], response);
      setStep(Math.min(STEP_COUNT - 1, step + 1));
    } catch {
      setErrorKey("onboarding.saveFailed");
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setErrorKey(null);
    const valid = await trigger();

    if (!valid) {
      return;
    }

    setSaving(true);

    try {
      const response = await updateMe(getValues());
      queryClient.setQueryData(["me"], response);

      if (response.complete) {
        window.location.replace("/profile");
      } else {
        setErrorKey("onboarding.incomplete");
      }
    } catch {
      setErrorKey("onboarding.saveFailed");
    } finally {
      setSaving(false);
    }
  };

  const campusOptions = campuses.data?.campuses ?? [];
  const lifeStage = values.lifeStage;
  const seeking = values.seeking;
  const bioLength = (values.bio ?? "").trim().length;
  const copy = STEP_COPY[step] ?? STEP_COPY[0];

  return (
    <AuthShell>
      <div className="rounded-card border bg-card p-6 text-card-foreground shadow-soft sm:p-8">
        <p className="text-xs font-semibold tracking-wide text-secondary uppercase">
          {t("onboarding.eyebrow")}
        </p>
        <div
          className="mt-3 flex gap-1.5"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEP_COUNT}
          aria-valuenow={step + 1}
          aria-label={t("onboarding.progress", { current: step + 1, total: STEP_COUNT })}
        >
          {PROGRESS_SEGMENTS.map((segment) => (
            <span
              key={segment}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                segment <= step + 1 ? "bg-primary" : "bg-surface-container-highest",
              )}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("onboarding.progress", { current: step + 1, total: STEP_COUNT })}
        </p>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-5 text-display-lg-mobile text-balance outline-none"
        >
          {t(copy.title)}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(copy.body)}</p>

        {errorKey ? (
          <p
            role="alert"
            className="mt-5 rounded-control border border-error/40 bg-error/10 px-3 py-2 text-sm font-medium text-error"
          >
            {t(errorKey)}
          </p>
        ) : null}

        <form
          className="mt-6 space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void next();
          }}
          noValidate
        >
          {step === 0 ? (
            <>
              <PhotoField id="onboarding-photo" photoUrl={photoUrl} onChange={setPhotoUrl} />
              <Field
                id="onboarding-display-name"
                label={t("profile.displayName.label")}
                hint={t("profile.displayName.hint", {
                  min: DISPLAY_NAME_MIN_LENGTH,
                  max: DISPLAY_NAME_MAX_LENGTH,
                })}
                error={errors.displayName ? t("validation.checkField") : undefined}
              >
                <Input
                  id="onboarding-display-name"
                  autoComplete="nickname"
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  aria-describedby="onboarding-display-name-hint onboarding-display-name-error"
                  invalid={Boolean(errors.displayName)}
                  {...register("displayName")}
                />
              </Field>
              <Controller
                control={control}
                name="ageConfirmed"
                render={({ field }) => (
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="onboarding-age"
                      checked={field.value}
                      onChange={(event) => field.onChange(event.target.checked)}
                      aria-describedby="onboarding-age-hint"
                      invalid={Boolean(errors.ageConfirmed)}
                    />
                    <label htmlFor="onboarding-age" className="text-sm leading-relaxed">
                      {t("onboarding.ageConfirm")}
                    </label>
                  </div>
                )}
              />
              <p id="onboarding-age-hint" className="text-xs text-muted-foreground">
                {t("onboarding.ageHint")}
              </p>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Field
                id="onboarding-area"
                label={t("profile.areaLabel.label")}
                hint={t("profile.areaLabel.hint")}
                error={errors.areaLabel ? t("validation.checkField") : undefined}
              >
                <Input
                  id="onboarding-area"
                  autoComplete="address-level2"
                  aria-describedby="onboarding-area-hint onboarding-area-error"
                  invalid={Boolean(errors.areaLabel)}
                  {...register("areaLabel")}
                />
              </Field>
              <Controller
                control={control}
                name="campusId"
                render={({ field }) => (
                  <Field
                    id="onboarding-campus"
                    label={t("profile.campus.label")}
                    hint={t("profile.campus.hint")}
                    error={errors.campusId ? t("validation.checkField") : undefined}
                  >
                    <Select
                      id="onboarding-campus"
                      value={field.value ?? ""}
                      onChange={(event) =>
                        field.onChange(event.target.value === "" ? null : event.target.value)
                      }
                      aria-describedby="onboarding-campus-hint onboarding-campus-error"
                      invalid={Boolean(errors.campusId)}
                    >
                      <option value="">{t("profile.campus.none")}</option>
                      {campusOptions.map((campus) => (
                        <option key={campus.id} value={campus.id}>
                          {i18n.resolvedLanguage === "el"
                            ? `${campus.nameEl} · ${campus.cityEl}`
                            : `${campus.name} · ${campus.city}`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              />
              {campuses.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {t("profile.campus.loadFailed")}
                </p>
              ) : null}
              <Controller
                control={control}
                name="lifeStage"
                render={({ field }) => (
                  <fieldset>
                    <legend className="text-sm font-medium text-foreground">
                      {t("profile.lifeStage.label")}
                    </legend>
                    {errors.lifeStage ? (
                      <p
                        id="onboarding-life-stage-error"
                        role="alert"
                        className="mt-1 text-sm text-error"
                      >
                        {t("validation.checkField")}
                      </p>
                    ) : null}
                    <div className="mt-2 grid gap-2">
                      {LIFE_STAGES.map((stage) => {
                        const active = field.value === stage;

                        return (
                          <label
                            key={stage}
                            className={cn(
                              "flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 text-sm transition-colors has-[:focus-visible]:border-primary-container",
                              active
                                ? "border-transparent bg-surface-container-highest text-on-surface"
                                : "border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container",
                            )}
                          >
                            <input
                              type="radio"
                              name="onboarding-life-stage"
                              value={stage}
                              checked={active}
                              onChange={() => field.onChange(stage)}
                              aria-invalid={Boolean(errors.lifeStage)}
                              aria-describedby={
                                errors.lifeStage ? "onboarding-life-stage-error" : undefined
                              }
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
                            <span>{t(lifeStageLabelKeys[stage])}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="onboarding-move-in-from"
                  label={t("profile.moveIn.fromLabel")}
                  error={errors.moveInFrom ? t("validation.checkField") : undefined}
                >
                  <Input
                    id="onboarding-move-in-from"
                    type="date"
                    aria-describedby="onboarding-move-in-from-error"
                    invalid={Boolean(errors.moveInFrom)}
                    {...register("moveInFrom")}
                  />
                </Field>
                <Field
                  id="onboarding-move-in-to"
                  label={t("profile.moveIn.toLabel")}
                  error={errors.moveInTo ? t("validation.checkField") : undefined}
                >
                  <Input
                    id="onboarding-move-in-to"
                    type="date"
                    aria-describedby="onboarding-move-in-to-error"
                    invalid={Boolean(errors.moveInTo)}
                    {...register("moveInTo")}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="onboarding-budget-min"
                  label={t("profile.budget.minLabel")}
                  error={errors.budgetMin ? t("validation.checkField") : undefined}
                >
                  <Input
                    id="onboarding-budget-min"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={10_000}
                    step={50}
                    aria-describedby="onboarding-budget-min-error"
                    invalid={Boolean(errors.budgetMin)}
                    {...register("budgetMin", { valueAsNumber: true })}
                  />
                </Field>
                <Field
                  id="onboarding-budget-max"
                  label={t("profile.budget.maxLabel")}
                  error={errors.budgetMax ? t("validation.checkField") : undefined}
                >
                  <Input
                    id="onboarding-budget-max"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={10_000}
                    step={50}
                    aria-describedby="onboarding-budget-max-error"
                    invalid={Boolean(errors.budgetMax)}
                    {...register("budgetMax", { valueAsNumber: true })}
                  />
                </Field>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("profile.budget.hint")}
              </p>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Controller
                control={control}
                name="seeking"
                render={({ field }) => (
                  <fieldset>
                    <legend className="text-sm font-medium text-foreground">
                      {t("profile.seeking.label")}
                    </legend>
                    <p id="onboarding-seeking-hint" className="mt-1 text-xs text-muted-foreground">
                      {t("profile.seeking.hint")}
                    </p>
                    {errors.seeking ? (
                      <p
                        id="onboarding-seeking-error"
                        role="alert"
                        className="mt-1 text-sm text-error"
                      >
                        {t("validation.checkField")}
                      </p>
                    ) : null}
                    <div className="mt-2 grid gap-2">
                      {SEEKING_TYPES.map((option) => {
                        const active = field.value === option;

                        return (
                          <label
                            key={option}
                            className={cn(
                              "flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 text-sm transition-colors has-[:focus-visible]:border-primary-container",
                              active
                                ? "border-transparent bg-surface-container-highest text-on-surface"
                                : "border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container",
                            )}
                          >
                            <input
                              type="radio"
                              name="onboarding-seeking"
                              value={option}
                              checked={active}
                              onChange={() => field.onChange(option)}
                              aria-invalid={Boolean(errors.seeking)}
                              aria-describedby="onboarding-seeking-hint onboarding-seeking-error"
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
                            <span>{t(seekingLabelKeys[option])}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
              />
              <Field
                id="onboarding-bio"
                label={t("profile.bio.label")}
                hint={t("profile.bio.hint", { min: BIO_MIN_LENGTH, max: BIO_MAX_LENGTH })}
                error={errors.bio ? t("validation.checkField") : undefined}
              >
                <Textarea
                  id="onboarding-bio"
                  maxLength={BIO_MAX_LENGTH}
                  aria-describedby="onboarding-bio-hint onboarding-bio-error"
                  invalid={Boolean(errors.bio)}
                  {...register("bio")}
                />
              </Field>
              <p className="text-right text-xs text-muted-foreground">
                {t("profile.bio.count", { count: bioLength, max: BIO_MAX_LENGTH })}
              </p>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Controller
                control={control}
                name="language"
                render={({ field }) => (
                  <Field
                    id="onboarding-language"
                    label={t("profile.language.label")}
                    hint={t("profile.language.hint")}
                  >
                    <Select
                      id="onboarding-language"
                      value={field.value}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        changeLanguage(event.target.value);
                      }}
                      aria-describedby="onboarding-language-hint"
                    >
                      {PROFILE_LANGUAGES.map((language) => (
                        <option key={language} value={language}>
                          {t(languageLabelKeys[language])}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              />
              <div className="rounded-control border bg-surface-container-lowest p-4">
                <h2 className="text-headline-md">{t("onboarding.review.title")}</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("profile.displayName.label")}</dt>
                    <dd className="text-right font-medium">{values.displayName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("profile.areaLabel.label")}</dt>
                    <dd className="text-right font-medium">{values.areaLabel}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("profile.lifeStage.label")}</dt>
                    <dd className="text-right font-medium">
                      {lifeStage ? t(lifeStageLabelKeys[lifeStage]) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("profile.seeking.label")}</dt>
                    <dd className="text-right font-medium">
                      {seeking ? t(seekingLabelKeys[seeking]) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("profile.budget.label")}</dt>
                    <dd className="text-right font-medium">
                      €{values.budgetMin}–€{values.budgetMax}
                    </dd>
                  </div>
                </dl>
              </div>
            </>
          ) : null}

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-container/90 p-2 backdrop-blur">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setErrorKey(null);
                setStep(Math.max(0, step - 1));
              }}
              disabled={step === 0 || saving}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t("common.back")}
            </Button>
            {step < STEP_COUNT - 1 ? (
              <Button type="submit" disabled={saving}>
                {saving ? t("common.saving") : t("common.continue")}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            ) : (
              <Button type="button" onClick={() => void finish()} disabled={saving}>
                <Check aria-hidden="true" className="size-4" />
                {saving ? t("common.saving") : t("onboarding.finish")}
              </Button>
            )}
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
