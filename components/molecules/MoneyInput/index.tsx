"use client";

import { useState, type ComponentProps } from "react";
import { AppInput } from "@/components/atoms/AppInput";

/** Dígitos digitados viram centavos: "12345" -> "123,45"; "1234567" -> "12.345,67". */
export function maskBrl(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9);
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const int = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${int},${padded.slice(-2)}`;
}

export const centsToMask = (cents: number): string => maskBrl(String(cents));

type Props = Omit<ComponentProps<typeof AppInput>, "value" | "defaultValue" | "onChange"> & {
  defaultValue?: string;
};

export function MoneyInput({ defaultValue = "", ...props }: Props) {
  const [value, setValue] = useState(() => maskBrl(defaultValue));
  return (
    <AppInput
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder="0,00"
      value={value}
      onChange={(e) => setValue(maskBrl(e.target.value))}
    />
  );
}
