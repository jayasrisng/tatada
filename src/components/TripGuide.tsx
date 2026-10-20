import type {PlanGuide} from '../types'
export function TripGuide({guide}:{guide:PlanGuide}) {
 return <section className="trip-guide" aria-label="Packing and good to know"><p className="small dim">Research snapshot · {guide.checkedAt ? new Date(guide.checkedAt).toLocaleString() : 'time unavailable'}. Recheck changing conditions before travel.</p><details><summary>Timing &amp; travel</summary><p>{guide.summary}</p></details><details><summary>What to pack</summary><ul>{guide.packing.map((item,i)=><li key={i}>{item}</li>)}</ul></details><details><summary>Good to know</summary>{guide.notes.map((n,i)=><article key={i}><h4>{n.title}</h4><p>{n.text}</p>{n.url&&/^https:\/\//.test(n.url)&&<a href={n.url} target="_blank" rel="noreferrer">official / reference source ↗</a>}</article>)}</details></section>
}
export function YosemiteChecks({destination}:{destination:string}) {
 if(!/yosemite/i.test(destination))return null
 return <details className="trip-live-checks"><summary>Yosemite · official checks before you go</summary><ul>{[
 ['Road and trail conditions','https://www.nps.gov/yose/planyourvisit/conditions.htm'],
 ['Destination weather and forecast links','https://www.nps.gov/yose/planyourvisit/weather.htm'],
 ['Tire-chain requirements','https://www.nps.gov/yose/planyourvisit/tirechains.htm'],
 ['Downloadable official maps','https://www.nps.gov/yose/planyourvisit/maps.htm'],
 ['Optional NPS app · offline park information','https://www.nps.gov/yose/planyourvisit/app.htm'],
 ['California roads · QuickMap website','https://quickmap.dot.ca.gov/']
 ].map(([label,url])=><li key={url}><a href={url} target="_blank" rel="noreferrer">{label} ↗</a></li>)}</ul></details>
}
