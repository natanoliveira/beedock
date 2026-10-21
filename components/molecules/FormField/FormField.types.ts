import type { ComponentProps } from "react";
import type { AppInput } from "@/components/atoms/AppInput";

export type FormFieldProps = ComponentProps<typeof AppInput> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
};
