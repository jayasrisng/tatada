# Tatada ✶

**Plan the trip. Put the phone away. Live it.**

Tatada is a personal travel workspace for turning scattered plans, confirmations and preferences into a usable trip. Its chalkboard interface favors decisions and practical details over an endless destination feed. Carry the essentials offline or print them, then add your own memories afterward.

The core journey is **create a trip → review a day-by-day plan → save your choices → take the plan with you**. Closet planning, journals and keepsakes support that journey.

## Start here

- [Product purpose and beta scope](docs/product.md)
- [Development and repository map](docs/development.md)
- [Beta readiness, release and owner guide](docs/beta.md)

These are the maintained documents. Update them instead of creating another summary, audit or launch report. Historical notes and private evidence belong under ignored `.local/`.

## Run locally

Use Node 22.22+ (CI pins Node 24.19.0).

```sh
npm ci
npm run dev:frontend
```

This runs the browser-only sample. For connected development, see [development](docs/development.md); server credentials stay in a private `.env`.

```sh
npm run typecheck
npm run build
npm test
npm run test:e2e
```

## Wajo-first candidate

The mobile beta opens directly with trips, preferences and printer settings saved on the device. Profile connects Wajo for optional research and approved printing. No separate Tatada signup is needed. Physical output of the synthetic print test was confirmed by the owner. See [beta readiness](docs/beta.md).

## Deployed beta scope

The source implements a private beta for **one owner plus ten invited testers**, with password sign-in, authenticator protection, isolated workspaces and in-app feedback. Trip planning, confirmations, packing, PDF downloads, local encrypted documents and journal features exist. AI research needs a configured provider.

Payments, cloud document sync, public share links, Google connections and cloud-print delivery are outside this beta. Live Fo execution/calls remain restricted. Saved plans are not bookings; PDF exports are not boarding passes.

The latest local deployment evidence records source `b726273` on October 21, 2026. That record is not a fresh production-health check. See the [beta guide](docs/beta.md) for remaining acceptance work and evidence boundaries.

![Tatada itinerary planner](assets/screenshots/itinerary.png)

Map data: [OpenStreetMap / ODbL](https://www.openstreetmap.org/copyright), [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/). Weather: [Open-Meteo](https://open-meteo.com/). In-app policies contain further credits.
