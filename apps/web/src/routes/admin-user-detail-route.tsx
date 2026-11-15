import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Field, Input } from "@/components/form-controls";
import { PageError, PageLoading } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { deleteAdminUser, fetchAdminUser, revokeAdminUserSessions } from "@/lib/admin";
import { ApiRequestError } from "@/lib/me";

const seekingLabels = {
  room: "profile.seeking.room",
  roommate: "profile.seeking.roommate",
  either: "profile.seeking.either",
} as const;

const lifeStageLabels = {
  student: "profile.lifeStage.student",
  "first-time-mover": "profile.lifeStage.first-time-mover",
  independent: "profile.lifeStage.independent",
  other: "profile.lifeStage.other",
} as const;

function SeekingValue({ value }: { value: string | null }) {
  const { t } = useTranslation();

  if (value === "room") return <>{t(seekingLabels.room)}</>;
  if (value === "roommate") return <>{t(seekingLabels.roommate)}</>;
  if (value === "either") return <>{t(seekingLabels.either)}</>;
  return <>{value ?? t("admin.user.fields.none")}</>;
}

function LifeStageValue({ value }: { value: string | null }) {
  const { t } = useTranslation();

  if (value === "student") return <>{t(lifeStageLabels.student)}</>;
  if (value === "first-time-mover") return <>{t(lifeStageLabels["first-time-mover"])}</>;
  if (value === "independent") return <>{t(lifeStageLabels.independent)}</>;
  if (value === "other") return <>{t(lifeStageLabels.other)}</>;
  return <>{value ?? t("admin.user.fields.none")}</>;
}

