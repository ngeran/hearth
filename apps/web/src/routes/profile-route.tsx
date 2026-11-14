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
import {
  CheckCircle2,
  Download,
  KeyRound,
  LogOut,
  MailCheck,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Checkbox, Field, Input, Select, Textarea } from "@/components/form-controls";
import { PageError, PageLoading } from "@/components/page-states";
import { PhotoField } from "@/components/photo-field";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { LANGUAGE_STORAGE_KEY, normalizeLanguage } from "@/lib/i18n";
import {
  ApiRequestError,
  deleteAccount,
  downloadExport,
  fetchCampuses,
  sendAcademicCode,
  updateMe,
  verifyAcademicCode,
} from "@/lib/me";
import { useMe } from "@/lib/use-me";

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

type AcademicErrorKey =
  | "profile.academic.invalidEmail"
  | "profile.academic.sendFailed"
  | "profile.academic.rateLimited"
  | "profile.academic.hourlyLimited"
  | "profile.academic.invalidCode"
  | "profile.academic.generic";

type DataErrorKey =
  | "profile.data.exportFailed"
  | "profile.data.deleteFailed"
  | "profile.passkeys.addFailed"
  | "profile.passkeys.deleteFailed";

function defaultsFor(me: MeResponse, fallbackLanguage: "en" | "el"): OnboardingFormValues {
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

export function ProfileRoute() {
  const { t } = useTranslation();
  const me = useMe();

  useEffect(() => {
    document.title = t("profile.title");
  }, [t]);

  if (me.isPending) {
    return <PageLoading label={t("common.loading")} />;
  }

  if (me.isError || !me.data) {
    return (
      <PageError
        title={t("common.errorTitle")}
        body={t("common.errorBody")}
        actionLabel={t("common.retry")}
        onAction={() => void me.refetch()}
      />
    );
  }

  return <ProfileContent me={me.data} />;
}

function ProfileContent({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [photoUrl, setPhotoUrl] = useState(me.profile.photoUrl);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [dataError, setDataError] = useState<DataErrorKey | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const campuses = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: false });
  const passkeys = authClient.useListPasskeys();
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<DataErrorKey | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: defaultsFor(me, normalizeLanguage(i18n.resolvedLanguage)),
    mode: "onTouched",
  });

  const bioLength = (watch("bio") ?? "").trim().length;

  const onSubmit = async (values: OnboardingFormValues) => {
    setSaveState("idle");

    try {
      const response = await updateMe(values as ProfilePatch);
      queryClient.setQueryData(["me"], response);
      const language = normalizeLanguage(values.language);

      if (language !== normalizeLanguage(i18n.resolvedLanguage)) {
        try {
          window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
        } catch {
          // The saved profile preference still applies on the next load.
        }

        await i18n.changeLanguage(language);
      }

      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.replace("/");
  };

  const exportData = async () => {
    setDataError(null);

    try {
      await downloadExport();
      setDataMessage(t("profile.data.exported"));
    } catch {
      setDataError("profile.data.exportFailed");
    }
  };

  const removeAccount = async () => {
    setDataError(null);
    setDeleting(true);

    try {
      await deleteAccount();
      window.location.replace("/");
    } catch {
      setDataError("profile.data.deleteFailed");
    } finally {
      setDeleting(false);
    }
  };

  const addPasskey = async () => {
    setPasskeyError(null);
    setPasskeyBusy(true);

    try {
      const result = await authClient.passkey.addPasskey({
        name: passkeyName.trim() || t("profile.passkeys.defaultName"),
      });

      if (result.error) {
        setPasskeyError("profile.passkeys.addFailed");
      } else {
        setPasskeyName("");
      }
    } catch {
      setPasskeyError("profile.passkeys.addFailed");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const removePasskey = async (id: string) => {
    setPasskeyError(null);
    setPasskeyBusy(true);

    try {
      const result = await authClient.$fetch("/passkey/delete-passkey", {
        method: "POST",
        body: { id },
      });

      if (result.error) {
        setPasskeyError("profile.passkeys.deleteFailed");
      }
    } catch {
      setPasskeyError("profile.passkeys.deleteFailed");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const passkeySupported =
    typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-display-lg-mobile">{t("profile.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("profile.body")}</p>
      </header>

      {!me.complete ? (
        <div
          role="status"
          className="rounded-card border border-accent/50 bg-accent/10 p-4 text-sm leading-relaxed"
        >
          {t("profile.incompleteBanner")}{" "}
          <Link
            to="/onboarding"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t("profile.finishOnboarding")}
          </Link>
        </div>
      ) : null}

      <section className="rounded-card border bg-surface-container-low p-5 text-card-foreground shadow-soft sm:p-6">
        <h2 className="text-headline-md">{t("profile.photo.sectionTitle")}</h2>
        <div className="mt-4">
          <PhotoField
            id="profile-photo"
            photoUrl={photoUrl}
            onChange={(url) => {
              setPhotoUrl(url);
              void queryClient.invalidateQueries({ queryKey: ["me"] });
            }}
          />
        </div>
      </section>

      <form
        className="space-y-6 rounded-card border bg-card p-5 text-card-foreground shadow-soft sm:p-6"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
      >
        <h2 className="text-headline-md">{t("profile.detailsTitle")}</h2>

        {saveState === "saved" ? (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-secondary">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {t("profile.saved")}
          </p>
        ) : null}
        {saveState === "error" ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {t("profile.saveFailed")}
          </p>
        ) : null}

        <Field
          id="profile-display-name"
          label={t("profile.displayName.label")}
          hint={t("profile.displayName.hint", {
            min: DISPLAY_NAME_MIN_LENGTH,
            max: DISPLAY_NAME_MAX_LENGTH,
          })}
          error={errors.displayName ? t("validation.checkField") : undefined}
        >
          <Input
            id="profile-display-name"
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            aria-describedby="profile-display-name-hint profile-display-name-error"
            invalid={Boolean(errors.displayName)}
            {...register("displayName")}
          />
        </Field>

        <Field
          id="profile-area"
          label={t("profile.areaLabel.label")}
          hint={t("profile.areaLabel.hint")}
          error={errors.areaLabel ? t("validation.checkField") : undefined}
        >
          <Input
            id="profile-area"
            autoComplete="address-level2"
            aria-describedby="profile-area-hint profile-area-error"
            invalid={Boolean(errors.areaLabel)}
            {...register("areaLabel")}
          />
        </Field>

        <Controller
          control={control}
          name="campusId"
          render={({ field }) => (
            <Field
              id="profile-campus"
              label={t("profile.campus.label")}
              hint={t("profile.campus.hint")}
              error={errors.campusId ? t("validation.checkField") : undefined}
            >
              <Select
                id="profile-campus"
                value={field.value ?? ""}
                onChange={(event) =>
                  field.onChange(event.target.value === "" ? null : event.target.value)
                }
                aria-describedby="profile-campus-hint profile-campus-error"
                invalid={Boolean(errors.campusId)}
              >
                <option value="">{t("profile.campus.none")}</option>
                {(campuses.data?.campuses ?? []).map((campus) => (
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
            <Field
              id="profile-life-stage"
              label={t("profile.lifeStage.label")}
              error={errors.lifeStage ? t("validation.checkField") : undefined}
            >
              <Select
                id="profile-life-stage"
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                aria-describedby="profile-life-stage-error"
                invalid={Boolean(errors.lifeStage)}
              >
                {LIFE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {t(lifeStageLabelKeys[stage])}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="profile-move-in-from"
            label={t("profile.moveIn.fromLabel")}
            error={errors.moveInFrom ? t("validation.checkField") : undefined}
          >
            <Input
              id="profile-move-in-from"
              type="date"
              aria-describedby="profile-move-in-from-error"
              invalid={Boolean(errors.moveInFrom)}
              {...register("moveInFrom")}
            />
          </Field>
          <Field
            id="profile-move-in-to"
            label={t("profile.moveIn.toLabel")}
            error={errors.moveInTo ? t("validation.checkField") : undefined}
          >
            <Input
              id="profile-move-in-to"
              type="date"
              aria-describedby="profile-move-in-to-error"
              invalid={Boolean(errors.moveInTo)}
              {...register("moveInTo")}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="profile-budget-min"
            label={t("profile.budget.minLabel")}
            error={errors.budgetMin ? t("validation.checkField") : undefined}
          >
            <Input
              id="profile-budget-min"
              type="number"
              inputMode="numeric"
              min={0}
              max={10_000}
              step={50}
              aria-describedby="profile-budget-min-error"
              invalid={Boolean(errors.budgetMin)}
              {...register("budgetMin", { valueAsNumber: true })}
            />
          </Field>
          <Field
            id="profile-budget-max"
            label={t("profile.budget.maxLabel")}
            error={errors.budgetMax ? t("validation.checkField") : undefined}
          >
            <Input
              id="profile-budget-max"
              type="number"
              inputMode="numeric"
              min={0}
              max={10_000}
              step={50}
              aria-describedby="profile-budget-max-error"
              invalid={Boolean(errors.budgetMax)}
              {...register("budgetMax", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <Controller
          control={control}
          name="seeking"
          render={({ field }) => (
            <Field
              id="profile-seeking"
              label={t("profile.seeking.label")}
              hint={t("profile.seeking.hint")}
              error={errors.seeking ? t("validation.checkField") : undefined}
            >
              <Select
                id="profile-seeking"
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                aria-describedby="profile-seeking-hint profile-seeking-error"
                invalid={Boolean(errors.seeking)}
              >
                {SEEKING_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {t(seekingLabelKeys[option])}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        />

        <Field
          id="profile-bio"
          label={t("profile.bio.label")}
          hint={t("profile.bio.hint", { min: BIO_MIN_LENGTH, max: BIO_MAX_LENGTH })}
          error={errors.bio ? t("validation.checkField") : undefined}
        >
          <Textarea
            id="profile-bio"
            maxLength={BIO_MAX_LENGTH}
            aria-describedby="profile-bio-hint profile-bio-error"
            invalid={Boolean(errors.bio)}
            {...register("bio")}
          />
        </Field>
        <p className="text-right text-xs text-muted-foreground">
          {t("profile.bio.count", { count: bioLength, max: BIO_MAX_LENGTH })}
        </p>

        <Controller
          control={control}
          name="language"
          render={({ field }) => (
            <Field
              id="profile-language"
              label={t("profile.language.label")}
              hint={t("profile.language.hint")}
            >
              <Select
                id="profile-language"
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                aria-describedby="profile-language-hint"
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

        <Controller
          control={control}
          name="ageConfirmed"
          render={({ field }) => (
            <div className="flex items-start gap-3">
              <Checkbox
                id="profile-age"
                checked={field.value}
                onChange={(event) => field.onChange(event.target.checked)}
                invalid={Boolean(errors.ageConfirmed)}
              />
              <label htmlFor="profile-age" className="text-sm leading-relaxed">
                {t("onboarding.ageConfirm")}
              </label>
            </div>
          )}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("profile.save")}
        </Button>
      </form>

      <AcademicEmailCard me={me} />
      <PasskeysCard
        passkeys={passkeys}
        supported={passkeySupported}
        busy={passkeyBusy}
        name={passkeyName}
        onNameChange={setPasskeyName}
        onAdd={() => void addPasskey()}
        onRemove={(id) => void removePasskey(id)}
        errorKey={passkeyError}
      />

      <section className="space-y-4 rounded-card border bg-card p-5 text-card-foreground shadow-soft sm:p-6">
        <h2 className="text-headline-md">{t("profile.data.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("profile.data.body")}</p>
        {dataMessage ? (
          <p role="status" className="text-sm font-medium text-secondary">
            {dataMessage}
          </p>
        ) : null}
        {dataError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {t(dataError)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void exportData()}>
            <Download aria-hidden="true" className="size-4" />
            {t("profile.data.export")}
          </Button>
          <Button type="button" variant="outline" onClick={() => void signOut()}>
            <LogOut aria-hidden="true" className="size-4" />
            {t("profile.signOut")}
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-card border border-error/30 bg-surface-container-lowest p-5 text-card-foreground shadow-soft sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-error/10 text-error">
            <TriangleAlert aria-hidden="true" className="size-5" />
          </span>
          <h2 className="text-headline-md text-error">{t("profile.delete.title")}</h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("profile.delete.body")}</p>
        <Field
          id="profile-delete-confirm"
          label={t("profile.delete.confirmLabel")}
          hint={t("profile.delete.confirmHint")}
        >
          <Input
            id="profile-delete-confirm"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            autoComplete="off"
            aria-describedby="profile-delete-confirm-hint"
          />
        </Field>
        <Button
          type="button"
          variant="destructive"
          disabled={confirmText !== "DELETE" || deleting}
          onClick={() => void removeAccount()}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {deleting ? t("profile.delete.deleting") : t("profile.delete.action")}
        </Button>
      </section>
    </div>
  );
}

function AcademicEmailCard({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(me.profile.academicEmail ?? "");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"idle" | "sent">("idle");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorKey, setErrorKey] = useState<AcademicErrorKey | null>(null);
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);

    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const verifiedAt = me.profile.academicEmailVerifiedAt;
  const verifiedEmail = me.profile.academicEmail;

  const send = async () => {
    const normalized = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setErrorKey("profile.academic.invalidEmail");
      return;
    }

    setBusy(true);
    setErrorKey(null);

    try {
      await sendAcademicCode(normalized);
      setSentTo(normalized);
      setStep("sent");
      setCode("");
      setCooldown(60);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 429) {
        if (error.code === "hourly_limit") {
          setErrorKey("profile.academic.hourlyLimited");
        } else {
          setErrorKey("profile.academic.rateLimited");
          setCooldown(60);
        }
      } else {
        setErrorKey("profile.academic.sendFailed");
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setErrorKey(null);

    try {
      await verifyAcademicCode(code.trim());
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setStep("idle");
      setCode("");
      setCooldown(0);
    } catch {
      setErrorKey("profile.academic.invalidCode");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-card border bg-card p-5 text-card-foreground shadow-soft sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-secondary">
          <MailCheck aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="text-headline-md">{t("profile.academic.title")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("profile.academic.body")}
          </p>
        </div>
      </div>

      {verifiedAt && verifiedEmail ? (
        <p className="inline-flex items-center gap-2 self-start rounded-full bg-secondary-container/20 px-3 py-1.5 text-sm font-medium text-secondary">
          <ShieldCheck aria-hidden="true" className="size-4" />
          {t("profile.academic.verified", { email: verifiedEmail })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("profile.academic.notVerified")}</p>
      )}

      {errorKey ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(errorKey)}
        </p>
      ) : null}

      {step === "idle" ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          noValidate
        >
          <Field id="profile-academic-email" label={t("profile.academic.emailLabel")}>
            <Input
              id="profile-academic-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              placeholder={t("profile.academic.emailPlaceholder")}
            />
          </Field>
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? t("profile.academic.sending") : t("profile.academic.send")}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
          noValidate
        >
          <p className="text-sm text-muted-foreground">
            {t("profile.academic.codeSent", { email: sentTo })}
          </p>
          <Field id="profile-academic-code" label={t("profile.academic.codeLabel")}>
            <Input
              id="profile-academic-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              disabled={busy}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? t("profile.academic.verifying") : t("profile.academic.verify")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || cooldown > 0}
              onClick={() => void send()}
            >
              {cooldown > 0
                ? t("profile.academic.resendIn", { seconds: cooldown })
                : t("profile.academic.resend")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setStep("idle");
                setErrorKey(null);
              }}
            >
              {t("profile.academic.changeEmail")}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

type PasskeysController = ReturnType<typeof authClient.useListPasskeys>;

function PasskeysCard({
  passkeys,
  supported,
  busy,
  name,
  onNameChange,
  onAdd,
  onRemove,
  errorKey,
}: {
  passkeys: PasskeysController;
  supported: boolean;
  busy: boolean;
  name: string;
  onNameChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  errorKey: DataErrorKey | null;
}) {
  const { t } = useTranslation();

  return (
    <section className="space-y-4 rounded-card border bg-card p-5 text-card-foreground shadow-soft sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-secondary">
          <KeyRound aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="text-headline-md">{t("profile.passkeys.title")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("profile.passkeys.body")}
          </p>
        </div>
      </div>

      {errorKey ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(errorKey)}
        </p>
      ) : null}

      {!supported ? (
        <p className="text-sm text-muted-foreground">{t("profile.passkeys.unsupported")}</p>
      ) : (
        <>
          {passkeys.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : null}
          {passkeys.data && passkeys.data.length > 0 ? (
            <ul className="space-y-2">
              {passkeys.data.map((passkey) => (
                <li
                  key={passkey.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-container-lowest px-3 py-2"
                >
                  <span className="text-sm font-medium">
                    {passkey.name || t("profile.passkeys.defaultName")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onRemove(passkey.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    {t("profile.passkeys.remove")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("profile.passkeys.empty")}</p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Field id="profile-passkey-name" label={t("profile.passkeys.nameLabel")}>
                <Input
                  id="profile-passkey-name"
                  value={name}
                  maxLength={50}
                  onChange={(event) => onNameChange(event.target.value)}
                  placeholder={t("profile.passkeys.namePlaceholder")}
                  disabled={busy}
                />
              </Field>
            </div>
            <Button type="button" variant="outline" onClick={onAdd} disabled={busy}>
              <Plus aria-hidden="true" className="size-4" />
              {busy ? t("common.saving") : t("profile.passkeys.add")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
