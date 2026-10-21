/*
 * What a print request can and can't do through Epson Connect Email Print.
 * Shared by the browser (preview) and the server (authoritative approval).
 *
 * Documented by Epson (epsonconnect.com/faq, checked 2026-10-18):
 *  - Documents print on plain paper at the printer-wide "Plain Paper Size".
 *  - Copies and n-up are not supported per email.
 *  - Per-email options exist only as address suffixes before the @:
 *      =+bk grayscale · =+dl two-sided long edge (automatic-duplex printers,
 *      A3/A4/Letter/Postcard paper only).
 *  - Email body and sender information print unless the owner turns them off.
 *  - Password-protected PDFs, more than 10 attachments, or more than 20 MB
 *    don't print.
 * Nothing else is invented: no subject-line commands, no per-email paper.
 */
export type PaperSize = 'letter' | 'a4' | '4x6'
export type Answer = 'yes' | 'no' | 'unknown'

export interface PrinterProfile {
  /** Preferred account for Gmail consent; never used to forge the actual sender. */
  senderEmail?: string
  directPrint?: boolean
  printingConsent?: boolean
  defaults?: Pick<PrintRequest, 'color' | 'duplex' | 'copies' | 'size'>
  email: string
  /** As the owner set it in Epson Connect → Print Settings. */
  plainPaper: 'letter' | 'a4' | 'unknown'
  colorInk: Answer
  autoDuplex: Answer
  /** "Print Email Body" and "Print Sender's Information" are off. */
  bodyPrintingOff: Answer
  /** The sending address is on the Approved Senders list, or the list is off. */
  senderApproved: Answer
  updatedAt: number
}

export interface PrintRequest {
  instructions?: string; color?: 'color' | 'grayscale'; size?: PaperSize; duplex?: boolean; copies?: number; document?: 'card' | 'journal' | 'flights' | 'hotels' | 'packing' | 'all' }
export interface PrintChoices { fourBySix?: 'layout-on-plain'; duplex?: 'single' | 'try'; copies?: 'repeat-pages' | 'single' }

export interface PlanLine { setting: string; requested: string; how: 'pdf' | 'address' | 'printer' | 'not_possible'; result: string }
export interface Question { key: keyof PrintChoices; text: string; options: { value: string; label: string }[] }
export interface PrintPlan {
  /** PDF page size actually generated. */
  pageSize: 'letter' | 'a4'
  layout: 'full' | '4x6-on-plain'
  grayscale: boolean
  /** Each page repeated this many times in the PDF (disclosed copy workaround). */
  repeat: number
  suffix: string
  lines: PlanLine[]
  questions: Question[]
  limitations: string[]
}

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

export const isPrintRequest = (text: string) => /\bprint(ed|ing)?\b/i.test(text)

/** Reads "print in color", "make it 4×6", "double-sided", "two copies"… into explicit settings. */
export function parsePrintRequest(text: string): PrintRequest {
  const q = text.toLowerCase().replace(/×/g, 'x')
  const out: PrintRequest = {}
  if (/black (and|&) white|\bb ?& ?w\b|gr[ae]yscale|monochrome|\bmono\b|no colou?r/.test(q)) out.color = 'grayscale'
  else if (/\bcolou?r\b/.test(q)) out.color = 'color'
  if (/\b4\s*(x|by)\s*6\b|\bpostcard\b/.test(q)) out.size = '4x6'
  else if (/\ba4\b/.test(q)) out.size = 'a4'
  else if (/\bletter\b(?! to)/.test(q)) out.size = 'letter'
  if (/single[- ]sided|one[- ]sided|simplex/.test(q)) out.duplex = false
  else if (/(double|two|2)[- ]sided|duplex|both sides/.test(q)) out.duplex = true
  const copies = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(copies|copy|prints|times)\b/.exec(q)
  if (copies) out.copies = WORDS[copies[1]] ?? Number(copies[1])
  else if (/\btwice\b/.test(q)) out.copies = 2
  if (/\b(print\s+)?(all|everything|whole trip)\b/.test(q)) out.document = 'all'
  else if (/packing|pack list|clothes list/.test(q)) out.document = 'packing'
  else if (/journal|memories/.test(q)) out.document = 'journal'
  else if (/\bflights?\b/.test(q) && !/\bhotels?\b|\bstays?\b/.test(q)) out.document = 'flights'
  else if (/\bhotels?\b|\bstays?\b|accommodation/.test(q) && !/\bflights?\b/.test(q)) out.document = 'hotels'
  else if (/trip card|card|itinerary|plan/.test(q)) out.document = 'card'
  return out
}

