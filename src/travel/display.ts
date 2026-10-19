/** Display a saved calendar date without converting it to the device's time zone. */
export function humanDate(iso:string):string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const date=new Date(iso+'T12:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==iso) return iso
  return date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})
}
export const humanWhen=(text:string)=>text.replace(/\b\d{4}-\d{2}-\d{2}\b/g,humanDate)
