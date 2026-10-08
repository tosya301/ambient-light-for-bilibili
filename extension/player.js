/* Playback adapters. Live rooms share rendering/settings with 0.5.3. */
(() => {
  'use strict';
  function pageKind({hostname,pathname}) {
    if(hostname==='localhost'||hostname==='127.0.0.1')return pathname==='/demo/live.html'?'live':'video';
    // /blanc/<room> is the plain room layout and uses the same live player.
    if(hostname==='live.bilibili.com')return /^\/(?:blanc\/)?[1-9]\d*\/?$/.test(pathname)?'live':null;
    // The watch-later detail page uses the same player, modes and comments as
    // ordinary VOD. Keep the homepage/PiP launcher and other list routes out.
    return hostname==='www.bilibili.com'&&(/^\/(video\/|bangumi\/play\/)/.test(pathname)||/^\/list\/watchlater\/?$/.test(pathname))?'video':null;
  }
  function selectVideo(scope,kind) {
    // Live pages also contain gift/preview videos outside the main player.
    const candidates=scope.querySelectorAll(kind==='live'?'#live-player video':'video');
    let best=null,area=0;
    for(const candidate of candidates){
      const r=candidate.getBoundingClientRect(),a=r.width*r.height;
      if(a<=area||r.width<160||r.height<90)continue;
      let hidden=false;
      for(let el=candidate;el;el=el.parentElement){
        const s=getComputedStyle(el);
        if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0){hidden=true;break;}
      }
      if(!hidden){best=candidate;area=a;}
    }
    return best;
  }
  function presentation(video,kind,fullscreen,width=innerWidth,height=innerHeight){
    const native=Boolean(fullscreen&&video&&fullscreen.contains(video)&&fullscreen.tagName!=='VIDEO');
    if(native)return {stage:fullscreen,mode:'fullscreen',native};
    if(kind==='live'){
      // Web mode keeps a chat sidebar, so #fullscreen-container can be narrower
      // than the viewport. Still require a fixed, top-left, full-height stage;
      // normal players and floating mini players must not acquire a backdrop.
      for(let el=video?.parentElement;el&&el!==document.body;el=el.parentElement){
        const r=el.getBoundingClientRect();
        const fillsWidth=r.width>=width-2;
        const withChat=el.id==='fullscreen-container'&&r.width>=160&&r.width<=width+2;
        if(getComputedStyle(el).position==='fixed'&&Math.abs(r.left)<=2&&Math.abs(r.top)<=2&&r.height>=height-2&&(fillsWidth||withChat))
          return {stage:el,mode:'fullscreen',native:false};
      }
      return {stage:null,mode:'normal',native:false};
    }
    const container=video?.closest('.bpx-player-container'),screen=container?.getAttribute('data-screen');
    return {stage:screen==='web'?container:null,mode:screen==='web'?'fullscreen':screen==='wide'?'theater':'normal',native:false};
  }
  // Keep the same 12px radius in ordinary and widescreen layouts; only
  // fullscreen restores square corners. Only round the media stage;
  // the sending bar, live header, gifts and chat are outside this element.
  function createFrame(shadowRoot){
    let frame=null;
    const shadow=document.createElement('div');
    shadow.dataset.biliglowFrameShadow='';shadow.setAttribute('aria-hidden','true');
    shadow.style.cssText='position:absolute;pointer-events:none!important;background:transparent;display:none;';
    shadowRoot.append(shadow);
    function clear(){frame?.removeAttribute('data-biliglow-rounded');frame=null;shadow.style.display='none';}
    function update(video,settings,kind,mode,origin){
      const enabled=settings.enabled&&mode!=='fullscreen'&&video?.isConnected;
      const next=enabled&&(settings.roundedCorners||settings.frameShadow>0)
        ?video.closest(kind==='live'?'#live-player':'.bpx-player-video-area'):null;
      if(next!==frame){clear();frame=next;}
      if(!frame)return null;
      const rounded=settings.roundedCorners;
      if(frame.hasAttribute('data-biliglow-rounded')!==rounded)frame.toggleAttribute('data-biliglow-rounded',rounded);
      const r=frame.getBoundingClientRect(),style=getComputedStyle(frame);
      const amount=settings.frameShadow/100;
      // The shadow lives above the light canvas, below page content, outside
      // Bilibili's overflow:hidden wrappers. It never intercepts player input.
      shadow.style.display=amount>0?'block':'none';
      shadow.style.left=`${r.left-origin.left}px`;shadow.style.top=`${r.top-origin.top}px`;
      shadow.style.width=`${r.width}px`;shadow.style.height=`${r.height}px`;
      shadow.style.borderRadius=style.borderRadius;
      shadow.style.boxShadow=amount>0?`0 2px ${4+8*amount}px rgba(0,0,0,${.6*amount}),0 4px ${8+24*amount}px ${2*amount}px rgba(0,0,0,${.5*amount})`:'none';
      return {rect:r,radius:rounded?12:0};
    }
    return {update,clear};
  }
  function roundedCutout(rect,frame,origin,viewport){
    if(!frame?.radius||!['left','top','width','height'].every(k=>Math.abs(rect[k]-frame.rect[k])<2))return null;
    const x=rect.left-origin.left,y=rect.top-origin.top,w=rect.width,h=rect.height,r=Math.min(frame.radius,w/2,h/2);
    // A rounded inverse hole lets light reach the newly exposed corner pixels.
    return `path(evenodd, "M0 0H${viewport.width}V${viewport.height}H0Z M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z")`;
  }
  globalThis.BiliGlowPlayer=Object.freeze({pageKind,selectVideo,presentation,createFrame,roundedCutout});
})();
