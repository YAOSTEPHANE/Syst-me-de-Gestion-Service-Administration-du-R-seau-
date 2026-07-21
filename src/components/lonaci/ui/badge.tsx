import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type Tone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span className={cn("lonaci-ui-badge", `lonaci-ui-tone--${tone}`, className)} {...props}>
      {children}
    </span>
  );
}

export interface StatusBadgeProps extends BadgeProps {
  dot?: boolean;
}

export function StatusBadge({ dot = true, children, ...props }: StatusBadgeProps) {
  return (
    <Badge {...props}>
      {dot ? <span className="lonaci-ui-status-dot" aria-hidden="true" /> : null}
      {children}
    </Badge>
  );
}
