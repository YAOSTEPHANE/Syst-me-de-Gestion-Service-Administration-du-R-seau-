export const PDF_COLORS = {
  orange: "#F97316",
  orangeDark: "#C2410C",
  orangeLight: "#FFF7ED",
  ink: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  surface: "#FFFFFF",
  surfaceMuted: "#F9FAFB",
  success: "#15803D",
  successLight: "#F0FDF4",
  warning: "#B45309",
  warningLight: "#FFFBEB",
  danger: "#B91C1C",
  dangerLight: "#FEF2F2",
  info: "#1D4ED8",
  infoLight: "#EFF6FF",
} as const;

export const PDF_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
} as const;

export const PDF_TYPOGRAPHY = {
  body: 9,
  small: 7.5,
  label: 8,
  section: 11,
  title: 18,
} as const;

export const PDF_PAGE = {
  margin: 48,
  headerHeight: 58,
  footerHeight: 34,
  topMargin: 86,
  bottomMargin: 58,
} as const;

/** Palette éditoriale premium (courriers, exports, fiches, contrats). */
export const PDF_PREMIUM = {
  navy: "#0B1220",
  navySoft: "#1E293B",
  ink: "#0F172A",
  inkSoft: "#334155",
  muted: "#64748B",
  mutedLight: "#94A3B8",
  gold: "#C9A227",
  goldSoft: "#FEF9E7",
  accent: PDF_COLORS.orange,
  accentDark: PDF_COLORS.orangeDark,
  accentSoft: "#FFF7ED",
  accentLine: "#FDBA74",
  border: "#E2E8F0",
  shadow: "#CBD5E1",
  card: "#F8FAFC",
  cardStroke: "#E2E8F0",
  white: "#FFFFFF",
  tableStripe: "#F1F5F9",
} as const;
