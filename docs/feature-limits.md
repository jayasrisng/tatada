# Current feature boundaries

## Upload → closet

A dedicated browser worker runs `Xenova/segformer_b0_clothes` through Transformers.js. It downloads model/runtime files on first use and keeps photo processing on the device. It detects visible tops, bottoms, dresses and shoes, creates transparent pieces, and presents them for naming/category/ownership review before adding to the closet. Existing transparent garment images bypass detection.

This is semantic segmentation, not generative reconstruction. Hidden parts remain hidden, sleeve/hem edges can be imperfect, multiple people of the same clothing class can merge, and layers may be one piece. Use a clear photo of one outfit. The 13 starter assets remain separate AI-reconstructed product views. A web worker keeps inference off the UI thread. On a slow phone, the initial model download and inference can take time. Browser/model-loading failures are shown explicitly.

Clothing and travel thumbnails share a conservative browser storage budget. This is not suitable for an entire photo library. Export/import includes closet photos, outfits, photo history, coordinates and trip links. Clearing site data still deletes browser saves.

## Nearby → saved ideas

Magic opens nearby discovery by default. Users explicitly share their location or type a city. Rule-based parsing turns a request into visible, editable preferences: walkable, parking, a view, vegetarian/vegan, open now, outdoor seating, Wi-Fi and a cuisine. It is not a general conversational AI, and nothing is passed to a live Fo agent.

Photon returns the nearest mapped cafés/restaurants (up to 50), plus a name search for “vegan”, “vegetarian” or a cuisine. One batched OSM request per element type fetches actual tags. Ranking uses only what is mapped:

- **Diet:** `diet:vegetarian` / `diet:vegan` (`only` > `yes` > `limited`) and vegetarian/vegan cuisine. An explicit `no` excludes the place. Untagged places stay, marked “not listed”.
- **Parking:** the venue's own `parking` tag or a lot named for it counts as evidence. A public lot within 200 m is reported as “public parking mapped N m away (free/paid/fee unknown); spaces unknown”. Private and customer-only lots are ignored. None of this establishes availability.
- **Views:** a mapped `rooftop=yes` or `view` tag is the only venue-level signal. View words in a name or description (“Skyline”, “Terrace”, “Miradouro”…) are weak hints: they rank only slightly higher and are labeled “a hint only; view not confirmed”. A viewpoint within 150 m is labeled “view from inside unknown”.
- **Hours:** a conservative `opening_hours` reader handles common weekly forms. Anything else (months, dates, sunrise, open ends) is shown as listed text. Geolocation gives coordinates, not a time zone. The venue's zone comes from an offline coordinate lookup (`@photostructure/tz-lookup`, CC0), which is approximate near borders. Open/closed is claimed only when all of these hold:
  - the venue and four points ~5 km around it share the same current UTC offset;
  - for “near me”, the device's own offset also agrees;
  - the hours parse cleanly.

  Otherwise the listed hours are shown as text. The claim is based on mapped hours, which may be outdated, and holiday rules are not evaluated. Details say both. The ~29 kB (gzip) zone table loads on the first place search.
- **Walking:** results appear with straight-line distance. The FOSSGIS OSRM `routed-foot` profile then supplies route distance and time for up to 10 candidates in one table request, labeled as estimates. Verified pedestrian on 2026-10-17: Filbert/Greenwich Steps route 159 m on foot vs 1.6 km by car; walking speed ~4.4 km/h. Its usage policy allows at most 1 request/second with attribution and a “fix the map” link. Tatada sends at most one routing request per search, caches it for 15 minutes, spaces requests ≥1.1 s apart, and shows the attribution. The server delays rapid repeat requests, so routes can take a few seconds. If it fails, distances stay straight-line and are labeled so. “Walkable” means a route of 1.6 km or less, or 1.2 km straight-line when unrouted.
- **Ratings:** none. OSM has no ratings and no free ratings API is connected. Requests that ask for “good” or “best” places say so.

This is a shortlist of mapped candidates, not a city-wide survey. Photon's public demo and the FOSSGIS router are for reasonable traffic and offer no availability guarantee. Results cache for 15 minutes within the page. Production scale needs hosted/paid geodata and routing.

## Events

