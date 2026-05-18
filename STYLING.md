# Claymores RFC — Styling Guide

## Two Visual Modes
1. **Website UI** — light theme (white background, dark text)
2. **Match Graphics / Posters** — dark theme (black background, white text)

Never mix these two modes.

---

## Brand Colors

| Token | Hex | Usage |
|---|---|---|
| Pink  | `#fd80b5` | CTAs, links, draws, primary accent |
| Steel Blue (Primary) | `#77c3ef` | Wins, secondary CTAs — use `#77c3ef`, NOT `#78c3ef` |
| Background | `#FFFFFF` | Page background |
| Primary Text | `#111111` | Headings, body |
| Secondary Text | `#555555` | Subtext, captions |
| Divider | `#EAEAEA` | Borders, separators |

> **Note:** `tailwind.config.js` defines `claymore-blue` as `#78c3ef` (one digit off). Always hardcode `#77c3ef` when color accuracy matters.

---

## Typography

- **Display / Headings:** `font-claymore` (VIKING-N.woff) — hero titles, section headings, match labels **only**
- **Body:** system-ui / Arial — never use `font-claymore` for paragraphs or UI text

```tsx
// Correct
<h1 className="font-claymore text-4xl">MATCHDAY</h1>
<p className="text-sm text-[#555555]">Body copy here</p>
```

---

## Buttons

All CTAs use Claymore blue. Pink is reserved for accents, eyebrows, and links — never for CTA fills.

| Type | Style |
|---|---|
| Primary CTA | `bg-[#77c3ef] text-white font-claymore rounded-md hover:bg-[#a0d5f5]` |
| Secondary CTA | `border border-[#77c3ef] text-[#77c3ef] hover:bg-[#77c3ef] hover:text-white` |
| Tertiary link | `text-[#fd80b5] hover:underline` |

---

## Links

- Default: `text-[#fd80b5]`
- Hover: `text-[#111111]` or `hover:underline`

---

## Cards

```css
background: #FFFFFF;
border: 1px solid #EAEAEA;
border-radius: 8px;
```

---

## Layout

- Max width: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Navbar height: `64px` — body has `padding-top: 64px` set globally in `globals.css`

---

## Utilities (globals.css)

- `.scrollbar-hide` — hides scrollbars cross-browser
- `.eapps-instagram-feed-posts-grid-load-more-container` — hides Elfsight "Load more" button

---

## Match Graphics (dark theme — social/posters only)

- Background: `#000000`
- Text: `#FFFFFF`
- Accent: `#fd80b5`
- Style: high contrast, black & white photography, large `font-claymore`, glow effects

---

## Brand Voice

Tone: confident, competitive, minimal

Examples: `MATCHDAY · FINAL SCORE · CLAYMORES RFC · MEN D3`
