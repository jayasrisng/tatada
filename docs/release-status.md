# Local integrated build — 2026-10-18

## Verified

- Authenticated Wajo tools/list with the configured key; new localhost preview reports provider=live, state=connected. Old running user servers were left untouched.
- Claude model discovery and one real Messages/web-search request returned an actual citation to an official Paris museum source. No personal profile or document was included.
- 167 automated tests (71 workspace/privacy/sharing tests, 96 server tests); production build and diff whitespace check pass.
- Phone-sized browser tests: both map themes, zoom/reset, no automatic location star, no duplicate Home shortcuts, priority without execution, live-only Fo controls, flights-only family trip, encrypted vault upload/lock/unlock and explicit field selection, IndexedDB namespace/conflict handling, mixed photo metadata/GPS imports, clothing failure recovery, country editing/reload, closet/backup restoration and journal preservation. Backend actions were intercepted in UI fixtures; no real provider action was executed by these tests.

## Ready to review locally

- Home and custom map: http://127.0.0.1:5180/
- Internal brand reference: docs/brand-kit.md (no in-app brand page).
- Default presentation profile: LA and Yosemite upcoming; Mexico City, Paris, Vijayawada, Nairobi, Rio and Sydney past, with location-only history and journal examples.
- Profile: multiple home bases, optional needs and membership labels; private document vault.
- Trip creation: free-form dream, optional voice, relevant planning categories and user-entered details.
- Research: source citations, checked dates, broader worldwide requests, saved trip briefings and backup portability.
- Sharing: reviewed read-only files, explicit journal-note inclusion, independent recipient copies.

## Actual boundaries

- Call Fo is user-triggered. The Wajo widget contract supplies structuredContent.joinUrl; Tatada opens only a recognized Wajo call URL. A real start_fo_call request and the local POST /api/fo/voice route returned a recognized HTTPS Wajo joinUrl on Oct 18 (HTTP 200, one valid link). No microphone/audio connection has been tested; the button opens the provider session and retains a fallback link.
- Fo can accept text requests. Its tool schema supplies no attachment argument or verified sender-account discovery, so real Epson attachment delivery remains blocked. Existing preparation, preview, approval binding and duplicate prevention remain available; no print job was sent.
- Membership labels and document program details do not connect loyalty accounts. Live inventory, reward redemption, payments and insurance transactions require actual provider access and fresh approval.
- Private documents are encrypted locally and manually reviewed. No automatic OCR, remote document upload, or cross-device document synchronization is implemented. A separate encrypted backup and the passphrase are required for recovery.
- Sharing files is not a hosted revocable link or collaborative editing.
- New research/local startup changes are not configured or deployed to the public hosted backend. This is a personal localhost runtime; a shared API key is never exposed as a public multi-user identity.
- No commits were pushed and no hosted application was published by this pass.

## Review polish

- Priority tasks precede other tasks across phases and trip status.
- Ordinary Fo conversation sends with one explicit tap; action requests retain category-specific review and server approval binding.
- Brief skippable Home arrival, country invitations, explicit Today ink/surface colors.
- Presentation trips live in the requested default local account, replacing seeded Lisbon, Big Sur and Kyoto. Profile/closet retained; rollback snapshots are private under .data/presentation-backups. Sample content is marked in the profile/trip UI.

## Presentation iteration

- Trip mode zooms to the known city point (or country) and scopes Trips, Tasks, Style and Magic.
- Everyday vs per-trip tasks, top-right profile close, brief onboarding manifesto, varied Home greetings.
- Destination briefings load automatically and save to trips. Live LA and Yosemite source-linked briefings were prepared.
- Today styling sends closet metadata and reviewed plans to Claude with no web-search tool, images, documents or full profile. Real response checked against an owned-piece name. Laundry and weather are not inferred.
- Backend assessment: docs/backend-review.md. Hosted deployment is unchanged.

## Focused trip and print iteration

