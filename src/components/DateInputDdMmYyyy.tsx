"use client";

import { useEffect, useId, useState } from "react";
import { formatIsoDateToDdMmYyyy, parseDdMmYyyyToIso } from "@/lib/dateFormats";

type Props = {
  id?: string;
  label: string;
  valueIso: string;
  onChangeIso: (iso: string) => void;
  required?: boolean;
  /** Inclusive minimum `YYYY-MM-DD` (e.g. return ≥ departure). */
  minIso?: string;
  /** Inclusive maximum `YYYY-MM-DD`. */
  maxIso?: string;
  className?: string;
  disabled?: boolean;
};

export function DateInputDdMmYyyy({
  id: idProp,
  label,
  valueIso,
  onChangeIso,
  required = false,
  minIso,
  maxIso,
  className = "",
  disabled = false,
}: Props) {
  const genId = useId();
  const id = idProp ?? `date-ddmmyyyy-${genId}`;
  const [text, setText] = useState(() => formatIsoDateToDdMmYyyy(valueIso));

  useEffect(() => {
    setText(formatIsoDateToDdMmYyyy(valueIso));
  }, [valueIso]);

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        required={required}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const iso = parseDdMmYyyyToIso(v.trim());
          if (iso) {
            if (minIso && iso < minIso) return;
            if (maxIso && iso > maxIso) return;
            onChangeIso(iso);
          } else if (v.trim() === "") {
            onChangeIso("");
          }
        }}
        onBlur={() => {
          const trimmed = text.trim();
          if (trimmed === "") {
            onChangeIso("");
            return;
          }
          const iso = parseDdMmYyyyToIso(trimmed);
          if (!iso) {
            setText(formatIsoDateToDdMmYyyy(valueIso));
            return;
          }
          if (minIso && iso < minIso) {
            setText(formatIsoDateToDdMmYyyy(valueIso));
            return;
          }
          if (maxIso && iso > maxIso) {
            setText(formatIsoDateToDdMmYyyy(valueIso));
            return;
          }
          onChangeIso(iso);
          setText(formatIsoDateToDdMmYyyy(iso));
        }}
        className={className}
      />
    </div>
  );
}
