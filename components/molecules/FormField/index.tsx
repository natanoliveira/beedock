import { AppInput } from "@/components/atoms/AppInput";
import { AppLabel } from "@/components/atoms/AppLabel";
import type { FormFieldProps } from "./FormField.types";

export function FormField({ label, name, error, hint, id = name, ...props }: FormFieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-1.5">
      <AppLabel htmlFor={id}>{label}</AppLabel>
      <AppInput id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
