# Google Calendar integration

Tatada can copy reviewed trip bookings and itinerary stops into a separate Google calendar named **Tatada**. Profile → Connections includes Google Calendar. Each trip has **Calendar · Google, Apple & Outlook**, with a preview and an independent calendar-file download.

The requested Google scope is `https://www.googleapis.com/auth/calendar.app.created`, plus `openid email` to identify the connected account. This permits app-created secondary calendars and their events, rather than reading or editing the user's existing calendars. Calendar tokens and Gmail tokens are independently encrypted and stored. No calendar is created and no trip information is sent to Calendar until the user confirms an event preview.

## Setup

Enable Google Calendar API in the existing Google Cloud project and accept its displayed terms as the owner. Keep the existing web OAuth client credentials in private `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The existing `GOOGLE_REDIRECT_URI` (`http://127.0.0.1:5180/api/gmail/callback` locally) also handles Calendar grants by dispatching the independently bound OAuth state. No additional callback or new client secret is needed. Hosted runtime uses the already configured Google callback as well, with authenticated same-tab completion. Consent for Calendar is separate from Gmail send consent.

Connect from the profile or trip panel and review Google's app-created-calendar permission. Then open a trip, review the exact events, select up to 30 per batch, and confirm adding them. Stable event IDs allow safe reconciliation of repeated or uncertain requests. The flow sends no invitations (`sendUpdates=none`, no attendees) and disables automatic reminders. Existing or manually changed Google events are not overwritten. No automatic background synchronization, primary-calendar reading, availability checking, invitation handling or automatic deletion of external Google events is implemented.

## Data and timing

Entries are deliberately **all-day**. Saved local departure/arrival or itinerary times are included in the description, with zones when saved. Durations and time zones are not guessed. Stays use their saved exclusive check-out date. Undated records are omitted. Previews and files include at most 100 dated entries, with sample bookings labeled as samples. Booking references, contact details, private notes, vault files, documents, Gmail contents and attendees are excluded. Titles and saved addresses are shown in the review before sending.

The `.ics` file is a real standards-based calendar export usable with Google Calendar, Apple Calendar and Outlook imports, even before connecting Google. It contains the same filtered entries, stable UIDs, escaped text and UTF-8-aware line folding. Imports remain controlled by the target calendar application.

## Recovery and removal

Calendar creation is persisted before making the Google request. An ambiguous creation is marked unresolved and is not blindly repeated; inspect Google Calendar and resolve that operator state before attempting to create another. Ambiguous event inserts reuse the same stable event IDs when retried. Trip/account deletion is blocked while a Calendar write remains active or uncertain. Re-running the same reviewed batch reconciles event IDs after a timeout.

Disconnect removes local Calendar credentials without revoking the shared Google app grant, since Google may also revoke Gmail access for the same client. Manage broader revocation in Google Account settings. Trip/account deletion removes active Tatada Calendar tokens and connection metadata; events already copied to Google remain and can be deleted there. Downloaded calendar files and imported copies in other apps also remain outside Tatada's control.

## Verification

Fixtures verify narrow scope, one-use account/browser-bound state, sealed independent credentials, local disconnect preserving Gmail, exclusions and calendar-file injection resistance, stable IDs, manual-edit protection, stale preview rejection and uncertain-write recovery. Google Calendar API enablement and real owner account consent are complete. Both Calendar and Gmail report connected in the actual local runtime. The first live event addition still requires the owner’s reviewed event approval; a fixture success is not evidence of a live Google event write.

Official references: [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

Current local verification: Google Calendar API was enabled after the owner approved its terms, then Google’s real app-created-calendar permission was separately approved. The live Calendar and Gmail statuses both report configured and connected. No live calendar or event has been created. Connection evidence is kept in the ignored local `docs/verification/google-calendar-connected.png`. The complete regression suite passed **92 application + 133 server tests (225 total)**; the production build passed.
