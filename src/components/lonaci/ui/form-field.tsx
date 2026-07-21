import { useId, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

export function FormField({
  label,
  children,
  htmlFor,
  hint,
  error,
  required = false,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const messageId = `${generatedId}-message`;

  return (
    <div
      className={cn(
        "lonaci-ui-form-field",
        error !== undefined && error !== null && "lonaci-ui-form-field--error",
        className,
      )}
      role="group"
      aria-describedby={hint || error ? messageId : undefined}
    >
      <label htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required ? <span className="lonaci-ui-sr-only"> (obligatoire)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={messageId} role="alert" className="lonaci-ui-field-error">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="lonaci-ui-field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
