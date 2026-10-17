import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-lg border bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 " +
  "transition-colors disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500";

const CONTROL_BORDER = "border-ink-300 hover:border-ink-400 focus:border-brand-500 focus:outline-none";
const CONTROL_BORDER_INVALID = "border-red-400 hover:border-red-500 focus:border-red-500";

/**
 * Label, control, hint and error as one unit so every form in the app lines up
 * and the error is always wired to its input via aria-describedby.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-800">
        {label}
        {required ? <span className="ms-0.5 text-red-600">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  leading?: ReactNode;
  /** Right-hand adornment. Unlike `leading` it stays clickable, for toggles. */
  trailing?: ReactNode;
};

export function Input({ label, hint, error, leading, trailing, className, id, ...props }: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;

  const control = (
    <input
      id={inputId}
      aria-invalid={error ? true : undefined}
      className={cn(
        CONTROL,
        error ? CONTROL_BORDER_INVALID : CONTROL_BORDER,
        "h-10",
        leading && "ps-9",
        trailing && "pe-10",
        className,
      )}
      {...props}
    />
  );

  const adorn = leading || trailing ? (
    <div className="relative">
      {leading ? (
        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-400">
          {leading}
        </span>
      ) : null}
      {control}
      {trailing ? (
        <span className="absolute inset-y-0 end-2 flex items-center text-ink-400">{trailing}</span>
      ) : null}
    </div>
  ) : (
    control
  );

  if (!label) return adorn;

  return (
    <Field label={label} hint={hint} error={error} required={props.required} htmlFor={inputId}>
      {adorn}
    </Field>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
};

export function Textarea({ label, hint, error, className, id, rows = 4, ...props }: TextareaProps) {
  const generated = useId();
  const areaId = id ?? generated;

  const control = (
    <textarea
      id={areaId}
      rows={rows}
      aria-invalid={error ? true : undefined}
      className={cn(CONTROL, error ? CONTROL_BORDER_INVALID : CONTROL_BORDER, "py-2 leading-relaxed", className)}
      {...props}
    />
  );

  if (!label) return control;

  return (
    <Field label={label} hint={hint} error={error} required={props.required} htmlFor={areaId}>
      {control}
    </Field>
  );
}

export type Option = { value: string; label: string };

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  options: Option[];
  placeholder?: string;
};

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  className,
  id,
  ...props
}: SelectProps) {
  const generated = useId();
  const selectId = id ?? generated;

  const control = (
    <select
      id={selectId}
      aria-invalid={error ? true : undefined}
      className={cn(
        CONTROL,
        error ? CONTROL_BORDER_INVALID : CONTROL_BORDER,
        "flip-chevron h-10 appearance-none pe-9",
        className,
      )}
      // Chevron inlined as a data URI: no icon font, no extra request.
      style={{
        background:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23697591'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z' clip-rule='evenodd'/%3E%3C/svg%3E\") right 0.6rem center / 1rem no-repeat",
      }}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  if (!label) return control;

  return (
    <Field label={label} hint={hint} error={error} required={props.required} htmlFor={selectId}>
      {control}
    </Field>
  );
}

export function Checkbox({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  const id = useId();

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-ink-300 text-accent accent-brand-700"
        {...props}
      />
      <label htmlFor={id} className="text-sm text-ink-800">
        {label}
        {hint ? <span className="mt-0.5 block text-xs text-ink-500">{hint}</span> : null}
      </label>
    </div>
  );
}
