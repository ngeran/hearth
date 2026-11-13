/** Keep persisted instants on whole seconds, matching the D1 schema. */
export function nowDate(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}

export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function fromUnixSeconds(seconds: number): Date {
  return new Date(seconds * 1000);
}
