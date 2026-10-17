/* An entirely local, animated landscape for the settings preview. */
(() => {
  'use strict';

  function create(element) {
    const video=element?.querySelector('.preview-video');
    const glow=element?.querySelector('.preview-glow');
    const scene=video?.getContext('2d',{alpha:false});
    const light=glow?.getContext('2d',{alpha:false});
    if(!scene || !light) return {update(){},setVisible(){},destroy(){}};

    const doc=element.ownerDocument,win=doc.defaultView;
    const motion=win.matchMedia('(prefers-reduced-motion: reduce)');
    let settings={enabled:true,clearBackground:false,strength:80,spread:100,blur:72,saturation:130,smoothing:65,fps:24};
    let visible=true,inView=true,destroyed=false,frame=0,lastTick=null,phase=0,painted=false;
    const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
    const mix=(a,b,t)=>a.map((value,i)=>Math.round(value+(b[i]-value)*t));
    const rgb=(value)=>`rgb(${value.join(',')})`;

    function style() {
      const strength=clamp(settings.strength,0,150);
      element.dataset.enabled=String(settings.enabled);
      element.dataset.background=settings.clearBackground?'clear':'glow';
      const box=element.getBoundingClientRect?.()||{width:354,height:110};
      const values={
        '--preview-opacity':settings.enabled?Math.min(1,strength/100)*.94:0,
        '--preview-scale':settings.clearBackground?Math.max(box.width/144,box.height/81):1.05+(clamp(settings.spread,30,400)-30)/370*1.6,
        '--preview-blur':settings.clearBackground?'0px':`${5+(clamp(settings.blur,20,140)-20)/120*15}px`,
        '--preview-saturation':clamp(settings.saturation,50,200)/100,
        '--preview-brightness':1+strength/150*.3,
        '--preview-transition':`${motion.matches||settings.clearBackground?0:clamp(settings.smoothing,0,95)*6}ms`
      };
      Object.entries(values).forEach(([key,value])=>element.style.setProperty(key,String(value)));
    }

    function draw(dt,replace=false) {
      const w=video.width,h=video.height;
      // Scene time pauses with the panel. Colour drifts over a twelve-second
      // cycle, while fixed silhouettes keep the small preview easy to read.
      if(!motion.matches) phase+=dt/1000;
      const t=(Math.sin(phase*Math.PI/6)+1)/2;
      scene.save();
      scene.scale(w/256,h/144);
      const sky=scene.createLinearGradient(0,0,256,114);
      sky.addColorStop(0,rgb(mix([75,173,203],[125,148,212],t)));
      sky.addColorStop(.55,rgb(mix([162,199,232],[170,163,227],t)));
      sky.addColorStop(1,rgb(mix([173,159,220],[225,174,224],t)));
      scene.fillStyle=sky;scene.fillRect(0,0,256,144);

      const haze=scene.createRadialGradient(190,37,0,190,37,66);
      haze.addColorStop(0,'rgba(240,239,255,.4)');haze.addColorStop(1,'rgba(240,239,255,0)');
      scene.fillStyle=haze;scene.fillRect(118,0,138,106);
      scene.beginPath();scene.arc(191,35,13,0,Math.PI*2);
      scene.fillStyle='rgba(245,239,255,.65)';scene.fill();

      // Three broad ridgelines retain their shape at 144 × 81 CSS pixels.
      scene.beginPath();scene.moveTo(0,98);
      scene.bezierCurveTo(20,94,45,57,69,64);
      scene.bezierCurveTo(93,71,97,91,119,87);
      scene.bezierCurveTo(151,81,167,52,195,66);
      scene.bezierCurveTo(215,77,239,79,256,70);
      scene.lineTo(256,144);scene.lineTo(0,144);scene.closePath();
      scene.fillStyle=rgb(mix([77,122,165],[105,107,164],t));scene.fill();

      scene.beginPath();scene.moveTo(0,98);
      scene.bezierCurveTo(36,77,64,110,94,106);
      scene.bezierCurveTo(126,102,144,82,175,93);
      scene.bezierCurveTo(208,105,234,101,256,92);
      scene.lineTo(256,144);scene.lineTo(0,144);scene.closePath();
      scene.fillStyle=rgb(mix([47,94,129],[76,74,129],t));scene.fill();

      const foreground=scene.createLinearGradient(0,103,200,144);
      foreground.addColorStop(0,rgb(mix([31,80,105],[60,62,109],t)));
      foreground.addColorStop(1,rgb(mix([31,51,78],[37,43,74],t)));
      scene.beginPath();scene.moveTo(0,125);
      scene.bezierCurveTo(50,143,76,112,119,117);
      scene.bezierCurveTo(161,119,207,144,256,116);
      scene.lineTo(256,144);scene.lineTo(0,144);scene.closePath();
      scene.fillStyle=foreground;scene.fill();
      scene.restore();

      light.globalAlpha=replace||!painted||motion.matches||settings.clearBackground?1:
        globalThis.BiliGlow.blendAlpha(dt,settings.smoothing);
      light.drawImage(video,0,0,glow.width,glow.height);
      light.globalAlpha=1;
      painted=true;
    }

    function canAnimate() {return !destroyed && settings.enabled && visible && inView && !doc.hidden && !motion.matches;}
    function stop() {
      if(frame) win.cancelAnimationFrame(frame);
      frame=0;lastTick=null;
    }
    function tick(now) {
      frame=0;
      if(!canAnimate()) return;
      const interval=1000/clamp(settings.fps,8,24);
      if(lastTick===null) lastTick=now;
      const dt=now-lastTick;
      if(dt>=interval){draw(Math.min(dt,250));lastTick=now;}
      frame=win.requestAnimationFrame(tick);
    }
    function sync() {
      if(!canAnimate()){stop();return;}
      if(!frame) frame=win.requestAnimationFrame(tick);
    }
    function onMotion() {
      if(destroyed) return;
      style();
      if(motion.matches){phase=0;draw(0,true);}
      sync();
    }
    doc.addEventListener('visibilitychange',sync);
    motion.addEventListener('change',onMotion);
    const observer=typeof win.IntersectionObserver==='function'?new win.IntersectionObserver(entries=>{
      if(destroyed) return;
      inView=entries.some(entry=>entry.target===element && entry.isIntersecting);
      sync();
    },{threshold:0}):null;
    if(observer){inView=false;observer.observe(element);}
    style();draw(0,true);sync();

    return {
      update(next) {
        if(destroyed) return;
        const changed=typeof next.clearBackground==='boolean'&&next.clearBackground!==settings.clearBackground;
        settings={...settings,...next};
        style();if(changed)draw(0,true);sync();
      },
      setVisible(value) {
        if(destroyed) return;
        visible=Boolean(value);sync();
      },
      destroy() {
        if(destroyed) return;
        destroyed=true;stop();observer?.disconnect();
        doc.removeEventListener('visibilitychange',sync);
        motion.removeEventListener('change',onMotion);
      }
    };
  }
  globalThis.BiliGlowPreview=Object.freeze({create});
})();
