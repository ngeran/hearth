import { KeyRound, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { AuthShell } from "@/components/auth-shell";
import { Field, Input } from "@/components/form-controls";
import { PageError, PageLoading } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { authClient, useSession } from "@/lib/auth-client";
import { useMe } from "@/lib/use-me";

type Step = "email" | "code";

type AuthErrorKey =
  | "auth.errors.invalidEmail"
  | "auth.errors.rateLimited"
  | "auth.errors.sendFailed"
  | "auth.errors.generic"
  | "auth.errors.invalidCode"
  | "auth.errors.passkeyFailed";

function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  // Browsers treat "\" as "/" in special-scheme URLs, so normalize before
  // rejecting protocol-relative targets like "//host" or "/\host".
  const normalized = value.replace(/\\/g, "/");

  return normalized.startsWith("/") &&
    !normalized.startsWith("//") &&
    !normalized.startsWith("/sign-in")
    ? value
    : null;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function SignInRoute() {
  const { t } = useTranslation();
  const location = useLocation();
  const session = useSession();
  const me = useMe(Boolean(session.data));
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [passkeySupported, setPasskeySupported] = useState(false);

  const from = safeRedirectTarget((location.state as { from?: unknown } | null | undefined)?.from);

  useEffect(() => {
    document.title = t("auth.title");
  }, [t]);

  useEffect(() => {
    setPasskeySupported(
      typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);

    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!session.data || me.isPending || me.isError) {
      return;
    }

    const target = from ?? (me.data?.complete ? "/profile" : "/onboarding");

    window.location.replace(target);
  }, [session.data, me.isPending, me.isError, me.data, from]);

  const sendCode = async (targetEmail: string) => {
    const normalized = targetEmail.trim().toLowerCase();

    if (!looksLikeEmail(normalized)) {
      setErrorKey("auth.errors.invalidEmail");
      return;
    }

    setSubmitting(true);
    setErrorKey(null);

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: normalized,
        type: "sign-in",
      });

      if (result.error) {
        setErrorKey(
          result.error.status === 429 ? "auth.errors.rateLimited" : "auth.errors.sendFailed",
        );
        return;
      }

      setSentTo(normalized);
      setStep("code");
      setCode("");
      setCooldown(60);
    } catch {
      setErrorKey("auth.errors.generic");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    setSubmitting(true);
    setErrorKey(null);

    try {
      const result = await authClient.signIn.emailOtp({
        email: sentTo,
        otp: code.trim(),
      });

      if (result.error) {
        setErrorKey("auth.errors.invalidCode");
      }
    } catch {
      setErrorKey("auth.errors.generic");
    } finally {
      setSubmitting(false);
    }
  };

  const signInWithPasskey = async () => {
    setSubmitting(true);
    setErrorKey(null);

    try {
      const result = await authClient.signIn.passkey();

      if (result.error) {
        setErrorKey("auth.errors.passkeyFailed");
      }
    } catch {
      setErrorKey("auth.errors.generic");
    } finally {
      setSubmitting(false);
    }
  };

  if (session.data && me.isPending) {
    return (
      <AuthShell>
        <PageLoading label={t("auth.signedInRedirecting")} />
      </AuthShell>
    );
  }

  if (session.data && me.isError) {
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

  return (
    <AuthShell>
      <section className="rounded-card border bg-card p-6 text-card-foreground shadow-soft sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-primary">
          {step === "email" ? (
            <Mail aria-hidden="true" className="size-6" />
          ) : (
            <KeyRound aria-hidden="true" className="size-6" />
          )}
        </span>
        <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-balance">
          {step === "email" ? t("auth.title") : t("auth.codeTitle")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {step === "email" ? t("auth.body") : t("auth.codeBody", { email: sentTo })}
        </p>

        {errorKey ? (
          <p
            role="alert"
            className="mt-5 rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          >
            {t(errorKey)}
          </p>
        ) : null}

        {step === "email" ? (
          <form
            className="mt-6 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void sendCode(email);
            }}
            noValidate
          >
            <Field id="sign-in-email" label={t("auth.emailLabel")}>
              <Input
                id="sign-in-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
                required
              />
            </Field>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t("auth.sending") : t("auth.sendCode")}
            </Button>
          </form>
        ) : (
          <form
            className="mt-6 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void verifyCode();
            }}
            noValidate
          >
            <Field id="sign-in-code" label={t("auth.codeLabel")} hint={t("auth.codeHint")}>
              <Input
                id="sign-in-code"
                type="text"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder={t("auth.codePlaceholder")}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                disabled={submitting}
                required
              />
            </Field>
            <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
              {submitting ? t("auth.verifying") : t("auth.verify")}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("email");
                  setErrorKey(null);
                }}
                disabled={submitting}
              >
                {t("auth.changeEmail")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void sendCode(sentTo)}
                disabled={submitting || cooldown > 0}
              >
                {cooldown > 0 ? t("auth.resendIn", { seconds: cooldown }) : t("auth.resend")}
              </Button>
            </div>
          </form>
        )}

        {passkeySupported ? (
          <>
            <div className="my-6 flex items-center gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              {t("auth.or")}
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void signInWithPasskey()}
              disabled={submitting}
            >
              <KeyRound aria-hidden="true" className="size-4" />
              {t("auth.passkeyAction")}
            </Button>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("auth.passkeyBody")}
            </p>
          </>
        ) : null}
      </section>
    </AuthShell>
  );
}
