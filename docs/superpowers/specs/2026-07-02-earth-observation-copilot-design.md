# Earth Observation Copilot — Design Spec

**Date:** 2026-07-02
**Context:** NASA Space Apps hackathon-style sprint (days). North star: a demo that never breaks live and makes judges say "that's clever."
**Stack:** React (Vite) frontend + Node/Express backend + Anthropic Claude as the reasoning engine.

---

## 1. Concept

A natural-language interface to NASA Earth datasets. The user types a plain-English question about the planet; the app:

1. Figures out **what** phenomenon is being asked about and **where**.
2. Shows a real NASA satellite **map layer** for that region.
3. Computes a **pie chart of percentages** — the proportional breakdown of the region across severity bands (e.g., "32% severe drought, 41% moderate, 27% normal").
4. Has Claude **narrate the insight**, grounded in the real computed numbers.

**Differentiator:** the percentage breakdown. Most map tools show a heatmap and stop. We turn the picture into a quantified answer.

Example: *"Show areas in Africa experiencing severe drought."* → map flies to Africa with the drought layer, pie chart shows the severity split, Claude explains the trend.

---

## 2. Key technical decision — "whole world" that never breaks

For each phenomenon we store a **coarse global data grid** locally (~1° resolution, ~360×180 cells — a small JSON file). When the AI extracts a bounding box for **any** place on Earth, the backend computes band percentages over just those cells.

Benefits:
- Genuinely works **anywhere in the world**, not only pre-baked regions.
- Percentages come from **real pre-fetched NASA data** — no hallucination.
- Runs **instantly and offline** — nothing to break on stage.

The map imagery itself comes from **NASA GIBS** tile layers (live, free, reliable per-phenomenon satellite layers). Clean split of concerns:
- **GIBS tiles** → the beautiful map layer.
- **Local global grids** → the numeric percentage computation.

**Live bonus (stretch):** one live **NASA POWER** API call to prove live capability, since POWER is free, keyless, and reliable.

---

## 3. Experience — Hybrid split view

- **Left:** conversation (chat).
- **Right:** live canvas — a world map that flies to the region, with the pie chart and trend chart animating in beside it as Claude explains.

Judges watch a query become a map **and** a percentage breakdown **and** a narrated insight, all at once.

---

## 4. Architecture

```
React (Vite) frontend                 Node/Express backend
┌─────────────┬──────────────┐        ┌──────────────────────────┐
│  ChatPanel  │  MapCanvas    │        │ /api/query               │
│  (left)     │  (Leaflet +   │  ───▶  │  1. intentParser (Claude)│
│             │   NASA GIBS)  │        │  2. statsEngine (bbox →  │
│             │  PieBreakdown │        │     % bands from grid)   │
│             │  TrendChart   │  ◀───  │  3. narrator (Claude)    │
└─────────────┴──────────────┘        │  dataStore: global grids │
                                       │  (Anthropic key lives here)│
                                       └──────────────────────────┘
```

The Anthropic API key lives only in the backend and is never exposed to the browser.

---

## 5. Data flow (one query)

1. User types a question → `POST /api/query { text }`.
2. **Claude call #1 (intentParser)** returns structured params via tool use / structured output: `{ phenomenon, bbox, regionLabel, timeframe }`.
3. **statsEngine** loads that phenomenon's global grid, selects cells within the bbox, classifies each cell into severity bands, computes band percentages + mean/max.
4. **Claude call #2 (narrator)** writes a short explanation grounded in the computed numbers (factual, not invented).
5. Backend responds: `{ regionLabel, bbox, phenomenon, gibsLayerId, bands: [{ name, pct }], stats, explanation, timeframe }`.
6. Frontend: map flies to bbox and sets the GIBS layer; pie chart animates; explanation appears in chat.

---

## 6. Components (small, isolated, testable)

**Backend**
- `intentParser` — Claude structured call: free text → `{ phenomenon, bbox, regionLabel, timeframe }`.
- `dataStore` — loads the local global grids for each phenomenon.
- `statsEngine` — bbox + grid → severity bands + percentages + stats. **Credibility-critical; unit tested.**
- `narrator` — Claude call: computed numbers → short grounded explanation.
- `queryRoute` — orchestrates the above for `/api/query`.

**Frontend**
- `App` — split-view layout.
- `ChatPanel` — conversation input + message stream.
- `MapCanvas` — Leaflet map + NASA GIBS layer + fly-to.
- `PieBreakdown` — Recharts pie of severity bands (the differentiator).
- `TrendChart` — Recharts time series (stretch).
- `useQuery` — hook calling `/api/query`.

---

## 7. Phenomena & scope tiers

**Core (must-have, built end-to-end first):**
- **Drought** — precipitation anomaly / soil moisture.
- **Wildfires** — active fires (FIRMS / MODIS).
- **Air quality** — aerosol optical depth / NO₂.

**Stretch (mostly data + config once the engine works):**
- Vegetation / NDVI (greenness, deforestation).
- Land surface temperature (heatwaves, warming).
- Trend chart over time.
- One live NASA POWER call.
- Fly-to animation polish, suggestion chips.

Each phenomenon config: `{ id, label, gibsLayerId, gridFile, bands: [{ name, min, max, color }] }`.

---

## 8. Error handling

- Unsupported / unclear query → friendly reply + clickable suggestion chips.
- Empty bbox (no data cells) → auto-widen or explain.
- Any API failure or rate limit → graceful message + retry/backoff on the backend; the app never crashes on stage.

---

## 9. Testing

- **Unit tests on `statsEngine`** — known grid → known percentages. This is the number judges will trust.
- A handful of intent-parsing example checks (query → expected params).
- One end-to-end smoke test of `/api/query` (with a stubbed or recorded Claude response).

---

## 10. Biggest prep task (flagged)

Sourcing and pre-processing the global grids for the core phenomena (drought, wildfires, air quality) into clean JSON. Sources are free but each needs a small fetch + downsample script. This is the first implementation step, before UI work.

---

## Out of scope (YAGNI)

- User accounts / auth.
- Persistence / databases.
- Arbitrary dataset ingestion beyond the configured phenomena.
- Mobile-specific layouts.
