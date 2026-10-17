const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
require('../extension/shared.js');
const B=globalThis.BiliGlow;
test('invalid stored settings cannot escape supported ranges or add keys',()=>{
  const s=B.sanitize({enabled:'yes',strength:Infinity,spread:-5,blur:900,fps:NaN,saturation:155.9,dark:false,arbitrary:'ignored'});
  assert.equal(s.enabled,true);assert.equal(s.strength,80);assert.equal(s.spread,30);assert.equal(s.blur,140);assert.equal(s.fps,24);assert.equal(s.saturation,156);assert.equal(s.dark,false);assert.ok(!('arbitrary'in s));
});
test('contained video geometry preserves letterbox and portrait placement',()=>{
  const actual=B.contentRect({left:100,top:50,width:1000,height:600},1920,1080);
  for(const [key,value] of Object.entries({left:100,top:68.75,width:1000,height:562.5})) assert.ok(Math.abs(actual[key]-value)<1e-8,key);
  assert.deepEqual(B.contentRect({left:0,top:0,width:960,height:540},1080,1920),{left:328.125,top:0,width:303.75,height:540});
  assert.deepEqual(B.contentRect({left:0,top:0,width:0,height:0},0,0),{left:0,top:0,width:0,height:0});
});
test('temporal blending has equal response at different frame rates',()=>{
  const alpha15=B.blendAlpha(1000/15,65),alpha30=B.blendAlpha(1000/30,65);
  assert.ok(Math.abs((1-alpha15)**15-(1-alpha30)**30)<1e-12);
  assert.equal(B.blendAlpha(20,0),1);assert.ok(B.blendAlpha(20,95)<B.blendAlpha(20,30));
});
test('theater projects past both viewport edges without changing normal spread',()=>{
  const r={left:200,top:100,width:1200,height:675},viewport={width:1600,height:900};
  const normal=B.glowGeometry(r,viewport,B.defaults);
  const wide=B.glowGeometry(r,viewport,B.defaults,'theater');
  assert.equal(normal.left,100);assert.equal(normal.width,1400);
  assert.ok(wide.left<0);assert.ok(wide.left+wide.width>viewport.width);
  assert.ok(wide.height>normal.height);assert.ok(wide.blur>normal.blur);
});
test('400% covers every viewport edge plus blur bleed for off-centre and scrolled players',async()=>{
  await B.storage.set({spread:400});
  assert.equal((await B.storage.get()).spread,400);
  assert.equal(B.sanitize({spread:999}).spread,400);
  const fixtures=[
    {r:{left:160.5,top:103.5,width:951,height:534.9375},vp:{width:1728,height:853}},
    {r:{left:300,top:160,width:1400,height:787.5},vp:{width:3440,height:1440}},
    {r:{left:36,top:-400,width:900,height:506.25},vp:{width:1024,height:1366}},
    {r:{left:1500,top:70,width:1080,height:607.5},vp:{width:3840,height:2160}}
  ];
  for(const {r,vp} of fixtures) for(const mode of ['normal','theater','fullscreen']) for(const blur of [20,72,140]) {
    const glow=B.glowGeometry(r,vp,{...B.defaults,spread:400,blur},mode);
    const bleed=glow.blur*3;
    assert.ok(glow.left<=-bleed,'left edge');
    assert.ok(glow.top<=-bleed,'top edge');
    assert.ok(glow.left+glow.width>=vp.width+bleed,'right edge');
    assert.ok(glow.top+glow.height>=vp.height+bleed,'bottom edge');
    const base=B.glowGeometry(r,vp,{...B.defaults,spread:100,blur},mode);
    assert.ok(glow.width>=base.width&&glow.height>=base.height);
    assert.ok(glow.width<=vp.width+bleed*2+base.width,'bounded render surface');
  }
  await B.storage.set(B.defaults);
});
test('increasing spread never shrinks any edge or introduces a jump at 100%',()=>{
  const r={left:160,top:100,width:950,height:535},vp={width:1728,height:900};
  for(const mode of ['normal','theater','fullscreen']) {
    let previous=B.glowGeometry(r,vp,{...B.defaults,spread:30},mode);
    for(let spread=31;spread<=400;spread++) {
      const next=B.glowGeometry(r,vp,{...B.defaults,spread},mode);
      assert.ok(next.left<=previous.left&&next.top<=previous.top);
      assert.ok(next.left+next.width>=previous.left+previous.width-1e-6);
      assert.ok(next.top+next.height>=previous.top+previous.height-1e-6);
      previous=next;
    }
    const before=B.glowGeometry(r,vp,{...B.defaults,spread:99.9999},mode);
    const after=B.glowGeometry(r,vp,{...B.defaults,spread:100.0001},mode);
    assert.ok(Math.abs(after.width-before.width)<.01&&Math.abs(after.height-before.height)<.01);
  }
});
test('clear background is opt-in, rejects invalid values and preserves existing light parameters',async()=>{
  const old={privacyAccepted:true,enabled:true,spread:75,blur:95,smoothing:80,strength:103};
  assert.equal(B.defaults.clearBackground,false);
  assert.equal(B.sanitize(old).clearBackground,false);
  for(const value of [undefined,null,'true','false',0,1,[],{},NaN])assert.equal(B.sanitize({...old,clearBackground:value}).clearBackground,false);
  await B.storage.set(old);await B.storage.set({clearBackground:true});
  let saved=await B.storage.get();assert.equal(saved.clearBackground,true);
  for(const [key,value] of Object.entries(old))assert.equal(saved[key],value,key);
  await B.storage.set(B.presets.soft);assert.equal((await B.storage.get()).clearBackground,true,'presets preserve the separate opt-in');
  await B.storage.set({clearBackground:false});saved=await B.storage.get();
  assert.equal(saved.clearBackground,false);assert.equal(saved.blur,B.presets.soft.blur);
  await B.storage.set(B.defaults);
});
test('clear background covers the viewport without distortion and bounds its bitmap by source, display and 1920px',()=>{
  for(const [sourceWidth,sourceHeight] of [[1920,1080],[3840,2160],[1080,1920],[640,360],[1440,1080],[11520,1080]]){
    for(const viewport of [{width:1728,height:1117},{width:3440,height:1440},{width:320,height:180}]){
      for(const dpr of [.75,1,2,3]){
        const plan=B.clearBackgroundPlan(sourceWidth,sourceHeight,viewport,dpr);
        assert.equal(plan.left,0);assert.equal(plan.top,0);assert.equal(plan.width,viewport.width);assert.equal(plan.height,viewport.height,'filter surface stays viewport-sized');
        assert.ok(Math.abs(plan.sw/plan.sh-plan.width/plan.height)<1e-8,'source crop and display preserve aspect ratio');
        assert.ok(Math.abs(plan.sx*2+plan.sw-sourceWidth)<1e-8&&Math.abs(plan.sy*2+plan.sh-sourceHeight)<1e-8,'background crop is centred');
        assert.ok(plan.pixelWidth<=plan.sw&&plan.pixelHeight<=plan.sh,'no source crop upscaling');
        assert.ok(plan.pixelWidth<=plan.width*Math.min(dpr,2)&&plan.pixelHeight<=plan.height*Math.min(dpr,2),'no bitmap larger than the covered display');
        assert.ok(Math.max(plan.pixelWidth,plan.pixelHeight)<=1920,'bounded sampling work');
        assert.ok(Math.abs(plan.pixelWidth-plan.sw/plan.sh*plan.pixelHeight)<=1+plan.sw/plan.sh,'integer rounding stays within one source-scaled pixel');
        assert.equal(plan.blur,0);
      }
    }
  }
  assert.deepEqual(B.clearBackgroundPlan(1920,1080,{width:1280,height:900}),{left:0,top:0,width:1280,height:900,blur:0,sx:192,sy:0,sw:1536,sh:1080,pixelWidth:1280,pixelHeight:900});
  assert.equal(B.clearBackgroundPlan(1920,1080,{width:320,height:180},3).pixelWidth,640,'DPR is capped at two');
  assert.equal(B.clearBackgroundPlan(1920,1080,{width:320,height:180},NaN).pixelWidth,320);
  for(const args of [[0,1080,{width:1280,height:900}],[1920,Infinity,{width:1280,height:900}],[1920,1080,{width:0,height:900}],[1920,1080,null]])assert.equal(B.clearBackgroundPlan(...args),null);
});
test('storage patches preserve unrelated values',async()=>{
  await B.storage.set({strength:50});await B.storage.set({dark:false});
  const stored=await B.storage.get();assert.equal(stored.strength,50);assert.equal(stored.dark,false);
  await B.storage.set(B.defaults);
});
test('launcher hiding is opt-in for existing settings and accepts only actual booleans',()=>{
  const old={privacyAccepted:true,enabled:true,strength:103,spread:310,dark:false};
  const upgraded=B.sanitize(old);
  assert.equal(B.defaults.hideLauncher,false);assert.equal(upgraded.hideLauncher,false);
  for(const [key,value] of Object.entries(old))assert.equal(upgraded[key],value,key);
  for(const value of [undefined,null,'true','false',0,1,[],{},NaN]){
    assert.equal(B.sanitize({hideLauncher:value}).hideLauncher,false,`${String(value)} cannot hide the launcher`);
  }
  assert.equal(B.sanitize({hideLauncher:true}).hideLauncher,true);
  assert.equal(B.sanitize({hideLauncher:false}).hideLauncher,false);
});
test('launcher visibility persists across extension contexts, reloads and light toggles',async()=>{
  const stored={privacyAccepted:true,enabled:true,strength:103},listeners=new Set(),writes=[];
  const shared=fs.readFileSync(__dirname+'/../extension/shared.js','utf8');
  function load(){
    const context=vm.createContext({chrome:{storage:{
      local:{async get(keys){return Object.fromEntries(keys.filter(key=>key in stored).map(key=>[key,stored[key]]));},async set(patch){
        writes.push({...patch});const changes={};
        for(const [key,value] of Object.entries(patch)){changes[key]={oldValue:stored[key],newValue:value};stored[key]=value;}
        for(const listener of listeners)listener(changes,'local');
      }},onChanged:{addListener(fn){listeners.add(fn);},removeListener(fn){listeners.delete(fn);}}
    }}});
    vm.runInContext(shared,context);return context.BiliGlow;
  }
  const popup=load(),content=load(),contentChanges=[];
  assert.equal((await content.storage.get()).hideLauncher,false);assert.equal(writes.length,0,'reading old storage must not rewrite it');
  const unsubscribe=content.storage.subscribe(settings=>contentChanges.push(settings));
  try{
    await popup.storage.set({hideLauncher:true});await new Promise(setImmediate);
    assert.equal(stored.hideLauncher,true);assert.equal(contentChanges.at(-1).hideLauncher,true);
    assert.equal((await load().storage.get()).hideLauncher,true,'a newly loaded page reads the saved hidden preference');
    await popup.storage.set({enabled:false});await popup.storage.set(B.presets.vivid);await popup.storage.set({enabled:true});
    const reread=await content.storage.get();
    assert.equal(reread.hideLauncher,true);assert.equal(reread.enabled,true);assert.equal(reread.strength,100);
    await popup.storage.set({hideLauncher:false});await new Promise(setImmediate);
    assert.equal(contentChanges.at(-1).hideLauncher,false);assert.equal((await load().storage.get()).hideLauncher,false);
    assert.equal(stored.privacyAccepted,true,'changing launcher visibility does not change consent');
  }finally{unsubscribe();}
});
test('bar removal is opt-in when upgrading existing settings and rejects truthy non-booleans',()=>{
  const existing=B.sanitize({strength:100,spread:310,dark:true});
  assert.equal(existing.removeHorizontalBars,false);assert.equal(existing.removeVerticalBars,false);
  assert.equal(existing.detectColoredBars,false);assert.equal(existing.fillRemovedBars,false);
  const invalid=B.sanitize({removeHorizontalBars:'true',removeVerticalBars:1,detectColoredBars:[],fillRemovedBars:{}});
  assert.equal(invalid.removeHorizontalBars,false);assert.equal(invalid.removeVerticalBars,false);
  assert.equal(invalid.detectColoredBars,false);assert.equal(invalid.fillRemovedBars,false);
});
test('bar removal choices persist independently and survive light preset changes',async()=>{
  await B.storage.set({removeHorizontalBars:true,removeVerticalBars:true,detectColoredBars:true,fillRemovedBars:true});
  await B.storage.set({removeHorizontalBars:false});
  await B.storage.set(B.presets.vivid);
  const stored=await B.storage.get();
  assert.equal(stored.removeHorizontalBars,false);assert.equal(stored.removeVerticalBars,true);
  assert.equal(stored.detectColoredBars,true);assert.equal(stored.fillRemovedBars,true);
  assert.equal(stored.strength,100);assert.equal(stored.spread,310);
  await B.storage.set(B.defaults);
});
test('MV3 package references real files and only requests storage',()=>{
  const base=__dirname+'/../extension/';const m=JSON.parse(fs.readFileSync(base+'manifest.json'));
  assert.equal(m.manifest_version,3);assert.deepEqual(m.permissions,['storage']);assert.deepEqual(m.content_scripts[0].matches,['https://www.bilibili.com/*','https://live.bilibili.com/*']);
  for(const path of [...Object.values(m.icons),...m.content_scripts[0].js,...m.content_scripts[0].css,m.action.default_popup,m.background.service_worker])assert.ok(fs.existsSync(base+path),path);
});

