import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CircleCheck, Inbox, Info } from "lucide-react";

import type { Tone } from "@/components/lonaci/ui/badge";
import { cn } from "@/lib/ui/cn";

const toneIcons = {
  neutral: Inbox,
  brand: Info,
  info: Info,
  success: CircleCheck,
  warning: AlertTriangle,
  danger: AlertTriangle,
} satisfies Record<Tone, typeof Info>;

export interface FeedbackStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: Tone;
}

export function FeedbackState({
  title,
  description,
  action,
  tone = "neutral",
  className,
  ...props
}: FeedbackStateProps) {
  const Icon = toneIcons[tone];
  return (
    <div
      className={cn("lonaci-ui-feedback", `lonaci-ui-feedback--${tone}`, className)}
      role={tone === "danger" ? "alert" : "status"}
      {...props}
    >
      <span className="lonaci-ui-feedback__icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <div>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
        {action ? <div className="lonaci-ui-feedback__action">{action}</div> : null}
      </div>
    </div>
  );
}

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  lines?: number;
}

export function Skeleton({ lines = 3, className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("lonaci-ui-skeleton", className)}
      aria-label="Chargement en cours"
      role="status"
      {...props}
    >
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <span key={index} style={{ width: `${Math.max(42, 100 - index * 13)}%` }} aria-hidden="true" />
      ))}
    </div>
  );
}
