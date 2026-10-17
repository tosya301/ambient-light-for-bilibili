/* Real production panel and renderer; fixture settings are page-local memory. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),B=globalThis.BiliGlow;
  const video=$('video'),player=$('#player'),out=$('#clear-results'),preview=$('#clear-preview');
  const source=document.createElement('canvas'),paint=source.getContext('2d');
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function until(test,label='等待生产状态超时',timeout=8000){const start=performance.now();while(performance.now()-start<timeout){if(test())return;await wait(60);}throw Error(label);}
  const root=()=>$('[data-biliglow-root]'),canvas=()=>root()?.shadowRoot.querySelector('canvas'),count=()=>Number(root()?.dataset.frames||0);
  const visible=e=>Boolean(e&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden');
  const backdrop=()=>$('[data-biliglow-backdrop]');
  let pattern='grid',running=false;const observations={};
  function paintFrame(){
    const w=source.width,h=source.height;
    if(pattern==='red'||pattern==='blue'){paint.fillStyle=pattern==='red'?'#ff0000':'#0000ff';paint.fillRect(0,0,w,h);return;}
    const tile=Math.max(40,Math.round(w/16));
    for(let y=0;y<h;y+=tile)for(let x=0;x<w;x+=tile){paint.fillStyle=(Math.floor(x/tile)+Math.floor(y/tile))%2?'#1d44be':'#f0d06a';paint.fillRect(x,y,tile,tile);}
    paint.fillStyle='#0a162b';paint.fillRect(w*.13,h*.2,w*.74,h*.6);
    paint.strokeStyle='#fff';paint.lineWidth=Math.max(4,w*.004);paint.strokeRect(10,10,w-20,h-20);
    paint.textAlign='center';paint.fillStyle='#fff';paint.font=`bold ${Math.round(w*.075)}px system-ui`;paint.fillText('SHARP  ABC',w*.5,h*.43);
    paint.font=`bold ${Math.round(w*.038)}px system-ui`;paint.fillText(`${w} × ${h}`,w*.5,h*.56);
    paint.font=`${Math.round(w*.025)}px monospace`;paint.fillText(`FRAME ${Math.floor(performance.now()/100)}`,w*.5,h*.68);
  }
  function resizeSource(portrait=false){source.width=portrait?1080:1920;source.height=portrait?1920:1080;paintFrame();}
  resizeSource();video.srcObject=source.captureStream(30);video.play().catch(()=>{});setInterval(paintFrame,33);
  const stored={strength:83,spread:147,blur:91,saturation:151,smoothing:85,fps:24,frameShadow:21};
  B.storage.set({...B.defaults,...stored,privacyAccepted:true,enabled:true,hideLauncher:true,roundedCorners:true,clearBackground:false});
  const settingsReady=B.storage.get();
  const panelShadow=$('#settings-panel').attachShadow({mode:'open'});B.mountPanel(panelShadow);
  const control=()=>panelShadow.querySelector('[data-setting="clearBackground"]');
  const preserved=()=>getComputedStyle(video).objectFit==='contain'&&getComputedStyle(video).transform==='none'&&!video.hasAttribute('data-biliglow-bar-crop')&&!video.style.getPropertyValue('--biliglow-video-transform');
  function noBlur(){const s=canvas()&&getComputedStyle(canvas());return Boolean(s&&!/blur\((?!0(?:px)?\))/.test(s.filter));}
  const clearState=()=>visible(root())&&canvas()?.width>256&&noBlur();
  const defaultState=()=>canvas()?.width===256&&/blur\(([1-9]|0\.[1-9])/.test(canvas().style.filter);
  function cover(){const c=canvas(),r=c?.getBoundingClientRect();return r&&Math.abs(r.left)<.6&&Math.abs(r.top)<.6&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1&&Math.abs(c.width/c.height-innerWidth/innerHeight)<.01;}
  // Independent centered-cover mapping: compare stable, flat source anchors
  // with background pixels. This catches stretching as well as off-centre crops.
  function mappedPixels(){
    const c=canvas(),target=c.getContext('2d'),w=source.width,h=source.height;
    const scale=Math.max(innerWidth/w,innerHeight/h),cw=innerWidth/scale,ch=innerHeight/scale,sx=(w-cw)/2,sy=(h-ch)/2;let safe=0,matched=0;
    for(const fy of [.07,.15,.85,.93])for(const fx of [.06,.18,.38,.62,.82,.94]){
      const tx=Math.min(c.width-1,Math.floor(c.width*fx)),ty=Math.min(c.height-1,Math.floor(c.height*fy));
      const x=sx+(tx+.5)/c.width*cw,y=sy+(ty+.5)/c.height*ch;
      const sample=paint.getImageData(Math.max(0,Math.floor(x)-2),Math.max(0,Math.floor(y)-2),5,5).data,expected=Array.from(sample.slice(48,51));
      if(!Array.from({length:25},(_,i)=>i*4).every(p=>[0,1,2].every(k=>Math.abs(sample[p+k]-expected[k])<=2)))continue;
      safe++;const actual=target.getImageData(tx,ty,1,1).data;if([0,1,2].every(k=>Math.abs(actual[k]-expected[k])<=5))matched++;
    }
    observations.coverMapping={source:[w,h],viewport:[innerWidth,innerHeight],bitmap:[c.width,c.height],safe,matched};return safe>=8&&matched===safe;
  }
  function pixels(){const c=canvas();return Array.from(c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data);}
  function hit(selector){const e=$(selector),r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}
  function sameRect(a,b){return ['left','top','width','height'].every(k=>Math.abs(a[k]-b[k])<1);}
  function setMode(mode){player.dataset.screen=mode;window.dispatchEvent(new Event('resize'));}
  async function toggle(on){await until(()=>control(),'实际设置面板未出现清晰背景开关');if(control().checked!==on)control().click();await until(()=>control().checked===on);const state=await B.storage.get();if(state.clearBackground!==on)throw Error('生产面板开关未保存布尔设置');}
  async function shape(portrait){resizeSource(portrait);await video.play();await until(()=>video.videoWidth===source.width&&video.videoHeight===source.height,'视频源尺寸未更新');}
  async function normal(){if(document.fullscreenElement)await document.exitFullscreen();setMode('normal');await until(()=>root()?.dataset.mode==='normal'&&!backdrop());}
  async function inspect(on){if(running)return;await normal();pattern='grid';paintFrame();await toggle(on);await until(on?clearState:defaultState);preview.textContent=JSON.stringify({clearBackground:(await B.storage.get()).clearBackground,source:[video.videoWidth,video.videoHeight],bitmap:[canvas().width,canvas().height],filter:canvas().style.filter,cover:cover(),picturePreserved:preserved()},null,2);}
  $('#preview-clear').onclick=()=>inspect(true);$('#preview-default').onclick=()=>inspect(false);
  $('#preview-landscape').onclick=async()=>{if(!running){await shape(false);await inspect(true);}};$('#preview-portrait').onclick=async()=>{if(!running){await shape(true);await inspect(true);}};
  $('#normal').onclick=()=>{if(!running)normal();};$('#leave').onclick=()=>{if(!running)normal();};$('#wide').onclick=()=>{if(!running)setMode('wide');};$('#fullscreen').onclick=()=>{if(!running)setMode('web');};$('#mini').onclick=()=>{if(!running)setMode('mini');};
  $('#run-clear-suite').onclick=async()=>{
    if(running)return;running=true;out.dataset.state='running';out.textContent='正在检查生产面板、画布与模式切换…';
    const results=[],check=(passed,label)=>{results.push({passed:Boolean(passed),label});out.textContent=`已检查 ${results.length} 项：${label}`;};
    try{
      await settingsReady;await B.storage.set({...stored,privacyAccepted:true,enabled:true,clearBackground:false});await normal();pattern='grid';await shape(false);await until(()=>visible(root())&&defaultState());
      check(B.defaults.clearBackground===false,'新布尔设置默认关闭');
      check(defaultState(),'默认仍为256px采样画布和原有模糊光效');
      await until(()=>control()&&!control().checked);const actualControl=control(),label=panelShadow.querySelector(`label[for="${actualControl.id}"]`);actualControl.scrollIntoView({block:'nearest'});
      check(actualControl.type==='checkbox'&&visible(actualControl)&&label?.textContent.includes('清晰全屏背景'),'生产设置面板含可见清晰全屏背景开关');
      const rect=video.getBoundingClientRect();await toggle(true);await until(clearState);
      check((await B.storage.get()).clearBackground===true&&clearState(),'点击实际生产开关保存开启并切换高分辨率清晰画布');
      check(canvas().width<=video.videoWidth&&canvas().height<=video.videoHeight&&Math.max(canvas().width,canvas().height)<=1920&&Math.abs(canvas().width/canvas().height-innerWidth/innerHeight)<.01,'横屏背景画布匹配视口、不超采样片源、长边不超过1920');
      check(noBlur()&&cover()&&mappedPixels(),'清晰背景无模糊、位图仅为视口尺寸，源像素按原比例居中cover');
      check(preserved()&&sameRect(rect,video.getBoundingClientRect()),'背景模式不裁剪、缩放或改变前景视频边界');
      check(hit('#control-hit')&&hit('.bpx-player-dm-input'),'背景不拦截播放器按钮与输入框');
      const settings=await B.storage.get();check(Object.entries(stored).every(([k,v])=>settings[k]===v),'开启清晰模式保留原强度、扩散、柔化、饱和度、平滑和帧率设置');
      pattern='red';paintFrame();await wait(500);const red=pixels();pattern='blue';paintFrame();await wait(300);const blue=pixels();observations.redBlue={red,blue,smoothing:(await B.storage.get()).smoothing};check(red[0]>=250&&red[2]<=4&&blue[0]<=4&&blue[2]>=250,'平滑85时红→蓝仍整帧替换，画布像素无旧帧残影');
      pattern='grid';paintFrame();video.pause();await wait(120);const pausedAt=count();await toggle(false);await until(defaultState);check(video.paused&&count()>pausedAt,'暂停时关闭开关立即重绘原有柔光');
      const before=count();await toggle(true);await until(clearState);check(video.paused&&count()>before&&preserved(),'暂停时开启开关立即重绘清晰背景');
      await video.play();await shape(true);await until(clearState);check(cover()&&mappedPixels()&&Math.max(canvas().width,canvas().height)<=1920,'竖屏1080×1920按原比例居中cover，位图匹配视口且受1920限制');
      await shape(false);await until(clearState);setMode('wide');await until(()=>root()?.dataset.mode==='theater'&&defaultState());check(preserved()&&(await B.storage.get()).clearBackground,'宽屏恢复原有256px柔光，保留清晰模式偏好');
      setMode('web');await until(()=>root()?.dataset.mode==='fullscreen'&&defaultState());check(preserved()&&(await B.storage.get()).clearBackground,'全屏恢复原有256px管线，保留前景画面与设置');
      await normal();await until(clearState);setMode('mini');await until(defaultState);check(preserved()&&canvas().width===256,'小窗模式保持原有256px柔光管线');
      await normal();await until(clearState);check(cover()&&preserved(),'返回普通模式自动恢复清晰背景');
      await B.storage.set({enabled:false});await until(()=>!visible(root()));const stopped=count();await wait(300);check(count()===stopped&&!backdrop(),'关闭扩展停止采样并隐藏背景');
      await B.storage.set({enabled:true});await until(clearState);check(cover(),'重新开启扩展恢复清晰背景');
      panelShadow.querySelector('[data-tab="more"]').click();panelShadow.querySelector('[data-privacy-revoke]').click();await until(()=>!visible(root()));const revoked=count();await wait(300);check((await B.storage.get()).privacyAccepted===false&&count()===revoked&&!document.documentElement.hasAttribute('data-biliglow-active'),'实际设置面板撤回同意后停止采样并恢复页面');
      panelShadow.querySelector('[data-privacy-accept]').click();await until(clearState);panelShadow.querySelector('[data-tab="light"]').click();await toggle(false);await until(defaultState);const final=await B.storage.get();check(Object.entries(stored).every(([k,v])=>final[k]===v)&&final.clearBackground===false&&preserved(),'实际面板重新同意并关闭清晰背景后恢复原参数与默认柔光');
    }catch(error){check(false,error.message);}
    finally{
      pattern='grid';paintFrame();await video.play().catch(()=>{});await B.storage.set({privacyAccepted:true,enabled:true,clearBackground:false});setMode('normal');panelShadow.querySelector('[data-tab="light"]').click();
      const failed=results.filter(r=>!r.passed).length,data={passed:failed===0,total:results.length,failed,skipped:0,observations,results};out.textContent=JSON.stringify(data,null,2);Object.assign(out.dataset,{state:'complete',passed:String(data.passed),total:String(data.total),failed:String(failed),skipped:'0'});running=false;
    }
  };
  setTimeout(()=>{if(out.dataset.state==='preparing'){out.dataset.state='ready';out.textContent='准备就绪；右侧为实际生产设置面板。';}},600);
})();
