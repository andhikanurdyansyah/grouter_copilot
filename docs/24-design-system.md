# gRouter Copilot — Enterprise Design System

Adapted from gRouter `DESIGN.md` (cyberpunk metallic) for visual parity across the Copilot product.

## Locked tokens

| Token | Hex | Role |
|---|---|---|
| `--grx-void` | `#07090d` | deepest bg |
| `--grx-gun` | `#0d1117` | field well / surface |
| `--grx-steel-1` | `#1a2029` | card base |
| `--grx-steel-2` | `#2a323d` | card base light |
| `--grx-steel-hi` | `#3d4855` | raised edge |
| `--grx-cyan` | `#22d3ee` | PRIMARY accent (locked) |
| `--grx-magenta` | `#e64980` | secondary (sparse) |
| `--grx-ink` | `#e6edf3` | body text |
| `--grx-ink-dim` | `#8b98a5` | muted text |
| `--grx-ink-faint` | `#5a6672` | faint labels |

## Rules (locked)

1. **One accent:** cyan `#22d3ee` primary everywhere. Magenta sparse, never a second CTA.
2. **Dark-only.** No section inverts. No pure `#000`/`#fff`.
3. **Radius:** 10px cards/inputs, pills full.
4. **No AI-slop:** no gradient text (except `chrome-text` brand), no flat neon halos, no perpetual decorative animation, no em-dash, no fake numbers.
5. **Real data only.**
6. **Icons:** SVG (Material Symbols / Google), consistent 16–18px.
7. **A11y:** WCAG AA, 44px+ touch targets, visible focus, `prefers-reduced-motion`.

## Reusable classes (`/assets/grx.css`)

- `.grx-surface` — ambient bg + grid overlay.
- `.metal-panel` — brushed steel card (gradient + hairline + inset highlight).
- `.card-lift` — hover lift.
- `.chrome-text` — metallic gradient brand text.
- `.hud-brackets` — HUD corner brackets.
- `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-danger` / `.btn-google`.
- `.field` — gunmetal input well, cyan focus ring.
- `.badge` (active/revoked/expired/cyan) + `.chip-*`.
- `.mono-label`, `.mono`, `.divider`, `.empty`, `.modal`.

## Pages on this theme

| Route | File | Role |
|---|---|---|
| `/landing` | `public/landing.html` | marketing landing (copilot.grouter.id) |
| `/register` + `/login` | `public/register.html` | auth (Google OAuth + email) |
| `/user` | `public/user-dashboard.html` | customer dashboard |
| `/` | `public/dashboard.html` | admin console |

## Premium design principles applied

- **Chrome/metallic brand text** for hero headline (single usage, not spam).
- **Terminal card** with syntax-highlighted install flow (real commands, not fake screenshot).
- **Brushed steel panels** with inset highlight + hairline cyan border.
- **HUD grid background** masked to top (subtle, not busy).
- **Google OAuth button** with official multi-color G.
- **Restrained motion** — card lift + button hover only, all gated by `prefers-reduced-motion`.
- **Enterprise hierarchy** — mono-label eyebrows, Space Grotesk display, DM Sans body, Fira Code mono.
