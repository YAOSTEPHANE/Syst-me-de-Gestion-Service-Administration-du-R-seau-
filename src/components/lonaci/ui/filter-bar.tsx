import type { HTMLAttributes, ReactNode } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/ui/cn";

export interface FilterBarProps extends HTMLAttributes<HTMLDivElement> {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
  };
  filters?: ReactNode;
  actions?: ReactNode;
}

export function FilterBar({
  search,
  filters,
  actions,
  className,
  ...props
}: FilterBarProps) {
  return (
    <div className={cn("lonaci-ui-filter-bar", className)} role="search" {...props}>
      <div className="lonaci-ui-filter-bar__controls">
        {search ? (
          <label className="lonaci-ui-search">
            <span className="lonaci-ui-sr-only">{search.label ?? "Rechercher"}</span>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder ?? "Rechercher…"}
              aria-label={search.label ?? "Rechercher"}
            />
          </label>
        ) : null}
        {filters}
      </div>
      {actions ? <div className="lonaci-ui-filter-bar__actions">{actions}</div> : null}
    </div>
  );
}
