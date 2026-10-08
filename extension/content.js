(() => {
  'use strict';
  if (document.querySelector('[data-biliglow-root]')) return;
  const B=globalThis.BiliGlow,P=globalThis.BiliGlowPlayer;
  let settings={...B.defaults},settingsReady=false,video=null,cleanVideo=()=>{},frameId=null,timerId=null,layoutId=null;
  let lastFrame=0,nextPaint=0,needsDraw=false,painted=false,visible=false,blocked=false,supported=false,layoutDirty=true,frames=0;
  let status={text:'等待播放器',error:false},ui=null,panel=null,panelHost=null,launcher=null,root=null,canvas=null,ctx=null;
  let stage=null,backdrop=null,mode='normal',barEffect=null,frameEffect=null,barStatus='宽屏去边已关闭';
  let launcherPosition=null,drag=null,suppressLauncherClick=false;
  const setBarStatus=text=>{barStatus=text;panel?.setBarStatus(text);};
  let kind=P.pageKind(location);
  const isSupported=()=>{kind=P.pageKind(location);return Boolean(kind);};
  // Bilibili comments live in open shadow roots. Page CSS cannot reach the
  // editor or the fixed bottom wrapper; changing inherited --bg1/--bg3 would
  // also erase emoji menus and dialogs. Only patch these observed surfaces.
  const commentStyles=new Map();
  const commentHosts='bili-comments,bili-comments-header-renderer,bili-comment-thread-renderer,bili-comment-renderer,bili-comment-replies-renderer,bili-comment-reply-renderer,bili-comment-box';
  const commentCSS={
    'bili-comment-thread-renderer':`
      /* Match the video tag/toolbar divider without changing other comment surfaces. */
      :host([data-biliglow-comments-active]) #div { border-bottom-color:var(--line_regular)!important; }
    `,
    'bili-comments-header-renderer':`
      /* The site creates its bottom-fixed wrapper only while the composer is
         pinned. Preserve that wrapper's native opaque base so comment pictures
         cannot show through the avatar, editor, tools and send-button row. */
      :host([data-biliglow-comments-active]) #disabled-commentbox #edit { background:transparent!important;box-shadow:none!important;border-color:transparent!important; }
    `,
    'bili-comment-box':`
      :host([data-biliglow-comments-active]),
      :host([data-biliglow-comments-active]) :is(#comment-area, #body, #editor, #footer, .tool-btn) { background:transparent!important;box-shadow:none!important; }
      :host([data-biliglow-comments-active]) #editor { border-color:transparent!important; }
      :host([data-biliglow-comments-active]) #editor:focus-within { outline:1px solid var(--brand_blue,#00aeec);outline-offset:1px; }
    `
  };
  // Firefox does not implement :host-context(). Mirror only our own active
  // state onto known hosts, including immediate fullscreen mode transitions.
  function setCommentActivity(active){
    for(const host of commentStyles.keys())host.toggleAttribute('data-biliglow-comments-active',active&&kind==='video');
  }
  function syncCommentSurfaces(){
    const active=document.documentElement.hasAttribute('data-biliglow-active');
    for(const [host,style] of commentStyles){
      if(!active||kind==='live'||!host.isConnected){host.removeAttribute('data-biliglow-comments-active');style.remove();commentStyles.delete(host);}
    }
    if(!active||kind==='live')return;
    function visit(scope){
      for(const host of scope.querySelectorAll(commentHosts)){
        const shadow=host.shadowRoot;
        if(!shadow)continue;
        const css=commentCSS[host.localName];
        if(css){
          host.setAttribute('data-biliglow-comments-active','');
          let style=commentStyles.get(host);
          if(!style){
            style=document.createElement('style');style.dataset.biliglowComments='';
            // The gate also restores backgrounds immediately during mode changes.
            style.textContent=css;
            commentStyles.set(host,style);
          }
          if(style.parentNode!==shadow)shadow.append(style);
        }
        visit(shadow);
      }
    }
    // Reuse the 1s lifecycle check, never the video frame loop. It also catches
    // lazy comments, reply boxes, root replacement and SPA navigation.
    visit(document);
  }
  const setStatus=(text,error=false)=>{
    if(status.text===text&&status.error===error)return;
    status={text,error};panel?.setStatus(text,error);
    if(root)root.dataset.state=text;
  };
  function ensureUI(){
    if(root)return;
    root=document.createElement('div');root.dataset.biliglowRoot='';
    root.setAttribute('aria-hidden','true');
    // A negative child of the isolated body paints AFTER its background but BEFORE page content.
    root.style.cssText='position:fixed;inset:0;pointer-events:none!important;z-index:-1;overflow:hidden;contain:strict;display:none;';
    root.dataset.version='0.5.3.14';
    const shadow=root.attachShadow({mode:'open'});
    canvas=document.createElement('canvas');canvas.width=256;canvas.height=144;
    canvas.style.cssText='position:absolute;pointer-events:none;transform-origin:center;';shadow.append(canvas);
    frameEffect=P.createFrame(shadow);
    ctx=canvas.getContext('2d',{alpha:false});document.body.append(root);
    ui=document.createElement('div');ui.dataset.biliglowUi='';
    ui.style.cssText='position:fixed;right:24px;bottom:24px;z-index:2147483001;color-scheme:dark;pointer-events:none;';
    const uiShadow=ui.attachShadow({mode:'open'});
    uiShadow.innerHTML=`<style>${B.css}.holder{position:fixed;overflow:visible;border-radius:16px;pointer-events:auto}.holder[hidden]{display:none}</style><div class="holder" hidden></div><button class="launcher" type="button" aria-label="打开氛围光设置" title="氛围光设置 · 可拖动" aria-expanded="false">${B.mark}</button>`;
    panelHost=uiShadow.querySelector('.holder');launcher=uiShadow.querySelector('.launcher');
    launcher.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary||drag)return;
      const rect=launcher.getBoundingClientRect();
      suppressLauncherClick=false;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,moved:false};
      launcher.setPointerCapture(event.pointerId);
    });
    launcher.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.id)return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!drag.moved&&Math.hypot(dx,dy)<5)return;
      drag.moved=true;suppressLauncherClick=true;
      launcher.setAttribute('data-dragging','');event.preventDefault();
      launcherPosition={left:drag.left+dx,top:drag.top+dy};positionLauncher();
    });
    const endDrag=event=>{if(drag?.id===event.pointerId)cancelLauncherDrag();};
    launcher.addEventListener('pointerup',endDrag);
    launcher.addEventListener('pointercancel',endDrag);
    launcher.addEventListener('lostpointercapture',endDrag);
    launcher.addEventListener('dragstart',event=>event.preventDefault());
    launcher.addEventListener('click',event=>{
      // Pointer-generated clicks follow a drag. Keyboard activation has detail=0.
      if(suppressLauncherClick&&event.detail!==0){event.preventDefault();event.stopPropagation();suppressLauncherClick=false;return;}
      suppressLauncherClick=false;togglePanel(panelHost.hidden);
    });
    ui.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panelHost.hidden){togglePanel(false);event.stopPropagation();}});
    syncLauncherVisibility();document.documentElement.append(ui);
    new ResizeObserver(positionPanel).observe(panelHost);
  }
  function syncLauncherVisibility(){
    if(!launcher)return;
    const hidden=!settingsReady||settings.hideLauncher;
    if(hidden)cancelLauncherDrag();
    // Keep its geometry as the open panel's anchor, but leave no pointer target.
    launcher.style.visibility=hidden?'hidden':'visible';
    launcher.style.pointerEvents=hidden?'none':'auto';
    launcher.tabIndex=hidden?-1:0;launcher.setAttribute('aria-hidden',String(hidden));
  }
  function cancelLauncherDrag(){
    if(!drag)return;
    const id=drag.id;drag=null;launcher.removeAttribute('data-dragging');
    if(launcher.hasPointerCapture(id))launcher.releasePointerCapture(id);
  }
  const clampPosition=(value,size,limit)=>Math.max(8,Math.min(value,Math.max(8,limit-size-8)));
  const viewportWidth=()=>document.documentElement.clientWidth||innerWidth;
  function positionLauncher(){
    if(!ui)return;
    if(launcherPosition){
      const rect=launcher.getBoundingClientRect();
      launcherPosition={left:clampPosition(launcherPosition.left,rect.width,viewportWidth()),top:clampPosition(launcherPosition.top,rect.height,innerHeight)};
      ui.style.left=`${launcherPosition.left}px`;ui.style.top=`${launcherPosition.top}px`;
      ui.style.right='auto';ui.style.bottom='auto';
    }else{
      ui.style.left='auto';ui.style.top='auto';ui.style.right='24px';ui.style.bottom='24px';
    }
    positionPanel();
  }
  function resetLauncher(){cancelLauncherDrag();launcherPosition=null;positionLauncher();}
  function positionPanel(){
    if(!panelHost||panelHost.hidden)return;
    const r=launcher.getBoundingClientRect(),p=panelHost.getBoundingClientRect();
    let left=r.right-p.width,top=r.top-p.height-12;
    if(top<8){
      if(r.bottom+12+p.height<=innerHeight-8)top=r.bottom+12;
      else{
        top=r.bottom-p.height;
        if(r.right+12+p.width<=viewportWidth()-8)left=r.right+12;
        else if(r.left-12-p.width>=8)left=r.left-12-p.width;
      }
    }
    panelHost.style.left=`${clampPosition(left,p.width,viewportWidth())}px`;
    panelHost.style.top=`${clampPosition(top,p.height,innerHeight)}px`;
  }
  function togglePanel(open){
    if(open&&!panel){panel=B.mountPanel(panelHost.attachShadow({mode:'open'}),{closable:true,onClose:()=>togglePanel(false)});panel.setStatus(status.text,status.error);panel.setBarStatus(barStatus);}
    panelHost.hidden=!open;launcher.setAttribute('aria-expanded',String(open));
    positionPanel();
    if(open)panel.focus();else if(!settings.hideLauncher)launcher.focus();
  }
  function cancelFrames(){
    if(frameId!==null&&video?.cancelVideoFrameCallback)video.cancelVideoFrameCallback(frameId);
    clearTimeout(timerId);frameId=null;timerId=null;nextPaint=0;
  }
  function allowed(){return supported&&B.isActive(settings)&&video?.isConnected&&!(kind==='live'&&(video.ended||video.readyState<2))&&!document.hidden&&visible&&!blocked;}
  function startFrames(){
    if(!allowed()||video.paused||video.ended||frameId!==null||timerId!==null)return;
    if(video.requestVideoFrameCallback){frameId=video.requestVideoFrameCallback(tick);}
    else timerId=setTimeout(()=>tick(performance.now()),1000/settings.fps);
  }
  function tick(now){
    frameId=null;timerId=null;
    if(!allowed())return;
    if(layoutDirty)layout();
    if(now>=nextPaint){
      draw(now);
      const interval=1000/settings.fps;
      nextPaint=nextPaint&&now-nextPaint<interval*2?nextPaint+interval:now+interval;
    }
    startFrames();
  }
  function draw(now=performance.now(),force=false){
    if(!allowed()||video.readyState<2||!video.videoWidth)return;
    try{
      barEffect?.sample(now);
      const crop=barEffect?.crop||{top:0,bottom:0,left:0,right:0};
      const sx=video.videoWidth*crop.left,sy=video.videoHeight*crop.top;
      const sw=video.videoWidth*(1-crop.left-crop.right),sh=video.videoHeight*(1-crop.top-crop.bottom);
      const targetHeight=Math.max(32,Math.min(256,Math.round(256*sh/sw)));
      if(canvas.height!==targetHeight){canvas.height=targetHeight;painted=false;}
      const dt=lastFrame?Math.min(500,now-lastFrame):1000;
      ctx.globalAlpha=(!painted||force)?1:B.blendAlpha(dt,settings.smoothing);
      ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
      painted=true;lastFrame=now;frames++;root.dataset.frames=String(frames);
      root.style.display='block';root.style.visibility='visible';updatePlaybackStatus();
    }catch(error){
      blocked=true;root.style.display='none';cancelFrames();
      if(kind==='live'){setStage(null);frameEffect?.clear();document.documentElement.removeAttribute('data-biliglow-active');document.documentElement.removeAttribute('data-biliglow-dark');}
      setStatus('此视频暂时无法生成光效，播放不受影响',true);
      console.warn('[BiliGlow] Video frame unavailable:',error.name);
    }
  }
  function invalidate(force=false){
    layoutDirty=true;needsDraw=needsDraw||force===true;
    if(layoutId!==null)return;
    layoutId=requestAnimationFrame(()=>{layoutId=null;layout();if(allowed()){if(needsDraw||!painted)draw(performance.now(),true);startFrames();}needsDraw=false;});
  }
  function updatePlaybackStatus(){
    const label=mode==='theater'?'宽屏环绕':mode==='fullscreen'?'全屏环绕':kind==='live'?'直播透光':'背景透光';
    setStatus(video.paused?`${label} · 已暂停`:`${label} · 上限 ${settings.fps} fps`);
  }
  function setStage(next){
    if(stage!==next){
      stage?.removeAttribute('data-biliglow-stage');
      stage=next;stage?.setAttribute('data-biliglow-stage','');
    }
    if(stage){
      // The isolated stage paints this opaque base below the glow (z=-1).
      // Cover the viewport so letterboxing and transparent player surfaces
      // cannot reveal the page header, recommendations or live activity feed.
      // Keep it separate from the sampled canvas: it must also cover between
      // the first frame and first paint, and when the light has no outer space.
      if(!backdrop){
        backdrop=document.createElement('div');backdrop.dataset.biliglowBackdrop='';
        backdrop.setAttribute('aria-hidden','true');
        backdrop.style.cssText='position:fixed;inset:0;z-index:-2;background:#10141d;pointer-events:none!important;';
      }
      if(backdrop.parentNode!==stage)stage.append(backdrop);
    }else backdrop?.remove();
  }
  function layout(){
    layoutDirty=false;
    if(!root)return;
    if(!B.isActive(settings)){visible=false;root.style.display='none';cancelFrames();return;}
    const fs=document.fullscreenElement;
    const presentation=P.presentation(video,kind,fs);
    const ownFullscreen=presentation.native;
    const ready=kind!=='live'||Boolean(video?.readyState>=2&&!video.ended&&!blocked);
    const active=supported&&B.isActive(settings)&&Boolean(video?.isConnected)&&ready&&(!fs||Boolean(ownFullscreen));
    document.documentElement.toggleAttribute('data-biliglow-active',active);
    setCommentActivity(active);
    document.documentElement.toggleAttribute('data-biliglow-live',kind==='live'&&active);
    document.documentElement.toggleAttribute('data-biliglow-dark',active&&settings.dark);
    document.documentElement.toggleAttribute('data-biliglow-glass-controls',active&&kind==='video'&&settings.glassControls&&Boolean(video?.closest('.bpx-player-container')));
    const nextStage=active?presentation.stage:null;
    setStage(nextStage);
    mode=presentation.mode;
    barEffect?.configure({...settings,enabled:active},mode);
    const croppedRect=barEffect?.layout();
    root.dataset.mode=mode;
    const parent=stage||document.body;
    if(root.parentNode!==parent)parent.append(root);
    if(!active)frameEffect?.clear();
    const uiParent=ownFullscreen?fs:document.documentElement;
    if(ui.parentNode!==uiParent){cancelLauncherDrag();uiParent.append(ui);positionLauncher();}
    ui.style.display=supported&&(!fs||Boolean(ownFullscreen))?'block':'none';
    if(!active||document.hidden){
      visible=false;root.style.display='none';cancelFrames();
      setStatus(blocked?'此视频暂时无法生成光效，播放不受影响':!settings.enabled?'氛围光已关闭':document.hidden?'后台待机':fs?'系统全屏 · 氛围光待机':kind==='live'?'等待直播画面 · 停播时自动待机':'等待播放器',blocked);return;
    }
    root.style.display='block';root.style.visibility=painted&&!blocked?'visible':'hidden';
    // Apply the frame and its page footprint before measuring the video. A
    // taller recording can grow when rounded clipping becomes active.
    const origin=root.getBoundingClientRect();
    const frame=frameEffect?.update(video,{...settings,enabled:active},kind,mode,origin);
    const r=video.getBoundingClientRect();
    visible=r.width>=160&&r.height>=90&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;
    if(!visible){root.style.display='none';cancelFrames();setStatus('播放器离开视野 · 已省电暂停');return;}
    const rect=croppedRect||B.contentRect({left:r.left,top:r.top,width:r.width,height:r.height},video.videoWidth,video.videoHeight,getComputedStyle(video).objectFit);
    const l=rect.left,t=rect.top,right=l+rect.width,bottom=t+rect.height;
    // Convert viewport coordinates to the layer's containing block (fullscreen can create one).
    const ox=origin.left,oy=origin.top;
    // Inverse rectangle: light never paints over the actual video image.
    root.style.clipPath=P.roundedCutout(rect,frame,origin,{width:origin.width,height:origin.height})||`polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${l-ox}px ${t-oy}px,${right-ox}px ${t-oy}px,${right-ox}px ${bottom-oy}px,${l-ox}px ${bottom-oy}px,${l-ox}px ${t-oy}px)`;
    const glow=B.glowGeometry(rect,{width:innerWidth,height:innerHeight},settings,mode);
    canvas.style.left=`${glow.left-ox}px`;canvas.style.top=`${glow.top-oy}px`;
    canvas.style.width=`${glow.width}px`;canvas.style.height=`${glow.height}px`;
    canvas.style.filter=`blur(${glow.blur}px) saturate(${settings.saturation}%) brightness(${Math.max(1,settings.strength/100)})`;
    canvas.style.opacity=String(Math.min(1,settings.strength/100));
    // An opaque video that fills the viewport leaves nowhere to project light.
    if(l<=1&&t<=1&&right>=innerWidth-1&&bottom>=innerHeight-1){visible=false;root.style.display='none';cancelFrames();setStatus('画面已铺满屏幕 · 无外侧光效空间');return;}
    if(painted&&!blocked){root.style.display='block';updatePlaybackStatus();}
  }
  const resizeObserver=new ResizeObserver(invalidate);
  const modeObserver=new MutationObserver(()=>invalidate());
  function bind(next){
    if(next===video)return;
    cancelFrames();cleanVideo();barEffect?.dispose();barEffect=null;frameEffect?.clear();resizeObserver.disconnect();modeObserver.disconnect();setStage(null);video=next;painted=false;lastFrame=0;blocked=false;
    if(canvas){canvas.width=256;root.style.display='none';}
    if(!next){setStatus('等待播放器');return;}
    if(kind==='live')setBarStatus('直播保留完整画面 · 自动去边仅用于视频宽屏');
    else barEffect=globalThis.BiliGlowVideoBars.create(next,{onChange:()=>{painted=false;invalidate(true);},onStatus:setBarStatus});
    const refresh=()=>{blocked=false;invalidate(true);};
    const pause=()=>{cancelFrames();invalidate(true);};
    const reset=()=>{barEffect?.reset();painted=false;lastFrame=0;blocked=false;canvas.width=256;root.style.display='none';setStatus('等待视频加载');invalidate();};
    const seek=()=>{barEffect?.reset();refresh();};
    const events={playing:refresh,loadeddata:refresh,loadedmetadata:reset,seeked:seek,pause,ended:pause,emptied:reset,resize:seek,enterpictureinpicture:invalidate,leavepictureinpicture:invalidate};
    for(const [type,fn] of Object.entries(events))next.addEventListener(type,fn);
    cleanVideo=()=>{for(const [type,fn] of Object.entries(events))next.removeEventListener(type,fn);};
    resizeObserver.observe(next);invalidate();
    if(kind==='live'){
      for(let el=next.parentElement;el&&el!==document.body;el=el.parentElement)
        modeObserver.observe(el,{attributes:true,attributeFilter:['class','style']});
    }else{
      const container=next.closest('.bpx-player-container');
      if(container)modeObserver.observe(container,{attributes:true,attributeFilter:['data-screen']});
    }
  }
  function reconcile(){
    supported=isSupported();
    if(supported)ensureUI();
    if(!B.isActive(settings)){
      // Before consent (or while disabled), only inspect the route and show our entry point.
      // Never query or bind a player; revoke also cancels its pending frame callback now.
      bind(null);cancelFrames();setStage(null);visible=false;
      document.documentElement.removeAttribute('data-biliglow-active');
      document.documentElement.removeAttribute('data-biliglow-dark');
      document.documentElement.removeAttribute('data-biliglow-live');
      document.documentElement.removeAttribute('data-biliglow-glass-controls');
      if(root){root.style.display='none';canvas.width=256;painted=false;}
      if(ui){if(ui.parentNode!==document.documentElement)document.documentElement.append(ui);ui.style.display=supported?'block':'none';}
      setStatus(settings.privacyAccepted?'氛围光已关闭':'尚未开启 · 请先确认本地处理说明');
      syncCommentSurfaces();return;
    }
    if(supported){
      bind(P.selectVideo(document,kind));
    }else bind(null);
    document.documentElement.toggleAttribute('data-biliglow-dark',supported&&Boolean(video)&&B.isActive(settings)&&settings.dark);
    if(root){layoutDirty=true;layout();if(allowed()){if(!painted)draw(performance.now(),true);startFrames();}}
    syncCommentSurfaces();
  }
  let settingsRevision=0;
  function apply(next){
    const toggled=next.enabled!==settings.enabled||B.isActive(next)!==B.isActive(settings);
    settingsRevision++;settingsReady=true;settings=next;reconcile();syncLauncherVisibility();if(toggled)resetLauncher();invalidate();
  }
  const initialRevision=settingsRevision;
  B.storage.get().then(next=>{if(settingsRevision===initialRevision)apply(next);}).catch(()=>{settingsReady=true;syncLauncherVisibility();setStatus('设置读取失败，当前使用默认值',true);});
  B.storage.subscribe(apply,{onRevoke:()=>apply({...settings,privacyAccepted:false})});
  window.addEventListener('resize',()=>{cancelLauncherDrag();positionLauncher();invalidate();},{passive:true});
  window.addEventListener('scroll',invalidate,{passive:true,capture:true});
  document.addEventListener('fullscreenchange',()=>{cancelLauncherDrag();positionLauncher();invalidate();});
  window.addEventListener('blur',cancelLauncherDrag);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelFrames();if(root)root.style.display='none';}else invalidate();});
  window.addEventListener('popstate',reconcile);
  // Catches pushState routes and player replacement without observing every danmaku mutation.
  setInterval(reconcile,1000);
  if(globalThis.chrome?.runtime?.onMessage)chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message?.type==='BILIGLOW_STATUS')reply({...status,barStatus});
  });
  reconcile();
})();
