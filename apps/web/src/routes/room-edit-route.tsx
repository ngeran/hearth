import type { MeResponse, RoomDetails, RoomListItem, RoomStatus } from "@hearth/shared";
import { roomCreateSchema } from "@hearth/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { BedDouble, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import type { z } from "zod";
import { Checkbox, Field, Input, Textarea } from "@/components/form-controls";
import { PageError, PageLoading } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { roomPhotoUrl } from "@/lib/rooms";
import { useMe } from "@/lib/use-me";
import {
  useCreateRoom,
  useDeleteRoom,
  useDeleteRoomPhoto,
  useMyRooms,
  useRoom,
  useUpdateRoom,
  useUploadRoomPhotos,
} from "@/lib/use-rooms";

// The form collects the area label only; coordinates ride along from the
// lister's profile when present (they are nullable end-to-end, see M5.md).
const roomFormSchema = roomCreateSchema.omit({ areaLat: true, areaLng: true });
type RoomFormValues = z.infer<typeof roomFormSchema>;

// Literal photo slots (0–3 photos per listing) — used as stable list keys.
const PHOTO_SLOTS = [0, 1, 2] as const;

/**
 * Create or edit the member's single room listing. The outer component gates
 * on profile + existing-listing data (the same pattern as the profile route)
 * so the form below always mounts with complete defaults.
 */
export function RoomEditRoute() {
  const { t } = useTranslation();
  const session = useSession();
  const me = useMe(Boolean(session.data));
  const mine = useMyRooms(Boolean(session.data));

  const listings = mine.data?.rooms ?? [];
  const existing = listings.find((room) => room.status === "active") ?? listings[0] ?? null;
  const isEdit = existing !== null;
  // The list item carries no description; the full details do.
  const details = useRoom(existing?.id ?? null, existing !== null);

  useEffect(() => {
    document.title = `${t(isEdit ? "rooms.form.editTitle" : "rooms.form.createTitle")} · Hearth`;
  }, [t, isEdit]);

  if (me.isPending || mine.isPending || (isEdit && details.isPending)) {
    return <PageLoading label={t("common.loading")} />;
  }
  if (me.isError || mine.isError) {
    return (
      <PageError
        title={t("common.errorTitle")}
        body={t("common.errorBody")}
        actionLabel={t("common.retry")}
        onAction={() => {
          if (me.isError) void me.refetch();
          if (mine.isError) void mine.refetch();
        }}
      />
    );
  }
  if (isEdit && details.isError) {
    return (
      <PageError
        title={t("common.errorTitle")}
        body={t("common.errorBody")}
        actionLabel={t("common.retry")}
        onAction={() => void details.refetch()}
      />
    );
  }
  if (!me.data?.complete) {
    return (
      <section className="mx-auto max-w-xl py-10 text-center sm:py-16">
        <span className="mx-auto flex size-16 rounded-full bg-surface-container-high text-secondary">
          <BedDouble className="mx-auto size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-headline-lg">{t("rooms.title")}</h1>
        <p className="mt-3 text-base text-muted-foreground">{t("rooms.incomplete")}</p>
        <Button className="mt-6" asChild>
          <Link to="/onboarding">{t("common.continue")}</Link>
        </Button>
      </section>
    );
  }

  return (
    <RoomEditForm
      me={me.data}
      existing={existing}
      details={isEdit && details.data ? details.data : null}
    />
  );
}

