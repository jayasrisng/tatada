import {useEffect,useState} from 'react'
import {Doodle} from './Doodle'
type Weather={temperature:number;code:number;at:number}
function condition(code:number){return code===0?'Clear':code<=2?'Partly cloudy':code===3?'Overcast':code<=48?'Foggy':code<=67?'Rain':code<=77?'Snow':code<=82?'Showers':code<=86?'Snow showers':'Thunderstorms'}
export function ProfileWeather(){
 const [weather,setWeather]=useState<Weather>(),[message,setMessage]=useState('Finding your location…'),[retry,setRetry]=useState(0)
 useEffect(()=>{
  let active=true,controller:AbortController|undefined,point:{lat:number;lon:number}|undefined,lastKey='',lastFetch=0,generation=0
  const locationWait=setTimeout(()=>{if(active&&!point)setMessage('Allow location in your browser or device settings, then refresh.')},20000)
  async function load(force=false){
   if(!point||(!force&&Date.now()-lastFetch<15*60_000&&lastKey===`${point.lat},${point.lon}`))return
   const key=`${point.lat},${point.lon}`,current=++generation
   controller?.abort();controller=new AbortController();setWeather(undefined);setMessage('Checking local weather…')
   try{
    // About 1 km precision is sufficient for weather. Exact GPS stays on device.
    const params=new URLSearchParams({latitude:String(point.lat),longitude:String(point.lon),current:'temperature_2m,weather_code',temperature_unit:'fahrenheit',timezone:'auto',timeformat:'unixtime'})
    const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])})
    if(!response.ok)throw Error('Weather service unavailable. Try again.')
    const v=(await response.json()).current
    if(!Number.isFinite(v?.temperature_2m)||!Number.isInteger(v.weather_code)||v.weather_code<0||v.weather_code>99||typeof v.time!=='number'||Math.abs(Date.now()-v.time*1000)>2*60*60_000)throw Error('Current weather is unavailable. Try again.')
    if(active&&current===generation){lastFetch=Date.now();lastKey=key;setWeather({temperature:v.temperature_2m,code:v.weather_code,at:v.time*1000});setMessage('')}
   }catch(e){if(active&&current===generation){setWeather(undefined);setMessage((e as Error).message)}}
  }
  if(!navigator.geolocation){clearTimeout(locationWait);setMessage('Location is unavailable in this browser.');return}
  const watch=navigator.geolocation.watchPosition(position=>{
   if(!active)return
   clearTimeout(locationWait)
   point={lat:Math.round(position.coords.latitude*100)/100,lon:Math.round(position.coords.longitude*100)/100};void load()
  },error=>{if(!active)return;clearTimeout(locationWait);point=undefined;generation++;controller?.abort();setWeather(undefined);setMessage(error.code===1?'Allow location in your browser to see local weather.':'Your location is unavailable. Check location settings and retry.')},{enableHighAccuracy:false,maximumAge:60000,timeout:15000})
  const refresh=()=>{if(document.visibilityState==='visible')void load(true)}
  const interval=setInterval(refresh,15*60_000);document.addEventListener('visibilitychange',refresh)
  return()=>{active=false;clearTimeout(locationWait);generation++;controller?.abort();navigator.geolocation.clearWatch(watch);clearInterval(interval);document.removeEventListener('visibilitychange',refresh)}
 },[retry])
 return <section className="location-weather" aria-label="Current location weather"><div className="home-base-weather"><span><Doodle name="home" size={17}/>Current location</span><span aria-live="polite">{weather?<a className="weather-value" href="https://open-meteo.com/" target="_blank" rel="noreferrer">{Math.round(weather.temperature)}°F · {condition(weather.code)}</a>:message}</span><button className="linkbtn" onClick={()=>{setWeather(undefined);setMessage('Finding your location…');setRetry(n=>n+1)}}>refresh</button></div><p className="small dim">{weather?`Observed ${new Date(weather.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}. `:''}Updates as you move while this page is open. Approximate coordinates go to Open-Meteo.</p></section>
}
