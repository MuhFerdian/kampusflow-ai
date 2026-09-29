import { z } from "zod";

// API/database timestamps must identify an instant. Keep the original string:
// converting it through Date would truncate PostgreSQL microseconds to milliseconds.
export const timestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => {
    const offset = value.match(/([+-])(\d{2}):?(\d{2})$/);
    return (
      Number.isFinite(Date.parse(value)) &&
      (!offset || (Number(offset[2]) <= 23 && Number(offset[3]) <= 59))
    );
  }, "Invalid timestamp or timezone offset");

const pad = (value: number) => String(value).padStart(2, "0");

// datetime-local has no timezone. Display using the browser's local components.
export function toDatetimeLocal(value: string | null): string {
  if (value === null) return "";
  const date = new Date(timestampSchema.parse(value));
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocal(
  value: string,
  original: string | null = null,
): string | null {
  if (value === "") return null;
  // Preserve sub-minute precision and the original DST-fold instant on unrelated edits.
  if (original !== null && value === toDatetimeLocal(original)) return original;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("Enter a valid local deadline date and time.");
  }
  const date = new Date(value); // Interpret local wall time, never append a UTC 'Z'.
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Enter a valid local deadline date and time.");
  }
  const iso = date.toISOString();
  // Reject calendar rollover and nonexistent local times in a DST spring-forward gap.
  if (toDatetimeLocal(iso) !== value) {
    throw new Error("This date or local time does not exist in your timezone.");
  }
  return iso;
}