function RoomEditForm({
  me,
  existing,
  details,
}: {
  me: MeResponse;
  existing: RoomListItem | null;
  details: RoomDetails | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<RoomFormValues>({
    resolver: zodResolver(roomFormSchema),
    defaultValues:
      existing && details
        ? {
            title: existing.title,
            description: details.description,
            areaLabel: existing.areaLabel,
            rentEur: existing.rentEur,
            billsIncluded: existing.billsIncluded,
            availableFrom: existing.availableFrom,
          }
        : {
            title: "",
            description: "",
            areaLabel: me.profile.areaLabel ?? "",
            rentEur: me.profile.budgetMin ?? 350,
            billsIncluded: false,
            availableFrom: new Date().toISOString().slice(0, 10),
          },
    mode: "onTouched",
  });
  const { register, handleSubmit, watch, control } = form;
  const errors = form.formState.errors;
  const descriptionLength = watch("description").length;

  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const saving = createRoom.isPending || updateRoom.isPending;
  const saveError = createRoom.isError || updateRoom.isError;

  const onSubmit = handleSubmit(async (values) => {
    if (existing) {
      await updateRoom.mutateAsync({ roomId: existing.id, patch: values });
    } else {
      await createRoom.mutateAsync({
        ...values,
        areaLat: me.profile.areaLat ?? null,
        areaLng: me.profile.areaLng ?? null,
      });
    }
    await queryClient.invalidateQueries({ queryKey: ["rooms"] });
    navigate("/rooms");
  });

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-headline-lg">
          {t(existing ? "rooms.form.editTitle" : "rooms.form.createTitle")}
        </h1>
        <Button variant="ghost" asChild>
          <Link to="/rooms">{t("common.back")}</Link>
        </Button>
      </div>

      <form className="mt-6 flex flex-col gap-5" onSubmit={(event) => void onSubmit(event)}>
        <Field
          id="room-title"
          label={t("rooms.form.title")}
          hint={t("rooms.form.titleHint")}
          error={errors.title ? t("rooms.errors.title") : undefined}
        >
          <Input id="room-title" {...register("title")} invalid={Boolean(errors.title)} />
        </Field>

        <Field
          id="room-description"
          label={t("rooms.form.description")}
          hint={t("rooms.form.descriptionHint")}
          error={errors.description ? t("rooms.errors.description") : undefined}
        >
          <Textarea
            id="room-description"
            {...register("description")}
            invalid={Boolean(errors.description)}
          />
          <p className="text-xs text-muted-foreground">{descriptionLength}/2000</p>
        </Field>

        <Field
          id="room-area"
          label={t("rooms.form.area")}
          hint={t("rooms.form.areaHint")}
          error={errors.areaLabel ? t("rooms.errors.area") : undefined}
        >
          <Input id="room-area" {...register("areaLabel")} invalid={Boolean(errors.areaLabel)} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="room-rent"
            label={t("rooms.form.rent")}
            hint={t("rooms.form.rentHint")}
            error={errors.rentEur ? t("rooms.errors.rent") : undefined}
          >
            <Input
              id="room-rent"
              type="number"
              min={50}
              max={5000}
              step={10}
              {...register("rentEur", { valueAsNumber: true })}
              invalid={Boolean(errors.rentEur)}
            />
          </Field>
          <Field
            id="room-available-from"
            label={t("rooms.form.availableFrom")}
            hint={t("rooms.form.availableFromHint")}
            error={errors.availableFrom ? t("rooms.errors.date") : undefined}
          >
            <Input
              id="room-available-from"
              type="date"
              {...register("availableFrom")}
              invalid={Boolean(errors.availableFrom)}
            />
          </Field>
        </div>

        <Controller
          control={control}
          name="billsIncluded"
          render={({ field }) => (
            <div className="flex items-center gap-3">
              <Checkbox
                id="room-bills"
                checked={field.value}
                onChange={(event) => field.onChange(event.target.checked)}
              />
              <label htmlFor="room-bills" className="text-sm leading-relaxed">
                {t("rooms.form.bills")}
              </label>
            </div>
          )}
        />

        {existing && (
          <PhotoEditor
            roomId={existing.id}
            photoCount={existing.photoCount}
            version={details ? details.updatedAt : existing.createdAt}
          />
        )}

        {saveError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {t("common.errorBody")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? t("common.saving") : t("rooms.form.save")}
          </Button>
          {existing && <StatusButtons roomId={existing.id} status={existing.status} />}
        </div>
      </form>

      {existing && <DeleteListing roomId={existing.id} />}
    </div>
  );
}

function PhotoEditor({
  roomId,
  photoCount,
  version,
}: {
  roomId: string;
  photoCount: number;
  version: number;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPhotos = useUploadRoomPhotos();
  const deletePhoto = useDeleteRoomPhoto();
  const busy = uploadPhotos.isPending || deletePhoto.isPending;

  const onFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void uploadPhotos.mutate(
      { roomId, photos: Array.from(files) },
      {
        onSuccess: () => {
          if (fileInputRef.current) fileInputRef.current.value = "";
        },
      },
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-headline-sm">{t("rooms.form.photos")}</h2>
      <p className="text-xs text-muted-foreground">{t("rooms.form.photosHint")}</p>
      <div className="grid grid-cols-3 gap-3">
        {PHOTO_SLOTS.map((slot) =>
          slot < photoCount ? (
            <figure key={slot} className="relative">
              <img
                src={roomPhotoUrl(roomId, slot, version)}
                alt=""
                className="aspect-square w-full rounded-control object-cover"
                loading="lazy"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 size-8 rounded-full bg-surface-container-highest/80"
                aria-label={t("rooms.form.photoDelete")}
                disabled={busy}
                onClick={() => deletePhoto.mutate({ roomId, index: slot })}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </figure>
          ) : slot === photoCount ? (
            <button
              key={slot}
              type="button"
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-control border border-dashed border-outline-variant text-xs text-muted-foreground hover:bg-surface-container-low"
              disabled={busy || photoCount >= 3}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="size-6" aria-hidden="true" />
              {t("rooms.form.photoAdd")}
            </button>
          ) : (
            <span
              key={slot}
              aria-hidden="true"
              className="aspect-square rounded-control border border-dashed border-outline-variant/50"
            />
          ),
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        className="sr-only"
        aria-label={t("rooms.form.photoAdd")}
        onChange={(event) => onFilesSelected(event.target.files)}
      />
      {(uploadPhotos.isError || deletePhoto.isError) && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t("rooms.form.photoFailed")}
        </p>
      )}
    </section>
  );
}

function StatusButtons({ roomId, status }: { roomId: string; status: RoomStatus }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateRoom = useUpdateRoom();
  const busy = updateRoom.isPending;

  const setStatus = (next: RoomStatus) => {
    void updateRoom.mutate(
      { roomId, patch: { status: next } },
      { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rooms"] }) },
    );
  };

  return status === "active" ? (
    <Button type="button" variant="outline" disabled={busy} onClick={() => setStatus("withdrawn")}>
      {t("rooms.form.withdraw")}
    </Button>
  ) : (
    <Button type="button" variant="outline" disabled={busy} onClick={() => setStatus("active")}>
      {t("rooms.form.reactivate")}
    </Button>
  );
}

function DeleteListing({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const deleteRoom = useDeleteRoom();
  const [confirming, setConfirming] = useState(false);

  const onDelete = () => {
    // mutate (not mutateAsync) so failures surface through deleteRoom.isError
    // instead of an unhandled rejection; success invalidates + leaves.
    deleteRoom.mutate(roomId, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ["rooms"] });
        navigate("/rooms");
      },
    });
  };

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="mt-8 self-start text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {t("rooms.form.delete")}
      </Button>
    );
  }
  return (
    <div
      role="alert"
      className="mt-8 rounded-card border border-error bg-surface-container-lowest p-4"
    >
      <p className="text-sm font-medium">{t("rooms.delete.title")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("rooms.delete.body")}</p>
      <div className="mt-4 flex gap-3">
        <Button
          type="button"
          variant="destructive"
          onClick={onDelete}
          disabled={deleteRoom.isPending}
        >
          {deleteRoom.isPending ? t("common.saving") : t("rooms.delete.confirm")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          {t("common.cancel")}
        </Button>
      </div>
      {deleteRoom.isError ? (
        <p className="mt-3 text-sm text-destructive">{t("common.errorBody")}</p>
      ) : null}
    </div>
  );
}