- Removed presentation labels from the customer-facing trip/home/history UI; fixture provenance stays in data. Past trips have flight, stay/family accommodation, transfer, meal, itinerary, checklist and journal examples. No real reservation codes or provider outcomes were invented.
- Trip mode changes the entire shell and uses three primary navigation controls, with a text-based trip menu. The chosen trip is retained within the account's browser session.
- Custom local area maps use bundled, attributed street/water geometry for downtown LA and Yosemite Valley, centered on known coordinates. They do not require a runtime map-provider key. Other destinations still need broader detailed-map coverage.
- Saved the user-provided Epson address privately in the local owner's printer profile. Direct-print preference persists; first-time printer setup remains available to new accounts.
- A one-use session intent binds a Print gesture to its trip, document and request. Refreshes and pasted URLs do not automatically reprint. Missing attachment/sender capability still blocks external submission.
- 169 tests pass, plus existing, presentation and direct-print browser regressions. Direct-send UI tests use an intercepted delivery fixture; no physical print or real print email was sent.

## Gmail sender integration

- Local runtime now uses Gmail PDF delivery for printing, independently of Fo chat. Profile and Print include a Gmail connection panel.
- Browser/account-bound OAuth state, PKCE, verified email, sealed access/refresh tokens, send-only Gmail scope, and cancellation/refresh race guards.
- Exact MIME PDF attachment, Epson-only recipient restriction, and Gmail receipt tracking; no automatic retry after ambiguous submission.
- 177 tests pass (71 workspace + 106 server), including eight Gmail tests. Full build and intercepted repeat-print UI checks pass. No real Gmail authorization or print email has been performed.
- Missing external configuration: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not present in the private local environment. The app correctly reports Gmail as not connected. See docs/gmail-print-setup.md for the stable localhost callback and setup. Hosted Gmail integration remains separate work.


### Pocket guides, category printing, and trip moments (Oct 18)

Destination briefings now request five plain-language headings in 140 words, with source wording preserved in expandable cards for older answers. Sources, check time and the complete answer remain available. Long existing briefings refresh when opened on the live backend; no current conditions are invented locally.

Flights-only and hotels-only PDFs are available in Notebook, Print, and natural-language print requests. Each booking starts on its own page. Category PDFs exclude unrelated bookings, tasks and mixed-trip QR payloads. The existing printer approval/one-use gesture and duplicate protections still apply. Gmail OAuth setup is still required for real delivery.

Trip Journal accepts a photo, caption, date and optional place. The browser makes a compact JPEG (up to 85,000 data-URL characters), strips metadata, and stores it with the account workspace. Photos survive reload and private export/import and appear in journal PDFs. They are not sent to Fo/Claude or included in friend snapshots. The composer checks the existing workspace budget (900 KB threshold beneath the 1 MB API limit) and keeps unsaved input visible if full. Supported input: JPG, PNG and WebP under 20 MB. No photos are generated for sample memories.

The local owner's Sydney example now has two travelers, 17 itinerary stops, transport/meals and eight sample journal moments. The targeted update saves a private rollback copy and preserves other trips and non-seeded personal additions. Bakery identity was checked against its official site: https://www.bourkestreetbakery.com.au/ (no live prices or availability claimed).

Verification: 73 app tests and 107 server tests; isolated journal, presentation and direct-print browser regressions; real PDF rendering and text checks for category isolation and photo embedding. No email or physical print was sent.

### Ticket and notebook refinement

Flights now render a compact ticket directly inside Notebook, including the profile name, saved airline/flight number, route, date and a standard QR containing only that flight's notes. Sample flights use the fictional Tatada Air and are explicitly not valid for boarding. Real entries without saved airline/number show those fields as missing instead of inventing them. QR codes are generated locally with a four-module quiet zone and were independently decoded from rendered PDF pages.

Notebook print opens a native modal dialog with an automatic local PDF preview. It preserves the notebook URL and selected category, supports Escape and native focus containment, and creates no server print job on opening. Explicit Print still uses existing sender setup and duplicate protection. The redundant global print icon is hidden inside Notebook; the journal's global print icon now selects the journal document.

Sydney's sample journal includes two generated pen illustrations with stick figures and drawn food. See journal-illustrations.md for exact prompts and saved assets. Both illustrations are embedded in journal PDFs. No photographs, real faces or fabricated booking credentials were added.

### Flight-first trip mode and recovered Fo replies

A real Wajo response uses `structuredContent.response`. The normalizer previously ignored that field, causing the completed-message placeholder. It now reads response as well as the existing aliases, and question text takes precedence over generic waiting progress. On restart, old idle chats ending with that exact placeholder are recovered by read-only polling of the existing conversation; messages are never resent. Genuine empty completions remain pending, then time out with an honest retrieval error and a read-only check-again path.

