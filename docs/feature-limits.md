# Current feature boundaries

## Upload → closet

A dedicated browser worker runs `Xenova/segformer_b0_clothes` through Transformers.js. It downloads model/runtime files on first use and keeps photo processing on the device. It detects visible tops, bottoms, dresses and shoes, creates transparent pieces, and presents them for naming/category/ownership review before adding to the closet. Existing transparent garment images bypass detection.

This is semantic segmentation, not generative reconstruction. Hidden parts remain hidden, sleeve/hem edges can be imperfect, multiple people of the same clothing class can merge, and layers may be one piece. Use a clear photo of one outfit. The 13 starter assets remain separate AI-reconstructed product views. A web worker keeps inference off the UI thread. On a slow phone, the initial model download and inference can take time. Browser/model-loading failures are shown explicitly.

Clothing and travel thumbnails share a conservative browser storage budget. This is not suitable for an entire photo library. Export/import includes closet photos, outfits, photo history, coordinates and trip links. Clearing site data still deletes browser saves.

## Nearby → saved ideas

Magic opens nearby discovery by default. Users explicitly select their location or choose a city. Photon returns a limited set of nearby OpenStreetMap features; small batched OSM detail lookups supply actual tags. Results rank by straight-line distance plus mapped vegetarian, nearby parking and nearby viewpoint preferences. These are transparent rules, not a general-purpose conversational AI. Simple keyword parsing selects coffee/restaurants/events and preferences such as parking or views; chips let users refine them. No query is silently passed to a live Fo agent.

This is a shortlist of mapped candidates, not an exhaustive city-wide survey. Missing dietary, accessibility, opening or parking information remains unknown. Parking proximity does not establish parking availability, safety, price or an attached lot. A nearby viewpoint does not establish a view from a café. Straight-line distance does not establish a walkable route. Ratings, reviews, live opening hours, reservations and paid transactions are not integrated. Maps/source links let users verify details. Saved ideas retain source URLs.

Photon's public demo is for reasonable traffic and has no availability guarantee. Results cache for 15 minutes within the page. Production scale requires a hosted/paid data service, shared caching and request limits. The overloaded public Overpass endpoint was rejected during verification and is not used by the implementation.

Partiful, Luma and Eventbrite currently open labeled provider-search links. Their results are not scraped, ingested, deduplicated or ranked in Tatada. A real event aggregator still needs stable provider feeds or a backend search/ingestion service. No public/private event availability is invented.

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
