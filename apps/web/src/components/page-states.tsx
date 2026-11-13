import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PageLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function PageError({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div role="alert" className="rounded-card border bg-card p-6 shadow-soft">
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <Button type="button" className="mt-5" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