test('frame preferences upgrade without changing saved light settings and reject invalid input',()=>{
  const old={privacyAccepted:true,strength:103,spread:310,hideLauncher:true};
  const upgraded=B.sanitize(old);
  assert.equal(upgraded.roundedCorners,false);assert.equal(upgraded.frameShadow,0);
  for(const [key,value] of Object.entries(old))assert.equal(upgraded[key],value);
  assert.equal(B.sanitize({roundedCorners:'true',frameShadow:NaN}).roundedCorners,false);
  assert.equal(B.sanitize({frameShadow:Infinity}).frameShadow,0);
  assert.equal(B.sanitize({frameShadow:-1}).frameShadow,0);
  assert.equal(B.sanitize({frameShadow:999}).frameShadow,100);
});
test('frame preferences persist independently of light presets and enable/disable',async()=>{
  try{
    await B.storage.set({roundedCorners:true,frameShadow:65});
    await B.storage.set(B.presets.soft);await B.storage.set({enabled:false});await B.storage.set({enabled:true});
    let saved=await B.storage.get();assert.equal(saved.roundedCorners,true);assert.equal(saved.frameShadow,65);
    await B.storage.set({frameShadow:0});saved=await B.storage.get();assert.equal(saved.roundedCorners,true);assert.equal(saved.frameShadow,0);
  }finally{await B.storage.set(B.defaults);}
});

