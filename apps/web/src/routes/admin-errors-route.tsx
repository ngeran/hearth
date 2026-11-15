import { ADMIN_LIST_DEFAULT_LIMIT } from "@hearth/shared";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Field, Input, Select } from "@/components/form-controls";
import { PageError, PageLoading } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { fetchAdminErrors } from "@/lib/admin";

export function AdminErrorsRoute() {
  const { t, i18n } = useTranslation();
  const dateTime = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: "short",
    timeStyle: "medium",
  });
  const [routeInput, setRouteInput] = useState("");
  const [route, setRoute] = useState("");
  const [status, setStatus] = useState<number | undefined>(undefined);
  const [offset, setOffset] = useState(0);

  const errors = useQuery({
    queryKey: ["admin", "errors", route, status, offset],
    queryFn: () => fetchAdminErrors({ route: route || undefined, status, offset }),
    retry: false,
  });

  useEffect(() => {
    document.title = `${t("admin.tabs.errors")} · ${t("admin.title")}`;
  }, [t]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setRoute(routeInput.trim());
    setOffset(0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-title-md">{t("admin.errors.subtitle")}</h2>
        <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Field id="admin-error-route" label={t("admin.errors.routeFilter")}>
              <Input
                id="admin-error-route"
                type="search"
                value={routeInput}
                onChange={(event) => setRouteInput(event.target.value)}
                placeholder={t("admin.errors.routePlaceholder")}
                maxLength={120}
              />
            </Field>
          </div>
          <div className="w-40">
            <Field id="admin-error-status" label={t("admin.errors.statusFilter")}>
              <Select
                id="admin-error-status"
                value={status === undefined ? "" : String(status)}
                onChange={(event) => {
                  setStatus(event.target.value === "" ? undefined : Number(event.target.value));
                  setOffset(0);
                }}
              >
                <option value="">{t("admin.all")}</option>
                <option value="500">500</option>
              </Select>
            </Field>
          </div>
          <Button type="submit">{t("admin.search")}</Button>
        </form>
      </div>

      {errors.isPending ? (
        <PageLoading label={t("common.loading")} />
      ) : errors.isError ? (
        <PageError
          title={t("common.errorTitle")}
          body={t("common.errorBody")}
          actionLabel={t("common.retry")}
          onAction={() => errors.refetch()}
        />
      ) : errors.data.errors.length === 0 ? (
        <p className="rounded-card border bg-card p-6 text-sm text-muted-foreground">
          {t("admin.errors.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {errors.data.errors.map((event) => (
            <li key={event.id} className="rounded-card border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{dateTime.format(new Date(event.createdAt * 1000))}</span>
                <span className="font-mono">
                  {event.method} {event.route}
                </span>
                <span>{event.status}</span>
                <span className="font-semibold text-on-surface">{event.errorName}</span>
                {event.requestId ? (
                  <span className="truncate font-mono">{event.requestId}</span>
                ) : null}
              </div>
              {event.message ? (
                <p className="mt-2 font-mono text-xs break-words text-muted-foreground">
                  {event.message}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={offset === 0 || errors.isFetching}
          onClick={() => setOffset(Math.max(0, offset - ADMIN_LIST_DEFAULT_LIMIT))}
        >
          {t("admin.previous")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={errors.data?.nextOffset == null || errors.isFetching}
          onClick={() => {
            if (errors.data?.nextOffset != null) setOffset(errors.data.nextOffset);
          }}
        >
          {t("admin.next")}
        </Button>
      </div>
    </div>
  );
}
