# Coditent illustration atlas

Review the [gallery](index.html) or the single [contact sheet](contact-sheet.svg). The gallery covers all 47 current `apps/web/src/app/**/page.tsx` routes. Every page has a distinct illustration composition and a short explanation in [manifest.json](manifest.json).

The artwork explores a shared language: warm white, forest green, sage, terracotta and ochre; small human figures, plants, profile and opportunity objects, and fine original contour lines. The Oracle screenshot supplied by the user informed the *idea* of a topographic background. No Oracle or Simplify asset was copied or imported.

The 47 editable route SVGs are in [`svg/`](svg/). Four smaller [`figma-import-*.svg`](figma-import-1.svg) sheets divide the atlas into importable groups of 12.

## Higgsfield picture direction

The user prefers Higgsfield-generated pictures for the eventual site. The generated studies are:

- [Career network](higgsfield-career-network.png) — people and networked profiles beneath a tree.
- [Opportunity horizon](higgsfield-offers.png) — people following a winding career path.
- [Open threshold](higgsfield-login.png) — people meeting under an organic arch.

The latter two contain baked-in headings, so they are moodboard studies, not production-ready UI assets. When implementation starts, generate text-free final pictures for the selected placements and keep real headings in accessible HTML. Do not start further Higgsfield generations during this design-only phase. As checked on 2026-09-16, 7.55 image credits remained, and the separate free video generation counters were untouched.

The [Figma review file](https://www.figma.com/design/erGQi7i5v5hhyGCre1YI9a) contains the first four editable public-page concepts. The connected Figma Starter plan reached its MCP call limit before the remaining pages could be added. Import the four `figma-import-*.svg` sheets into that file when Figma access is available, or use the standalone SVGs to refine one page at a time.

These are illustration concepts, not approved page layouts or production assets. Before implementation, review them alongside the latest site pages, select the strongest direction, and place artwork only where it supports the task on that page. Keep authenticated screens especially restrained so decorative art does not compete with real data.

Regenerate and validate route coverage with:

```bash
python3 design/illustration-atlas/generate.py
```
