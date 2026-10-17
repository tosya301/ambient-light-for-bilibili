const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// The canvas pixels are reviewed in the browser. This harness checks resource
// lifetime and timing, which are not apparent in a static screenshot.
function fixture(reducedMotion=false) {
  const queue=new Map(),docEvents=new Map(),motionEvents=new Map(),styles=new Map();
  let id=0,now=0,observer,paintCount=0,blendCount=0;
  function context() {
    return new Proxy({}, {get(target,key) {
      if(key in target) return target[key];
      if(key==='createLinearGradient'||key==='createRadialGradient') return ()=>({addColorStop(){}});
      if(key==='drawImage') return ()=>paintCount++;
      return ()=>{};
    }});
  }
  const scene={width:256,height:144,getContext:()=>context()};
  const glow={width:256,height:144,getContext:()=>context()};
  const motion={matches:reducedMotion,addEventListener:(key,fn)=>motionEvents.set(key,fn),removeEventListener:(key)=>motionEvents.delete(key)};
  const win={
    matchMedia:()=>motion,
    requestAnimationFrame:fn=>{queue.set(++id,fn);return id;},
    cancelAnimationFrame:id=>queue.delete(id),
    IntersectionObserver:class {
      constructor(callback){this.callback=callback;observer=this;this.disconnected=false;}
      observe(target){this.target=target;}
      disconnect(){this.disconnected=true;}
    }
  };
  const doc={defaultView:win,hidden:false,addEventListener:(key,fn)=>docEvents.set(key,fn),removeEventListener:(key)=>docEvents.delete(key)};
  const element={ownerDocument:doc,dataset:{},style:{setProperty:(key,value)=>styles.set(key,value)},querySelector:key=>key==='.preview-video'?scene:glow};
  const sandbox={BiliGlow:{blendAlpha:()=>{blendCount++;return .2;}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/preview.js'),'utf8'),sandbox);
  const preview=sandbox.BiliGlowPreview.create(element);
  return {
    preview,styles,doc,motion,queue,docEvents,motionEvents,
    get paints(){return paintCount;},get blends(){return blendCount;},get observer(){return observer;},
    intersect(value){observer.callback([{target:element,isIntersecting:value}]);},
    visibility(hidden){doc.hidden=hidden;docEvents.get('visibilitychange')?.();},
    reduce(value){motion.matches=value;motionEvents.get('change')?.();},
    frames(count,step=1000/60){for(let i=0;i<count;i++){now+=step;const entries=[...queue.entries()];queue.clear();entries.forEach(([,fn])=>fn(now));}}
  };
}

test('preview limits rendering and pauses when offscreen, in another tab, or document-hidden',()=>{
  const f=fixture();
  assert.equal(f.paints,1,'initial scene is ready before the observer reports visibility');
  assert.equal(f.queue.size,0);
  f.intersect(true);f.preview.update({fps:30});f.frames(61);
  assert.ok(f.paints>10 && f.paints<=25,'rendering is limited to at most 24 fps');
  assert.ok(f.blends>0,'animated glow uses temporal blending');
  f.intersect(false);const stopped=f.paints;f.frames(10);
  assert.equal(f.queue.size,0);assert.equal(f.paints,stopped);
  f.intersect(true);assert.equal(f.queue.size,1);
  f.preview.setVisible(false);assert.equal(f.queue.size,0);
  f.preview.setVisible(true);assert.equal(f.queue.size,1);
  f.visibility(true);assert.equal(f.queue.size,0);
  f.visibility(false);assert.equal(f.queue.size,1);
  f.preview.destroy();assert.equal(f.queue.size,0);
  assert.equal(f.docEvents.size,0);assert.equal(f.motionEvents.size,0);assert.equal(f.observer.disconnected,true);
  f.preview.update({strength:100});f.preview.setVisible(true);f.intersect(true);
  assert.equal(f.queue.size,0,'late callbacks cannot restart a destroyed preview');
});

test('reduced motion has a static scene, no transitions, and no animation loop',()=>{
  const f=fixture(true);f.intersect(true);f.preview.update({spread:400,smoothing:95});
  assert.equal(f.paints,1);assert.equal(f.queue.size,0);assert.equal(f.styles.get('--preview-transition'),'0ms');
  f.reduce(false);assert.equal(f.queue.size,1);f.frames(20);
  assert.ok(f.paints>1);
  f.reduce(true);assert.equal(f.queue.size,0);assert.equal(f.styles.get('--preview-transition'),'0ms');
  const staticCount=f.paints;f.frames(20);assert.equal(f.paints,staticCount);
  f.preview.destroy();
});

test('disabled and zero-strength previews suppress only the light while the landscape remains rendered',()=>{
  const f=fixture();f.intersect(true);f.preview.update({enabled:false,strength:100});
  assert.equal(f.styles.get('--preview-opacity'),'0');const stopped=f.paints;f.frames(20);
  assert.equal(f.paints,stopped);assert.equal(f.queue.size,0);
  f.preview.update({smoothing:0});assert.equal(f.styles.get('--preview-transition'),'0ms');
  f.preview.update({enabled:true,strength:0});assert.equal(f.styles.get('--preview-opacity'),'0');
  f.preview.update({strength:100});assert.ok(Number(f.styles.get('--preview-opacity'))>0);
  f.preview.destroy();
});
test('clear preview covers the panel without spatial or temporal blur and restores saved styling when switched off',()=>{
  const f=fixture();f.intersect(true);f.preview.update({spread:75,blur:95,smoothing:80,fps:24});
  const originalScale=f.styles.get('--preview-scale'),originalBlur=f.styles.get('--preview-blur');
  f.frames(20);const blends=f.blends;
  f.preview.update({clearBackground:true});
  assert.equal(f.styles.get('--preview-blur'),'0px');assert.equal(f.styles.get('--preview-transition'),'0ms');
  assert.ok(Number(f.styles.get('--preview-scale'))*144>=354,'clear image covers the panel width');
  f.frames(30);assert.equal(f.blends,blends,'moving clear preview replaces each frame');
  f.preview.update({clearBackground:false});
  assert.equal(f.styles.get('--preview-scale'),originalScale);assert.equal(f.styles.get('--preview-blur'),originalBlur);
  assert.equal(f.styles.get('--preview-transition'),'480ms');f.frames(20);assert.ok(f.blends>blends);
  f.preview.destroy();
});
