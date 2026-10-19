# Local map extracts

These are small, filtered OpenStreetMap area extracts acquired on 2026-10-19 UTC (2026-10-18 in Los Angeles). Tatada draws the geometry itself; these are not map tiles or routing instructions. Street geometry can change.

Source: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright

The filtered extract data is made available under the Open Database License (ODbL) 1.0: https://opendatacommons.org/licenses/odbl/1-0/ . Attribution is displayed on each local area map.

- los-angeles.json: downtown Los Angeles, center 34.0522, -118.2437; API map extract with longitude +/- 0.006 and latitude +/- 0.0048 degrees.
- yosemite.json: Yosemite Valley, center 37.7459, -119.5936; API map extract with longitude +/- 0.03 and latitude +/- 0.024 degrees.

Source endpoint: https://www.openstreetmap.org/api/0.6/map.json?bbox=west,south,east,north . Only street/path, park, and water ways are retained; point coordinates are resolved from the original nodes. The JSON includes the source name and acquisition timestamp. No user location or personal data appears in these files.
