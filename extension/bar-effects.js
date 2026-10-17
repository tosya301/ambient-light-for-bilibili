(() => {
  'use strict';
  const empty=()=>({top:0,bottom:0,left:0,right:0});
  const hasBars=c=>c.top+c.bottom+c.left+c.right>0;
  // Contain the remaining picture without stretching or cutting off content.
  function geometry(box,sourceWidth,sourceHeight,crop,fill){
    const fit=Math.min(box.width/sourceWidth,box.height/sourceHeight);
    const iw=sourceWidth*fit,ih=sourceHeight*fit;
    const x=(box.width-iw)/2+iw*crop.left,y=(box.height-ih)/2+ih*crop.top;
    const width=iw*(1-crop.left-crop.right),height=ih*(1-crop.top-crop.bottom);
    const scale=fill?Math.min(box.width/width,box.height/height):1;
    const dx=fill?(box.width-width*scale)/2-x*scale:0;
    const dy=fill?(box.height-height*scale)/2-y*scale:0;
    return {scale,dx,dy,inset:{top:y,right:box.width-x-width,bottom:box.height-y-height,left:x},
      rect:{left:box.left+dx+x*scale,top:box.top+dy+y*scale,width:width*scale,height:height*scale}};
  }
  function create(video,{onChange=()=>{},onStatus=()=>{}}={}){
    const sampleCanvas=document.createElement('canvas');sampleCanvas.width=320;sampleCanvas.height=180;
    const ctx=sampleCanvas.getContext('2d',{willReadFrequently:true});
    let crop=empty(),config={},key='',active=false,observeFullscreen=false,fullscreenBars=false,unreadable=false,lastSample=-Infinity,lastTime=-1;
    let scale=1,dx=0,dy=0,patched=false,unsupported=false,tracker=globalThis.BiliGlowBars.createTracker();
    let status='宽屏去边已关闭';
    const setStatus=text=>{if(text!==status){status=text;onStatus(text);}};
    const restore=()=>{
      video.removeAttribute('data-biliglow-bar-crop');
      video.style.removeProperty('--biliglow-video-clip');
      video.style.removeProperty('--biliglow-video-transform');
      scale=1;dx=dy=0;patched=false;
    };
    const reset=()=>{
      crop=empty();fullscreenBars=false;tracker.reset();lastSample=-Infinity;lastTime=-1;unreadable=false;unsupported=false;
      sampleCanvas.width=320;restore();onChange();
    };
    function configure(settings,mode){
      const enabled=settings.enabled&&(settings.removeHorizontalBars||settings.removeVerticalBars);
      const nextActive=Boolean(enabled&&mode==='theater');
      const nextObserve=Boolean(settings.enabled&&mode==='fullscreen');
      const nextKey=nextObserve?'fullscreen-black':[nextActive,settings.removeHorizontalBars,settings.removeVerticalBars,settings.detectColoredBars].join(':');
      config=settings;
      const changed=nextKey!==key;
      if(changed){key=nextKey;active=nextActive;observeFullscreen=nextObserve;reset();}
      if(!enabled)setStatus('宽屏去边已关闭');
      else if(!active)setStatus('进入宽屏模式后自动识别');
      else if(changed&&!unreadable)setStatus(video.paused?'播放后检测边框':'正在检测 · 连续多帧确认');
    }
    function sample(now,fullscreenEligible=false){
      const observing=observeFullscreen&&fullscreenEligible;
      if((!active&&!observing)||unsupported||unreadable||now-lastSample<400||video.readyState<2||!video.videoWidth
        ||(lastTime===video.currentTime&&!(observing&&video.paused)))return;
      lastSample=now;lastTime=video.currentTime;
      try{
        sampleCanvas.height=Math.max(90,Math.min(320,Math.round(320*video.videoHeight/video.videoWidth)));
        ctx.drawImage(video,0,0,sampleCanvas.width,sampleCanvas.height);
        const image=ctx.getImageData(0,0,sampleCanvas.width,sampleCanvas.height);
        const detected=observing?globalThis.BiliGlowBars.detectFullscreenBars(image):globalThis.BiliGlowBars.detect(image,{
          horizontal:config.removeHorizontalBars,vertical:config.removeVerticalBars,colored:config.detectColoredBars
        });
        const next=tracker.update(detected);
        // Observation never enters crop/geometry. The unchanged source frame
        // retains subtitles and its encoded black bars in fullscreen.
        if(observing){
          const nextBars=next.top>0&&next.bottom>0;
          if(nextBars!==fullscreenBars){fullscreenBars=nextBars;onChange();}
          return;
        }
        if(next&&JSON.stringify(next)!==JSON.stringify(crop)){crop=next;onChange();}
        setStatus(hasBars(crop)?`已去边 · 上下 ${Math.round((crop.top+crop.bottom)*100)}% / 左右 ${Math.round((crop.left+crop.right)*100)}%`:'未确认稳定边框 · 保留原画');
      }catch(error){
        unreadable=true;crop=empty();fullscreenBars=false;restore();onChange();
        setStatus(error.name==='SecurityError'?'视频限制像素读取 · 自动去边不可用':'此视频暂时无法检测边框');
      }
    }
    function layout(){
      if(active||observeFullscreen){
        const css=getComputedStyle(video);
        const originalTransform=video.style.transform;
        if((!patched&&css.transform!=='none')||(originalTransform&&originalTransform!=='none')||css.objectFit!=='contain'||css.objectPosition!=='50% 50%'||(!patched&&css.clipPath!=='none')){
          const changed=hasBars(crop)||fullscreenBars;crop=empty();fullscreenBars=false;tracker.reset();unsupported=true;restore();
          setStatus('播放器已有画面变换 · 保留原画');if(changed)onChange();return null;
        }
        unsupported=false;
      }
      // Undo our previous transform mathematically, avoiding style/layout churn.
      const r=video.getBoundingClientRect();
      const box={left:r.left-dx,top:r.top-dy,width:r.width/scale,height:r.height/scale};
      if(!active||!hasBars(crop)){restore();return null;}
      const g=geometry(box,video.videoWidth,video.videoHeight,crop,config.fillRemovedBars);
      const i=g.inset;
      video.style.setProperty('--biliglow-video-clip',`inset(${i.top}px ${i.right}px ${i.bottom}px ${i.left}px)`);
      video.style.setProperty('--biliglow-video-transform',`translate(${g.dx}px,${g.dy}px) scale(${g.scale})`);
      video.setAttribute('data-biliglow-bar-crop','');
      scale=g.scale;dx=g.dx;dy=g.dy;patched=true;
      return g.rect;
    }
    restore(); // Remove only our inherited effects if the host cloned an old video.
    return {configure,sample,layout,reset,dispose:restore,get crop(){return crop;},get fullscreenBars(){return fullscreenBars;},get status(){return status;}};
  }
  const api={geometry,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  globalThis.BiliGlowVideoBars=api;
})();
