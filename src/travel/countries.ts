/*
 * Countries for the travel map and the visited-country checklist. The list is
 * ISO 3166-1 (so small countries without a map shape can still be ticked);
 * English names come from Intl. Labels typed by people or returned by a
 * geocoder are matched by name, common alias, or ISO code. No match → unknown.
 */
const CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ')

export const normalizeLabel = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[’'`.]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the)\b/g, ' ').replace(/\s+/g, ' ').trim()

const ALIASES: Record<string, string> = {
  us: 'US', usa: 'US', 'united states of america': 'US', america: 'US', 'estados unidos': 'US',
  uk: 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  turkey: 'TR', turkiye: 'TR', burma: 'MM', myanmar: 'MM', 'czech republic': 'CZ', czechia: 'CZ', holland: 'NL', nederland: 'NL',
  uae: 'AE', 'ivory coast': 'CI', 'cote divoire': 'CI', 'south korea': 'KR', korea: 'KR', 'republic of korea': 'KR', 'north korea': 'KP',
  'dr congo': 'CD', drc: 'CD', 'democratic republic of congo': 'CD', 'dem rep congo': 'CD', 'republic of congo': 'CG', congo: 'CG',
  'east timor': 'TL', 'timor leste': 'TL', 'cape verde': 'CV', swaziland: 'SZ', eswatini: 'SZ', macedonia: 'MK', 'north macedonia': 'MK',
  vatican: 'VA', 'vatican city': 'VA', 'hong kong': 'HK', macau: 'MO', macao: 'MO', palestine: 'PS', taiwan: 'TW', kosovo: 'XK',
  russia: 'RU', 'russian federation': 'RU', vietnam: 'VN', 'viet nam': 'VN', laos: 'LA', syria: 'SY', iran: 'IR', bolivia: 'BO', venezuela: 'VE', tanzania: 'TZ', moldova: 'MD',
  // Natural Earth short names used by the map shapes
  'w sahara': 'EH', 'central african rep': 'CF', 'eq guinea': 'GQ', 's sudan': 'SS', 'bosnia and herz': 'BA', 'dominican rep': 'DO',
  'falkland is': 'FK', 'fr s antarctic lands': 'TF', 'solomon is': 'SB', 'n cyprus': 'CY', somaliland: 'SO', 'bosnia and herzegovina': 'BA',
  // Common native names
  espana: 'ES', deutschland: 'DE', italia: 'IT', brasil: 'BR', mexico: 'MX', osterreich: 'AT', schweiz: 'CH', suisse: 'CH', svizzera: 'CH',
  belgie: 'BE', belgique: 'BE', polska: 'PL', sverige: 'SE', norge: 'NO', danmark: 'DK', suomi: 'FI', hellas: 'GR', ellada: 'GR', nippon: 'JP', nihon: 'JP', '日本': 'JP', '中国': 'CN', 'eire': 'IE',
}

// A US state typed where a country belongs still means the United States. ("Georgia" stays the country.)
for (const state of 'alabama alaska arizona arkansas california colorado connecticut delaware florida georgia-us hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada new-hampshire new-jersey new-mexico new-york north-carolina north-dakota ohio oklahoma oregon pennsylvania rhode-island south-carolina south-dakota tennessee texas utah vermont virginia washington west-virginia wisconsin wyoming'.split(' ')) if (state !== 'georgia-us') ALIASES[state.replace(/-/g, ' ')] = 'US'

let names: Map<string, string> | undefined, byName: Map<string, string> | undefined
function tables() {
  if (!names || !byName) {
    const display = new Intl.DisplayNames(['en'], { type: 'region' })
    names = new Map(CODES.map((c) => [c, display.of(c) ?? c]))
    byName = new Map([...names].map(([code, name]) => [normalizeLabel(name), code]))
  }
  return { names, byName }
}

/** ISO alpha-2 code for a country label, or undefined when it can't be matched. */
export function countryCode(label?: string): string | undefined {
  if (!label?.trim()) return undefined
  const raw = label.trim(), n = normalizeLabel(raw)
  if (ALIASES[raw]) return ALIASES[raw]
  if (ALIASES[n]) return ALIASES[n]
  const { byName } = tables()
  if (byName.has(n)) return byName.get(n)
  if (/^[a-z]{2}$/i.test(raw) && tables().names.has(raw.toUpperCase())) return raw.toUpperCase()
  return undefined
}

export const countryName = (code: string) => tables().names.get(code) ?? code

/** Every country for the checklist, alphabetical by English name. */
export const allCountries = () => [...tables().names].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name))
