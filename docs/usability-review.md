# Tatada usability review — October 18, 2026

The strongest direction is the one-page journey: a clear next step, quiet details, and an assistant already in the right trip. The rest of the app should follow that pattern: one main action, familiar labels, and extra detail available when needed.

## Scope and evidence

Reviewed all nine main screen modules and their primary subviews: Home/trip mode, Trips/history, Tasks, Style, profile/onboarding, new trip, trip planner, Notebook, Journal and Print. Browser checks cover 11 routes at 320, 390 and 1280 pixels, in explicitly verified light and dark modes (66 route combinations, plus six focused trip-mode checks). Checks include page overflow, React/runtime errors and key navigation. Account/provider APIs are isolated fixtures; this is not a certification of live booking, payment or printer fulfillment. Existing tests cover Fo parsing, document encryption, import/export, print authorization and duplicate protection.

## Improvements implemented

| Area | Problem | Change |
| --- | --- | --- |
| Trip mode | Numbered steps stay fully expanded after completion. | Real checkboxes replace the numbers. Completion folds that stage and highlights the next unfinished one. Reopen details without undoing; uncheck to resume. Progress is trip-scoped, persists after reload and in private backups, and is excluded from friend snapshots. |
| Profile | Returning travelers see the introduction and onboarding again, mixed with data and integrations. | A concise personal overview, Edit details, and three clearly separated disclosures: Your data, Connections, Travel documents. New-user onboarding remains intact. Editing now has Back controls and an explicit Save details label. |
| Trip planner | A dinner-focused demo time-travel selector repeats information and looks like a product control. | One next checklist action, pending count and contextual Fo icon. Removed the selector. Saved arrangements are labeled accurately; a missing budget no longer appears as $0. |
| Style | “Swipe,” “mix,” “board,” and changing labels obscure the destination of each action. | Outfits, Mix & match, Closet, Day plan, Packing. Saving a look is labeled Save outfit; packing links say where they go. Import controls appear where clothes are added. The Today/trip choice precedes the chat. |
| Today/discovery | Outfit advice takes space inside nearby search even when someone wants places or events. | Outfit advice is available under a clear disclosure. The dedicated Style page keeps the outfit chat visible. Shortened explanatory text without changing what is sent to AI. |
| Tasks | Every row repeats the trip name already selected above it. | Removed repetitive labels while preserving scope, priority and completion behavior. |
| Trips | Sharing controls lead the page and date groups can become stale across midnight. | Sharing is tucked under “Have a friend’s trip?” and date grouping refreshes with the local day. |
| New trip | A second research form appears as soon as the user types, competing with Fo and trip details. | Optional idea comparison sits under one disclosure. |
| Dates | Machine-style dates in saved travel details take longer to scan. | Human-readable calendar dates, without shifting saved dates into a different time zone. Invalid/missing data is not invented. |
| Sharing | A long privacy paragraph precedes the action. | Short purpose, a concise privacy note, then the existing preview and optional journal notes. |
| Event results | Source coverage uses a details element inside a paragraph. | Corrected markup nesting to avoid React/browser inconsistencies. |

## Follow-through implemented

- Style, Tasks and the magic sheet now share the same Today / trip chips. Trip mode keeps its active destination. Style's microphone and magic submit icon sit inside the composer; the repeated Claude explanation is removed. Trips remains unchanged in this pass.
- Saved flights, stays, transport, meals and activities can be added, corrected or removed with undo. Editors are available inside Notebook categories, the planner and the home journey. Dates and contact details are validated; booking references remain outside default assistant context. Saving a record does not make a reservation. Primary stay addresses and flight arrival details feed the trip overview.
- Journal moments support text/date/place corrections and delete-with-undo. Existing photos and illustrations survive edits, undo, private backup and reload.
- Packing uses the managed PDF preview, saved printer preference and duplicate protections. It includes packing tasks and garments from saved outfits, without unrelated flight/hotel records. A fresh print action is still required; simply revisiting a URL cannot resend a job.

Verification: 80 app tests and 111 server tests, production build, isolated editing/reload regression, presentation and managed-print regressions, and 72 screen/size/theme layout checks. The generated packing PDF was extracted and visually reviewed. Browser provider APIs and print delivery were isolated fixtures; no real messages, reservations or printer emails were sent.

## Remaining practical priorities

1. Connect Gmail app credentials and finish account consent for actual Epson email delivery. See gmail-print-setup.md. A saved printer address alone cannot deliver an attachment.
2. Turn Fo suggestions into reviewed edits to these same travel records; distinguish suggestions from confirmed reservations. Live fares, availability, check-in and flight changes still require travel-provider integrations.
3. Improve journal storage visibility and sync status. Photo storage remains bounded; device tests should exercise offline use, resume, camera formats and microphone permissions.
4. Expand detailed area-map coverage beyond LA and Yosemite and make event-source coverage/freshness clear for each destination.

Keep refining the quiet map, readable typography, few primary controls and flight-first journey through actual trip use.
