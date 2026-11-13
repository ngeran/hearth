import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn("size-9", className)}
    >
      <rect width="64" height="64" rx="14" className="fill-primary-brand" />
      <path
        d="M12 31 32 15l20 16v20a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V31Z"
        className="fill-background"
      />
      <path d="M32 31c5 6 8 9 8 14a8 8 0 0 1-16 0c0-4 3-8 8-14Z" className="fill-accent" />
    </svg>
  );
}
