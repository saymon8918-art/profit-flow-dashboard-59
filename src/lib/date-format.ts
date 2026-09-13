import { useState } from "react";

export type DateFormat = "cis" | "us";

const KEY = "pf-date-format";

export function getDateFormat(): DateFormat {
  if (typeof window === "undefined") return "us";
  return window.localStorage.getItem(KEY) === "cis" ? "cis" : "us";
}

export function formatDate(
  value: string | Date | null | undefined,
  fmt: DateFormat = getDateFormat(),
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return fmt === "us" ? `${mm}/${dd}/${yyyy}` : `${dd}.${mm}.${yyyy}`;
}

export function useDateFormat(): [DateFormat, (fmt: DateFormat) => void] {
  const [fmt, setFmt] = useState<DateFormat>(getDateFormat);
  const update = (next: DateFormat) => {
    window.localStorage.setItem(KEY, next);
    setFmt(next);
  };
  return [fmt, update];
}
