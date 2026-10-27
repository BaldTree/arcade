(() => {
'use strict';
const $=id=>document.getElementById(id);
const buttons=[...document.querySelectorAll('[data-platform]')];
const groups=['Rat, Dragon, Monkey','Ox, Snake, Rooster','Tiger, Horse, Dog','Cat, Goat, Pig'];
const rawSeed=Number(new URLSearchParams(location.search).get('seed'));
const seed=Number.isSafeInteger(rawSeed)&&rawSeed>0?rawSeed>>>0:1952;
let callback=null,ready=false,failed=false,epoch=0,pendingPause=false;
let state={phase:'ready',paused:false,ticket:{},trains:[],epoch:0};
const mq=matchMedia('(prefers-reduced-motion: reduce)');
function send(type,data={}){callback?.(JSON.stringify({type,epoch,...data}));}
function start(type='start',timed=false){
 if(!ready||document.hidden)return;
 epoch++;pendingPause=false;
 send(type,{timed,seed});
}
function pause(){pendingPause=true;send('pause');render();}
function resume(){if(!ready||document.hidden)return;pendingPause=false;send('resume');}
function route(platform,gesture){
 if(!ready||pendingPause||state.paused||state.phase!=='playing'||!state.can_route)return;
 if(gesture&&(gesture.cancelled||gesture.epoch!==epoch||gesture.id!==state.ticket.id))return;
 send('route',{platform,id:state.ticket.id});
}
function render(){
 const playing=ready&&state.phase==='playing'&&!state.paused&&!pendingPause;
 buttons.forEach(b=>{const i=Number(b.dataset.platform),t=state.trains[i];b.disabled=!playing||!state.can_route;b.setAttribute('aria-label',`Train ${i+1}: ${groups[i]}. ${t?.seats||0} of 9 seated. ${t?.phase==='exchange'?'Exchanging; passengers wait on platform.':'Send this customer.'}`);});
 $('pause').disabled=!ready||state.phase!=='playing';$('pause').textContent=state.paused||pendingPause?'Resume':'Pause';
 $('speech').hidden=!playing||!state.can_route||!state.ticket?.id;
 $('birthday').textContent=state.ticket?.date?new Date(`${state.ticket.date}T12:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'…';
 $('ticket-number').textContent=state.ticket?.id?`CUSTOMER ${String(state.ticket.id).padStart(3,'0')}`:'TICKET COUNTER';
 $('tet').textContent=state.ticket?.tet||'—';
 $('queue').textContent=`Waiting: ${state.waiting||0} / 18 (${state.away||0} on paths)`;
 document.querySelector('.status').classList.toggle('warning',state.waiting>=14);
 $('boarded').textContent=`Boarded: ${state.boarded||0}`;$('departed').textContent=`Departures: ${state.departed||0}`;
 $('arrival').textContent=state.timed?`Next arrival: ${Math.ceil(state.arrival)}s`:'Layout study · arrivals stopped';
 if(state.event&&$('event').textContent!==state.event)$('event').textContent=state.event;
 for(const id of ['study','shift','fixture'])$(id).disabled=!ready;
 $('add').disabled=!playing||state.timed;
 if(failed)return;
 $('cover').hidden=playing;
 if(!ready)return;
 $('progress').hidden=true;$('continue').hidden=false;
 $('cover-title').textContent=state.phase==='lost'?'Station congested':state.paused||pendingPause?'Station paused':'Inspect the station';
 $('cover-copy').textContent=state.phase==='lost'?'The entrance boundary is full. Start a new study or try another shift.':state.paused||pendingPause?'Passengers, arrivals and trains are held in place.':'Route customers through the right bridge. Incorrect passengers return through the left bridge.';
 $('continue').textContent=state.phase==='lost'?'New layout study':state.paused||pendingPause?'Resume':'Open layout study';
}
window.TetStation={
 register(fn){callback=fn;send('reduced',{value:mq.matches});send('overlay',{value:$('routes').checked});},
 ready(){ready=true;if(document.hidden){pendingPause=true;render();}else start();},
 emit(raw){let next;try{next=JSON.parse(raw);}catch{return;}if(next.epoch!==epoch)return;state=next;render();},
 present(raw){
  let view;try{view=JSON.parse(raw);}catch{return;}if(view.epoch!==epoch)return;
  buttons.forEach(b=>{
   const r=view.targets.find(t=>t.platform===Number(b.dataset.platform)&&t.copy===Number(b.dataset.copy));
   b.hidden=!r||r.w<24;
   if(!b.hidden){b.style.left=`${r.x/1280*100}%`;b.style.top=`${(r.y+r.h/2)/800*100}%`;b.style.width=`${r.w/1280*100}%`;b.style.height=`${r.h/800*100}%`;}
  });
 },
 fail(error){failed=true;ready=false;$('cover').hidden=false;$('cover-title').textContent='Station could not load';$('cover-copy').textContent=error?.message||String(error);$('progress').hidden=true;$('continue').hidden=false;$('continue').textContent='Retry loading';render();}
};
$('continue').onclick=()=>{if(failed)location.reload();else if(state.paused||pendingPause){if(state.phase==='ready')start();else resume();}else start();};
$('study').onclick=()=>start();$('shift').onclick=()=>start('start',true);$('fixture').onclick=()=>start('fixture');
$('add').onclick=()=>send('add');$('pause').onclick=()=>state.paused||pendingPause?resume():pause();
$('routes').onchange=()=>send('overlay',{value:$('routes').checked});
$('reduced').checked=mq.matches;$('reduced').onchange=()=>send('reduced',{value:$('reduced').checked});
mq.addEventListener('change',()=>{$('reduced').checked=mq.matches;send('reduced',{value:mq.matches});});
buttons.forEach(button=>{
 let gesture=null;
 button.onpointerdown=e=>{gesture={epoch,id:state.ticket?.id,x:e.clientX,y:e.clientY,cancelled:!state.can_route||e.isPrimary===false||e.button!==0};};
 button.onpointermove=e=>{if(gesture&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>10)gesture.cancelled=true;};
 button.onpointercancel=()=>{if(gesture)gesture.cancelled=true;};
 button.onclick=e=>{if(e?.detail===0||!e)route(Number(button.dataset.platform));else if(gesture)route(Number(button.dataset.platform),gesture);gesture=null;};
});
window.addEventListener('keydown',e=>{
 if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||e.target.closest('input,textarea,select,[contenteditable=true]'))return;
 if(/^(Digit|Numpad)[1-4]$/.test(e.code)){e.preventDefault();route(Number(e.code.slice(-1))-1);}
 if(e.code==='Escape'){e.preventDefault();if(state.paused||pendingPause)resume();else pause();}
});
window.addEventListener('blur',pause);
window.addEventListener('pagehide',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='tet-switchyard-pause')pause();});
})();