export function AdminUserDetailRoute() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams();
  const id = params.id ?? "";
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium" });
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  const detail = useQuery({
    queryKey: ["admin", "users", id],
    queryFn: () => fetchAdminUser(id),
    retry: false,
    enabled: id.length > 0,
  });

  const revoke = useMutation({
    mutationFn: () => revokeAdminUserSessions(id),
    onSuccess: async () => {
      setConfirmRevoke(false);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteAdminUser(id, confirmEmail),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      navigate("/admin/users");
    },
  });

  useEffect(() => {
    document.title = `${t("admin.user.profile")} · ${t("admin.title")}`;
  }, [t]);

  if (detail.isPending) {
    return <PageLoading label={t("common.loading")} />;
  }

  if (detail.isError) {
    return (
      <PageError
        title={t("common.errorTitle")}
        body={t("common.errorBody")}
        actionLabel={t("common.retry")}
        onAction={() => detail.refetch()}
      />
    );
  }

  const { user, profile, counts, recentThreads, rooms } = detail.data;
  const actionError =
    revoke.isError || remove.isError
      ? remove.error instanceof ApiRequestError && remove.error.code === "bad_request"
        ? t("admin.user.checkEmail")
        : t("admin.user.failed")
      : null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/users" className="text-sm font-medium text-primary hover:underline">
          ← {t("admin.user.back")}
        </Link>
        <h2 className="mt-2 text-headline-lg">{user.displayName ?? (user.name || user.email)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-surface-container-high px-2 py-1">
            {user.deleted ? t("admin.users.deleted") : t("admin.users.status.active")}
          </span>
          <span className="rounded-full bg-surface-container-high px-2 py-1">
            {user.onboardingComplete
              ? t("admin.users.profileComplete")
              : t("admin.users.profileIncomplete")}
          </span>
          {user.academicVerified ? (
            <span className="rounded-full bg-surface-container-high px-2 py-1">
              {t("admin.overview.users.verified")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("admin.user.counts.sessions"), value: counts.sessions },
          { label: t("admin.user.counts.threads"), value: counts.threads },
          { label: t("admin.user.counts.rooms"), value: counts.rooms },
          { label: t("admin.user.counts.pushes"), value: counts.pushSubscriptions },
        ].map((item) => (
          <div key={item.label} className="rounded-card border bg-card p-4 shadow-soft">
            <p className="text-label-md text-muted-foreground uppercase tracking-wide">
              {item.label}
            </p>
            <p className="mt-1 text-headline-md">
              {new Intl.NumberFormat(i18n.resolvedLanguage).format(item.value)}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-card border bg-card p-5 shadow-soft">
        <h3 className="text-title-md">{t("admin.user.profile")}</h3>
        {profile ? (
          <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t("admin.user.fields.area")}</dt>
              <dd>{profile.areaLabel ?? t("admin.user.fields.none")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("admin.user.fields.seeking")}</dt>
              <dd>
                <SeekingValue value={profile.seeking} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("admin.user.fields.lifeStage")}</dt>
              <dd>
                <LifeStageValue value={profile.lifeStage} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("admin.user.fields.budget")}</dt>
              <dd>
                {profile.budgetMin === null || profile.budgetMax === null
                  ? t("admin.user.fields.none")
                  : `€${profile.budgetMin}–€${profile.budgetMax}`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("admin.user.fields.moveIn")}</dt>
              <dd>
                {profile.moveInFrom || profile.moveInTo
                  ? `${profile.moveInFrom ?? "—"} → ${profile.moveInTo ?? "—"}`
                  : t("admin.user.fields.none")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("admin.user.fields.language")}</dt>
              <dd>{profile.language.toUpperCase()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("admin.user.fields.ageConfirmed")}</dt>
              <dd>
                {profile.ageConfirmed ? t("admin.user.fields.yes") : t("admin.user.fields.no")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("admin.user.fields.onboarding")}</dt>
              <dd>
                {profile.onboardingCompletedAt
                  ? date.format(new Date(profile.onboardingCompletedAt * 1000))
                  : t("admin.user.fields.none")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("admin.user.fields.academic")}</dt>
              <dd>
                {profile.academicEmail ?? t("admin.user.fields.none")}
                {profile.academicVerifiedAt
                  ? ` · ${date.format(new Date(profile.academicVerifiedAt * 1000))}`
                  : ""}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t("admin.user.fields.bio")}</dt>
              <dd className="whitespace-pre-wrap">{profile.bio ?? t("admin.user.fields.none")}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.user.fields.none")}</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border bg-card p-5 shadow-soft">
          <h3 className="text-title-md">{t("admin.user.threads.title")}</h3>
          {recentThreads.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("admin.user.threads.empty")}</p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {recentThreads.map((thread) => (
                <li key={thread.peerId} className="flex justify-between gap-3 py-2">
                  <span>{thread.peerName ?? thread.peerId}</span>
                  <span className="text-xs text-muted-foreground">
                    {date.format(new Date(thread.updatedAt * 1000))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border bg-card p-5 shadow-soft">
          <h3 className="text-title-md">{t("admin.user.rooms.title")}</h3>
          {rooms.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("admin.user.rooms.empty")}</p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {rooms.map((room) => (
                <li key={room.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">{room.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(
                      room.status === "active"
                        ? "admin.rooms.status.active"
                        : "admin.rooms.status.withdrawn",
                    )}
                    {" · "}€{room.rentEur}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-card border border-error-container bg-card p-5 shadow-soft">
        <h3 className="text-title-md">{t("admin.user.actions")}</h3>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          {confirmRevoke ? (
            <>
              <p className="text-sm">{t("admin.user.revokeConfirm")}</p>
              <Button
                type="button"
                variant="destructive"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate()}
              >
                {t("admin.actions.confirm")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmRevoke(false)}>
                {t("admin.actions.cancel")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirmRevoke(true)}>
              {t("admin.user.revoke")}
            </Button>
          )}
        </div>

        <div className="mt-6 border-t pt-5">
          <p className="text-sm">{t("admin.user.delete")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("admin.user.deleteHint")}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Field id="admin-delete-email" label={t("admin.user.deleteEmail")}>
                <Input
                  id="admin-delete-email"
                  type="email"
                  value={confirmEmail}
                  onChange={(event) => setConfirmEmail(event.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending || confirmEmail.trim().length === 0}
              onClick={() => remove.mutate()}
            >
              {t("admin.user.deleteConfirm")}
            </Button>
          </div>
        </div>

        {actionError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            {actionError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