Trip mode Home now presents outbound flight, arrival/ride, stay and check-in, day-by-day stops, dining arrangements and onward flights in one journey. The map is below the journey. Stops can be checked off and survive export/import. Saved arrangements are distinguished from missing information and sample plans remain marked as such. LA's owner example has a complete sample flight, ride, two-night stay, dinner and return sequence; the targeted update preserves personal notes and other trips with a private rollback copy.

Fo chat is embedded on the trip overview. The active trip is inherited by every magic entry point in trip mode. Every message can carry the current trip summary within the existing 500-character limit, including dates, party size, short saved flight/stay labels, needs and unverified membership labels. No document, payment, booking-reference or photo contents are included in that summary. An attempted increase to 6,000 characters was rejected by automatic approval review; that increase was abandoned. Explicit user requests and action confirmations still govern sends.

A message can optionally be saved as the traveler's own journal note after sending. Fo replies are never automatically treated as proof that a booking or task was completed. Context transport text is separated from visible user bubbles. Conversation scrolling stays inside the chat and does not jump the journey page away from the flight.

Verification: 75 app tests and 111 server tests; isolated journey regression covers flight-first viewport, follow-up context, trip switching, journal capture and replies; presentation regression and production build. The owner's existing LA reply was recovered from Wajo (739 characters), without sending a new message. No bookings, payments, third-party messages or print deliveries were performed.

### Journey completion and readability pass

Top-level journey stages now have persistent checkboxes. Completing a stage collapses its details and highlights the next unfinished stage. Completed details can be reopened without undoing progress, and unchecking resumes the stage. This is the traveler's own progress, not proof of a provider booking or action. Progress is trip-scoped, included in private backups, and excluded from shared friend snapshots.

Profile now opens as a personal settings overview instead of repeating onboarding. Trip planning shows one next action instead of demo time travel. Style tabs and save/packing labels are explicit, duplicate discovery/outfit content is folded away, task rows avoid repeated trip names, and sharing/idea-comparison controls are secondary. Date labels are human-readable without timezone conversion. See usability-review.md for the full review and remaining priorities.

Validation: 77 app tests and 111 server tests; journey persistence/collapse/reopen regression; profile/vault and trip-mode regressions; production build. Main-screen layout checks use three widths and explicitly verified light/dark themes. All provider interactions in browser reviews are intercepted fixtures; no messages, payments, bookings or prints were sent.

### Consistent contexts and usable travel records

Style, Tasks and Magic share Today/trip chips, with the trip locked in trip mode. Style keeps dictation and magic submission inside its composer and removes repeated Claude explanation. Trips is unchanged in this pass.

Travel arrangements now have scoped add/edit/remove/undo forms for flights, stays, transport, meals and activities, including stay address and optional destination-local flight arrival. Correcting a note preserves untouched timing and identifiers. These controls save records; they do not book or contact providers. Journal moments have edit and delete/undo while preserving image data and order.

Packing now produces a PDF through the same managed print flow as tickets and journals. It combines saved packing tasks and saved-outfit garments and retains the existing single-use print intent and delivery authorization. Gmail configuration/consent is still needed for live printer email.

Validation: 80 app + 111 server tests, production build, isolated editing/reload, presentation and managed-print checks, and 72 layout/theme combinations. The packing PDF was extracted and visually inspected. No live third-party message, booking or printer delivery was sent.

### Small-screen and keepsake polish

New trip precedes upcoming trip cards. Common tasks is explicitly named Common, while Style and discovery retain Today. The navigation badge now counts all unfinished checklist rows, matching Tasks rather than excluding idea/memory rows. This is a workspace-wide total outside trip mode, not just the selected Common tab.

Briefing cards show short useful text without repeated expansion prompts or a full-briefing panel; source links and checked time remain. Profile removes the redundant details/connections sentence. Home displays a San Francisco home label and current Open-Meteo model conditions, with source/time, 15-minute refresh and resume refresh, cancellation, freshness validation and an unavailable/retry state. No sample weather is substituted.

