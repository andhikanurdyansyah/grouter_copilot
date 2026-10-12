/**
 * gRouter Copilot — Enterprise Design Tokens
 * ==========================================
 * Single source of truth untuk warna, tipografi, spacing, radius, shadow,
 * motion, focus dan z-index widget Copilot. Selaras dengan server/public/assets/
 * grx.css (Enterprise Design System v2 — gunmetal steel + cyan #22d3ee).
 *
 * Struktur:
 *   default export  = dark theme (default produk, dark-only di grx.css)
 *   export `tokens` = { dark, light } untuk host yang butuh tema terang.
 *   export `themes` = komponen-style map per tema (bubble, panel, composer, ...)
 *
 * Semua nilai style adalah gaya React inline (camelCase) sehingga bisa
 * di-spread langsung ke prop `style`.
 */

const fontFamily =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const fontFamilyMono =
  "ui-monospace, 'SFMono-Regular', 'Fira Code', Menlo, Consolas, monospace";

/* ---------------------------------------------------------------- */
/* Raw palette (subset grx.css) + nilai turunan yang dihitung AA    */
/* ---------------------------------------------------------------- */

const paletteDark = {
  void: '#06080b',
  gun: '#0b0f14',
  steel1: '#11161d',
  steel2: '#1a212b',
  steel3: '#232c38',
  steelHi: '#33404f',
  ink: '#e8eef5',
  inkDim: '#93a1b1',
  // #5c6975 dari grx.css hanya 3.2:1 di atas steel-1 — dinaikkan ke #7c8b9b
  // agar fg.muted lolos WCAG AA (>= 4.5:1) di semua permukaan gelap.
  inkMuted: '#7c8b9b',
  cyan: '#22d3ee',
  cyanHi: '#67e8f9',
  cyanDim: '#0e7490',
  ok: '#34d399',
  warn: '#fbbf24',
  err: '#f87171',
  onAccent: '#04141a',
};

const paletteLight = {
  canvas: '#f5f8fa',
  surface: '#ffffff',
  surfaceAlt: '#eef2f6',
  sunken: '#e7edf2',
  ink: '#0f1720',
  inkDim: '#46586c',
  inkMuted: '#5b6b7c',
  cyan: '#22d3ee',
  cyanHi: '#0aa8c4',
  cyanDim: '#0e7490',
  ok: '#0d7a4f',
  warn: '#92510a',
  err: '#c02b2b',
  onAccent: '#04141a',
};

/* ---------------------------------------------------------------- */
/* Tokens                                                           */
/* ---------------------------------------------------------------- */