Public listings come from three sources, read server-side because none send CORS headers:

| Source | What is read | Coverage | Price / availability |
| --- | --- | --- | --- |
| Luma | `api.lu.ma/discover/get-paginated-events` (the JSON behind luma.com/discover), up to 3 pages of 50 | Anywhere Luma has nearby events | Free / listed price; sold-out excluded; guest-only addresses give approximate distance |
| Eventbrite | `eventbrite.com/d/<place>/(<interest>--)events/` browse pages (`window.__SERVER_DATA__`) | Cities Eventbrite has pages for | Not on these pages → “price not listed”; sold-out unknown |
| Partiful | `partiful.com/explore/<region>` public explore pages (`__NEXT_DATA__`) | SF, LA, NYC, Austin, Boston, Chicago, DC, Miami, London | Not shown → “price not listed”; location rounded to ~1 km |

Verified live on 2026-10-17 for San Francisco, Lisbon and New York. Automated tests use trimmed copies of real responses.

The service validates input and rate-limits clients (30 searches/minute). Each upstream request has an 8 s timeout and a 4 MB cap, and each host is limited to 20 requests/minute. Responses stay fresh in a cache for 10 minutes, and a copy up to 2 hours old is used if a refresh fails. Each source reports when its listings were read: the panel shows “Checked 8 min ago”, and a source served from an older copy reads “Eventbrite 5 (from 1 h ago)” with “couldn't refresh” under why?. Each source has a 15 s budget and fails independently. It needs and stores no credentials. The robots.txt files of all three allow these paths. Partiful's disallows only AI-training crawlers, and this is a user-triggered display. These are undocumented public pages, not APIs, so their structure can change: the parser then reports that source as failed rather than guessing. Provider terms may restrict automated access. For production, ask each provider for permission or a partner feed.

Hosted (`tatada-events` on Supabase, deployed 2026-10-18): all three sources answered from Supabase's network in San Francisco, New York, London, Tokyo, Lisbon and rural Montana. Searches require the Tatada `Origin`, which is forgeable. The client key is `cf-connecting-ip`, which callers cannot set. Observed: almost every request runs on a fresh instance, so caches, cooldowns and per-client/instance limits rarely carry over. Each search makes fresh upstream requests (≤6, each bounded), and nothing caps the total. A shared cache and limiter would need a small table or an external store. That isn't done; the database is unchanged.

Rules: times are converted using the listing's own IANA zone, and date filters are judged in that zone. Events that have ended, have no end time and have started, are canceled (flag or “Canceled/Postponed” title), sold out (Luma flag) or online-only are excluded. Listings within 90 minutes of each other with matching normalized titles and nearby locations merge. The merged listing keeps every source link and the most detailed copy. Interest words match titles, provider categories and descriptions. If nothing matches, all events in the window are shown with a note. “Free only” keeps only listings marked free, which effectively means Luma.

What would need credentials or paid access: Eventbrite's public search API is deprecated. Its API now only covers events you organize, and this flow doesn't use it. Luma's official API (Luma Plus) covers only calendars you manage. Partiful has no public API. City-wide prices and sold-out status for Eventbrite/Partiful would need partner feeds or per-event page reads. Ratings for places need a paid places API (e.g. Google Places, Foursquare) behind a backend key.

## Photos → map and closet (one import)

Up to 20 images per batch, any mix of places. Each photo is read on the device:
- **Metadata:** EXIF date and GPS, plus IPTC/XMP City, Country/CountryCode and Sub-location/Location labels, prefill the fields and are marked "from photo".
- **Geocoding:** for GPS without labels, a city/country suggestion comes from Photon only after consent. Coordinates are rounded to 3 decimals (~100 m), and the image is never sent. Photon's nearest feature is never used as a place name, because a café near the coordinates isn't where the photo was taken.
- **Blank fields:** anything unresolved stays blank. Undated photos can still mark a country or city but create no trip. A photo joins the map only with at least a country.
- **Landmark recognition:** not available. Nothing is guessed from image content, and no photo goes to an AI service.

The same photos enter the on-device clothing detector one at a time. A piece reaches the closet only after you name it, set its category and tick "I still own it". The two halves can fail separately: the location lookup and the clothing model show their own retryable errors. Duplicates are detected by SHA-256 against the map history, and against closet pieces through their source photo.

