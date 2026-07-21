import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Badge, type Tone } from "@/components/lonaci/ui/badge";
import { Surface } from "@/components/lonaci/ui/surface";
import { cn } from "@/lib/ui/cn";

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  trend?: {
    label: string;
    tone?: Tone;
  };
  className?: string;
}

export function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  trend,
  className,
}: KpiCardProps) {
  return (
    <Surface className={cn("lonaci-ui-kpi-card", className)} elevated>
      <div className="lonaci-ui-kpi-card__top">
        <span className="lonaci-ui-kpi-card__label">{label}</span>
        {Icon ? (
          <span className="lonaci-ui-kpi-card__icon" aria-hidden="true">
            <Icon size={20} />
          </span>
        ) : null}
      </div>
      <div className="lonaci-ui-kpi-card__value">{value}</div>
      {detail || trend ? (
        <div className="lonaci-ui-kpi-card__footer">
          {detail ? <span>{detail}</span> : null}
          {trend ? <Badge tone={trend.tone ?? "neutral"}>{trend.label}</Badge> : null}
        </div>
      ) : null}
    </Surface>
  );
}

export interface ChartCardProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  description,
  action,
  legend,
  children,
  className,
}: ChartCardProps) {
  return (
    <Surface className={cn("lonaci-ui-chart-card", className)} elevated>
      <div className="lonaci-ui-chart-card__header">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="lonaci-ui-chart-card__plot">{children}</div>
      {legend ? <div className="lonaci-ui-chart-card__legend">{legend}</div> : null}
    </Surface>
  );
}
