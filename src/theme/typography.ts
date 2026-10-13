import type { TextStyle } from "react-native";

/**
 * One typographic scale for the entire app. Every screen uses these tokens
 * so that the user learns one hierarchy and it holds everywhere (DOET Ch. 7).
 *
 * Sizes are generous on purpose: users may have poor eyesight, be in bright
 * sunlight, or be holding the phone at arm's length while working.
 *
 * Rule of thumb baked into the numbers below:
 *   lineHeight >= fontSize * 1.4   (prevents crammed, unreadable lines)
 *   fontWeight >= '500'            (thin strokes vanish in sunlight)
 */
const s = (
  fontSize: number,
  lineHeight: number,
  fontWeight: NonNullable<TextStyle["fontWeight"]>,
  letterSpacing = 0,
): TextStyle => ({ fontSize, lineHeight, fontWeight, letterSpacing });

export const typography = {
  /** App title. Used once per screen at most. */
  display: s(34, 42, "900", 0.2),
  /** Screen titles. */
  h1: s(30, 38, "800", 0.2),
  /** Section headings. */
  h2: s(26, 34, "800", 0.1),
  /** Sub-section headings. */
  h3: s(22, 30, "700", 0),
  /** Default body text, button labels, tile titles. */
  body: s(20, 28, "500", 0),
  /** Emphasised body text. */
  bodyBold: s(20, 28, "700", 0),
  /** Form labels, taglines, secondary actions. */
  label: s(18, 26, "600", 0.1),
  /** Metadata, footer, timestamps. */
  caption: s(16, 22, "500", 0),
} as const;

export type TypographyToken = keyof typeof typography;
