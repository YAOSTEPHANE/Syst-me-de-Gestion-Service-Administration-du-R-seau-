import { ChevronLeft, ChevronRight } from "lucide-react";

import { IconButton } from "@/components/lonaci/ui/button";
import { getPaginationItems } from "@/lib/ui/pagination";

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label?: string;
  siblingCount?: number;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  label = "Pagination",
  siblingCount = 1,
}: PaginationProps) {
  if (pageCount <= 1) return null;
  const current = Math.min(Math.max(page, 1), pageCount);
  const items = getPaginationItems(current, pageCount, siblingCount);

  return (
    <nav className="lonaci-ui-pagination" aria-label={label}>
      <IconButton
        icon={ChevronLeft}
        label="Page précédente"
        variant="secondary"
        onClick={() => onPageChange(current - 1)}
        disabled={current === 1}
      />
      <div className="lonaci-ui-pagination__pages">
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="lonaci-ui-pagination__ellipsis" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              type="button"
              key={item}
              className="lonaci-ui-pagination__page"
              aria-current={item === current ? "page" : undefined}
              aria-label={`Page ${item}`}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}
      </div>
      <IconButton
        icon={ChevronRight}
        label="Page suivante"
        variant="secondary"
        onClick={() => onPageChange(current + 1)}
        disabled={current === pageCount}
      />
    </nav>
  );
}
