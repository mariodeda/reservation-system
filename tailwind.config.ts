import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--rs-${name}) / <alpha-value>)`;

/**
 * Ported verbatim from the Stitch design "Remix of Cancello dei Macci"
 * (project 4318036977659419823). Color names, spacing keys, border radii,
 * and the font-size tuples (size + lineHeight + letterSpacing + fontWeight)
 * match the Stitch tailwind.config exactly so every Stitch class works 1:1.
 *
 * fontFamily values reference the next/font CSS variables defined in layout.tsx:
 *   --font-playfair  -> Playfair Display (display / headline tokens)
 *   --font-montserrat -> Montserrat       (body / label tokens)
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        error: token("error"),
        "inverse-on-surface": "#313030",
        background: token("background"),
        "on-surface-variant": token("on-surface-variant"),
        "on-secondary": "#2f3131",
        "tertiary-fixed": "#dbe1ff",
        "surface-tint": token("surface-tint"),
        "on-tertiary-fixed": "#00174b",
        "tertiary-container": "#97b0ff",
        surface: token("surface"),
        "surface-bright": token("surface-bright"),
        outline: token("outline"),
        "primary-container": token("primary-container"),
        "on-error": "#690005",
        "surface-container-highest": token("surface-container-highest"),
        "on-surface": token("on-surface"),
        "surface-container-high": token("surface-container-high"),
        primary: token("primary"),
        "on-error-container": "#ffdad6",
        "inverse-surface": token("inverse-surface"),
        "on-primary-fixed-variant": "#574500",
        "on-secondary-fixed": "#1a1c1c",
        "secondary-fixed": "#e2e2e2",
        "inverse-primary": token("inverse-primary"),
        "secondary-fixed-dim": "#c6c6c7",
        "surface-dim": token("surface-dim"),
        "tertiary-fixed-dim": "#b4c5ff",
        "surface-container": token("surface-container"),
        secondary: "#c6c6c7",
        tertiary: "#bfcdff",
        "on-secondary-container": "#b4b5b5",
        "on-primary-container": token("on-primary-container"),
        "on-primary-fixed": "#241a00",
        "on-secondary-fixed-variant": "#454747",
        "secondary-container": "#454747",
        "error-container": "#93000a",
        "primary-fixed-dim": token("primary-fixed-dim"),
        "on-background": token("on-background"),
        "on-tertiary-fixed-variant": "#27438a",
        "surface-container-lowest": token("surface-container-lowest"),
        "outline-variant": token("outline-variant"),
        "on-tertiary": "#082b72",
        "primary-fixed": token("primary-fixed"),
        "surface-variant": token("surface-variant"),
        "on-primary": token("on-primary"),
        "surface-container-low": token("surface-container-low"),
        "on-tertiary-container": "#254188",
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
      spacing: {
        sm: "12px",
        lg: "48px",
        "margin-mobile": "20px",
        base: "8px",
        xs: "4px",
        xl: "80px",
        "margin-desktop": "64px",
        gutter: "24px",
        md: "24px",
      },
      fontFamily: {
        "headline-lg-mobile": ["var(--font-playfair)", "serif"],
        "body-lg": ["var(--font-montserrat)", "sans-serif"],
        "display-lg-mobile": ["var(--font-playfair)", "serif"],
        "label-md": ["var(--font-montserrat)", "sans-serif"],
        "label-lg": ["var(--font-montserrat)", "sans-serif"],
        "headline-md": ["var(--font-playfair)", "serif"],
        "body-md": ["var(--font-montserrat)", "sans-serif"],
        "headline-lg": ["var(--font-playfair)", "serif"],
        "display-lg": ["var(--font-playfair)", "serif"],
      },
      fontSize: {
        "headline-lg-mobile": ["32px", { lineHeight: "1.3", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "1.6", letterSpacing: "0.01em", fontWeight: "400" }],
        "display-lg-mobile": ["40px", { lineHeight: "1.2", fontWeight: "700" }],
        "label-md": ["12px", { lineHeight: "1.0", letterSpacing: "0.05em", fontWeight: "500" }],
        "label-lg": ["14px", { lineHeight: "1.0", letterSpacing: "0.1em", fontWeight: "600" }],
        "headline-md": ["32px", { lineHeight: "1.4", fontWeight: "500" }],
        "body-md": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "headline-lg": ["48px", { lineHeight: "1.2", fontWeight: "600" }],
        "display-lg": ["64px", { lineHeight: "1.1", letterSpacing: "0", fontWeight: "700" }],
      },
    },
  },
  plugins: [],
};

export default config;
