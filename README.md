# Tatada ✶

**Pronounced “Ta-tuh-duh”**—the feeling of a little magic falling into place.

**Plan the trip. Put the phone away. Live it.**

## Problem

Travel planning eats the time you wanted to spend traveling. Flights in twenty tab. hotels in another 20. Restaurants in another. Dietary needs, budgets, calendars, packing lists and confirmations scattered everywhere.

Expedia Group’s research found travelers spent **303 minutes researching travel content across the 45 days before booking**. Tatada brings the moving parts of travel into one personal workspace. [Research](https://www.expedia.com/newsroom/eg-path-to-purchase-research/)

## TL;DR

**Your whole trip, from the first “what if?” to the memories you bring home—with less screen time in between.**

When you think “trip,” you think:

1. **Getting there:** flights, transport and confirmations.
2. **Being there:** a place to stay, good food, things to do and a plan that fits you.
3. **Getting ready:** budget, documents, outfits and packing.
4. **Keeping it together:** tasks, calendars, offline essentials and sharing the plan.
5. **Remembering it:** little notes, photos, journals and printed keepsakes.

That is Tatada’s canvas. Bring your details, say what matters and start planning immediately. Fo chat and calls, sourced research and a day-by-day itinerary help turn the pieces into choices you can act on.

### A blackboard for planning. The real world for wonder.

We’re building for **digital detox**: enough time on your phone to get ready, then permission to put it away. Tatada’s chalkboard gives you useful words, choices and logistics instead of an endless feed of destination photos.

**Leave a few surprises unopened.** Know how to get there and what you need, without seeing every view before you arrive. Let the first sight of a place happen when you’re standing in it. Your own photos belong in the journal afterward.

## What we solve

**The ambition: turn four–five hours of trip planning into 20 minutes of decisions.** That is our product target; traveler timing studies are still ahead.

Start with what Tatada already knows: your dates, home airport, budget, interests, food preferences and saved travel details. Speak or type what you want. Build a plan for Sunday, Monday, Tuesday—and every day you’re away.

- **Choose your days.** Review a complete itinerary, compare alternatives for meals and activities, and save your picks together.
- **Find your fit.** Ask for vegetarian restaurants, a slower pace or places near your stay. Source links explain recommendations; ratings and distances appear only when sourced.
- **Choose a flight.** Research route options or check configured fare inventory, then add your choice to the itinerary. A saved option becomes a reservation only after booking with the provider.
- **Talk to Fo.** Chat or call from the app. Fo chat can use your saved trip and food preferences. The current phone connection does not automatically write a call’s choices back into Tatada; the itinerary builder handles reviewed saves today.
- **Carry one plan.** Export chosen stops to Google Calendar, download offline essentials, save confirmations and share a filtered itinerary.
- **Pack and remember.** Plan outfits from your own closet, make a packing list, keep a journal and print the memories.

Open **Trips → choose a trip → Itinerary** to see or build its days, packing and good-to-know notes. New trips open there automatically. For a day trip, choose **plan a day trip**; the SF → Yosemite example includes both drives and a home-by time. Use **something changed** to review a revised remaining plan.

Less searching. Fewer repeated decisions. More time outside.

## Inside Tatada

The app in a phone-sized viewport, shown one screen at a time. These sample trips demonstrate the interface; they are not live bookings.

### Your world

![Tatada home](assets/screenshots/home.png)

### Your day-by-day itinerary

![Tatada itinerary planner](assets/screenshots/itinerary.png)

### Your trip notebook

![Tatada trip notebook](assets/screenshots/notebook.png)

### Your closet

![Tatada closet and outfit planning](assets/screenshots/closet.png)

### Your travel journal

![Tatada travel journal](assets/screenshots/journal.png)

## Connect your accounts

**Fo:** the operator configures private Wajo credentials on the backend. Open **Profile → Connections** to check the connection. Fo chat shares the trip context you enable; calls use Wajo’s microphone/audio service.

**Wajo-connected services:** Fo chat can delegate supported calls, email and calendar requests to the services already connected in your Wajo account. History → “Load history from my Wajo account” opens provider conversations; “Refresh transcript from Wajo” retrieves current messages and recorded activity. Continuing a conversation reuses its Wajo conversation ID. Availability, timing and whether a channel appears in Wajo’s own UI are provider-controlled; Tatada does not fabricate a call or reservation confirmation.

**PDF attachments:** The currently exposed `ask_fo` schema accepts text and conversation controls, not PDF/file attachments. Printing therefore uses the direct Gmail PDF-attachment service. Connect Gmail once for that route; it is not required for ordinary email/calendar requests delegated through Fo.

**Google:** configure a Google Cloud Web application OAuth client, enable Gmail and Calendar APIs, and register the exact backend callback. Keep `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` private. Add your intended Google account as a test user while the OAuth app is in Testing.

Connect Gmail and Calendar separately in **Profile → Connections**. Gmail authorizes PDF print emails. Calendar authorizes app-created calendars with `calendar.app.created`. Review the event preview before adding anything. Calendar exports are one-way copies; Apple Calendar and Outlook can use the `.ics` download.

## Privacy, security and terms

**Keep private things close. Share only what a feature needs.**

- Passport and visa files stay in a **passphrase-encrypted on-device vault**, with separate encrypted backups. Original confirmations also have encrypted device storage.
- Clothing segmentation runs **in your browser** after the model downloads. Offline trip packs keep selected essentials available on the device.
- Connected workspaces also save data on the backend. Google tokens are encrypted server-side; API keys and OAuth secrets stay out of the frontend and Git.
- Itinerary research sends the displayed planning context to Anthropic. Fo requests go to Wajo. Browser dictation may use the browser’s speech service. AI and calls are not entirely on-device.
- You review plans, calendar additions and printing. Trip/account deletion requires confirmation. Exports, external calendar copies and provider records have separate retention.

Read **Terms & conditions** and **Privacy** in the app. AI suggestions need your judgment; prices, availability and opening hours can change. Upload content you have permission to use. Before public launch, operator identity, support/privacy contact and retention periods still need to be finalized.

## Repository

`src/` contains the app; `server/` the private API and integrations; `shared/` shared validation; `supabase/` hosted backend setup; `public/` app assets; `assets/screenshots/` README images; `scripts/` launch/build support.

Private review notes, runbooks and test tooling are ignored and archived locally. Previously committed copies remain in earlier Git history.

Map data: [OpenStreetMap / ODbL](https://www.openstreetmap.org/copyright), [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/). Weather: [Open-Meteo](https://open-meteo.com/).

## Current hosting and running the app

**Tatada currently runs as a connected, locally hosted prototype.** The working preview is `http://127.0.0.1:5180/`. Fo, Gmail and Google Calendar have been connected on the owner's local runtime. This does not certify an equivalent deployed website or transfer those sessions through a Git push.

Use Node 22.22+ and npm. Install dependencies, copy `.env.example` to the ignored `.env`, then supply your own authorized server credentials. `WAJO_FO_API_KEY` is required for the connected personal launcher; `CLAUDE_API_KEY` or `ANTHROPIC_API_KEY` enables research. Google integration additionally needs the OAuth setup above.

```bash
npm ci
cp .env.example .env
# Fill the private .env; never commit it.
TATADA_DEV_PORT=5180 npm run dev:offline
```

The launcher builds the frontend and starts a live backend bound to loopback. Stop the previous launcher before reusing the same port or private data store. `npm run dev` provides frontend hot reload; use the built `dev:offline` preview for cold offline downloads. Keep the computer awake while demonstrating.

```bash
npm run typecheck
npm run build
# Optional browser-only development, without connected backend behavior:
npm run dev:frontend
```

Type checking and the production build are available in this repository. Private test tooling and owner runbooks stay outside the public snapshot.

**Website deployment is a separate step.** GitHub Pages can serve the frontend; it cannot run the private Node backend or use server secrets. The hosted adapter uses per-user Wajo OAuth. Local API-key mode remains localhost-only. A newly authorized OAuth connection takes precedence over the local key, and disconnect disables the key fallback. The developer launcher also supports `TATADA_WAJO_LOGIN=1 npm run dev` for per-user OAuth without requiring an owner key. The same existing Google OAuth client can be reused with its production callback configured, but local connected sessions are not automatically migrated.

For the retained hosted shape, configure the backend's persistent store, stable sealing secret, public origin and provider secrets; add `https://<project>.supabase.co/functions/v1/tatada-api/api/gmail/callback` to the Google client. Gmail and Calendar share that callback with separate bound state. Keep `http://127.0.0.1:5180/api/gmail/callback` for this local preview. Connect the intended accounts on the hosted runtime and verify its end-to-end behavior before claiming readiness. Wajo may return an opaque token without a stable user ID: fresh browsers then get isolated workspaces, while authenticated reconnects keep the existing workspace. Hosted Tatada sessions persist in browser storage until sign-out or server expiry; Wajo and Google tokens stay sealed on the backend. Signing in on another device cannot automatically recover an opaque-identity workspace without an additional stable account/recovery mechanism.

```bash
# Only after the intended hosted API and account configuration are verified:
VITE_ENABLE_BACKEND=true npm run build:website
```

Publish only the reviewed frontend output. Never publish `.env`, `.data`, private archives, API keys, OAuth tokens, passport files or personal confirmation documents. The current localhost demo can be used now; a public deployment with the same connected behavior has not yet been certified.
