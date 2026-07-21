import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

export interface LonaciBrandProps extends HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
  inverse?: boolean;
}

export function LonaciBrand({
  compact = false,
  inverse = false,
  className,
  ...props
}: LonaciBrandProps) {
  return (
    <div
      className={cn(
        "lonaci-ui-brand",
        compact && "lonaci-ui-brand--compact",
        inverse && "lonaci-ui-brand--inverse",
        className,
      )}
      aria-label="LONACI"
      {...props}
    >
      <span className="lonaci-ui-brand__monogram" aria-hidden="true">
        L
      </span>
      {!compact ? (
        <span className="lonaci-ui-brand__wordmark">
          <strong>LONACI</strong>
          <small>Gestion institutionnelle</small>
        </span>
      ) : null}
    </div>
  );
}
