import { PHOTO_MAX_BYTES } from "@hearth/shared";
import { ImagePlus, Trash2, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { reencodePhoto } from "@/lib/image";
import { deletePhoto, uploadPhoto } from "@/lib/me";

type PhotoFieldProps = {
  id: string;
  photoUrl: string | null;
  onChange: (photoUrl: string | null) => void;
  disabled?: boolean;
};

type PhotoErrorKey =
  | "profile.photo.invalidType"
  | "profile.photo.tooLarge"
  | "profile.photo.uploadFailed"
  | "profile.photo.removeFailed";

export function PhotoField({ id, photoUrl, onChange, disabled = false }: PhotoFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(photoUrl);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<PhotoErrorKey | null>(null);

  useEffect(() => {
    setPreview(photoUrl);
  }, [photoUrl]);

  const handleFile = async (file: File) => {
    setErrorKey(null);

    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setErrorKey("profile.photo.invalidType");
      return;
    }

    if (file.size > PHOTO_MAX_BYTES) {
      setErrorKey("profile.photo.tooLarge");
      return;
    }

    setBusy(true);

    try {
      const encoded = await reencodePhoto(file);
      const result = await uploadPhoto(encoded);
      setPreview(result.photoUrl);
      onChange(result.photoUrl);
    } catch {
      setErrorKey("profile.photo.uploadFailed");
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    setErrorKey(null);
    setBusy(true);

    try {
      await deletePhoto();
      setPreview(null);
      onChange(null);
    } catch {
      setErrorKey("profile.photo.removeFailed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p id={`${id}-label`} className="text-sm font-medium">
        {t("profile.photo.label")}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {preview ? (
          <img
            src={preview}
            alt={t("profile.photo.alt")}
            className="size-24 rounded-full border object-cover shadow-soft"
          />
        ) : (
          <span className="flex size-24 items-center justify-center rounded-full border bg-surface-container-high text-muted-foreground">
            <UserRound aria-hidden="true" className="size-10" />
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            aria-labelledby={`${id}-label`}
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void handleFile(file);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
          >
            <ImagePlus aria-hidden="true" className="size-4" />
            {preview ? t("profile.photo.change") : t("profile.photo.choose")}
          </Button>
          {preview ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleRemove()}
              disabled={disabled || busy}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {t("profile.photo.remove")}
            </Button>
          ) : null}
        </div>
      </div>
      <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
        {t("profile.photo.hint")}
      </p>
      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("profile.photo.uploading")}
        </p>
      ) : null}
      {errorKey ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
