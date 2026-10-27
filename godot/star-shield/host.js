(() => {
'use strict';
const $=id=>document.getElementById(id), names=['Fire','Earth','Air','Water'], marks=['△','◇','≋','▽'],colors=['#f4aa78','#accea3','#cfb7ed','#83cadb'];
const waves=['THE FALLEN GATE','STONE AWAKENS','THE ASTRAL VAULT','THE LAST SENTINELS'];
const seed=(Number(new URLSearchParams(location.search).get('seed'))||2607)>>>0;
let callback=null,ready=false,failed=false,state={phase:'ready',paused:false,shield:0,charge:0,tick:0,x:240,y:535,wave:0,hull:3,score:0},muted=false;
const session=crypto.randomUUID();let epoch=0,identity=null,accepted=false,short=false,movement=null,pendingPause=false;
const keys=new Set(),canvas=$('canvas'),guide=$('guide'),mq=matchMedia('(prefers-reduced-motion: reduce)');
let audio=null;
function unlock(){try{audio??=new AudioContext();if(audio.state==='suspended')void audio.resume().catch(()=>{});}catch{}}
function tone(kind){if(muted||!audio||audio.state!=='running'||state.paused)return;const now=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();const hz={fire:420,absorb:784,hit:85,switch:294,counter:125}[kind]||220;const duration=kind==='counter'?.65:.14;o.type=kind==='hit'?'triangle':'sine';o.frequency.setValueAtTime(hz,now);o.frequency.exponentialRampToValueAtTime(kind==='absorb'?1174:hz*.4,now+duration);g.gain.setValueAtTime(kind==='fire'?.008:.045,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+duration);o.onended=()=>{o.disconnect();g.disconnect();};}
function send(type,values={}){if(callback)callback(JSON.stringify({type,...values}));}
function clear(){keys.clear();movement=null;send('input',{x:0,y:0});send('drag_end');}
function pause(){clear();pendingPause=true;send('pause');}
function playable(){return ready&&!short&&!pendingPause&&!state.paused&&state.phase==='playing'&&!guide.open;}
function start(){if(!ready||short)return;clear();identity={session,epoch:++epoch,run:`${session}:${epoch}`};accepted=false;pendingPause=false;unlock();send('start',{seed,identity});canvas.focus();}
function resume(){if(short||document.hidden||guide.open)return;clear();pendingPause=false;unlock();send('resume');canvas.focus();}
function select(value){if(!playable())return;unlock();send('shield',{value});}
function counter(){if(playable()&&state.charge===100){unlock();send('counter');}}
function keyboardMove(){send('input',{x:Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA')),y:Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'))});}
function render(){
 const playing=state.phase==='playing'&&!state.paused&&!short;
 document.querySelector('.ss-root').style.setProperty('--shield',colors[state.shield]);
 $('hull').setAttribute('aria-label',`${state.hull} hull remaining`);[...$('hull').children].forEach((el,i)=>el.classList.toggle('live',i<state.hull));
 $('wave').textContent=state.wave===3?'FINAL':`WAVE 0${state.wave+1} / 03`;$('time').textContent=state.wave===3?'ELIMINATE':`${30-Math.floor(state.tick/60)%30}s`;
 $('score').textContent=String(state.score).padStart(5,'0');$('wave-name').textContent=waves[state.wave];$('active-shield').textContent=`${names[state.shield].toUpperCase()} SHIELD`;$('selected-shield').textContent=`${marks[state.shield]} ${names[state.shield].toUpperCase()}`;
 document.querySelectorAll('[data-shield]').forEach((el,i)=>{el.disabled=!playing;el.classList.toggle('selected',i===state.shield);el.setAttribute('aria-pressed',String(i===state.shield));});
 $('counter').disabled=!playing||state.charge<100;$('counter').classList.toggle('charged',state.charge===100);$('charge').textContent=state.charge===100?'READY · SPACE':`${state.charge} / 100`;$('charge-bar').style.width=state.charge+'%';
 document.querySelectorAll('.ss-charge-card i').forEach((el,i)=>el.classList.toggle('filled',state.charge>i*50));
 document.querySelectorAll('.ss-wave-list>div').forEach((el,i)=>{el.classList.toggle('active',state.wave===i);el.querySelector('i').textContent=state.wave>i?'✓':state.wave===i?'●':'○';});
 $('pause').disabled=state.phase!=='playing'||short;$('pause').textContent=state.paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',state.paused?'Resume game':'Pause game');
 $('overlay').hidden=playing;if(playing)return;
 $('launch').hidden=short;$('launch').disabled=!ready;$('restart').hidden=!(state.phase==='playing'&&state.paused&&!short);$('replay').hidden=!['won','lost'].includes(state.phase)||short;
 if(short){$('eyebrow').textContent='EXPEDITION ON HOLD';$('heading').textContent='Turn to portrait';$('description').textContent='Your run is preserved. A taller view gives the seals room to approach.';$('footnote').textContent='Return to portrait, then resume.';return;}
 if(failed)return;
 $('eyebrow').textContent=state.phase==='ready'?'AWAKEN THE GUARDIAN':state.paused?'EXPEDITION ON HOLD':state.phase==='won'?'THE VAULT IS SAFE':'THE LIGHT FADES';
 $('heading').innerHTML=state.phase==='ready'?'The stars<br>remember.':state.paused?'Hold your light.':state.phase==='won'?'The ruins endure.':'Rise again.';
 $('description').textContent=state.phase==='ready'?'Steer your relic ship. Match the falling seals. Absorb two to unleash your counterattack.':state.paused?'The sky is waiting exactly where you left it.':`${state.score.toLocaleString()} points · ${state.absorbed} seals absorbed · ${state.destroyed} invaders destroyed`;
 $('launch').textContent=!ready?'OPENING THE GATE…':state.phase==='ready'?'ENTER THE RUINS ↗':state.paused?'RESUME FLIGHT ▷':'FLY AGAIN ↗';
 $('footnote').textContent=state.phase==='ready'?'3 waves + final formation · 3 hull':state.paused?'':'Preview run · no Cue Coins awarded';
}
window.StarShield={register(fn){callback=fn;send('settings',{muted,reduced:mq.matches});if(document.hidden||short||pendingPause)send('pause');},ready(){ready=true;$('progress').hidden=true;render();},tone,fail(error){failed=true;ready=false;$('heading').textContent='The gate did not open';$('description').textContent=`${error?.message||error}`;$('progress').hidden=true;$('launch').textContent='RETRY LOADING';$('launch').disabled=false;$('launch').hidden=false;},emit(raw){
 let event;try{event=JSON.parse(raw);}catch{return;}
 if(event.type==='state'){state=event;if(state.paused){keys.clear();movement=null;}render();}
 if(event.type==='complete'&&!accepted&&identity&&event.identity?.session===identity.session&&event.identity?.epoch===identity.epoch&&event.identity?.run===identity.run&&Number.isSafeInteger(event.score)&&event.score>=0&&['won','lost'].includes(event.result))accepted=true;
 if(event.type==='replay'){const blob=new Blob([JSON.stringify(event,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`star-shield-godot-${seed}-replay.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}};
$('launch').onclick=()=>{if(failed)location.reload();else if(state.phase==='playing'&&state.paused)resume();else start();};$('restart').onclick=start;$('replay').onclick=()=>send('replay');
$('pause').onclick=()=>state.paused?resume():pause();$('help').onclick=()=>{pause();guide.showModal();};
$('mute').onclick=()=>{unlock();muted=!muted;$('mute').textContent=muted?'♪̸':'♪';$('mute').setAttribute('aria-label',muted?'Unmute sound':'Mute sound');$('mute').setAttribute('aria-pressed',String(muted));send('settings',{muted});};
$('reduced').checked=mq.matches;$('reduced').onchange=()=>send('settings',{reduced:$('reduced').checked});mq.addEventListener('change',()=>{$('reduced').checked=mq.matches;send('settings',{reduced:mq.matches});});
for(const button of document.querySelectorAll('[data-shield]')){button.onpointerdown=e=>{if(e.pointerType!=='mouse'){e.preventDefault();select(Number(button.dataset.shield));}};button.onclick=()=>select(Number(button.dataset.shield));}
$('counter').onclick=counter;
canvas.addEventListener('pointerdown',e=>{if(!playable()||movement)return;e.preventDefault();unlock();canvas.focus();movement={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);send('drag_begin');});
canvas.addEventListener('pointermove',e=>{if(!playable()||movement?.id!==e.pointerId)return;const rect=canvas.getBoundingClientRect();send('drag',{x:(e.clientX-movement.x)*480/rect.width,y:(e.clientY-movement.y)*640/rect.height});});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(movement?.id===e.pointerId){movement=null;send('drag_end');}});
window.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||guide.open||e.target instanceof HTMLInputElement)return;if(e.code==='Escape'){e.preventDefault();if(!e.repeat){if(state.paused)resume();else pause();}return;}if(!playable())return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();keys.add(e.code);keyboardMove();}if(/^(Digit|Numpad)[1-4]$/.test(e.code)){e.preventDefault();if(!e.repeat)select(Number(e.code.slice(-1))-1);}if(e.code==='Space'){e.preventDefault();if(!e.repeat)counter();}},true);
window.addEventListener('keyup',e=>{if(keys.delete(e.code))keyboardMove();},true);
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='star-shield-pause')pause();});
function resize(){clear();short=innerHeight<500&&innerWidth>innerHeight;if(short)pause();render();}window.addEventListener('resize',resize);resize();
})();
