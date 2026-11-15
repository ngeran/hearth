import { ADMIN_LIST_DEFAULT_LIMIT } from "@hearth/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Field, Input, Select } from "@/components/form-controls";
import { PageError, PageLoading } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { deleteAdminRoom, fetchAdminRooms } from "@/lib/admin";

export function AdminRoomsRoute() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium" });
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "withdrawn" | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const rooms = useQuery({
    queryKey: ["admin", "rooms", search, status, offset],
    queryFn: () => fetchAdminRooms({ query: search || undefined, status, offset }),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAdminRoom(id),
    onSuccess: async () => {
      setConfirmId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  useEffect(() => {
    document.title = `${t("admin.tabs.rooms")} · ${t("admin.title")}`;
  }, [t]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSearch(term.trim());
    setOffset(0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-title-md">{t("admin.rooms.subtitle")}</h2>
        <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Field id="admin-room-search" label={t("admin.rooms.searchPlaceholder")}>
              <Input
                id="admin-room-search"
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={t("admin.rooms.searchPlaceholder")}
                maxLength={100}
              />
            </Field>
          </div>
          <div className="w-44">
            <Field id="admin-room-status" label={t("admin.rooms.statusFilter")}>
              <Select
                id="admin-room-status"
                value={status ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setStatus(value === "active" || value === "withdrawn" ? value : undefined);
                  setOffset(0);
                }}
              >
                <option value="">{t("admin.all")}</option>
                <option value="active">{t("admin.rooms.status.active")}</option>
                <option value="withdrawn">{t("admin.rooms.status.withdrawn")}</option>
              </Select>
            </Field>
          </div>
          <Button type="submit">{t("admin.search")}</Button>
        </form>
      </div>

      {rooms.isPending ? (
        <PageLoading label={t("common.loading")} />
      ) : rooms.isError ? (
        <PageError
          title={t("common.errorTitle")}
          body={t("common.errorBody")}
          actionLabel={t("common.retry")}
          onAction={() => rooms.refetch()}
        />
      ) : rooms.data.rooms.length === 0 ? (
        <p className="rounded-card border bg-card p-6 text-sm text-muted-foreground">
          {t("admin.rooms.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {rooms.data.rooms.map((room) => (
            <li key={room.id} className="rounded-card border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{room.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {room.lister.displayName ?? room.lister.email} · {room.areaLabel} · €
                    {room.rentEur} · {date.format(new Date(room.createdAt * 1000))}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface-container-high px-2 py-1 text-xs">
                    {room.status === "active"
                      ? t("admin.rooms.status.active")
                      : t("admin.rooms.status.withdrawn")}
                  </span>
                  <Link
                    to={`/admin/users/${encodeURIComponent(room.lister.userId)}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t("admin.user.profile")}
                  </Link>
                  {confirmId === room.id ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(room.id)}
                      >
                        {t("admin.actions.confirm")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmId(null)}
                      >
                        {t("admin.actions.cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmId(room.id)}
                    >
                      {t("admin.rooms.delete")}
                    </Button>
                  )}
                </div>
              </div>
              {confirmId === room.id ? (
                <p className="mt-2 text-xs text-destructive">{t("admin.rooms.deleteConfirm")}</p>
              ) : null}
              {remove.isError && confirmId === room.id ? (
                <p role="alert" className="mt-2 text-xs font-medium text-destructive">
                  {t("admin.user.failed")}
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
          disabled={offset === 0 || rooms.isFetching}
          onClick={() => setOffset(Math.max(0, offset - ADMIN_LIST_DEFAULT_LIMIT))}
        >
          {t("admin.previous")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={rooms.data?.nextOffset == null || rooms.isFetching}
          onClick={() => {
            if (rooms.data?.nextOffset != null) setOffset(rooms.data.nextOffset);
          }}
        >
          {t("admin.next")}
        </Button>
      </div>
    </div>
  );
}
