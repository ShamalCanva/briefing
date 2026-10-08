# Brief

A personal daily briefing page in the spirit of Dia's morning brief: one dated, artwork-led page that pulls Slack, Gmail, Google Calendar, Google Drive, GitHub and Figma together and says what matters today. Australia/Sydney time throughout.

## What's here

`index.html` is the working prototype with clearly labelled sample data. Open it in any browser; no build step, no server. It is also published as a private Claude artifact so you can open it from the gallery or share it later.

`ARCHITECTURE.md` explains how the deployed version gets live data: the OAuth apps and read-only scopes per service, the backend, the weekday 06:30 scheduler, the approval gate for anything that writes, and the phases to get there.

`contract/briefing.schema.json` is the data contract. The page renders a document of this shape; the backend must produce one.

`server/` is a TypeScript skeleton of that backend (Hono): routes, connector interface with scopes, the collect → synthesise → validate pipeline, token encryption, and the approval-gated action endpoints. The connector `collect()` bodies are stubs with the API calls named in comments.

## Previewing the prototype

Double-click `index.html`, or from this folder run `python3 -m http.server 8000` and open http://localhost:8000. Try: tick a to-do (saved in your browser only), select each meeting, press "Generate fuller prep notes", "Copy draft", and "Refresh" (which re-stamps the generation time and reminds you no live sources are connected).

## Switching to live data

In `index.html`, set `BRIEF_CONFIG.endpoint` to `/api/brief` and serve the page from the backend. The sample data is then never used. The "Sample data" badge disappears automatically when the backend returns `sample: false`.

## Ground rules baked into the design

Commitments (things you said you'd do, quoted) are visually distinct from suggestions. Items already completed or duplicated across sources are left out and listed under "items left out" so the filtering is visible. Disconnected or failed sources are stated, not papered over. Retrieved content is summarised, never obeyed. Credentials live only on the server. Nothing is sent or changed in any service without an explicit confirmation step on the page, and Phase 1 has no write scopes at all.