Counts: countries use ISO codes, matched by name, common alias or code, so US/United States count once. Unmatched labels stay as typed. Cities come from confirmed labels. Places are only named places you confirmed, never coordinates or photo counts. Photo spots cluster GPS within 100 m. Countries can be ticked or unticked by hand; these are stored as overrides, and saves from before still load. Visited and planned stay separate, and sample or upcoming trips never count as visited. The map is drawn locally from Natural Earth 1:110m shapes, with no map tiles or network. Small countries without a shape at that scale appear in the lists and checkboxes only.

Map history no longer shows a photo gallery. Existing photos stay in trip journals and can be removed from a compact list. Google Photos account linking is not implemented; its Picker API needs Google OAuth. A Fo connection is not assumed to grant photo access.

## Today context

Magic, discovery and Style start with "today". A trip becomes the context only when chosen explicitly: from a trip page, a task shortcut, or a chip. Style for today uses an unsaved stand-in with no itinerary or packing list.

## Printing (Epson Connect Email Print)

Facts from epsonconnect.com (FAQ, Guide and User Page help, checked 2026-10-18):
- **Paper:** documents print on plain paper at the printer-wide Plain Paper Size.
- **Copies and n-up:** not supported per email.
- **Per-email options:** grayscale (`=+bk`) and two-sided long/short edge (`=+dl`/`=+ds`), as address suffixes. Two-sided needs automatic duplex and A3/A4/Letter/Postcard paper.
- **Extra pages:** the email body and sender information print unless the owner turns them off in Print Settings.
- **Approved Senders:** this list is off by default. If it's on, unapproved senders' jobs fail with a Print Log error.
- **Attachments:** up to 10 and 20 MB in total. Password-protected or signed PDFs don't print.
- **Confirmation:** completion notification emails go to a sender only if the owner enabled them. The Print Log is visible only to the owner.

How Tatada applies these:
- The printer profile records what you say your Epson Connect settings are. Tatada can't read them, so "not sure" is allowed and shows up as a limitation.
- The PDF is generated in the browser (Helvetica, Latin-1). Arrows become ASCII, and characters it can't print are reported.
- The server re-reads the PDF and checks page size and count before storing it.
- The preview loads those stored bytes, and approval binds to their SHA-256 together with the printer address, sender, plan and copies.
- Jobs are saved as "sending" before delivery. After a restart, "sending" becomes "uncertain" and is never resent; "check again" asks the provider, and a resend needs explicit confirmation.

**Blocked:** live Fo delivery. `ask_fo` accepts only `message`, `conversationId` and `newConversation`, and rejects other arguments. No Fo tool exposes the connected sending account. So Fo delivery reports the blocker and sends nothing. Mock delivery exists for development only.

**Not verified:** that any specific printer is registered with Epson Connect or accepts a particular sender, or that a page printed. Doing so needs the owner's Print Log, a completion notice, or the Epson Connect API with credentials, none of which Tatada has.

**Hosting:** the print service also runs in the Supabase edge function (with a pdf-lib import map), so it doesn't need a laptop. That needs the paused Wajo sign-in for per-account storage, and it isn't deployed.

Wajo multi-user sign-in remains paused.

## Sources

- https://huggingface.co/Xenova/segformer_b0_clothes
- https://huggingface.co/docs/transformers.js/api/pipelines
- https://github.com/komoot/photon/blob/master/docs/api-v1.md
- https://github.com/komoot/photon#demo-server
- https://developers.google.com/photos/overview/about
- https://www.eventbrite.com/platform/new/api (public event search is deprecated)
- https://routing.openstreetmap.de/about.html (FOSSGIS OSRM routing)
- https://wiki.openstreetmap.org/wiki/Key:opening_hours
- https://wiki.openstreetmap.org/wiki/Key:diet
- https://www.epsonconnect.com/faq/en/index.htm (Email Print settings, suffixes, limits)
- https://epsonconnect.com/help/en/html/email_2.htm (Approved Senders) · email_4.htm (Print Settings) · email_5.htm (Print Log)
- Wajo MCP `search_documentation` (API key auth, Fo profile tools), checked 2026-10-18
