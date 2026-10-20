import {useEffect,useState} from 'react'
import {Doodle} from './Doodle'
import {describePoint} from '../discovery/search'
type Weather={temperature:number;code:number;at:number}
function condition(code:number){return code===0?'Clear':code<=2?'Partly cloudy':code===3?'Overcast':code<=48?'Foggy':code<=67?'Rain':code<=77?'Snow':code<=82?'Showers':code<=86?'Snow showers':'Thunderstorms'}
export function ProfileWeather(){
 const [weather,setWeather]=useState<Weather>(),[place,setPlace]=useState('Locating…'),[message,setMessage]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{
  let active=true,controller:AbortController|undefined,point:{lat:number;lon:number}|undefined,lastKey='',lastFetch=0,generation=0
  const locationWait=setTimeout(()=>{if(active&&!point){setPlace('Location off');setMessage('Enable location to see weather.')}},20000)
  async function load(force=false){
   if(!point||(!force&&Date.now()-lastFetch<15*60_000&&lastKey===`${point.lat},${point.lon}`))return
   const key=`${point.lat},${point.lon}`,current=++generation
   controller?.abort();controller=new AbortController();setWeather(undefined);setMessage('Checking weather…')
   if(lastKey!==key)setPlace('Locating…')
   void describePoint(point).then(location=>{if(active&&current===generation)setPlace(location.city||location.region||location.country||'Place unavailable')})
   try{
    const params=new URLSearchParams({latitude:String(point.lat),longitude:String(point.lon),current:'temperature_2m,weather_code',temperature_unit:'fahrenheit',timezone:'auto',timeformat:'unixtime'})
    const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])})
    if(!response.ok)throw Error()
    const v=(await response.json()).current
    if(!Number.isFinite(v?.temperature_2m)||!Number.isInteger(v.weather_code)||v.weather_code<0||v.weather_code>99||typeof v.time!=='number'||Math.abs(Date.now()-v.time*1000)>2*60*60_000)throw Error()
    if(active&&current===generation){lastFetch=Date.now();lastKey=key;setWeather({temperature:v.temperature_2m,code:v.weather_code,at:v.time*1000});setMessage('')}
   }catch{if(active&&current===generation){setWeather(undefined);setMessage('Weather unavailable.')}}
  }
  if(!navigator.geolocation){clearTimeout(locationWait);setPlace('Location unavailable');return}
  const watch=navigator.geolocation.watchPosition(position=>{
   if(!active)return
   clearTimeout(locationWait)
   // City and weather need only approximate coordinates; precise GPS stays on the device.
   point={lat:Math.round(position.coords.latitude*100)/100,lon:Math.round(position.coords.longitude*100)/100};void load()
  },error=>{if(!active)return;clearTimeout(locationWait);point=undefined;generation++;controller?.abort();setWeather(undefined);setPlace(error.code===1?'Location off':'Location unavailable');setMessage(error.code===1?'Enable location to see weather.':'Try again.')},{enableHighAccuracy:false,maximumAge:60000,timeout:15000})
  const refresh=()=>{if(document.visibilityState==='visible')void load(true)}
  const interval=setInterval(refresh,15*60_000);document.addEventListener('visibilitychange',refresh)
  return()=>{active=false;clearTimeout(locationWait);generation++;controller?.abort();navigator.geolocation.clearWatch(watch);clearInterval(interval);document.removeEventListener('visibilitychange',refresh)}
 },[retry])
 return <section className="location-weather" aria-label="Local weather"><div className="home-base-weather"><span><Doodle name="home" size={17}/>{place}</span><span aria-live="polite">{weather?<a className="weather-value" title={`Updated ${new Date(weather.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · Open-Meteo`} href="https://open-meteo.com/" target="_blank" rel="noreferrer">{Math.round(weather.temperature)}°F · {condition(weather.code)}</a>:message}</span><button className="iconbtn" aria-label="Refresh location and weather" onClick={()=>{setWeather(undefined);setPlace('Locating…');setMessage('');setRetry(n=>n+1)}}>↻</button></div></section>
}
