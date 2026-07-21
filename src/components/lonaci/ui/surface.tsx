import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type SurfacePadding = "none" | "sm" | "md" | "lg";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  padding?: SurfacePadding;
  elevated?: boolean;
  children: ReactNode;
}

export function Surface({
  padding = "md",
  elevated = false,
  className,
  children,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "lonaci-ui-surface",
        `lonaci-ui-surface--${padding}`,
        elevated && "lonaci-ui-surface--elevated",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardProps extends Omit<SurfaceProps, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function Card({ title, description, action, children, ...props }: CardProps) {
  return (
    <Surface {...props}>
      {title || description || action ? (
        <div className="lonaci-ui-card__header">
          <div>
            {title ? <h3 className="lonaci-ui-card__title">{title}</h3> : null}
            {description ? <p className="lonaci-ui-card__description">{description}</p> : null}
          </div>
          {action ? <div className="lonaci-ui-card__action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </Surface>
  );
}