/** Printer address with Epson's documented per-email suffix, e.g. abc=+bk+dl@print.epsonconnect.com. */
export function printerAddress(email: string, suffix: string) {
  const at = email.lastIndexOf('@')
  return suffix && at > 0 ? `${email.slice(0, at)}${suffix}${email.slice(at)}` : email
}

export const EPSON_EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_{|}~-]{6,32}@print\.epsonconnect\.com$/i

export function planPrint(req: PrintRequest, printer: Pick<PrinterProfile, 'plainPaper' | 'colorInk' | 'autoDuplex' | 'bodyPrintingOff' | 'senderApproved'>, choices: PrintChoices = {}, pageCount?: number): PrintPlan {
  const lines: PlanLine[] = [], questions: Question[] = [], limitations: string[] = []
  const plain = printer.plainPaper === 'a4' ? 'a4' : 'letter'
  const plainLabel = plain === 'a4' ? 'A4' : 'Letter'
  let layout: PrintPlan['layout'] = 'full', grayscale = false, repeat = 1
  const flags: string[] = []

  if (printer.plainPaper === 'unknown') limitations.push(`Assumed ${plainLabel} paper. Epson prints documents at the "Plain Paper Size" set in Epson Connect; set it there to be sure.`)

  // Paper size: only the PDF is ours; the physical paper is printer-wide.
  if (req.size === '4x6') {
    if (choices.fourBySix === 'layout-on-plain') { layout = '4x6-on-plain'; lines.push({ setting: 'size', requested: '4×6', how: 'pdf', result: `4×6 card with cut guides, on ${plainLabel} paper` }) }
    else {
      lines.push({ setting: 'size', requested: '4×6', how: 'not_possible', result: `Email Print puts documents on ${plainLabel} plain paper, not 4×6` })
      questions.push({ key: 'fourBySix', text: `4×6 paper isn't possible by email: Epson prints documents on its plain-paper size. Print a 4×6 card with cut guides on ${plainLabel} instead?`, options: [{ value: 'layout-on-plain', label: `yes, 4×6 on ${plainLabel}` }] })
    }
  } else if (req.size && req.size !== plain) {
    lines.push({ setting: 'size', requested: req.size === 'a4' ? 'A4' : 'Letter', how: 'not_possible', result: `Your printer is set to ${plainLabel}; change Plain Paper Size in Epson Connect to use another size` })
  } else lines.push({ setting: 'size', requested: req.size ? plainLabel : 'default', how: 'printer', result: `${plainLabel} (printer setting)` })

  // Color: grayscale is ours (PDF + documented =+bk); color output depends on the printer.
  if (req.color === 'grayscale') { grayscale = true; flags.push('bk'); lines.push({ setting: 'color', requested: 'black & white', how: 'address', result: 'grayscale PDF and Epson\'s grayscale address option (=+bk)' }) }
  else if (req.color === 'color' && printer.colorInk === 'no') lines.push({ setting: 'color', requested: 'color', how: 'not_possible', result: 'your printer only has black ink' })
  else if (req.color === 'color') lines.push({ setting: 'color', requested: 'color', how: 'printer', result: printer.colorInk === 'yes' ? 'color PDF; Epson prints documents in color' : 'color PDF; prints in color if your printer has color ink' })
  else lines.push({ setting: 'color', requested: 'default', how: 'printer', result: 'color PDF (Epson\'s default for documents)' })

  // Two-sided: documented only as =+dl on automatic-duplex printers.
  if (req.duplex) {
    if (pageCount !== undefined && pageCount * (req.copies && choices.copies === 'repeat-pages' ? req.copies : 1) < 2) lines.push({ setting: 'sides', requested: 'two-sided', how: 'not_possible', result: 'this document is one page, so there is no back side' })
    else if (printer.autoDuplex === 'no' && choices.duplex !== 'single') {
      lines.push({ setting: 'sides', requested: 'two-sided', how: 'not_possible', result: 'your printer can\'t print two-sided automatically' })
      questions.push({ key: 'duplex', text: 'Your printer can\'t print two-sided automatically. Print single-sided?', options: [{ value: 'single', label: 'single-sided is fine' }] })
    } else if (printer.autoDuplex === 'unknown' && !choices.duplex) {
      lines.push({ setting: 'sides', requested: 'two-sided', how: 'not_possible', result: 'only printers with automatic two-sided printing honor this' })
      questions.push({ key: 'duplex', text: 'Epson only prints two-sided by email on printers with automatic duplex (Letter/A4). Does yours have it?', options: [{ value: 'try', label: 'yes, it does' }, { value: 'single', label: 'single-sided is fine' }] })
    } else if (choices.duplex === 'single') lines.push({ setting: 'sides', requested: 'two-sided', how: 'printer', result: 'single-sided, as you chose' })
    else { flags.push('dl'); lines.push({ setting: 'sides', requested: 'two-sided', how: 'address', result: 'Epson\'s two-sided address option (=+dl, long edge)' }) }
  } else lines.push({ setting: 'sides', requested: req.duplex === false ? 'single-sided' : 'default', how: 'printer', result: 'single-sided' })

  // Copies: not supported by Email Print; repeating pages in one PDF is the disclosed alternative.
  const copies = Math.max(1, Math.min(10, Math.floor(req.copies ?? 1)))
  if (copies > 1) {
    if (choices.copies === 'repeat-pages') { repeat = copies; lines.push({ setting: 'copies', requested: String(copies), how: 'pdf', result: `one PDF with every page repeated ${copies} times` }) }
    else if (choices.copies === 'single') lines.push({ setting: 'copies', requested: String(copies), how: 'printer', result: '1 copy, as you chose' })
    else {
      lines.push({ setting: 'copies', requested: String(copies), how: 'not_possible', result: 'Epson Email Print has no copies setting' })
      questions.push({ key: 'copies', text: `Email Print can't set copies. Put ${copies} copies in one PDF by repeating its pages, or print 1?`, options: [{ value: 'repeat-pages', label: `repeat pages ×${copies}` }, { value: 'single', label: 'just 1 copy' }] })
    }
    if (repeat > 1 && flags.includes('dl')) limitations.push('Two-sided with repeated pages may put the start of one copy on the back of another.')
  } else lines.push({ setting: 'copies', requested: '1', how: 'pdf', result: '1 copy' })

  if (printer.bodyPrintingOff !== 'yes') limitations.push('Epson may print the email body or sender details on an extra page unless "Print Email Body" and "Print Sender\'s Information" are turned off in Epson Connect → Print Settings.')
  if (printer.senderApproved !== 'yes') limitations.push('If Approved Senders is on in Epson Connect, the sending address must be on it, or Epson rejects the job.')
  limitations.push('An accepted email isn\'t proof of a printed page. Epson can email a completion notice to the sender if the printer owner turned that on.')

  return { pageSize: plain, layout, grayscale, repeat, suffix: flags.length ? `=+${flags.join('+')}` : '', lines, questions, limitations }
}

/** Explicit mail-setting requests are preferences, never mailbox authorization. */
export function parsePrintMail(text:string):{from?:string;to?:string}{
 const email='([A-Z0-9.!#$%&\'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\\.[A-Z]{2,})'
 const from=new RegExp(`\\b(?:from|sender(?: email)?(?: is| to)?)\\s*[:=]?\\s*${email}`,'i').exec(text)?.[1]
 const to=new RegExp(`\\b(?:to|printer(?: email)?(?: is| to)?)\\s*[:=]?\\s*${email}`,'i').exec(text)?.[1]
 return {...(from?{from}:{}),...(to?{to}:{})}
}
