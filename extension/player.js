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
    let frame=null,picture=null,space=null,extra=0;
    const shadow=document.createElement('div');
    shadow.dataset.biliglowFrameShadow='';shadow.setAttribute('aria-hidden','true');
    shadow.style.cssText='position:absolute;pointer-events:none!important;background:transparent;display:none;';
    shadowRoot.append(shadow);
    function clearSpace(){
      if(space){
        space.removeAttribute('data-biliglow-player-space');
        space.style.removeProperty('--biliglow-player-padding');
        space.style.removeProperty('--biliglow-player-extra');
      }
      space=null;extra=0;
    }
    function reserveSpace(rounded,kind){
      const next=rounded&&kind==='video'?frame.closest('#playerWrap'):null;
      if(next!==space)clearSpace();
      if(!next)return;
      // A floating player uses viewport coordinates while its page wrapper
      // continues scrolling. Comparing their bottoms would grow the page by
      // the scroll distance. Keep the last in-flow footprint until it returns;
      // removing it here would also move the toolbar and comments mid-scroll.
      if(frame.closest('.bpx-player-container')?.getAttribute('data-screen')==='mini')return;
      for(let el=frame;el&&el!==next;el=el.parentElement){
        if(['fixed','sticky'].includes(getComputedStyle(el).position))return;
      }
      // Native Bilibili keeps a definite inner player height. overflow:clip
      // lets a taller in-flow recording exceed it. Reserve that actual excess
      // on the outer wrapper, without resizing the inner player or the video.
      const style=getComputedStyle(next);
      if(style.boxSizing!=='content-box'){clearSpace();return;}
      const primary=frame.closest('.bpx-player-primary-area');
      const sending=primary?.querySelector('.bpx-player-sending-area');
      const bottom=Math.max(frame.getBoundingClientRect().bottom,sending?.getBoundingClientRect().bottom||0);
      const nativeBottom=next.getBoundingClientRect().bottom-extra;
      const needed=bottom-nativeBottom>1?Math.ceil(bottom-nativeBottom):0;
      if(!needed){clearSpace();return;}
      if(!space){
        space=next;
        space.style.setProperty('--biliglow-player-padding',style.paddingBottom);
        space.setAttribute('data-biliglow-player-space','');
      }
      if(needed!==extra){space.style.setProperty('--biliglow-player-extra',`${needed}px`);extra=needed;}
    }
    function clearPicture(){
      picture?.removeAttribute('data-biliglow-picture-rounded');
      picture?.style.removeProperty('--biliglow-picture-clip');
      picture=null;
    }
    function roundPicture(video,rounded,kind,cropRect){
      const next=rounded&&kind==='video'?video.closest('.bpx-player-video-wrap'):null;
      if(next!==picture)clearPicture();
      // This layer contains the video alone; player controls remain outside.
      // Clipping it composes with the video's independent bar-crop transform.
      if(!next||next===frame||!frame.contains(next)||!video.videoWidth||!video.videoHeight){clearPicture();return null;}
      const rect=cropRect||globalThis.BiliGlow.contentRect(video.getBoundingClientRect(),video.videoWidth,video.videoHeight,getComputedStyle(video).objectFit);
      const wrap=next.getBoundingClientRect();
      const insets=[rect.top-wrap.top,wrap.right-rect.left-rect.width,wrap.bottom-rect.top-rect.height,rect.left-wrap.left];
      if(rect.width<=0||rect.height<=0||wrap.width<=0||wrap.height<=0||insets.some(value=>!Number.isFinite(value)||value< -1)){clearPicture();return null;}
      picture=next;
      picture.style.setProperty('--biliglow-picture-clip',`inset(${insets.map(value=>Math.max(0,value)+'px').join(' ')} round 12px)`);
      picture.setAttribute('data-biliglow-picture-rounded','');
      return rect;
    }
    function clear(){clearPicture();clearSpace();frame?.removeAttribute('data-biliglow-rounded');frame?.removeAttribute('data-biliglow-native-size');frame=null;shadow.style.display='none';}
    function update(video,settings,kind,mode,origin,readCrop){
      const enabled=settings.enabled&&mode!=='fullscreen'&&video?.isConnected;
      const next=enabled&&(settings.roundedCorners||settings.frameShadow>0)
        ?video.closest(kind==='live'?'#live-player':'.bpx-player-video-area'):null;
      if(next!==frame){clear();frame=next;}
      if(!frame){readCrop?.();return null;}
      const rounded=settings.roundedCorners;
      if(frame.hasAttribute('data-biliglow-rounded')!==rounded)frame.toggleAttribute('data-biliglow-rounded',rounded);
      // Square, 4:3 and portrait media retain their native contained size.
      // Slightly taller widescreen recordings keep the existing larger frame.
      const nativeSize=rounded&&kind==='video'&&video.videoWidth>0&&video.videoHeight>0&&video.videoWidth*3<=video.videoHeight*4;
      if(frame.hasAttribute('data-biliglow-native-size')!==nativeSize)frame.toggleAttribute('data-biliglow-native-size',nativeSize);
      reserveSpace(rounded,kind);
      const cropRect=readCrop?.();
      const r=roundPicture(video,rounded,kind,cropRect)||frame.getBoundingClientRect(),style=getComputedStyle(frame);
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
