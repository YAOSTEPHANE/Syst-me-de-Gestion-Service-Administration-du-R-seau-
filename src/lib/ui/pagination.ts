export type PaginationItem = number | "ellipsis";

export function getPaginationItems(
  page: number,
  pageCount: number,
  siblingCount = 1,
): PaginationItem[] {
  if (pageCount <= 0) return [];

  const current = Math.min(Math.max(1, page), pageCount);
  const visible = new Set<number>([1, pageCount]);

  for (let candidate = current - siblingCount; candidate <= current + siblingCount; candidate += 1) {
    if (candidate >= 1 && candidate <= pageCount) visible.add(candidate);
  }

  const sorted = [...visible].sort((left, right) => left - right);
  const items: PaginationItem[] = [];

  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > 1) items.push("ellipsis");
    items.push(value);
  });

  return items;
}
