import {Room,RoomEvent,Track} from 'livekit-client'
export interface VoiceJoin{signalUrl:string;participantToken:string;iceTransportPolicy:'relay'|'all'}
export async function connectVoice(join:VoiceJoin,{sink,signal,status}:{sink:HTMLElement;signal:AbortSignal;status:(text:string)=>void}){
 const room=new Room(),stop=()=>{void room.disconnect(true);sink.replaceChildren()}
 signal.addEventListener('abort',stop,{once:true})
 const presence=()=>status(room.remoteParticipants.size?'Talking to Fo':'Waiting for Fo…')
 room.on(RoomEvent.TrackSubscribed,track=>{if(track.kind===Track.Kind.Audio)sink.appendChild(track.attach())})
 room.on(RoomEvent.TrackUnsubscribed,track=>track.detach().forEach(el=>el.remove()))
 room.on(RoomEvent.ParticipantConnected,presence).on(RoomEvent.ParticipantDisconnected,presence)
 room.on(RoomEvent.Reconnecting,()=>status('Reconnecting…')).on(RoomEvent.Reconnected,presence)
 room.on(RoomEvent.Disconnected,()=>{if(!signal.aborted)status('Call ended');sink.replaceChildren()})
 try{
  if(signal.aborted)throw Error('Call cancelled')
  await room.connect(join.signalUrl,join.participantToken,{rtcConfig:{iceTransportPolicy:join.iceTransportPolicy}})
  if(signal.aborted){stop();throw Error('Call cancelled')}
  await room.localParticipant.setMicrophoneEnabled(true)
  if(signal.aborted){stop();throw Error('Call cancelled')}
  presence()
  return {mute:async(muted:boolean)=>{await room.localParticipant.setMicrophoneEnabled(!muted)},enableAudio:()=>room.startAudio(),hangUp:()=>{signal.removeEventListener('abort',stop);stop()}}
 }catch(e){stop();signal.removeEventListener('abort',stop);throw e}
}
