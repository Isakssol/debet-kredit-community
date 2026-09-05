"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Det sexsiffriga fältet. Ett fält, inte sex rutor.
 *
 * Sex separata rutor ser prydligare ut i en skiss och går sönder i
 * verkligheten: inklistring från en lösenordshanterare hamnar i första rutan,
 * webbläsarens ifyllnad av engångskoder hittar inget fält att fylla i, och en
 * skärmläsare läser upp sex namnlösa textrutor i rad. Ett fält med
 * `autocomplete="one-time-code"` får i stället koden serverad av telefonen.
 *
 * Fältet accepterar bara siffror och släpper `onComplete` när sex av dem är
 * inne, så inloggningens kodsteg kan skickas utan ett extra klick.
 */
export function MfaCodeInput({
  id, label, value, onChange, onComplete, disabled, autoFocus, className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** Anropas när fältet just fyllts till sex siffror. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        disabled={disabled}
        autoFocus={autoFocus}
        aria-describedby={`${id}-hjalp`}
        className="h-11 text-center font-mono text-2xl tracking-[0.4em]"
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(digits);
          if (digits.length === 6 && value.length < 6) onComplete?.(digits);
        }}
      />
      <p id={`${id}-hjalp`} className="text-xs text-muted-foreground">
        Sex siffror, utan mellanslag.
      </p>
    </div>
  );
}
