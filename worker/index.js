/** Metamong real-time presence: Cloudflare Worker + Durable Object.
 * Stateless routing, anonymous 100-person active room, FIFO waiting, 26B peer delta.
 * Does NOT connect to sansatemple.com or its Supabase servers.
 */
import { decodeState, encodePeerState, ACTIONS } from '../src/protocol.js';

const REGIONS = new Set(['apac', 'eur', 'nam', 'sam', 'oce', 'afr']);
const MAX_ACTIVE = 100, MAX_WAITING = 50, MAX_PAYLOAD = 512;
const ROOM_RE = /^maru-(?:[1-9]|[1-9][0-9]|100)$/;
const INSTANCE_RE = /^(?:[0-9]|1[0-5])$/;
const cleanName = str => (str || 'Khách an nhiên').normalize('NFC').replace(/[<>\x00-\x1f]/g, '').slice(0, 30);
const safe = (n, low, high, fallback) => Number.isFinite(n) && n >= low && n <= high ? n : fallback;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok:true, service:'metamong-presence', protocol:'v2', maxActive:MAX_ACTIVE });
    if (url.pathname !== '/ws') return new Response('Not found', { status:404 });
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status:426 });
    if (env.ALLOWED_ORIGIN && request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return new Response('Origin not permitted', { status:403 });
    const room=url.searchParams.get('room'), instance=url.searchParams.get('instance') || '0', region=url.searchParams.get('region') || 'apac';
    if (!ROOM_RE.test(room || '') || !INSTANCE_RE.test(instance) || !REGIONS.has(region)) return new Response('Invalid room settings', { status:400 });
    const key=`${room}:${instance}:${region}`;
    const name=cleanName(url.searchParams.get('name'));
    // Internal URL does not expose user-controlled arbitrary paths.
    const destination=new URL('https://metamong.internal/ws');destination.searchParams.set('name',name);
    return env.ROOMS.getByName(key).fetch(new Request(destination.toString(),request));
  }
};

