---
version: alpha
name: Coditent candidate workspace
description: A calm career workspace for profile building, job discovery, applications, and conversations.
colors:
  candidate-background: "#f8f8f3"
  candidate-surface: "#fffefa"
  candidate-foreground: "#192b23"
  candidate-primary: "#194d38"
  candidate-accent: "#a25c38"
  candidate-border: "#cfdbcf"
typography:
  sans:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
  display:
    fontFamily: "Georgia, Times New Roman, serif"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
spacing:
  section-gap: "2.5rem"
  page-max: "72rem"
components:
  button: { }
  input: { }
  dialog: { }
  card: { }
---

# Coditent design direction

The candidate workspace should feel like a clear, well-organized career journal: calm white surfaces, forest green emphasis, warm editorial headings, and restrained line patterns. It serves candidates who need to maintain a profile, discover roles, follow applications, and respond to recruiters. Current UI copy is English; the target-market and localization policy are not established in this repository.

The **runtime source of truth** is `apps/web/src/app/globals.css`. Its semantic variables are mapped into Tailwind in `apps/web/tailwind.config.ts` and used by shared UI primitives. Candidate colors above describe the scoped `body:has(.candidate-theme)` values; other product areas still use the existing global theme. Screen-specific layout and decorative styling live in `apps/web/src/components/candidate/candidate-pages.module.css`. Change the runtime variables and this document together when making a durable palette decision.

Use Inter for controls and body copy. Georgia is the editorial display face for page and section headings; bounded sizes keep it readable at mobile widths. Maintain generous spacing between page sections, compact spacing inside forms, and a consistent content width. Surfaces use hairline green-gray borders and slight shadows; avoid heavy glass, gradients, repeated badge rows, and decorative cards without a task purpose. Keep icon actions paired with text where meaning is not obvious.

The candidate dashboard uses one dark hero with a subtle contour-line motif and closes with the wide career-journey illustration after application activity. The profile page uses one representative illustration to support the masthead; its quiet eight-second motion loops only while at least half of the artwork is visible, pauses offscreen or in a hidden tab, and remains static when reduced motion is preferred. The candidate message inbox uses a quiet branching botanical path artwork only behind its empty conversation panel, embedded as a subdued background so text remains primary. Other candidate views are primarily functional and should not repeat the same artwork. For similar future decorative visuals, preview imagegen concepts with the user before adding them to the product.

For interaction, use the existing `Button`, `Input`, `Select`, `Dialog`, `Sheet`, and toast components. Candidate pages share a 4.5rem sticky top navigation; desktop shows the five destinations in one row, while mobile uses a disclosure below the header. Brand actions are green; danger appears only for destructive confirmation. Hover changes should be small, with visible focus for keyboard users. Transitions use the runtime `--ease-standard` curve and the existing fast/normal/slow duration tokens; panel changes move and fade gently. Under reduced motion, candidate animations and smooth scrolling should stop. Lists and forms must recompose at narrow widths rather than scale down, and no page should create horizontal overflow.

Do preserve the established candidate palette and real product content. Do keep the profile editor in a top-tabbed, in-page flow. Do not use Oracle branding or copy in Coditent, or reproduce the layout/assets of any reference site.
