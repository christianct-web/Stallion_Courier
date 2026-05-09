/**
 * Shared design tokens for courier module pages.
 * Mirrors the palette already used in DeclarationsList, Clients, etc.
 */
export const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6",
  paperMid: "#CCC7BE", ink: "#18150F", inkMid: "#3D3830", inkLight: "#6B6560",
  void: "#111318", voidMid: "#191D26", voidSurface: "#1F2430",
  voidBorder: "#2E3748", ghost: "#A0AABB", ghostDim: "#6B7585",
  green: "#1A5C3A", greenMid: "#2E7D52", greenLight: "#EBF5EE",
  warn: "#FEF3DC", warnBorder: "#D4A020", warnText: "#7A5000",
  critical: "#FEE8E8", critBorder: "#B02020",
  amber: "#C65911", amberLight: "#FDF2E5",
  blue: "#1E4A8C", blueLight: "#EEF2FA",
};

/** Style for the FREE / EXEMPT / 20% rate pill in line tables. */
export function ratePillStyle(exemption_class: string, duty_rate: number) {
  if (exemption_class === "full_exempt") {
    return { color: C.green, bg: C.greenLight, label: "EXEMPT" };
  }
  if (exemption_class === "duty_free_only") {
    return { color: C.blue, bg: C.blueLight, label: "FREE" };
  }
  if (duty_rate > 0) {
    return { color: C.amber, bg: C.amberLight, label: `${Math.round(duty_rate * 100)}%` };
  }
  return { color: C.inkLight, bg: C.paperAlt, label: "?" };
}

/** Format a TTD amount with thousands separators and 2 decimals. */
export function fmtTtd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a USD amount. */
export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
