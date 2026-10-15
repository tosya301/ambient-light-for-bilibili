/* Browser-only regression: real production adapters and CSS, synthetic local
   media, real geometry, mutation/resize observers and horizontal animation.
   No extension storage, fake DOM geometry, external URLs or network media. */
(() => {
  'use strict';
  const B=window.BiliGlow,P=window.BiliGlowPlayer,$=selector=>document.querySelector(selector);
  const shell=$('#fixture-wrapper'),output=$('#stability-results'),summary=$('#stability-summary');
  const live=P.createLiveBounds(),vod=P.createDanmakuBounds();
  const config={...B.defaults,enabled:true,roundedCorners:true};
  const shapes={landscape:{width:960,height:540,label:'横屏'},portrait:{width:540,height:960,label:'竖屏'},radio:{width:480,height:480,label:'电台方形封面'}};
  const modes={normal:'普通',theater:'宽屏',web:'网页全屏'};
  const emojiURL='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"%3E%3Ccircle fill="%23ffd15c" cx="32" cy="32" r="30"/%3E%3Ccircle fill="%23232436" cx="22" cy="25" r="4"/%3E%3Ccircle fill="%23232436" cx="42" cy="25" r="4"/%3E%3Cpath d="M18 40Q32 54 46 40" fill="none" stroke="%23232436" stroke-width="4"/%3E%3C/svg%3E';
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.8;
  const video=()=>$(state.kind==='live'?'#stability-live-video':'#stability-vod-video');
  const host=()=>$(state.kind==='live'?'#live-player':'.bpx-player-video-area');
  const layer=()=>$(state.kind==='live'?'.web-player-danmaku':'.bpx-player-render-dm-wrap');
  const container=()=>$(state.kind==='live'?'.danmaku-item-container':'.bpx-player-row-dm-wrap');
  const picture=()=>B.contentRect(rect(video()),video().videoWidth,video().videoHeight,getComputedStyle(video()).objectFit);
  let state={kind:'live',shape:'landscape',mode:'normal'},stream=null,paintTimer=null,canvas=null,running=false,active=false,report=null;
  async function until(test,label,ms=5000){const end=performance.now()+ms;while(performance.now()<end){if(test())return;await wait(30);}throw new Error(label+'：状态在 '+ms+' ms 内未就绪');}
  function layout(){
    if(!active||!video().videoWidth)return;
    const target=picture(),mode=state.mode==='web'?'fullscreen':state.mode;
    if(state.kind==='live')live.update(video(),config,mode,target,{native:false});
    else vod.update(video(),config,'video',mode,target);
  }
  function clearTracks(){for(const selector of ['.danmaku-item-container','.bpx-player-row-dm-wrap'])$(selector).replaceChildren();}
  function paint(){
    if(!canvas)return;const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    const gradient=c.createLinearGradient(0,0,w,h);gradient.addColorStop(0,'#164e63');gradient.addColorStop(1,'#581c87');c.fillStyle=gradient;c.fillRect(0,0,w,h);
    c.strokeStyle='#8edbff';c.lineWidth=8;c.strokeRect(8,8,w-16,h-16);c.fillStyle='#e8f9ff';c.textAlign='center';c.font='25px sans-serif';c.fillText(shapes[state.shape].label,w/2,h/2);c.fillText(w+' × '+h,w/2,h/2+36);
    const t=performance.now()/350;c.fillStyle='#ffd778';c.fillRect(w/2+Math.sin(t)*w*.22,h*.7,24,24);
  }
  async function setScene(kind,shape,mode){
    live.clear();vod.clear();clearTracks();state={kind,shape,mode};shell.dataset.kind=kind;shell.dataset.mode=mode;
    $('#live-player-ctnr').dataset.screen=mode==='web'?'web':'normal';$('#live-player-ctnr').className=mode==='web'?'webfullscreen':'normal';
    $('.bpx-player-container').dataset.screen=mode==='theater'?'wide':mode;
    $('#fixture-badge').textContent=(kind==='live'?'直播':'点播')+' · '+shapes[shape].label+' · '+modes[mode];
    clearInterval(paintTimer);stream?.getTracks().forEach(track=>track.stop());
    for(const element of document.querySelectorAll('video')){element.pause();element.srcObject=null;}
    canvas=document.createElement('canvas');Object.assign(canvas,{width:shapes[shape].width,height:shapes[shape].height});paint();
    if(!canvas.captureStream)throw new Error('当前浏览器不支持 Canvas captureStream');
    stream=canvas.captureStream(15);paintTimer=setInterval(paint,66);video().srcObject=stream;await video().play();
    await until(()=>video().readyState>=2&&video().videoWidth===shapes[shape].width&&video().videoHeight===shapes[shape].height,'合成视频元数据');
    await frame();layout();await frame();
  }
  function line(id,top,{fixed=false,emoji=false,hidden=false}={}){
    const node=document.createElement('span');node.className='bili-danmaku-x-dm bili-danmaku-x-'+(fixed?'center':'roll')+' bili-danmaku-x-show';node.dataset.stabilityId=id;
    node.style.setProperty(fixed?'--translateY':'--top',top+'px');node.style.animationDelay=(-1-(Number(id.replace(/\D/g,''))||0)%7)+'s';
    node.textContent=id+'  弹幕播放中';if(hidden)node.style.display='none';
    if(emoji){const img=document.createElement('img');img.className='fixture-tall-emoji';img.alt='本地表情';img.src=emojiURL;node.append(img);}
    return node;
  }
  const vertical=node=>rect(node).top;
  const nativeState=node=>({top:node.style.getPropertyValue('--top'),translateY:node.style.getPropertyValue('--translateY'),animation:getComputedStyle(node).animationName,duration:getComputedStyle(node).animationDuration,font:getComputedStyle(node).fontSize,lineHeight:getComputedStyle(node).lineHeight});
  const nativeUnchanged=(node,old)=>Object.entries(nativeState(node)).every(([key,value])=>value===old[key]);
  const matrix=node=>new DOMMatrixReadOnly(getComputedStyle(node).transform==='none'?undefined:getComputedStyle(node).transform);
  const visualBox=node=>{const boxes=[node,...node.querySelectorAll('img')].map(rect);return {top:Math.min(...boxes.map(r=>r.top)),bottom:Math.max(...boxes.map(r=>r.bottom))};};
  function snapshot(){
    return {state:{...state},metadata:{width:video().videoWidth,height:video().videoHeight},host:rect(host()),picture:picture(),layer:rect(layer()),lines:[...container().children].map(node=>({id:node.dataset.stabilityId,rect:rect(node),native:nativeState(node),ownedTop:node.style.getPropertyValue('--biliglow-live-track-top')||node.style.getPropertyValue('--biliglow-danmaku-track-top')}))};
  }
  async function sample(nodes,baseline,frames=3){
    let max=0,worst=null;const ranges=new Map(nodes.map(node=>[node,{id:node.dataset.stabilityId,baseline:baseline.get(node),min:baseline.get(node),max:baseline.get(node)}]));
    for(let tick=0;tick<frames;tick++){await frame();for(const node of nodes){const y=vertical(node),range=ranges.get(node),movement=Math.abs(y-baseline.get(node));range.min=Math.min(range.min,y);range.max=Math.max(range.max,y);if(movement>max){max=movement;worst={id:node.dataset.stabilityId,movement,tick};}}}
    return {max,worst,tracks:[...ranges.values()]};
  }
  function finishOutput(){
    output.dataset.results=JSON.stringify(report.results);output.dataset.total=String(report.results.length);output.dataset.failed=String(report.results.filter(result=>!result.passed).length);output.dataset.passedCount=String(report.results.filter(result=>result.passed).length);
    summary.textContent=output.dataset.passedCount+' / '+output.dataset.total+' 项通过，失败 '+output.dataset.failed+' 项';
    output.textContent=report.results.map(result=>(result.passed?'✓ ':'✗ ')+result.label+(result.detail?' · '+result.detail:'')).join('\n');
  }
  function check(passed,label,detail='',evidence){report.results.push({passed:Boolean(passed),label,detail,...(evidence?{evidence}:{})});finishOutput();}
  async function checkGeometry(label){
    layout();await frame();const h=rect(host()),p=picture(),r=rect(layer());
    const expectedWidth=state.kind==='live'||state.shape==='portrait'?h:p;
    check(near(r.left,expectedWidth.left)&&near(r.width,expectedWidth.width),label+(expectedWidth===h?'：弹幕宽度覆盖播放器':'：横屏保留原有画面宽度'),`弹幕 ${r.width.toFixed(2)} px / 预期 ${expectedWidth.width.toFixed(2)} px`,{host:h,picture:p,layer:r});
    check(near(r.top,p.top)&&near(r.height,p.height),label+'：保留有效画面的上下边界',`弹幕 top ${r.top.toFixed(2)} / height ${r.height.toFixed(2)}`);
    if(state.shape!=='landscape')check(p.width<h.width-10,label+'：合成画面有可测量的左右留白',`画面 ${p.width.toFixed(2)} px < 播放器 ${h.width.toFixed(2)} px`);
  }
  async function checkMotion(label){
    const height=rect(layer()).height,seed=[];
    // Include cached positions outside the resized viewport, close lower
    // tracks, duplicate native tracks, and fixed top/bottom comments.
    for(let i=0;i<22;i++)seed.push(line('resident-'+i,i<4?i*39:height-90+(i-4)*25));
    seed.push(line('fixed-top',-14,{fixed:true}),line('fixed-bottom',height+400,{fixed:true}));
    const peer=line('emoji-peer',height+240),emoji=line('emoji-same-track',height+240,{emoji:true});seed.push(peer);container().append(...seed);
    await until(()=>seed.every(node=>node.hasAttribute('data-biliglow-live-track')),'直播轨道适配');await frame();
    const initial=new Map(seed.map(node=>[node,vertical(node)])),native=new Map(seed.map(node=>[node,nativeState(node)]));
    let worst={max:0,worst:null};const ranges=new Map();const record=async(nodes=seed,baseline=initial,frames=3)=>{const result=await sample(nodes,baseline,frames);if(result.max>worst.max)worst={max:result.max,worst:result.worst};for(const range of result.tracks){const previous=ranges.get(range.id);ranges.set(range.id,previous?{...range,min:Math.min(previous.min,range.min),max:Math.max(previous.max,range.max)}:range);}};
    const wave=[];
    for(let step=0;step<8;step++){
      const batch=[];for(let i=0;i<9;i++)batch.push(line('new-'+step+'-'+i,(step%2?-70:height+600)+i*31));
      container().append(...batch);wave.push(...batch);await record();
      for(const node of wave.splice(0,Math.min(7,wave.length)))node.remove();await record();
    }
    for(const node of wave)node.remove();await record();
    check(worst.max<.8,label+'：高密度弹幕出生、离场时已有弹幕不跳动',`逐帧最大 Y 漂移 ${worst.max.toFixed(3)} px`,{...worst,tracks:[...ranges.values()]});
    // A new taller image on an occupied native track must not move existing
    // text. Its own full visual extent must still remain inside the bounds.
    const survivors=seed,stableBaseline=new Map(survivors.map(node=>[node,vertical(node)]));
    container().append(emoji);const born=await sample(survivors,stableBaseline,5);
    check(born.max<.8,label+'：同轨首次出现高表情时已有文字不跳动',`最大 Y 漂移 ${born.max.toFixed(3)} px`,born);
    emoji.remove();const removed=await sample(survivors,stableBaseline,5);container().append(emoji);const returned=await sample(survivors,stableBaseline,5);
    check(Math.max(removed.max,returned.max)<.8,label+'：同轨高表情离场、再次出现时文字不跳动',`最大 Y 漂移 ${Math.max(removed.max,returned.max).toFixed(3)} px`,{removed,returned});
    native.set(emoji,nativeState(emoji));const observed=[...seed,emoji],left=matrix(peer).m41;await wait(130);const right=matrix(peer).m41;
    check(Math.abs(right-left)>1&&observed.every(node=>nativeUnchanged(node,native.get(node)))&&observed.filter(node=>node.classList.contains('bili-danmaku-x-roll')).every(node=>Math.abs(matrix(node).m42)<.1),label+'：原生 --top / --translateY、字号与横向动画保留',`滚动 X 变化 ${(right-left).toFixed(2)} px`);
    check(observed.filter(node=>node.classList.contains('bili-danmaku-x-center')).every(node=>Math.abs(matrix(node).m42-(parseFloat(node.style.getPropertyValue('--translateY'))||0))<.1),label+'：固定弹幕原生 translateY 未被替换');
    const bounds=rect(layer()),outside=observed.map(node=>({id:node.dataset.stabilityId,...visualBox(node)})).filter(box=>box.top<bounds.top-.8||box.bottom>bounds.bottom+.8);
    check(outside.length===0,label+'：高表情与已有完整行仍处于上下边界内',outside.length?JSON.stringify(outside):'无整行裁切');
    report.scenes.push(snapshot());
  }
  async function checkVideoTracks(label){
    const lines=[line('vod-middle',120),line('vod-bottom',rect(layer()).height+200),line('vod-fixed-bottom',rect(layer()).height+350,{fixed:true})];container().append(...lines);layout();await frame();
    const n=lines.map(nativeState),x=matrix(lines[0]).m41;await wait(100);
    check(lines.every((node,i)=>nativeUnchanged(node,n[i]))&&Math.abs(matrix(lines[0]).m41-x)>1,label+'：竖屏宽度修复保留原生滚动和固定弹幕');report.scenes.push(snapshot());
  }
  async function run(){
    if(running)return report;running=true;active=true;document.documentElement.setAttribute('data-biliglow-active','');
    report={version:1,started:new Date().toISOString(),userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},results:[],scenes:[]};
    output.dataset.state='running';delete output.dataset.passed;$('#download-stability-report').disabled=true;
    for(const button of document.querySelectorAll('button,select'))button.disabled=true;document.body.dataset.preview='false';
    try{
      for(const mode of Object.keys(modes)){
        for(const shape of Object.keys(shapes)){
          await setScene('live',shape,mode);const label='直播 / '+shapes[shape].label+' / '+modes[mode];await checkGeometry(label);await checkMotion(label);
        }
        for(const shape of ['landscape','portrait']){
          await setScene('video',shape,mode);const label='点播 / '+shapes[shape].label+' / '+modes[mode];await checkGeometry(label);await checkVideoTracks(label);
        }
      }
      live.clear();vod.clear();check(!document.querySelector('[data-biliglow-live-bounds],[data-biliglow-live-track],[data-biliglow-danmaku-bounds]')&&![...document.querySelectorAll('.bili-danmaku-x-dm')].some(node=>[...node.style].some(key=>/^--biliglow-(live|danmaku)-/.test(key))),'结束后清理生产适配器的边界、轨道标记与变量');
    }catch(error){check(false,'回归中断',error.stack||error.message);}
    finally{
      try{await setScene('live','landscape','normal');}catch(error){check(false,'恢复本地预览失败',error.message);}
      running=false;report.finished=new Date().toISOString();report.passed=report.results.length>0&&report.results.every(result=>result.passed);
      output.dataset.state='complete';output.dataset.passed=String(report.passed);finishOutput();window.liveStabilityReport=report;
      for(const button of document.querySelectorAll('button,select'))button.disabled=false;$('#download-stability-report').disabled=false;
    }
    return report;
  }
  async function preview(){if(running)return;active=true;document.documentElement.setAttribute('data-biliglow-active','');await setScene($('#preview-kind').value,$('#preview-shape').value,$('#preview-mode').value);const height=rect(layer()).height;container().append(...Array.from({length:12},(_,i)=>line('preview-'+i,i===11?height+200:20+i*31,{emoji:i===11})));layout();document.body.dataset.preview=String(state.mode==='web');}
  $('#run-stability-tests').addEventListener('click',run);$('#apply-preview').addEventListener('click',()=>preview().catch(error=>{$('#error-note').textContent=error.message;}));
  $('#download-stability-report').addEventListener('click',()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='live-stability-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const exit=()=>{if(running)return;$('#preview-mode').value='normal';document.body.dataset.preview='false';preview().catch(error=>{$('#error-note').textContent=error.message;});};
  $('#exit-preview').addEventListener('click',exit);document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.mode==='web')exit();});window.addEventListener('resize',layout);
  window.addEventListener('pagehide',()=>{clearInterval(paintTimer);stream?.getTracks().forEach(track=>track.stop());live.clear();vod.clear();});
  window.liveStabilityFixture={run,preview,setScene,snapshot};
  setScene('live','landscape','normal').catch(error=>{$('#error-note').textContent=error.message;});
})();
