import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const controlClasses =
  "min-h-11 w-full rounded-control border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface transition-colors placeholder:text-on-surface-variant focus-visible:border-primary-container disabled:cursor-not-allowed disabled:opacity-60";

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InvalidProps = {
  invalid?: boolean;
};

export function Input({
  className,
  invalid = false,
  ...props
}: ComponentProps<"input"> & InvalidProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(controlClasses, invalid && "border-error", className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid = false,
  ...props
}: ComponentProps<"textarea"> & InvalidProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(controlClasses, "min-h-32 resize-y", invalid && "border-error", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  invalid = false,
  ...props
}: ComponentProps<"select"> & InvalidProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(controlClasses, invalid && "border-error", className)}
      {...props}
    />
  );
}

export function Checkbox({
  className,
  invalid = false,
  ...props
}: ComponentProps<"input"> & InvalidProps) {
  return (
    <input
      type="checkbox"
      aria-invalid={invalid || undefined}
      className={cn("size-5 rounded border-outline-variant accent-secondary", className)}
      {...props}
    />
  );
}
