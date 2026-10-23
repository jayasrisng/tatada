# Product purpose and scope

## Why Tatada exists

Travel planning scatters decisions across tabs, booking emails, maps, notes and calendars. Tatada brings that work into one personal workspace so a traveler can prepare, leave the screen and experience the place for themselves.

The product promise is **less planning overhead and less screen time during the trip**. The existing ambition of turning hours of research into about twenty minutes of decisions is a target, not a measured result.

The chalkboard identity, text-first recommendations, offline essentials and printable notebook all serve that purpose. Destination imagery should not spoil every view before arrival; the traveler's own photos belong in the journal afterward.

## Mobile beta interaction

The Wajo-first candidate is scoped to one phone per traveler. Overview and Itinerary use four compact tool popups. Your Space keeps Wajo, printer email, preferences, Vault and data transfer compact, with policy/tip/source links at the bottom. Printer defaults use four adjacent selects. The star guide is hands-on: it advances on a saved trip, journal photo, closet addition, dictation, profile save, vault unlock, document save and export/import. All steps can be skipped; no personal data or external action is supplied by the guide.

Saved itinerary stops are shared with booking categories rather than copied into reservations. Eat can request route-aware meal suggestions using dated stops, diet and personal needs; users explicitly save a choice back to the itinerary. Suggestions are not reservations or dietary guarantees.

Overview has an online map, confirmed saved-place pins, next-stop directions and opt-in location. Nearby searches support restrooms, fuel, water, pharmacies, nursing-room matches and cafés. Missing mapped facilities and unverified access are stated plainly. Map tiles are not included in offline packs; tile attribution remains visible. This is discovery and external directions, not turn-by-turn or trail navigation.

## First beta audience

Recommended starting cohort: ten invited travelers planning a real day trip or short break. Start with two testers before filling the cohort. This is a proposed testing focus, not evidence of validated demand.

A successful first session means the traveler can:

1. Enter destination, dates, origin, budget and relevant needs.
2. Review a realistic daily plan, its alternatives and supporting sources.
3. Save choices, add confirmations and prepare a packing/task list.
4. Reopen the saved trip and carry essentials offline or download a PDF.
5. Report friction without exposing private travel documents.

## Capability boundaries

| Area | Current implementation | Beta expectation |
| --- | --- | --- |
| Trips and itinerary | Intake, research, reviewed saves, revisions, arrangements, readiness | Primary journey; validate with real travelers |
| Accounts | Invite links, passwords, TOTP, independent workspaces, revocation | Owner-assisted private beta |
| Feedback | Tester submission and protected owner review | Use this as the issue intake channel |
| Offline and paper | Offline packs, calendar files, PDF downloads | Verify on actual target phones |
| Documents | Passphrase-encrypted device vault, separate backup | Clearly explain that files do not sync across devices |
| Closet and journal | Clothing import, outfit planning, photos and memories | Secondary; do not block the first trip |
| AI | Provider-backed planning/research; restricted Fo integration | Disclose sources, uncertainty and unavailable services |
| External actions | Several integration implementations exist | Google connections, cloud printing and unsafe Fo actions stay disabled |
| Payments and cloud documents | Feature flags disabled | Outside the beta |

## What to measure

Observe activation → first trip → reviewed saved plan → successful PDF/offline use. Record time to a usable plan, assistance needed, abandonment reason, bad recommendations and whether the traveler actually used the plan outside the app. Use consented observations and coarse counts; travel content is not analytics payload.

Proposed first-cohort acceptance: both initial testers complete that journey without intervention, reopen the correct saved data, and can recover from an unavailable provider. No unresolved data-loss, cross-account access or sign-in blocker. The owner reviews feedback before inviting the remaining testers.

Defer booking automation, payments, more providers and broad social features until this core journey proves useful.