Print preview offers star, sun, heart or plain motifs and an optional caption. Vector decorations print sharply without emoji font dependencies; saved travel text remains in Helvetica. Flight dates are readable calendar dates. Decorative controls invalidate previously prepared bytes, and managed delivery still sends the exact newly prepared PDF under existing authorization and duplicate protection. Captions/motifs are per print view, not saved account preferences.

Claude powers automatic destination briefings, manual research and Style chat via /api/intelligence. Fo chat uses Wajo conversation tools; Fo call creation uses start_fo_call. Nearby and event retrieval, rule-based outfit generation, PDFs and checklist state are separate application code. Neither Claude research nor a saved record proves a reservation exists.

Wajo's public /call/ endpoint was checked on October 18: its hosted page returns frame-ancestors none and X-Frame-Options DENY. The public widget uses an MCP app host, not a drop-in iframe of /call/. The external call button is marked with an arrow and explains dictation as the in-app alternative. Embedded two-way audio has not been implemented or tested; it needs a supported Wajo embedded integration.

### Profile forecast, movable stickers, and LAX schedule

San Francisco and its forecast now appear only on the profile overview. Each opening requests current conditions and today's high/low, with no interval or tab-resume refresh and no visible update timestamp. Weather attribution is retained under a closed Weather sources disclosure. Home performs no weather requests. Failed or stale responses are shown as unavailable; no fixture is substituted in the app.

Print decoration now has an emoji tray beside a rendered PDF. Drag or tap to add; placed stickers support pointer/touch movement, arrow keys, removal and page selection. Zoom controls enlarge the editing area. PNG stickers preserve the chosen emoji appearance in the PDF, at the same page and normalized coordinates. Sticker edits invalidate prepared jobs. Decoration is local to this print view; saved PDF bytes retain it. PDF.js loads only on opening Decorate. Prepared delivery still uses the exact reviewed bytes.

The owner-approved LA example is LAX, October 19–25, 2026. A private rollback backup precedes the targeted workspace change. Sample bookings, six-night stay, all seven itinerary days, sample task date text and saved outfit day assignments are updated. Existing journal memories, private notes and other trips are preserved. No actual airline reservation has been changed. The return sample replaces its flight-notes QR with a 24-hour-before-departure check-in placeholder, retaining Fo access. This is sample timing, not a verified airline policy. The exported return card has the same placeholder and no generated QR.

Real boarding codes must be airline-issued. Automatic booking import, airline authentication/check-in and verified boarding-pass retrieval are not connected; Fo conversation does not establish any of those capabilities. Existing cards read saved flight records and their QR codes contain explicitly labeled flight notes, not boarding credentials.

Removed the journey introduction/up-next sentence and redundant conversation, map and Gmail helper copy. Validation: 80 app + 111 server tests, build, 72 layout/theme cases, journey/presentation/managed-print checks, profile-only weather request/failure/reopen checks, and exact exported sticker position/page verification plus visual PDF inspection. Browser account/provider APIs are isolated fixtures. No real check-in, email, booking or printer delivery was performed.

### Compact printing and in-app calls

Profile is only home base plus current temperature/conditions, loaded on profile opening. High/low, Today label, provider text, timestamp and sources disclosure are removed. The weather value itself links to its data source, with accessible attribution.

Print opens directly into Print & decorate. The duplicate iframe/summary is removed. Download and Print icons are the final actions. Entry from a print icon or chat opens the editor without sending; only the final Print tap prepares/approves delivery. Change print settings (mail icon) hides From/To, Gmail connection and advanced options. The owner's preferred sender and existing Epson destination are private account preferences. Explicit print-from/to requests update preferences; non-Epson destinations block sending. A preferred From address does not authorize Gmail: actual sender identity remains Google-verified and must match the preference. Old prepared jobs cannot approve after account/destination changes.

Print status is polled while delivery is in flight. Success says sent to printer email with physical completion unconfirmed. No fake progress or paper-completion claim is made. The local environment still needs Google OAuth client configuration and Gmail consent for actual attachment delivery; Wajo sign-in does not grant these scopes. No real print/email was sent in this review.

Wajo's published MCP call resource supplies a one-use ticket redeem contract independent of its non-embeddable hosted page. The backend redeems that ticket and returns only a short-lived participant credential for the allowlisted secure LiveKit host. The in-app voice dialog supports microphone permission, connection state, mute/unmute, audio playback recovery and hang-up. Close/unmount releases microphone tracks. The SDK is loaded separately. A real room connection was verified, with microphone disabled and no audio played; the remote Fo participant was not present during that short probe. Browser voice controls were exercised with an isolated transport fixture. A human conversation still needs microphone permission and a user check; do not describe the readiness probe as a completed conversation.

