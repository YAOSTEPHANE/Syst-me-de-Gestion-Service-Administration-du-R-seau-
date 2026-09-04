import type { CSSProperties, ReactNode } from "react";
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
  /** Cadre analytique ultra-premium (glow, entrée animée). */
  premium?: boolean;
  /** Variante exécutive : orbes mesh, badge live, bordure lumineuse. */
  ultra?: boolean;
  badge?: string;
  /** Délai d’entrée en cascade (ms), pour les grilles de graphiques. */
  enterDelayMs?: number;
}

export function ChartCard({
  title,
  description,
  action,
  legend,
  children,
  className,
  premium = false,
  ultra = false,
  badge,
  enterDelayMs = 0,
}: ChartCardProps) {
  const elevated = premium || ultra;
  return (
    <Surface
      className={cn(
        "lonaci-ui-chart-card",
        elevated && "lonaci-ui-chart-card--premium",
        ultra && "lonaci-ui-chart-card--ultra",
        className,
      )}
      elevated
      style={
        enterDelayMs > 0
          ? ({ "--chart-enter-delay": `${enterDelayMs}ms` } as CSSProperties)
          : undefined
      }
    >
      {elevated ? <span className="lonaci-ui-chart-card__glow" aria-hidden="true" /> : null}
      {ultra ? (
        <>
          <span className="lonaci-ui-chart-card__orb lonaci-ui-chart-card__orb--a" aria-hidden="true" />
          <span className="lonaci-ui-chart-card__orb lonaci-ui-chart-card__orb--b" aria-hidden="true" />
          <span className="lonaci-ui-chart-card__beam" aria-hidden="true" />
        </>
      ) : null}
      <div className="lonaci-ui-chart-card__header">
        <div>
          <div className="lonaci-ui-chart-card__title-row">
            <h3>{title}</h3>
            {badge ? <span className="lonaci-ui-chart-card__live">{badge}</span> : null}
          </div>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="lonaci-ui-chart-card__plot">{children}</div>
      {legend ? <div className="lonaci-ui-chart-card__legend">{legend}</div> : null}
    </Surface>
  );
}
