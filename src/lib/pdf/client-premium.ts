import { PDF_COLORS } from "./tokens";

export const CLIENT_PDF_COLORS = PDF_COLORS;

export interface RasterPageSlice {
  start: number;
  end: number;
}

/**
 * Découpe une image verticale en pages en privilégiant les limites de blocs
 * fournies par le DOM. Une page reste suffisamment remplie pour éviter les
 * grandes zones blanches quand aucun point de coupure idéal n'existe.
 */
export function calculateRasterPageSlices(
  totalHeight: number,
  maximumSliceHeight: number,
  safeBreaks: readonly number[],
  minimumFillRatio = 0.68,
): RasterPageSlice[] {
  if (!Number.isFinite(totalHeight) || totalHeight <= 0) return [];
  if (!Number.isFinite(maximumSliceHeight) || maximumSliceHeight <= 0) {
    throw new Error("La hauteur de page doit être positive.");
  }

  const normalizedBreaks = [...new Set(safeBreaks)]
    .filter((value) => Number.isFinite(value) && value > 0 && value < totalHeight)
    .sort((left, right) => left - right);
  const slices: RasterPageSlice[] = [];
  let start = 0;

  while (start < totalHeight) {
    const idealEnd = Math.min(totalHeight, start + maximumSliceHeight);
    if (idealEnd === totalHeight) {
      slices.push({ start, end: totalHeight });
      break;
    }

    const minimumEnd = start + maximumSliceHeight * minimumFillRatio;
    const safeEnd = normalizedBreaks.reduce<number | null>(
      (candidate, value) => (value >= minimumEnd && value <= idealEnd ? value : candidate),
      null,
    );
    const end = safeEnd ?? idealEnd;
    slices.push({ start, end });
    start = end;
  }

  return slices;
}