Validation: 81 app + 114 server tests, production build, 72 layout/theme cases, compact-print/address/polling/voice-control browser regression, managed-print entry/send/duplicate regression, and sticker-export checks. Account/provider browser APIs use fixtures; the live room readiness probe did not publish or record microphone audio. Reversible preferred-email settings were saved only to the local owner account.

### Closet naming and conversation history

The main Style label is Closet in the screen heading, bottom navigation, trip menu and accessibility labels. Existing /style links remain valid. The subtitle is Pack your bags. The world is calling, with a mountains variant for Yosemite.

Fo chat now offers a trip-scoped History picker with first-message titles and dates. New conversation creates a separate saved thread; previous messages are not removed. Switching retrieves the selected thread without sending anything, clears approval selections and preserves unsent input drafts within that panel. Conversation lists survive server persistence and are available after reload; unsent input drafts are not stored across reloads. Existing account/context filtering remains in force. Initial list responses cannot overwrite a newly selected/created thread.

Validation: build, 81 app + 114 server tests, history/new-thread/reopen/reload/draft/context regression, and journey/presentation checks. The owner's stored conversation counts were checked read-only (six total, five nonempty); no message contents were logged and no provider message was sent.

### Unified home controls and task help

Common Tasks now says Ask Fo. Get shit done. The action opens the existing Fo sheet over the Tasks page with a reviewable draft of up to six open common tasks. Individual task magic icons retain their selected task context. Opening either entry does not create/send a provider message or execute a task. One shared sheet preserves conversation history and avoids multiple embedded conversations per row.

The been/planned legend is above the world map. Next adventure, destination selection, countdown/date and the trip-mode icon share one card. Selecting a destination updates that card's dates; the icon enters its focused trip journey. The duplicate upcoming-trip heading is removed from the normal home layout; empty states and trip-mode navigation remain.

Validation: production build, 81 app + 114 server tests, focused home/task browser regression, 72 size/theme layouts and journey regression. Browser account/provider requests use fixtures; no real message or booking was sent.

Recommended future account flow (not implemented in this pass): Continue with Google for identity, with separately linked Wajo authorization when required. Google client setup belongs to the app developer once, not to each user. For lowest-friction printing, consider a verified Tatada-owned sender with PDF attachments, so users save a printer address and approve that sender only if their Epson allowlist requires it. Personal Gmail sending can remain optional and requires its own send-scope consent. The current runtime still uses Gmail delivery; no Google-login migration or transactional-email provider has been configured by this UI pass.

## Journal and print collection — October 19

- Print and Download sit beside Print & decorate, including the inline notebook preview. Entry remains preview-only; final Print is the delivery gesture.
- Captions use a single line with an in-field prompt. Other blank text fields have hints; accessible labels remain available. Removed wavy link styling and underlines from print navigation tools.
- Journal uses a continuous cream-paper layout, handwritten entries, date/place headings and larger framed photos and drawings. Photo frames reserve space before lazy loading. Existing editing, deletion/undo, attachment storage and exports remain intact.
- Packing PDFs include saved clothing photos grouped by kept outfits. Unavailable images are labeled; no replacement photos are invented. Assets are limited to saved data URLs or same-origin files.
- All combines trip card, flights, stay, packing and journal into one PDF, with section page boundaries, one approval and copies repeating the whole collection. The existing 4 MB delivery limit remains enforced.
- Verified: 83 application and 115 server tests; build; policy/dropdown navigation; isolated journal persistence/print previews; compact delivery and voice controls; 72 screen/size/theme checks. Real sending and microphone conversations were not performed. Fo's text-only attachment limitation is unchanged.

## October 19 continuation

See [continuation verification](verification/continuation-2026-10-19.md) for the current implementation, 214 passing regression tests, separately counted browser fixture/diagnostic runs, preserved live-demo history, limitations and updated preview. [Production preparation](production-readiness-2026-10-19.md) documents additive runtime compatibility, exact access needed, staging checks, retention and rollback. Older limits above are historical and must not be treated as current verification.
