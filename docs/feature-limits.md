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

## Photos → timeline / map

Users select up to 20 image files per batch from one city. EXIF dates and GPS are read locally; missing dates must be supplied and missing GPS stays unmapped. City/country labels are confirmed by the user, not guessed from scenery. Duplicate files are detected by SHA-256. Same-city photo groups split when dates are more than three days apart, create or attach to trips, appear in trip journals, and persist through backup/restoration.

Countries/cities use normalized confirmed labels; aliases such as US/United States can still count separately. Photo stops cluster coordinates within 100 m, not distinct businesses. Sample/upcoming trips do not inflate counts. Map tiles load only after opening the map and reveal the viewed geographic area to the tile provider; photos are not uploaded there.

Google Photos account linking is not implemented. Its Picker API requires Google OAuth and user selection; the Library API covers app-created content. A Fo connection must not be assumed to grant Tatada access to someone's Google Photos. Current imports use downloaded/original files; exports may lack original GPS/EXIF. There is no landmark recognition, whole-library background scan, or automatic inventory of clothes a user still owns.

Wajo sign-in/live actions and Epson integration remain paused.

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