const dark = {
  color: {
    bg: {
      canvas: paletteDark.void, // latar paling dalam
      surface: paletteDark.steel1, // panel / kartu
      sunken: paletteDark.gun, // area input / well
    },
    fg: {
      primary: paletteDark.ink,
      secondary: paletteDark.inkDim,
      muted: paletteDark.inkMuted,
    },
    accent: {
      base: paletteDark.cyan,
      hover: paletteDark.cyanHi,
      active: paletteDark.cyanDim,
      soft: 'rgba(34, 211, 238, 0.14)',
      onAccent: paletteDark.onAccent,
      asText: paletteDark.cyan,
    },
    success: { base: paletteDark.ok, soft: 'rgba(52, 211, 153, 0.14)', asText: paletteDark.ok },
    warn: { base: paletteDark.warn, soft: 'rgba(251, 191, 36, 0.14)', asText: paletteDark.warn },
    danger: { base: paletteDark.err, soft: 'rgba(248, 113, 113, 0.16)', asText: paletteDark.err },
    border: {
      subtle: paletteDark.steel2,
      strong: paletteDark.steelHi,
    },
  },
  typography: {
    fontFamily,
    fontFamilyMono,
    size: { xs: 12, sm: 13, md: 14, lg: 16, xl: 20, xxl: 24 },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeight: { tight: 1.25, normal: 1.45, relaxed: 1.6 },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
  radius: { sm: 8, md: 12, lg: 16, full: 999 },
  shadow: {
    subtle: '0 1px 2px rgba(0, 0, 0, 0.4)',
    panel: '0 4px 16px -2px rgba(0, 0, 0, 0.5)',
    overlay: '0 12px 40px -8px rgba(0, 0, 0, 0.65)',
  },
  motion: {
    duration: { instant: 120, fast: 160, normal: 220, slow: 320 },
    easing: { standard: 'cubic-bezier(0.16, 1, 0.3, 1)', linear: 'linear' },
    reduced: 'prefers-reduced-motion: reduce',
  },
  focus: {
    ring: '0 0 0 2px rgba(6, 8, 11, 1), 0 0 0 4px rgba(34, 211, 238, 0.55)',
    ringColor: 'rgba(34, 211, 238, 0.55)',
    outlineColor: paletteDark.cyan,
  },
  zIndex: {
    bubble: 9999,
    panel: 10000,
    overlay: 10050,
    tooltip: 10100,
    toast: 10200,
  },
};

const light = {
  color: {
    bg: {
      canvas: paletteLight.canvas,
      surface: paletteLight.surface,
      sunken: paletteLight.sunken,
    },
    fg: {
      primary: paletteLight.ink,
      secondary: paletteLight.inkDim,
      muted: paletteLight.inkMuted,
    },
    accent: {
      base: paletteLight.cyan,
      hover: paletteLight.cyanHi,
      active: paletteLight.cyanDim,
      soft: 'rgba(14, 116, 144, 0.12)',
      onAccent: paletteLight.onAccent,
      asText: paletteLight.cyanDim,
    },
    success: { base: paletteLight.ok, soft: 'rgba(13, 122, 79, 0.12)', asText: paletteLight.ok },
    warn: { base: paletteLight.warn, soft: 'rgba(146, 81, 10, 0.12)', asText: paletteLight.warn },
    danger: { base: paletteLight.err, soft: 'rgba(192, 43, 43, 0.12)', asText: paletteLight.err },
    border: {
      subtle: paletteLight.surfaceAlt,
      strong: '#c6d2dc',
    },
  },
  typography: dark.typography,
  spacing: dark.spacing,
  radius: dark.radius,
  shadow: {
    subtle: '0 1px 2px rgba(15, 23, 32, 0.08)',
    panel: '0 4px 16px -2px rgba(15, 23, 32, 0.12)',
    overlay: '0 12px 40px -8px rgba(15, 23, 32, 0.24)',
  },
  motion: dark.motion,
  focus: {
    ring: '0 0 0 2px rgba(255, 255, 255, 1), 0 0 0 4px rgba(14, 116, 144, 0.55)',
    ringColor: 'rgba(14, 116, 144, 0.55)',
    outlineColor: paletteLight.cyanDim,
  },
  zIndex: dark.zIndex,
};

/* ---------------------------------------------------------------- */
/* Component-style map (React inline style objects)                 */
/* ---------------------------------------------------------------- */

function componentStyles(t) {
  const { color, typography: type, spacing, radius, shadow } = t;
  return {
    bubble: {
      position: 'fixed',
      width: 58,
      height: 58,
      borderRadius: radius.full,
      border: 'none',
      background: color.accent.base,
      color: color.accent.onAccent,
      fontSize: type.size.xl,
      fontWeight: type.weight.bold,
      boxShadow: shadow.overlay,
      cursor: 'grab',
      touchAction: 'none',
    },
    panel: {
      display: 'flex',
      flexDirection: 'column',
      width: 'min(360px, calc(100vw - 32px))',
      height: 'min(520px, calc(100vh - 48px))',
      background: color.bg.canvas,
      color: color.fg.primary,
      border: `1px solid ${color.border.strong}`,
      borderRadius: radius.lg,
      overflow: 'hidden',
      boxShadow: shadow.overlay,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flex: '0 0 auto',
      padding: `${spacing.md}px ${spacing.lg}px`,
      background: color.bg.surface,
      color: color.fg.primary,
      borderBottom: `1px solid ${color.border.subtle}`,
      fontWeight: type.weight.semibold,
      fontSize: type.size.md,
    },
    'message-user': {
      alignSelf: 'flex-end',
      maxWidth: '85%',
      padding: `${spacing.xs + 6}px ${spacing.md + 2}px`,
      background: color.accent.base,
      color: color.accent.onAccent,
      borderRadius: `${radius.md}px ${radius.md}px ${radius.sm}px ${radius.md}px`,
      fontSize: type.size.sm,
      lineHeight: type.lineHeight.normal,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
    'message-assistant': {
      alignSelf: 'flex-start',
      maxWidth: '85%',
      padding: `${spacing.xs + 6}px ${spacing.md + 2}px`,
      background: color.bg.surface,
      color: color.fg.primary,
      border: `1px solid ${color.border.subtle}`,
      borderRadius: `${radius.md}px ${radius.md}px ${radius.md}px ${radius.sm}px`,
      fontSize: type.size.sm,
      lineHeight: type.lineHeight.normal,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
    composer: {
      flex: '0 0 auto',
      display: 'flex',
      gap: spacing.sm,
      padding: spacing.sm,
      borderTop: `1px solid ${color.border.subtle}`,
      background: color.bg.surface,
    },
    'button-primary': {
      padding: `0 ${spacing.lg}px`,
      minWidth: 64,
      borderRadius: radius.sm,
      border: 'none',
      background: color.accent.base,
      color: color.accent.onAccent,
      fontWeight: type.weight.semibold,
      fontSize: type.size.sm,
      cursor: 'pointer',
    },
    'button-primary-hover': {
      background: color.accent.hover,
    },
    'button-primary-active': {
      background: color.accent.active,
    },
    'button-primary-disabled': {
      opacity: 0.55,
      cursor: 'not-allowed',
    },
    'button-ghost': {
      padding: `${spacing.xs}px ${spacing.sm}px`,
      borderRadius: radius.sm,
      border: `1px solid ${color.border.strong}`,
      background: 'transparent',
      color: color.fg.secondary,
      fontWeight: type.weight.medium,
      fontSize: type.size.sm,
      cursor: 'pointer',
    },
    'button-ghost-hover': {
      background: color.bg.sunken,
      color: color.fg.primary,
    },
    input: {
      flex: 1,
      resize: 'none',
      padding: `${spacing.sm}px ${spacing.md}px`,
      borderRadius: radius.sm,
      border: `1px solid ${color.border.strong}`,
      background: color.bg.sunken,
      color: color.fg.primary,
      fontFamily: type.fontFamily,
      fontSize: type.size.sm,
      lineHeight: type.lineHeight.normal,
    },
    'input-focus': {
      border: `1px solid ${color.accent.base}`,
      boxShadow: t.focus.ring,
      outline: 'none',
    },
    'input-placeholder': {
      color: color.fg.muted,
    },
    'approval-card': {
      maxWidth: '85%',
      marginTop: spacing.xs,
      padding: spacing.md,
      background: color.bg.surface,
      color: color.fg.primary,
      border: `1px solid ${color.accent.active}`,
      borderLeft: `3px solid ${color.accent.base}`,
      borderRadius: radius.md,
      fontSize: type.size.xs,
      lineHeight: type.lineHeight.normal,
    },
    'approval-card-actions': {
      display: 'flex',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    'suggestion-chip': {
      display: 'inline-flex',
      alignItems: 'center',
      padding: `${spacing.xs + 2}px ${spacing.md - 2}px`,
      borderRadius: radius.full,
      border: `1px solid ${color.border.strong}`,
      background: color.bg.sunken,
      color: color.fg.secondary,
      fontSize: type.size.xs,
      fontWeight: type.weight.medium,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    'suggestion-chip-hover': {
      borderColor: color.accent.base,
      color: color.fg.primary,
      background: color.accent.soft,
    },
  };
}

const componentStylesDark = componentStyles(dark);
const componentStylesLight = componentStyles(light);

/** Komponen-style map per tema: themes.dark.bubble, themes.light.panel, dst. */
export const themes = {
  dark: componentStylesDark,
  light: componentStylesLight,
};

/** Map tema lengkap (dark = default produk). */
export const tokens = { dark, light };

/** Token aktif bawaan — dark (Enterprise Design System v2 dark-only di grx.css). */
export default dark;