test('glass controls are opt-in on upgrade and accept only boolean settings',()=>{
  const old={privacyAccepted:true,enabled:true,roundedCorners:true,frameShadow:65,strength:103};
  const upgraded=B.sanitize(old);
  assert.equal(B.defaults.glassControls,false);assert.equal(upgraded.glassControls,false);
  for(const [key,value] of Object.entries(old))assert.equal(upgraded[key],value,key);
  for(const glassControls of [undefined,null,'true','false',0,1,[],{},NaN])assert.equal(B.sanitize({glassControls}).glassControls,false);
  assert.equal(B.sanitize({glassControls:true}).glassControls,true);
});

test('glass preference synchronizes between extension contexts and survives reload, presets and consent changes',async()=>{
  const stored={privacyAccepted:true,enabled:true,roundedCorners:true,frameShadow:65},listeners=new Set(),writes=[];
  const shared=fs.readFileSync(__dirname+'/../extension/shared.js','utf8');
  function load(){
    const context=vm.createContext({chrome:{storage:{local:{
      async get(){return {...stored};},
      async set(patch){
        writes.push({...patch});const changes={};
        for(const [key,value] of Object.entries(patch)){changes[key]={oldValue:stored[key],newValue:value};stored[key]=value;}
        for(const listener of listeners)listener(changes,'local');
      }
    },onChanged:{addListener(fn){listeners.add(fn);},removeListener(fn){listeners.delete(fn);}}}}});
    vm.runInContext(shared,context);return context.BiliGlow;
  }
  const popup=load(),content=load(),updates=[];
  assert.equal((await content.storage.get()).glassControls,false);assert.equal(writes.length,0,'old preferences are read without migration writes');
  const unsubscribe=content.storage.subscribe(settings=>updates.push(settings));
  try{
    await popup.storage.set({glassControls:true});await new Promise(setImmediate);
    assert.deepEqual(writes[0],{glassControls:true});assert.equal(updates.at(-1).glassControls,true);
    assert.equal((await load().storage.get()).glassControls,true,'a new page receives the saved preference');
    await popup.storage.set(B.presets.vivid);await popup.storage.set({enabled:false});await popup.storage.set({privacyAccepted:false});
    const saved=await content.storage.get();
    assert.equal(saved.glassControls,true);assert.equal(saved.roundedCorners,true);assert.equal(saved.frameShadow,65);
    assert.equal(saved.privacyAccepted,false);assert.equal(saved.enabled,false);
    await popup.storage.set({glassControls:false});await new Promise(setImmediate);
    assert.equal(updates.at(-1).glassControls,false);assert.equal((await load().storage.get()).glassControls,false);
    assert.equal(stored.privacyAccepted,false,'the appearance toggle cannot grant consent');
  }finally{unsubscribe();}
});
