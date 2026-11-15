import { ADMIN_LIST_DEFAULT_LIMIT } from "@hearth/shared";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Field, Input } from "@/components/form-controls";
import { PageError, PageLoading } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { fetchAdminUsers } from "@/lib/admin";

export function AdminUsersRoute() {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium" });
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const users = useQuery({
    queryKey: ["admin", "users", search, offset],
    queryFn: () => fetchAdminUsers({ query: search || undefined, offset }),
    retry: false,
  });

  useEffect(() => {
    document.title = `${t("admin.tabs.users")} · ${t("admin.title")}`;
  }, [t]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSearch(term.trim());
    setOffset(0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-title-md">{t("admin.users.subtitle")}</h2>
        <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Field id="admin-user-search" label={t("admin.users.searchLabel")}>
              <Input
                id="admin-user-search"
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={t("admin.users.searchPlaceholder")}
                maxLength={100}
              />
            </Field>
          </div>
          <Button type="submit">{t("admin.users.searchLabel")}</Button>
        </form>
      </div>

      {users.isPending ? (
        <PageLoading label={t("common.loading")} />
      ) : users.isError ? (
        <PageError
          title={t("common.errorTitle")}
          body={t("common.errorBody")}
          actionLabel={t("common.retry")}
          onAction={() => users.refetch()}
        />
      ) : users.data.users.length === 0 ? (
        <p className="rounded-card border bg-card p-6 text-sm text-muted-foreground">
          {t("admin.users.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {users.data.users.map((user) => (
            <li key={user.id}>
              <Link
                to={`/admin/users/${encodeURIComponent(user.id)}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border bg-card p-4 shadow-soft transition-colors hover:bg-surface-container-high"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {user.displayName ?? (user.name || user.email)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-surface-container-high px-2 py-1">
                    {user.deleted
                      ? t("admin.users.deleted")
                      : user.status === "active"
                        ? t("admin.users.status.active")
                        : user.status}
                  </span>
                  <span className="rounded-full bg-surface-container-high px-2 py-1">
                    {user.onboardingComplete
                      ? t("admin.users.profileComplete")
                      : t("admin.users.profileIncomplete")}
                  </span>
                  <span className="text-muted-foreground">
                    {t("admin.users.joined", {
                      date: date.format(new Date(user.createdAt * 1000)),
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    {user.lastSeenAt > 0
                      ? t("admin.users.lastSeen", {
                          date: date.format(new Date(user.lastSeenAt * 1000)),
                        })
                      : t("admin.users.never")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={offset === 0 || users.isFetching}
          onClick={() => setOffset(Math.max(0, offset - ADMIN_LIST_DEFAULT_LIMIT))}
        >
          {t("admin.previous")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={users.data?.nextOffset == null || users.isFetching}
          onClick={() => {
            if (users.data?.nextOffset != null) setOffset(users.data.nextOffset);
          }}
        >
          {t("admin.next")}
        </Button>
      </div>
    </div>
  );
}
