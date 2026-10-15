/* Browser regression using real production scripts and the observed live
   overlay hierarchy. No settings are enabled without prior user consent. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),B=window.BiliGlow,F=window.liveFixture;
  const button=$('#run-live-picture-tests'),output=$('#live-picture-results');
  // Keep completed counts readable without expanding a long result list.
  for(const [id,label] of [['live-picture-results','画面边界'],['live-native-picture-results','原生全屏'],['live-control-shade-results','底栏圆角'],['live-track-results','完整弹幕']]){
    const report=document.getElementById(id),summary=document.createElement('p');
    summary.setAttribute('role','status');report.before(summary);
    new MutationObserver(()=>{
      const d=report.dataset;
      if(!['complete','partial','skipped'].includes(d.state)){summary.textContent='';return;}
      const failures=JSON.parse(d.results||'[]').filter(r=>!r.passed).map(r=>r.label+(r.detail?'：'+r.detail:''));
      summary.textContent=`${label}：${d.passedCount||0}/${d.total||0} 通过；失败 ${d.failed||0}；跳过 ${d.skipped||0}；状态 ${d.state}`+(failures.length?'。'+failures.join('；'):'');
    }).observe(report,{attributes:true,attributeFilter:['data-state','data-results']});
  }
  const layerSelector='#live-player > :is(.web-player-danmaku,#animation-mask-wrapper,.web-player-inject-wrap)';
  const layers=()=>[...document.querySelectorAll(layerSelector)];
  const root=()=>$('[data-biliglow-root]');
  const shadow=()=>root()?.shadowRoot.querySelector('[data-biliglow-frame-shadow]');
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function until(predicate,label){
    const began=performance.now();
    while(performance.now()-began<5000){if(predicate())return;await wait(60);}
    throw new Error(label+'：5 秒内未就绪');
  }
  const closeRect=(a,b)=>['left','top','width','height'].every(k=>Math.abs(a[k]-b[k])<1);
  const picture=()=>B.contentRect(F.video.getBoundingClientRect(),F.video.videoWidth,F.video.videoHeight,getComputedStyle(F.video).objectFit);
  const bound=()=>layers().length===3&&layers().every(el=>el.hasAttribute('data-biliglow-live-bounds')&&closeRect(el.getBoundingClientRect(),picture()));
  const clipRadius=el=>getComputedStyle(el).borderRadius==='12px'||/round\s+12px/.test(getComputedStyle(el).clipPath);
  const targetAtCenter=el=>{
    const r=el.getBoundingClientRect();
    const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return Boolean(hit&&(hit===el||el.contains(hit)));
  };
  const shade=()=>$('#live-player > .web-player-controller-bg');
  const controlWrap=()=>$('#live-player > #web-player-controller-wrap-el');
  const controlFrames=()=>[shade(),controlWrap()];
  const controlEdgesMatch=(element,rect)=>{
    const r=element.getBoundingClientRect();
    return Math.abs(r.left-rect.left)<1&&Math.abs(r.width-rect.width)<1&&Math.abs(r.bottom-rect.top-rect.height)<1;
  };
  const noControlFrameProperties=el=>![...el.style].some(property=>property.startsWith('--biliglow-live-control-'));
  const shadeToggle=$('#toggle-live-control-shade');
  let shadePinned=false,shadeTesting=false;
  const showShade=on=>{shade().style.display=on?'block':'none';};
  $('#live-player').addEventListener('mouseenter',()=>{if(!shadeTesting)showShade(true);});
  $('#live-player').addEventListener('mouseleave',()=>{if(!shadeTesting&&!shadePinned)showShade(false);});
  shadeToggle.addEventListener('click',()=>{
    shadePinned=!shadePinned;shadeToggle.setAttribute('aria-pressed',String(shadePinned));
    shadeToggle.textContent=shadePinned?'取消固定控制栏底色':'固定显示控制栏底色';showShade(shadePinned);
  });
  // Read the browser's resolved clip, including calc(100% - Npx). Keeping the
  // entire picture's shape can deliberately put its top above the 56px strip.
  const cssTerms=text=>text.match(/calc\([^)]*\)|[^\s]+/g)||[];
  const four=values=>values.length===1?[values[0],values[0],values[0],values[0]]:values.length===2?[values[0],values[1],values[0],values[1]]:values.length===3?[values[0],values[1],values[2],values[1]]:values;
  const cssLength=(text,basis)=>{
    const expression=text.replace(/^calc\((.*)\)$/,'$1').replace(/\s/g,'');
    const terms=[...expression.matchAll(/([+-]?\d*\.?\d+)(px|%)/g)];
    if(!terms.length||terms.map(term=>term[0]).join('')!==expression)return NaN;
    return terms.reduce((sum,term)=>sum+Number(term[1])*(term[2]==='%'?basis/100:1),0);
  };
  const shadeShape=()=>{
    const text=getComputedStyle(shade()).clipPath,r=shade().getBoundingClientRect();
    if(!text.startsWith('inset(')||!text.endsWith(')'))return null;
    const [offsetText,roundText='0px']=text.slice(6,-1).split(/\s+round\s+/);
    const offsets=four(cssTerms(offsetText)).map((term,i)=>cssLength(term,i%2?r.width:r.height));
    const radii=four(cssTerms(roundText.split('/')[0])).map(term=>cssLength(term,r.width));
    if(offsets.length!==4||radii.length!==4||[...offsets,...radii].some(value=>!Number.isFinite(value)))return null;
    return {rect:{left:r.left+offsets[3],top:r.top+offsets[0],width:r.width-offsets[1]-offsets[3],height:r.height-offsets[0]-offsets[2]},radii};
  };
  const cleanLiveProperties=el=>{
    el.removeAttribute('data-biliglow-live-bounds');
    for(const key of ['left','top','width','height','radius'])el.style.removeProperty('--biliglow-live-'+key);
  };
  button.addEventListener('click',async()=>{
    const original=await B.storage.get();
    if(!B.isActive(original)){output.textContent='请先在设置中同意并开启氛围光，再运行画面边界回归。';output.dataset.state='needs-consent';return;}
    const before={web:$('#live-player-ctnr').dataset.screen==='web',chat:F.webChat,portrait:$('#portrait-stream').getAttribute('aria-pressed')==='true',stopped:!F.video,paused:F.video?.paused,scrollX,scrollY};
    const peers=[...document.querySelectorAll('#run-live-tests,#run-web-tests,#frame-tests,#live-color-tests,#run-live-native-picture-tests,#run-live-control-shade-tests,#run-live-track-tests,#toggle-live-control-shade')].map(el=>({el,disabled:el.disabled}));
    button.disabled=true;peers.forEach(({el})=>el.disabled=true);
    const results=[];output.dataset.state='running';delete output.dataset.passed;
    const check=(passed,label,detail='')=>{
      results.push({passed:Boolean(passed),label,detail});
      output.textContent=results.map(r=>`${r.passed?'✓':'✗'} ${r.label}${r.detail?' · '+r.detail:''}`).join('\n');
    };
    const checkScene=async(label,{web=false,chat=false,portrait=false}={})=>{
      F.setWeb(false);F.setPortrait(portrait);F.setWeb(web,chat);window.scrollTo({top:0,behavior:'instant'});
      await until(()=>F.video?.readyState>=2&&(portrait?F.video.videoHeight>F.video.videoWidth:F.video.videoWidth>F.video.videoHeight)&&bound(),label+'叠加层');
      await until(()=>F.video.hasAttribute('data-biliglow-live-picture-rounded')&&shadow()?.style.display==='block',label+'圆角阴影');
      const p=picture(),videoBox=F.video.getBoundingClientRect(),videoStyle=getComputedStyle(F.video);
      check(bound(),label+'：弹幕、动画和通知层均对齐有效视频画面');
      check(clipRadius(F.video)&&layers().every(clipRadius),label+'：视频和三层叠加内容均有 12px 圆角');
      check(closeRect(shadow().getBoundingClientRect(),p),label+'：阴影紧贴实际画面边缘');
      check(videoStyle.opacity==='1'&&videoStyle.filter==='none'&&videoStyle.objectFit==='contain'&&closeRect(videoBox,$('#live-player').getBoundingClientRect()),label+'：保留原视频尺寸、比例与颜色');
      check(layers().every(el=>getComputedStyle(el).pointerEvents==='none')&&targetAtCenter($('.player-toolbar')),label+'：叠加层不挡住播放器控制区');
      if(chat)check(targetAtCenter($('#chat-control-panel-vm input'))&&getComputedStyle($('#aside-area-vm')).opacity==='1',label+'：聊天输入区仍可命中且保持原透明度');
      if(portrait)check(p.width<videoBox.width-20,label+'：确实包含两侧留白，边界检查不是满框巧合');
    };
    try{
      F.setWeb(false);F.setPortrait(false);await F.reconnect();window.scrollTo({top:0,behavior:'instant'});
      await B.storage.set({...original,enabled:true,roundedCorners:true,frameShadow:65});
      await checkScene('普通横屏');
      await checkScene('网页模式保留聊天',{web:true,chat:true});
      check(root()?.dataset.mode==='fullscreen'&&Boolean($('[data-biliglow-backdrop]')),'网页模式继续使用原有光效和遮挡底板');
      await checkScene('竖屏网页模式',{web:true,chat:true,portrait:true});
      const expected=picture();
      await B.storage.set({roundedCorners:false});
      await until(()=>!F.video.hasAttribute('data-biliglow-live-picture-rounded')&&layers().every(el=>!clipRadius(el)),'关闭圆角');
      check(bound()&&closeRect(shadow().getBoundingClientRect(),expected),'关闭圆角后，叠加层边界与独立阴影仍贴合实际画面');
      check(getComputedStyle(F.video).clipPath==='none','关闭圆角恢复视频原生裁切样式');
      await B.storage.set({roundedCorners:true});
      await until(()=>F.video.hasAttribute('data-biliglow-live-picture-rounded'),'重新开启圆角');
      const oldVideo=F.video;await F.replace();
      await until(()=>F.video!==oldVideo&&F.video.hasAttribute('data-biliglow-live-picture-rounded')&&bound(),'替换视频');
      check(!oldVideo.hasAttribute('data-biliglow-live-picture-rounded')&&!oldVideo.style.getPropertyValue('--biliglow-live-picture-clip'),'替换视频后清理旧视频并重绑新视频');
      const oldLayers=layers();
      for(const old of oldLayers){const next=old.cloneNode(true);cleanLiveProperties(next);old.replaceWith(next);}
      await until(bound,'替换叠加层');
      check(oldLayers.every(el=>!el.hasAttribute('data-biliglow-live-bounds'))&&layers().every(clipRadius),'原生重建叠加层后重新对齐并清理旧层');
      check(root().shadowRoot.querySelectorAll('[data-biliglow-frame-shadow]').length===1,'重建后仅有一个阴影层');
      await B.storage.set({enabled:false});
      await until(()=>!F.video.hasAttribute('data-biliglow-live-picture-rounded')&&layers().every(el=>!el.hasAttribute('data-biliglow-live-bounds')),'关闭氛围光');
      const hostRect=$('#live-player').getBoundingClientRect();
      check(layers().every(el=>closeRect(el.getBoundingClientRect(),hostRect)&&getComputedStyle(el).clipPath==='none'&&getComputedStyle(el).pointerEvents==='none'),'关闭后，三层恢复原生满播放器尺寸、裁切和事件行为');
      check(layers().every(el=>['left','top','width','height','radius'].every(key=>!el.style.getPropertyValue('--biliglow-live-'+key)))&&!F.video.style.getPropertyValue('--biliglow-live-picture-clip'),'关闭后移除全部新增边界与圆角变量');
      check(shadow()?.style.display==='none'&&!$('[data-biliglow-backdrop]'),'关闭后清理阴影与网页模式底板');
      await B.storage.set({enabled:true});
      await until(()=>bound()&&F.video.hasAttribute('data-biliglow-live-picture-rounded'),'重新开启');
      check(true,'网页模式重新开启后恢复圆角与画面边界');
    }catch(error){check(false,'回归中断',error.message);}
    finally{
      try{
        F.setWeb(false);F.setPortrait(before.portrait);F.setWeb(before.web,before.chat);
        if(before.stopped)F.stop();else{await F.reconnect();if(before.paused)F.video.pause();}
        await B.storage.set(original);
        const restored=await B.storage.get();
        check(Object.keys(original).every(key=>original[key]===restored[key]),'自检后完整恢复原有设置');
        window.scrollTo({left:before.scrollX,top:before.scrollY,behavior:'instant'});
      }catch(error){check(false,'还原状态失败',error.message);}
      button.disabled=false;peers.forEach(({el,disabled})=>el.disabled=disabled);
      output.dataset.state='complete';output.dataset.passed=String(results.length>0&&results.every(r=>r.passed));
      output.dataset.total=String(results.length);output.dataset.passedCount=String(results.filter(r=>r.passed).length);output.dataset.failed=String(results.filter(r=>!r.passed).length);
      output.dataset.results=JSON.stringify(results);
    }
  });

  // Separate real Fullscreen API coverage leaves the web-mode result intact.
  // Request from this explicit click, before timers consume user activation.
  const nativeButton=$('#run-live-native-picture-tests'),nativeOutput=$('#live-native-picture-results');
  $('#exit-native-fullscreen').addEventListener('click',()=>{
    if(document.fullscreenElement)document.exitFullscreen().catch(error=>{nativeOutput.textContent='退出原生全屏失败：'+error.message;});
  });
  nativeButton.addEventListener('click',async()=>{
    if(nativeButton.disabled)return;
    const original=await B.storage.get(),stage=$('#fullscreen-container');
    if(!B.isActive(original)){nativeOutput.textContent='请先在设置中同意并开启氛围光，再测试原生全屏。';nativeOutput.dataset.state='needs-consent';return;}
    if(!stage.requestFullscreen||document.fullscreenEnabled===false){
      nativeOutput.textContent='未运行：当前浏览器或嵌入环境不支持原生全屏。没有将能力缺失计为通过。';
      nativeOutput.dataset.state='skipped';nativeOutput.dataset.capability='unsupported';nativeOutput.dataset.skipped='1';delete nativeOutput.dataset.passed;return;
    }
    if(document.fullscreenElement){nativeOutput.textContent='请先退出当前原生全屏，再点击测试。';nativeOutput.dataset.state='needs-exit';return;}
    if(!F.video){nativeOutput.textContent='请先点击“重连直播”，再测试原生全屏。';nativeOutput.dataset.state='needs-video';return;}
    const before={web:$('#live-player-ctnr').dataset.screen==='web',chat:F.webChat,portrait:$('#portrait-stream').getAttribute('aria-pressed')==='true',paused:F.video.paused,shadeDisplay:shade().style.display,scrollX,scrollY};
    const peers=[...document.querySelectorAll('#run-live-tests,#run-web-tests,#frame-tests,#live-color-tests,#run-live-picture-tests,#run-live-control-shade-tests,#run-live-track-tests,#toggle-live-control-shade')].map(el=>({el,disabled:el.disabled}));
    nativeButton.disabled=true;peers.forEach(({el})=>el.disabled=true);
    shadeTesting=true;showShade(true);
    const results=[],events=[];let skipped=false,skipReason='';
    nativeOutput.dataset.state='running';nativeOutput.dataset.skipped='0';delete nativeOutput.dataset.passed;
    const check=(passed,label,detail='')=>{
      results.push({passed:Boolean(passed),label,detail});
      nativeOutput.textContent=results.map(r=>`${r.passed?'✓':'✗'} ${r.label}${r.detail?' · '+r.detail:''}`).join('\n');
    };
    const onFullscreen=()=>events.push({entered:document.fullscreenElement===stage,time:performance.now()});
    document.addEventListener('fullscreenchange',onFullscreen);
    const nativeWithoutNewBounds=()=>document.documentElement.hasAttribute('data-biliglow-active')&&document.documentElement.hasAttribute('data-biliglow-live')&&!F.video.hasAttribute('data-biliglow-live-picture-rounded')&&!$('#live-player').hasAttribute('data-biliglow-rounded')&&bound()&&layers().every(el=>!clipRadius(el))&&!shade().hasAttribute('data-biliglow-live-control-shade')&&controlFrames().every(el=>!el.hasAttribute('data-biliglow-live-control-frame'));
    const nativeGeometry=label=>{
      const viewport={left:0,top:0,width:innerWidth,height:innerHeight},v=F.video.getBoundingClientRect(),p=picture(),s=getComputedStyle(F.video),host=$('#live-player');
      const fits=p.left>=-.5&&p.top>=-.5&&p.left+p.width<=innerWidth+.5&&p.top+p.height<=innerHeight+.5;
      const maximum=Math.abs(p.width-innerWidth)<1||Math.abs(p.height-innerHeight)<1;
      check(closeRect(stage.getBoundingClientRect(),viewport)&&closeRect(host.getBoundingClientRect(),viewport)&&closeRect(v,viewport),label+'：原生播放器和视频盒子使用完整全屏视口');
      check(s.objectFit==='contain'&&s.objectPosition==='50% 50%'&&s.transform==='none'&&s.clipPath==='none'&&fits&&maximum&&Math.abs(p.width/p.height-F.video.videoWidth/F.video.videoHeight)<.001,label+'：画面保持原比例、完整可见并放到最大，不裁切或拉伸');
      check(getComputedStyle(host).borderRadius==='0px'&&getComputedStyle(host).boxShadow==='none'&&getComputedStyle(host).borderTopWidth==='0px',label+'：保留直角，没有新增边框或圆角');
      check(bound()&&layers().every(el=>!clipRadius(el)),label+'：消息层贴实际画面但保留直角，避免上下弹幕裁半行');
      const sr=shade().getBoundingClientRect();
      check(!shade().hasAttribute('data-biliglow-live-control-shade')&&!shade().style.getPropertyValue('--biliglow-live-shade-clip')&&getComputedStyle(shade()).clipPath==='none'&&controlFrames().every(el=>!el.hasAttribute('data-biliglow-live-control-frame')&&noControlFrameProperties(el)&&controlEdgesMatch(el,v))&&Math.abs(sr.height-56)<1&&controlWrap().getBoundingClientRect().height===0,label+'：底色和零高控制层恢复原生全宽、底边和直角，不加新裁切');
    };
    try{
      F.setWeb(false);F.setPortrait(false);
      // Local in-memory storage updates synchronously. Do not await a timer
      // before requestFullscreen: it must consume this actual button gesture.
      const settingsWrite=B.storage.set({...original,enabled:true,roundedCorners:true,frameShadow:65,strength:80});
      const playback=F.video.play();
      try{await stage.requestFullscreen();}catch(error){
        skipped=true;skipReason=error.name+': '+error.message;nativeOutput.dataset.capability='denied';
      }
      await settingsWrite;await playback;
      if(!skipped){
        nativeOutput.dataset.capability='supported';
        await until(()=>document.fullscreenElement===stage&&events.some(event=>event.entered),'实际原生全屏事件');
        check(true,'Fullscreen API 已真实进入播放器全屏，并收到 fullscreenchange');
        await until(()=>F.video.videoWidth>F.video.videoHeight&&nativeWithoutNewBounds(),'原生全屏撤去新增圆角和边界');
        check(nativeWithoutNewBounds(),'原生全屏保留氛围光和消息画面边界，撤去视频圆角与控制栏装饰');
        await until(()=>root()&&getComputedStyle(root()).display==='block'&&getComputedStyle(root()).visibility==='visible','原有全屏氛围光');
        check(stage.hasAttribute('data-biliglow-stage')&&Boolean($('[data-biliglow-backdrop]'))&&root().parentElement===stage&&getComputedStyle(shadow()).display==='none','原生全屏保留原有氛围光和底板，不添加边框阴影');
        const framesBefore=Number(root().dataset.frames||0);
        await until(()=>Number(root().dataset.frames||0)>framesBefore+2,'原生全屏持续采样');
        const glow=root().shadowRoot.querySelector('canvas'),glowRect=glow.getBoundingClientRect();
        check(Number(getComputedStyle(glow).opacity)>0&&glowRect.left<=0&&glowRect.top<=0&&glowRect.right>=innerWidth&&glowRect.bottom>=innerHeight,'全屏氛围光持续绘制并覆盖不同屏幕比例产生的周围留白');
        nativeGeometry('横屏全屏');
        F.setPortrait(true);
        await until(()=>F.video.videoHeight>F.video.videoWidth&&nativeWithoutNewBounds(),'原生竖屏流');
        nativeGeometry('竖屏全屏');
        const inFullscreen=await B.storage.get();
        check(inFullscreen.roundedCorners===true&&inFullscreen.frameShadow===65&&inFullscreen.enabled===true,'全屏期间保存的圆角、阴影与启用设置保持不变');
        F.setPortrait(false);
        await document.exitFullscreen();
        await until(()=>!document.fullscreenElement&&events.some(event=>!event.entered),'实际退出全屏事件');
        check(true,'Fullscreen API 已实际退出，并收到退出 fullscreenchange');
        F.setWeb(true,true);
        await until(()=>F.video.videoWidth>F.video.videoHeight&&bound()&&F.video.hasAttribute('data-biliglow-live-picture-rounded')&&shadow()?.style.display==='block','退出后恢复网页模式');
        check(clipRadius(F.video)&&layers().every(clipRadius)&&closeRect(shadow().getBoundingClientRect(),picture()),'退出原生全屏后，网页模式恢复 12px 圆角、阴影与实际画面边界');
        check(root()?.dataset.mode==='fullscreen'&&Boolean($('[data-biliglow-backdrop]')),'网页模式恢复氛围光和原有遮挡底板');
      }
    }catch(error){check(false,'原生全屏回归中断',error.message);}
    finally{
      try{
        if(document.fullscreenElement===stage)await document.exitFullscreen();
        F.setWeb(false);F.setPortrait(before.portrait);F.setWeb(before.web,before.chat);
        if(before.paused)F.video.pause();
        await B.storage.set(original);const restored=await B.storage.get();
        shade().style.display=before.shadeDisplay;shadeTesting=false;
        check(Object.keys(original).every(key=>original[key]===restored[key]),'测试后完整恢复原有设置');
        window.scrollTo({left:before.scrollX,top:before.scrollY,behavior:'instant'});
      }catch(error){check(false,'还原原生全屏测试状态失败',error.message);}
      document.removeEventListener('fullscreenchange',onFullscreen);
      shadeTesting=false;
      nativeButton.disabled=false;peers.forEach(({el,disabled})=>el.disabled=disabled);
      nativeOutput.dataset.total=String(results.length);nativeOutput.dataset.passedCount=String(results.filter(r=>r.passed).length);nativeOutput.dataset.failed=String(results.filter(r=>!r.passed).length);nativeOutput.dataset.events=JSON.stringify(events);nativeOutput.dataset.results=JSON.stringify(results);
      if(skipped){
        nativeOutput.dataset.state='skipped';nativeOutput.dataset.skipped='1';delete nativeOutput.dataset.passed;
        nativeOutput.textContent='原生全屏未运行：浏览器拒绝请求（'+skipReason+'）。未计为通过。\n'+nativeOutput.textContent;
      }else{nativeOutput.dataset.state='complete';nativeOutput.dataset.passed=String(results.length>0&&results.every(r=>r.passed));}
    }
  });

  const shadeButton=$('#run-live-control-shade-tests'),shadeOutput=$('#live-control-shade-results');
  shadeButton.addEventListener('click',async()=>{
    const original=await B.storage.get();
    if(!B.isActive(original)){shadeOutput.textContent='请先在设置中同意并开启氛围光，再测试底栏圆角。';shadeOutput.dataset.state='needs-consent';return;}
    const before={web:$('#live-player-ctnr').dataset.screen==='web',chat:F.webChat,portrait:$('#portrait-stream').getAttribute('aria-pressed')==='true',stopped:!F.video,paused:F.video?.paused,shadeDisplay:shade().style.display,menuOpen:$('.fixture-controller-menu').open,scrollX,scrollY};
    const peers=[...document.querySelectorAll('#run-live-tests,#run-web-tests,#frame-tests,#live-color-tests,#run-live-picture-tests,#run-live-native-picture-tests,#run-live-track-tests,#toggle-live-control-shade')].map(el=>({el,disabled:el.disabled}));
    shadeButton.disabled=true;peers.forEach(({el})=>el.disabled=true);shadeTesting=true;
    const results=[];shadeOutput.dataset.state='running';delete shadeOutput.dataset.passed;
    const check=(passed,label,detail='')=>{results.push({passed:Boolean(passed),label,detail});shadeOutput.textContent=results.map(r=>`${r.passed?'✓':'✗'} ${r.label}${r.detail?' · '+r.detail:''}`).join('\n');};
    const checkScene=async(label,{web=false,portrait=false,letterbox=false}={})=>{
      F.setWeb(false);F.setPortrait(portrait);F.setWeb(web,web);window.scrollTo({top:0,behavior:'instant'});showShade(false);
      if(letterbox){const host=$('#live-player').getBoundingClientRect();F.source.width=Math.max(960,Math.ceil(540*host.width/host.height*1.6));F.source.height=540;}
      await until(()=>F.video.readyState>=2&&F.video.videoWidth===F.source.width&&F.video.videoHeight===F.source.height&&(portrait?F.video.videoHeight>F.video.videoWidth:F.video.videoWidth>F.video.videoHeight)&&bound()&&shade().hasAttribute('data-biliglow-live-control-shade')&&controlFrames().every(el=>el.hasAttribute('data-biliglow-live-control-frame'))&&getComputedStyle(shade()).clipPath!=='none',label+'隐藏时准备底栏裁切');
      check(shade().style.display==='none'&&Boolean(shade().style.getPropertyValue('--biliglow-live-shade-clip')),label+'：底色隐藏时已经准备好裁切，无需先显示测量');
      showShade(true);
      // Intentionally no await: this is the first style/layout read after the
      // native display:none -> block transition, before a later video frame.
      const shape=shadeShape(),p=picture(),sr=shade().getBoundingClientRect(),vr=F.video.getBoundingClientRect();
      check(Boolean(shape)&&closeRect(shape.rect,p),label+'：刚显示的第一帧即沿实际视频画面裁切',getComputedStyle(shade()).clipPath);
      check(Boolean(shape)&&shape.radii.every((r,i)=>Math.abs(r-(i<2?0:12))<.1),label+'：只保留两个 12px 下圆角，上沿保持直线');
      check(controlFrames().every(el=>controlEdgesMatch(el,p))&&Math.abs(sr.height-56)<1&&controlWrap().getBoundingClientRect().height===0,label+'：底色和零高控制层左右及底边均贴实际画面，保留各自原生高度');
      if(letterbox)check(p.top>vr.top+20&&p.top+p.height<vr.bottom-20&&controlWrap().getBoundingClientRect().bottom<vr.bottom-20,label+'：确有上下留白，整条控制栏跟随画面底边向上对齐');
      let immediate=true;
      for(let i=0;i<4;i++){showShade(false);showShade(true);const current=shadeShape();immediate=immediate&&Boolean(current)&&closeRect(current.rect,picture());}
      check(immediate,label+'：反复显示隐藏无需等待下一帧恢复边界');
      $('.fixture-controller-menu').open=true;
      check(targetAtCenter($('.fixture-controller-menu summary'))&&targetAtCenter($('.fixture-controller-menu-panel button'))&&getComputedStyle($('.player-toolbar')).clipPath==='none'&&getComputedStyle(controlWrap()).clipPath==='none'&&getComputedStyle(controlWrap()).overflow==='visible'&&getComputedStyle(controlWrap()).pointerEvents==='auto'&&!$('.player-toolbar').hasAttribute('data-biliglow-live-control-shade'),label+'：按钮和向上展开的菜单仍可命中，零高容器保持可见溢出和原生事件');
      $('.fixture-controller-menu').open=false;
    };
    try{
      F.setWeb(false);F.setPortrait(false);await F.reconnect();
      await B.storage.set({...original,enabled:true,roundedCorners:true,frameShadow:65});
      await checkScene('普通横屏');
      await checkScene('网页横屏',{web:true});
      await checkScene('网页上下留白',{web:true,letterbox:true});
      await checkScene('网页竖屏',{web:true,portrait:true});
      await B.storage.set({roundedCorners:false});
      await until(()=>{const s=shadeShape();return s&&s.radii.every(r=>r===0);},'关闭底栏圆角');
      check(closeRect(shadeShape().rect,picture())&&controlFrames().every(el=>controlEdgesMatch(el,picture())),'关闭圆角后底栏恢复直角，控制层和底色仍贴实际画面');
      await B.storage.set({enabled:false});
      await until(()=>!shade().hasAttribute('data-biliglow-live-control-shade')&&controlFrames().every(el=>!el.hasAttribute('data-biliglow-live-control-frame')),'关闭后清理底栏');
      check(getComputedStyle(shade()).clipPath==='none'&&!shade().style.getPropertyValue('--biliglow-live-shade-clip')&&Math.abs(shade().getBoundingClientRect().height-56)<1&&controlFrames().every(el=>noControlFrameProperties(el)&&controlEdgesMatch(el,F.video.getBoundingClientRect()))&&controlWrap().getBoundingClientRect().height===0,'关闭氛围光移除新增裁切和对齐变量，恢复原生满宽控制栏与渐变');
    }catch(error){check(false,'底栏圆角回归中断',error.message);}
    finally{
      try{
        F.setWeb(false);F.setPortrait(before.portrait);F.setWeb(before.web,before.chat);
        if(before.stopped)F.stop();else{await F.reconnect();if(before.paused)F.video.pause();}
        await B.storage.set(original);shade().style.display=before.shadeDisplay;$('.fixture-controller-menu').open=before.menuOpen;
        const restored=await B.storage.get();check(Object.keys(original).every(key=>original[key]===restored[key]),'底栏测试后完整恢复原有设置');
        window.scrollTo({left:before.scrollX,top:before.scrollY,behavior:'instant'});
      }catch(error){check(false,'还原底栏测试状态失败',error.message);}
      shadeTesting=false;shadeButton.disabled=false;peers.forEach(({el,disabled})=>el.disabled=disabled);
      shadeOutput.dataset.state='complete';shadeOutput.dataset.passed=String(results.length>0&&results.every(r=>r.passed));shadeOutput.dataset.total=String(results.length);shadeOutput.dataset.passedCount=String(results.filter(r=>r.passed).length);shadeOutput.dataset.failed=String(results.filter(r=>!r.passed).length);shadeOutput.dataset.results=JSON.stringify(results);
    }
  });

  const trackButton=$('#run-live-track-tests'),trackOutput=$('#live-track-results');
  const trackContainer=()=>$('.web-player-danmaku > .danmaku-item-container');
  const tracks=()=>[...trackContainer().children].filter(el=>el.matches('.bili-danmaku-x-dm.bili-danmaku-x-show:not(.bili-danmaku-x-dm-rotate)')&&getComputedStyle(el).display!=='none');
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const lineBox=el=>{
    const boxes=[el,...el.querySelectorAll('img')].map(node=>node.getBoundingClientRect());
    return {top:Math.min(...boxes.map(r=>r.top)),bottom:Math.max(...boxes.map(r=>r.bottom))};
  };
  const tracksInside=gap=>{
    const p=picture();return tracks().every(el=>{const r=lineBox(el);return r.top>=p.top+gap-.8&&r.bottom<=p.top+p.height-gap+.8;});
  };
  const nativeLineMetrics=el=>{
    const copy=el.cloneNode(true);copy.removeAttribute('data-biliglow-live-track');
    copy.style.removeProperty('--biliglow-live-track-top');copy.style.removeProperty('--biliglow-live-track-size');
    copy.style.cssText+=';position:fixed;left:-10000px;right:auto;top:0;transform:none;animation:none;visibility:hidden';
    document.body.append(copy);const r=lineBox(copy),style=getComputedStyle(copy);
    const metrics={height:r.bottom-r.top,fontSize:style.fontSize,lineHeight:style.lineHeight};copy.remove();return metrics;
  };
  trackButton.addEventListener('click',async()=>{
    const original=await B.storage.get(),stage=$('#fullscreen-container');
    if(!B.isActive(original)){trackOutput.textContent='请先在设置中同意并开启氛围光，再运行弹幕完整可见回归。';trackOutput.dataset.state='needs-consent';return;}
    if(!F.video){trackOutput.textContent='请先重连合成直播，再运行弹幕回归。';trackOutput.dataset.state='needs-video';return;}
    if(document.fullscreenElement){trackOutput.textContent='请先退出原生全屏，再点击测试。';trackOutput.dataset.state='needs-exit';return;}
    const before={web:$('#live-player-ctnr').dataset.screen==='web',chat:F.webChat,portrait:$('#portrait-stream').getAttribute('aria-pressed')==='true',paused:F.video.paused,scrollX,scrollY};
    const seeds=tracks().map(el=>({el,top:el.style.getPropertyValue('--top'),translateY:el.style.getPropertyValue('--translateY')}));
    const emoji=$('[data-fixture-track="emoji-bottom"] img'),emojiStyle=emoji.getAttribute('style');
    const peers=[...document.querySelectorAll('#run-live-tests,#run-web-tests,#frame-tests,#live-color-tests,#run-live-picture-tests,#run-live-native-picture-tests,#run-live-control-shade-tests,#toggle-live-control-shade')].map(el=>({el,disabled:el.disabled}));
    trackButton.disabled=true;peers.forEach(({el})=>el.disabled=true);
    const results=[],temporary=[];let skipped=false,skipReason='';
    trackOutput.dataset.state='running';delete trackOutput.dataset.passed;trackOutput.dataset.skipped='0';
    const check=(passed,label,detail='')=>{results.push({passed:Boolean(passed),label,detail});trackOutput.textContent=results.map(r=>`${r.passed?'✓':'✗'} ${r.label}${r.detail?' · '+r.detail:''}`).join('\n');};
    const resetSeeds=()=>{
      for(const {el,top,translateY} of seeds){if(top)el.style.setProperty('--top',top);if(translateY)el.style.setProperty('--translateY',translateY);}
      if(emojiStyle===null)emoji.removeAttribute('style');else emoji.setAttribute('style',emojiStyle);
      for(const el of temporary.splice(0))el.remove();
    };
    const nativeTransformsIntact=()=>tracks().every(el=>{
      const style=getComputedStyle(el),matrix=new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform);
      if(el.classList.contains('bili-danmaku-x-roll'))return style.animationName==='fixture-live-traverse'&&style.animationDuration==='12s'&&style.animationTimingFunction==='linear'&&Math.abs(matrix.m42)<.1;
      return Math.abs(matrix.m42-(parseFloat(el.style.getPropertyValue('--translateY'))||0))<.1;
    });
    const runMode=async(label,gap)=>{
      resetSeeds();await until(()=>bound()&&tracks().every(el=>el.hasAttribute('data-biliglow-live-track'))&&tracksInside(gap),label+'首轮轨道拟合');
      check(tracksInside(gap),label+'：缓存越界的滚动、固定顶/底弹幕均完整落在画面安全上下沿');
      check(seeds.every(({el,top,translateY})=>el.style.getPropertyValue('--top')===top&&el.style.getPropertyValue('--translateY')===translateY),label+'：保留引擎原始 --top / --translateY，不篡改缓存轨道');
      check(tracks().every(el=>{
        const natural=nativeLineMetrics(el),r=lineBox(el),s=getComputedStyle(el);
        return Math.abs(r.bottom-r.top-natural.height)<.5&&s.fontSize===natural.fontSize&&s.lineHeight===natural.lineHeight;
      })&&emoji.getBoundingClientRect().height===48,label+'：整行与高表情保持原尺寸，不靠缩小字体或裁掉行高适配');
      const moving=$('[data-fixture-track="roll-bottom"]'),xBefore=new DOMMatrixReadOnly(getComputedStyle(moving).transform).m41;
      await wait(140);const xAfter=new DOMMatrixReadOnly(getComputedStyle(moving).transform).m41;
      check(nativeTransformsIntact()&&Math.abs(xAfter-xBefore)>1&&tracksInside(gap),label+'：横向滚动继续，固定弹幕原生 transform 保持不变');
      const dynamic=document.createElement('span');dynamic.className='bili-danmaku-x-dm bili-danmaku-x-roll bili-danmaku-x-show';dynamic.dataset.fixtureTrack='dynamic';dynamic.style.setProperty('--top','6500px');dynamic.textContent='刚插入的底轨弹幕';trackContainer().append(dynamic);temporary.push(dynamic);
      await nextFrame();
      check(dynamic.hasAttribute('data-biliglow-live-track')&&tracksInside(gap),label+'：新插入弹幕在首个绘制帧已完整进入画面');
      const hidden=document.createElement('span');hidden.className='bili-danmaku-x-dm bili-danmaku-x-center bili-danmaku-x-show';hidden.style.cssText='display:none;--translateY:-40px';hidden.textContent='隐藏后显示的顶部弹幕';trackContainer().append(hidden);temporary.push(hidden);
      await nextFrame();hidden.style.removeProperty('display');await nextFrame();
      check(hidden.hasAttribute('data-biliglow-live-track')&&tracksInside(gap),label+'：隐藏节点重新显示时完整落在顶部安全区');
      moving.style.setProperty('--top','-35px');$('[data-fixture-track="fixed-bottom"]').style.setProperty('--translateY','6600px');await nextFrame();
      check(tracksInside(gap)&&moving.style.getPropertyValue('--top')==='-35px'&&$('[data-fixture-track="fixed-bottom"]').style.getPropertyValue('--translateY')==='6600px',label+'：引擎更新缓存位置后即时重排，原生变量仍保留新值');
      emoji.style.height='76px';emoji.style.transform='translateY(-8px)';await nextFrame();await nextFrame();
      check(emoji.getBoundingClientRect().height===76&&tracksInside(gap),label+'：表情增高且向上溢出后仍完整可见，字体未缩小');
      check($('[data-fixture-track="emoji-bottom"]').style.getPropertyValue('--biliglow-live-track-top')===$('[data-fixture-track="emoji-peer"]').style.getPropertyValue('--biliglow-live-track-top'),label+'：同一原生底轨的文字和高表情仍共享基线，不拆成两行');
      const rotate=$('[data-fixture-track="rotate-helper"]');
      check(!rotate.hasAttribute('data-biliglow-live-track')&&!rotate.style.getPropertyValue('--biliglow-live-track-top')&&Math.abs(parseFloat(getComputedStyle(rotate).top)+90)<.1,label+'：旋转辅助节点不被 JS 或 CSS fallback 改写原生位置');
      if(document.fullscreenElement===stage){
        check(root()?.parentElement===stage&&getComputedStyle(root()).display==='block'&&Boolean($('[data-biliglow-backdrop]'))&&controlFrames().every(el=>!el.hasAttribute('data-biliglow-live-control-frame'))&&!shade().hasAttribute('data-biliglow-live-control-shade')&&!F.video.hasAttribute('data-biliglow-live-picture-rounded'),label+'：保留旧版全屏氛围光及原生控制栏，只增加消息完整显示约束');
      }
    };
    try{
      F.setWeb(false);F.setPortrait(false);
      const write=B.storage.set({...original,enabled:true,roundedCorners:true,frameShadow:65,strength:80});
      const playback=F.video.play();
      if(stage.requestFullscreen&&document.fullscreenEnabled!==false){
        try{await stage.requestFullscreen();}catch(error){skipped=true;skipReason=error.name+': '+error.message;}
      }else{skipped=true;skipReason='浏览器或嵌入环境不支持 Fullscreen API';}
      await write;await playback;
      if(!skipped){
        await until(()=>document.fullscreenElement===stage&&F.video.videoWidth>F.video.videoHeight,'真实原生全屏');
        await runMode('原生全屏',2);await document.exitFullscreen();
        await until(()=>!document.fullscreenElement,'退出原生全屏');
      }
      F.setWeb(false);F.setPortrait(false);window.scrollTo({top:0,behavior:'instant'});await runMode('普通模式',12);
      F.setWeb(true,true);await runMode('网页模式',12);
      F.setPortrait(true);await until(()=>F.video.videoHeight>F.video.videoWidth,'竖屏流');await runMode('网页竖屏',12);
      await B.storage.set({roundedCorners:false});await until(()=>tracksInside(2),'直角轨道边距');
      check(tracksInside(2)&&nativeTransformsIntact(),'关闭圆角后仍保证整行完整，滚动与固定动画不变');
      await B.storage.set({enabled:false});
      await until(()=>tracks().every(el=>!el.hasAttribute('data-biliglow-live-track')),'关闭后清理轨道');
      check(tracks().every(el=>!el.style.getPropertyValue('--biliglow-live-track-top')&&!el.style.getPropertyValue('--biliglow-live-track-size')),'关闭氛围光后清理全部轨道变量并交回原生布局');
    }catch(error){check(false,'弹幕完整显示回归中断',error.message);}
    finally{
      try{
        if(document.fullscreenElement===stage)await document.exitFullscreen();resetSeeds();
        F.setWeb(false);F.setPortrait(before.portrait);F.setWeb(before.web,before.chat);
        if(before.paused)F.video.pause();await B.storage.set(original);
        const restored=await B.storage.get();check(Object.keys(original).every(key=>original[key]===restored[key]),'弹幕测试后完整恢复原有设置与样例轨道');
        window.scrollTo({left:before.scrollX,top:before.scrollY,behavior:'instant'});
      }catch(error){check(false,'弹幕测试还原失败',error.message);}
      trackButton.disabled=false;peers.forEach(({el,disabled})=>el.disabled=disabled);
      trackOutput.dataset.state=skipped?'partial':'complete';trackOutput.dataset.skipped=skipped?'1':'0';trackOutput.dataset.passed=String(!skipped&&results.length>0&&results.every(r=>r.passed));trackOutput.dataset.total=String(results.length);trackOutput.dataset.passedCount=String(results.filter(r=>r.passed).length);trackOutput.dataset.failed=String(results.filter(r=>!r.passed).length);trackOutput.dataset.results=JSON.stringify(results);
      if(skipped)trackOutput.textContent='原生全屏未运行：'+skipReason+'。其余模式继续验证；未将缺失模式计为通过。\n'+trackOutput.textContent;
    }
  });
})();
