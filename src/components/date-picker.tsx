import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Date picker with an English calendar (native <input type="date"> follows the OS language). */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  id?: string;
  /** ISO date string "YYYY-MM-DD" or empty string. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const date = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4" />
          {date ? format(date, "PPP", { locale: enUS }) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={enUS}
          selected={date}
          onSelect={(d) =>
            onChange(
              d
                ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                : "",
            )
          }
          className="pointer-events-auto p-3"
        />
      </PopoverContent>
    </Popover>
  );
}
