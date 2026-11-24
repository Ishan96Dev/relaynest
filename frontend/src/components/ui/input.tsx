import { AlertCircle } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "./styles";

export { inputClass };
export { Select } from "./select";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  counter,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  counter?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-semibold">
          {label}
          {required && <span className="text-bad"> *</span>}
        </label>
        {counter && <span className="text-[11px] text-muted">{counter}</span>}
      </div>
      {error && React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ "aria-invalid"?: boolean }>, { "aria-invalid": true }) : children}
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-xs font-medium text-bad"><AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />{error}</p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode; trailing?: React.ReactNode }>(
  function Input({ className, icon, trailing, ...props }, ref) {
    if (!icon && !trailing) return <input suppressHydrationWarning ref={ref} className={cn(inputClass, className)} {...props} />;
    return (
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted [&_svg]:size-4">{icon}</span>}
        <input suppressHydrationWarning ref={ref} className={cn(inputClass, icon && "pl-10", trailing && "pr-10", className)} {...props} />
        {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea suppressHydrationWarning ref={ref} className={cn(inputClass, "h-auto min-h-24 resize-y py-2", className)} {...props} />;
  },
);