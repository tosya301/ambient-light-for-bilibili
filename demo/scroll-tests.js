/* Controlled scroll mismatch: retain production layout for one old position,
   while the real document/video scroll. No renderer styles are patched. The
   optional /baseline/content.js is supplied by the investigation's local server. */
(() => {
  const params=new URLSearchParams(location.search),baseline=params.has('baseline'),wide=params.has('wide'),B=globalThis.BiliGlow;
  const output=document.querySelector('#scroll-results'),video=document.querySelector('video');
  document.querySelector('#variant').textContent=baseline?'修复前 · 0.5.6':'本地修复候选';
  const nativeRAF=window.requestAnimationFrame.bind(window),nativeInterval=window.setInterval.bind(window);
  const nativeVideoFrame=HTMLVideoElement.prototype.requestVideoFrameCallback;
  if(wide){
    document.querySelector('#player').dataset.screen='wide';
    document.querySelector('main').style.paddingLeft='219.5px';
    for(const selector of ['#playerWrap','#player','.bpx-player-video-area','.bpx-player-video-wrap']){
      const element=document.querySelector(selector);element.style.width='1274px';
      if(selector!=='#playerWrap')element.style.height=selector==='#player'?'754px':'714px';
    }
    output.style.top='auto';output.style.bottom='12px';output.style.left='12px';output.style.fontSize='10px';output.style.maxHeight='130px';output.style.overflow='auto';
  }
  let frozen=false,held=[];
  window.requestAnimationFrame=callback=>nativeRAF(time=>{if(frozen)held.push(()=>callback(performance.now()));else callback(time);});
  window.setInterval=(callback,delay,...args)=>nativeInterval(()=>{if(!frozen)callback(...args);},delay);
  if(nativeVideoFrame)HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){return nativeVideoFrame.call(this,(time,metadata)=>{if(frozen)held.push(()=>callback(performance.now(),metadata));else callback(time,metadata);});};
  const source=document.createElement('canvas');source.width=wide?540:960;source.height=wide?960:540;
  const ctx=source.getContext('2d');
  function paint(){
    ctx.setTransform(source.width/960,0,0,source.height/540,0,0);
    const fill=ctx.createLinearGradient(0,0,960,540);fill.addColorStop(0,'#41cbb6');fill.addColorStop(1,'#ba80e7');ctx.fillStyle=fill;ctx.fillRect(0,0,960,540);
    ctx.fillStyle='#173c52';ctx.fillRect(150,130,660,280);ctx.fillStyle='#effaff';ctx.font='bold 50px system-ui';ctx.fillText('SCROLL TEST',290,280);ctx.font='24px system-ui';ctx.fillText('Static video / frame shadow = 0',290,330);
  }
  paint();video.srcObject=source.captureStream(30);video.play();nativeInterval(paint,80);
  B.storage.set({...B.defaults,privacyAccepted:true,enabled:true,roundedCorners:true,frameShadow:0,spread:400,strength:100,smoothing:0});
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function state(){const root=document.querySelector('[data-biliglow-root]'),shadow=root?.shadowRoot.querySelector('[data-biliglow-frame-shadow]'),wrap=document.querySelector('.bpx-player-video-wrap');return {variant:baseline?'baseline':'candidate',wide,frozen,scrollY,videoRect:video.getBoundingClientRect().toJSON(),clipPath:root?getComputedStyle(root).clipPath:null,shadowDisplay:shadow?getComputedStyle(shadow).display:null,pictureRounded:wrap.hasAttribute('data-biliglow-picture-rounded'),pictureClip:getComputedStyle(wrap).clipPath,pictureWillChange:getComputedStyle(wrap).willChange,frames:root?.dataset.frames};}
  function show(extra={}){output.textContent=JSON.stringify({...state(),...extra},null,2);}
  function resume(){frozen=false;const pending=held;held=[];for(const callback of pending)callback();}
  document.querySelector('#freeze-scroll').addEventListener('click',async()=>{
    resume();window.scrollTo({top:0,behavior:'instant'});await wait(250);frozen=true;window.scrollTo({top:120,behavior:'instant'});await wait(120);
    show({diagnostic:'已滚动真实文档，暂缓光层布局。检查视频下方旧位置是否露出黑色矩形。'});
  });
  document.querySelector('#resume').addEventListener('click',async()=>{resume();window.scrollTo({top:0,behavior:'instant'});await wait(250);show();});
  document.querySelector('#mask-check').addEventListener('click',()=>{
    const s=state(),checks=[{passed:s.clipPath==='none',label:'普通点播不保留会滞后的视口挖空'},{passed:s.shadowDisplay==='none',label:'0% 阴影没有阴影元素绘制'},{passed:s.pictureRounded,label:'实际视频仍保留独立圆角裁切'}];
    output.dataset.passed=String(checks.every(check=>check.passed));show({checks});
  });
  setTimeout(()=>show(),800);
})();
