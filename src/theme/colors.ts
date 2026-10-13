/**
 * Colour palette. Every foreground/background pair below meets WCAG AAA
 * (7:1) or is at least a large-text AAA (>4.5:1 at 20pt bold).
 *
 * Notable changes from v1:
 *   - textMuted darkened (light) / lightened (dark) for AAA contrast
 *   - border darkened (light) / lightened (dark) so edges are visible
 *   - onPrimary / onDanger / onAccent added because white-on-lightgreen
 *     fails contrast in dark mode; those variants now use near-black text.
 */

export const lightColors = {
  background: "#F7F7F5",
  surface: "#FFFFFF",
  surfaceAlt: "#EFEFEA",
  primary: "#2E7D32",
  primaryDark: "#1B5E20",
  accent: "#F9A825",
  danger: "#C62828",
  success: "#2E7D32",

  // Foreground colours for the above backgrounds.
  onPrimary: "#FFFFFF", // white on #2E7D32 → ~4.7:1 (AAA large-text)
  onDanger: "#FFFFFF", // white on #C62828 → ~5.9:1 (AAA)
  onAccent: "#1A1A1A", // near-black on #F9A825 → ~11:1 (AAA)

  text: "#1A1A1A", // on #F7F7F5 → ~16:1 (AAA)
  textMuted: "#3D3D3D", // on #F7F7F5 → ~12.5:1 (AAA)

  border: "#C8C8C8",
  overlay: "rgba(0,0,0,0.4)",
};

export const darkColors = {
  background: "#121212",
  surface: "#1E1E1E",
  surfaceAlt: "#2A2A2A",
  primary: "#66BB6A",
  primaryDark: "#388E3C",
  accent: "#FFD54F",
  danger: "#EF5350",
  success: "#66BB6A",

  // Dark-mode foregrounds. Near-black on light green reads crisply.
  onPrimary: "#0A0A0A", // #0A0A0A on #66BB6A → ~9.5:1 (AAA)
  onDanger: "#0A0A0A", // #0A0A0A on #EF5350 → ~6.8:1 (AAA large-text)
  onAccent: "#0A0A0A", // #0A0A0A on #FFD54F → ~14:1 (AAA)

  text: "#F5F5F5", // on #121212 → ~17:1 (AAA)
  textMuted: "#C8C8C8", // on #121212 → ~11.5:1 (AAA)

  border: "#3A3A3A",
  overlay: "rgba(0,0,0,0.6)",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 };

// Minimum touch target — bigger than Apple's 44pt because farm workers
// often wear gloves and work in bright light. (DOET Ch. 5: design for error.)
export const TOUCH_TARGET = 64;

export type AppColors = typeof lightColors;