export class TempleRoom {
  constructor(ctx,env) {
    this.ctx=ctx;this.env=env;
    // Handled without waking the DO. These are application-level *text* frames.
    this.ctx.setWebSocketAutoResponse?.(new WebSocketRequestResponsePair('ping','pong'));
  }
  liveSockets() { return this.ctx.getWebSockets().filter(ws=>ws.readyState===1); }
  activeSockets() { return this.liveSockets().filter(ws=>ws.deserializeAttachment()?.status==='active'); }
  waitingSockets() { return this.liveSockets().filter(ws=>ws.deserializeAttachment()?.status==='waiting').sort((a,b)=>a.deserializeAttachment().joined-b.deserializeAttachment().joined); }
  peerState(ws) { const {id,name,x,z,yaw,action}=ws.deserializeAttachment(); return {id,name,x,z,yaw,action}; }
  peers(exclude) { return this.activeSockets().filter(ws=>ws!==exclude).map(ws=>this.peerState(ws)); }
  send(ws,payload) { try {if(ws.readyState===1) ws.send(typeof payload==='string'||payload instanceof Uint8Array?payload:JSON.stringify(payload));} catch {/*disconnected*/} }
  broadcast(payload,exclude,activeOnly=true) {
    for(const ws of this.liveSockets()) if(ws!==exclude && (!activeOnly||ws.deserializeAttachment()?.status==='active')) this.send(ws,payload);
  }
  async fetch(request) {
    if(this.liveSockets().length>=MAX_ACTIVE+MAX_WAITING) return new Response('Rooms and waiting list are full', {status:503});
    const now=Date.now(), name=cleanName(new URL(request.url).searchParams.get('name'));
    const pair=new WebSocketPair();const [client,server]=Object.values(pair);
    const active=this.activeSockets().length<MAX_ACTIVE;
    const attachment={id:crypto.randomUUID(),name,joined:now,status:active?'active':'waiting',x:0,z:8,yaw:0,action:'idle',seq:0,last:now};
    this.ctx.acceptWebSocket(server);server.serializeAttachment(attachment);
    const incense=(await this.ctx.storage.get('incense'))||[];
    this.send(server,{type:'welcome',status:attachment.status,id:attachment.id,now,peers:active?this.peers(server):[],incense:incense.filter(x=>x.until>now),position:active?0:this.waitingSockets().length});
    if(active)this.broadcast({type:'join',peer:this.peerState(server)},server);
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,message) {
    const prev=ws.deserializeAttachment();if(!prev) return;
    if(message instanceof ArrayBuffer || ArrayBuffer.isView(message)) {
      if(prev.status!=='active') return;
      const bytes=message instanceof ArrayBuffer?new Uint8Array(message):new Uint8Array(message.buffer,message.byteOffset,message.byteLength);
      if(bytes.length!==10) return;
      const state=decodeState(bytes);if(!state)return;
      const now=Date.now();
      if(now-prev.last<65)return;
      const x=safe(state.x,-43,43,prev.x),z=safe(state.z,-31,47,prev.z),yaw=safe(state.yaw,-6.2832,6.2832,prev.yaw);
      const dt=Math.max(.07,(now-prev.last)/1000);
      if(Math.hypot(x-prev.x,z-prev.z)>Math.max(.65,dt*8))return;
      if(((state.seq-prev.seq+65536)%65536)===0)return;
      const next={...prev,x,z,yaw,action:ACTIONS.includes(state.action)?state.action:'idle',last:now,seq:state.seq};
      ws.serializeAttachment(next);
      this.broadcast(encodePeerState(prev.id,next,state.seq),ws);
      if(state.seq%8===0) this.send(ws,{type:'ack',seq:state.seq});
      return;
    }
    if(typeof message!=='string'||message.length>MAX_PAYLOAD)return;
    if(message==='ping')return; // auto-response above
    let event;try{event=JSON.parse(message);}catch{return;}
    if(event.type==='sync' && prev.status==='active') {
      const incense=(await this.ctx.storage.get('incense'))||[];
      this.send(ws,{type:'sync',peers:this.peers(ws),incense:incense.filter(x=>x.until>Date.now()),now:Date.now()});
    } else if(event.type==='offer_request' && prev.status==='active') await this.requestOffer(ws);
  }
  async requestOffer(ws) {
    const id=ws.deserializeAttachment().id;
    const incense=(await this.ctx.storage.get('incense'))||[];
    const queue=(await this.ctx.storage.get('offeringQueue'))||[];
    if(incense.some(v=>v.id===id)||queue.includes(id)){this.send(ws,{type:'offer_queue',position:queue.indexOf(id)+1});return;}
    queue.push(id);
    await this.ctx.storage.put('offeringQueue',queue);
    await this.progressIncense();
    const nextQueue=(await this.ctx.storage.get('offeringQueue'))||[];
    if(nextQueue.includes(id))this.send(ws,{type:'offer_queue',position:nextQueue.indexOf(id)+1});
  }
  async progressIncense() {
    const now=Date.now();
    let incense=((await this.ctx.storage.get('incense'))||[]).filter(v=>v.until>now);
    let queue=(await this.ctx.storage.get('offeringQueue'))||[];
    let nextAt=(await this.ctx.storage.get('nextServiceAt'))||0;
    const activeIds=new Set(this.activeSockets().map(ws=>ws.deserializeAttachment().id));
    queue=queue.filter(id=>activeIds.has(id));
    if(incense.length<5 && queue.length && now>=nextAt) {
      const id=queue.shift(),until=now+120000;
      incense.push({id,until});nextAt=now+8000;
      this.broadcast({type:'incense_start',id,until});
    }
    await Promise.all([this.ctx.storage.put('incense',incense),this.ctx.storage.put('offeringQueue',queue),this.ctx.storage.put('nextServiceAt',nextAt)]);
    if(incense.length||queue.length){
      let alarmAt=Math.min(...[...incense.map(v=>v.until),...(queue.length&&incense.length<5?[Math.max(now+100,nextAt)]:[])]);
      if(Number.isFinite(alarmAt))await this.ctx.storage.setAlarm(alarmAt);
    }else await this.ctx.storage.deleteAlarm();
  }
  async alarm(){await this.progressIncense();}
  async webSocketClose(ws){
    const prev=ws.deserializeAttachment();
    if(prev?.status==='active') {
      this.broadcast({type:'leave',id:prev.id},ws);
      const next=this.waitingSockets().find(w=>w!==ws);
      if(next){
        const data=next.deserializeAttachment();data.status='active';data.last=Date.now();next.serializeAttachment(data);
        this.send(next,{type:'promoted',peers:this.peers(next)});
        this.broadcast({type:'join',peer:this.peerState(next)},next);
      }
    }
    this.waitingSockets().forEach((w,i)=>this.send(w,{type:'queue',position:i+1}));
  }
  async webSocketError(ws){try{ws.close(1011,'Connection closed');}catch{}}
}
