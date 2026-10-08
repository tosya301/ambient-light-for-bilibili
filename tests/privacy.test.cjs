const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=name=>fs.readFileSync(`${__dirname}/../extension/${name}`,'utf8');
require('../extension/shared.js');
const B=globalThis.BiliGlow;

test('first install and 0.5.0 storage require consent without discarding existing choices',async()=>{
  const old={enabled:true,strength:101,spread:310,dark:false,removeVerticalBars:true};
  const writes=[];
  const context=vm.createContext({chrome:{storage:{local:{
    async get(){return {...old};},async set(patch){writes.push(patch);Object.assign(old,patch);}
  }}}});
  vm.runInContext(source('shared.js'),context);
  const api=context.BiliGlow;
  assert.equal(B.isActive(B.sanitize({})),false);
  for(const value of ['true',1,{},null])assert.equal(B.isActive(B.sanitize({privacyAccepted:value})),false);
  const upgraded=await api.storage.get();
  assert.equal(upgraded.privacyAccepted,false);
  assert.equal(api.isActive(upgraded),false);
  for(const [key,value] of Object.entries(old))assert.equal(upgraded[key],value,key);
  assert.equal(writes.length,0,'reading old settings must not rewrite them');
  await api.storage.set({privacyAccepted:true,enabled:true});
  assert.equal(api.isActive(await api.storage.get()),true);
  await api.storage.set({privacyAccepted:false});
  const revoked=await api.storage.get();
  assert.equal(api.isActive(revoked),false);
  assert.equal(revoked.strength,101);assert.equal(revoked.spread,310);
  assert.equal(revoked.dark,false);assert.equal(revoked.removeVerticalBars,true);
});

test('keyboard shortcut cannot grant or bypass missing, revoked, or invalid consent',async()=>{
  let command,stored={enabled:true},writes=0;
  const context=vm.createContext({chrome:{commands:{onCommand:{addListener(fn){command=fn;}}},storage:{local:{
    async get(){return {...stored};},async set(patch){writes++;Object.assign(stored,patch);}
  }}}});
  vm.runInContext(source('background.js'),context);
  for(const privacyAccepted of [undefined,false,'true',1]){
    stored={enabled:true,privacyAccepted};await command('toggle-ambient');
    assert.equal(writes,0);assert.equal(stored.enabled,true);
  }
  stored={enabled:true,privacyAccepted:true};await command('toggle-ambient');
  assert.equal(stored.enabled,false);assert.equal(writes,1);
  await command('toggle-ambient');assert.equal(stored.enabled,true);assert.equal(writes,2);
  stored.privacyAccepted=false;await command('toggle-ambient');assert.equal(writes,2);
});

test('toolbar popup does not query the active tab or its player status before consent',async()=>{
  let privacyAccepted=false,refresh,queries=0,messages=0;
  const context=vm.createContext({BiliGlow:{
    mountPanel:()=>({setStatus(){},setBarStatus(){},flush(){}}),storage:{get:async()=>({privacyAccepted}),subscribe:()=>()=>{}}
  },document:{querySelector:()=>({attachShadow(){return {};}})},window:{addEventListener(){}},
  setInterval(fn){refresh=fn;},chrome:{tabs:{
    async query(){queries++;return [{id:1}];},async sendMessage(){messages++;return {text:'播放中'};}
  }}});
  vm.runInContext(source('popup.js'),context);await new Promise(setImmediate);
  assert.equal(queries,0);assert.equal(messages,0);
  privacyAccepted=true;await refresh();assert.equal(queries,1);assert.equal(messages,1);
  privacyAccepted=false;await refresh();assert.equal(queries,1);assert.equal(messages,1);
});

test('HTTP popup preview updates consent and disabled status immediately without extension APIs',async()=>{
  let status,changed;
  const context=vm.createContext({BiliGlow:{
    mountPanel:()=>({setStatus(text){status=text;},setBarStatus(){},flush(){}}),
    storage:{get:async()=>({privacyAccepted:false,enabled:true}),subscribe(fn){changed=fn;return ()=>{};}}
  },document:{querySelector:()=>({attachShadow(){return {};}})},window:{addEventListener(){}},setInterval(){}});
  vm.runInContext(source('popup.js'),context);await new Promise(setImmediate);
  assert.match(status,/请先确认/);
  changed({privacyAccepted:true,enabled:true});
  assert.equal(status,'本地界面预览 · 请在 B 站播放页使用扩展');
  changed({privacyAccepted:true,enabled:false});
  assert.equal(status,'本地界面预览 · 氛围光已关闭');
  changed({privacyAccepted:false,enabled:false});
  assert.match(status,/请先确认/);
});

test('local and cross-tab revocation notify immediately and discard stale asynchronous settings reads',async()=>{
  let onChanged,revokes=0;const reads=[],received=[];
  const context=vm.createContext({chrome:{storage:{local:{
    get(){return new Promise(resolve=>reads.push(resolve));},async set(){}
  },onChanged:{addListener(fn){onChanged=fn;},removeListener(){}}}}});
  vm.runInContext(source('shared.js'),context);
  const api=context.BiliGlow;
  api.storage.subscribe(settings=>received.push(settings),{onRevoke(){revokes++;}});
  onChanged({enabled:{newValue:true}},'local');
  const write=api.storage.set({privacyAccepted:false});
  assert.equal(revokes,1,'local revoke does not await storage persistence');
  reads.shift()({privacyAccepted:true,enabled:true});await write;await Promise.resolve();
  assert.equal(received.length,0,'a pre-revoke read cannot re-enable processing');
  onChanged({privacyAccepted:{newValue:false}},'local');
  assert.equal(revokes,2,'other tabs stop before the follow-up settings read resolves');
  reads.shift()({privacyAccepted:false,enabled:true,spread:310});await new Promise(setImmediate);
  assert.equal(received.length,1);assert.equal(received[0].privacyAccepted,false);assert.equal(received[0].spread,310);
});

function contentHarness(initial,delayed=false,live=false,options={}){
  const counts={videoQueries:0,videoReads:0,draws:0,barCreates:0,barSamples:0,barDisposals:0,cancelled:0};
  const barConfigurations=[];
  const windowEvents=new Map(),documentEvents=new Map(),panelCalls={mounted:0,focused:0};
  const rafs=new Map(),frames=new Map(),intervals=[];let nextId=0,onSettings,resolveInitial,rejectInitial;
  function dispatch(target,type,values={}){
    const event={button:0,isPrimary:true,pointerId:1,clientX:0,clientY:0,detail:1,defaultPrevented:false,propagationStopped:false,
      preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...values};
    (target instanceof Map?target:target.events).get(type)?.(event);return event;
  }
  function styleObject(){
    const style={setProperty(name,value){this[name]=value;},removeProperty(name){delete this[name];}};
    Object.defineProperty(style,'cssText',{set(value){for(const item of value.split(';')){const [name,...parts]=item.split(':');if(parts.length)this[name.trim().replace(/-([a-z])/g,(_match,letter)=>letter.toUpperCase())]=parts.join(':').trim();}}});
    return style;
  }
  class Element{
    constructor(tag){this.localName=tag;this.tagName=tag.toUpperCase();this.dataset={};this.style=styleObject();this.attrs=new Map();this.children=[];this.events=new Map();this.isConnected=true;this.captured=new Set();}
    append(child){if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(item=>item!==child);child.parentNode=this;this.children.push(child);}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(item=>item!==this);this.parentNode=null;}
    contains(child){return child===this||this.children.some(item=>item.contains(child));}
    setAttribute(key,value){this.attrs.set(key,value);}
    removeAttribute(key){this.attrs.delete(key);}
    hasAttribute(key){return this.attrs.has(key);}
    getAttribute(key){return this.attrs.get(key)||null;}
    toggleAttribute(key,on){if(on)this.attrs.set(key,'');else this.attrs.delete(key);}
    addEventListener(type,fn){this.events.set(type,fn);}
    removeEventListener(type){this.events.delete(type);}
    getBoundingClientRect(){return {left:0,top:0,right:1280,bottom:900,width:1280,height:900};}
    attachShadow(){this.shadowRoot=new Element('shadow');this.shadowRoot.host=this;return this.shadowRoot;}
    set innerHTML(_html){
      this.holder=new Element('div');this.holder.hidden=true;this.launcher=new Element('button');
      this.holder.getBoundingClientRect=()=>{const width=Math.min(400,context.innerWidth-32),height=Math.min(600,context.innerHeight-32),left=Number.parseFloat(this.holder.style.left)||0,top=Number.parseFloat(this.holder.style.top)||0;return {left,top,width,height,right:left+width,bottom:top+height};};
      this.launcher.getBoundingClientRect=()=>{const style=this.host.style,width=48,height=48,left=style.left&&style.left!=='auto'?Number.parseFloat(style.left):context.innerWidth-width-Number.parseFloat(style.right||24),top=style.top&&style.top!=='auto'?Number.parseFloat(style.top):context.innerHeight-height-Number.parseFloat(style.bottom||24);return {left,top,width,height,right:left+width,bottom:top+height};};
    }
    querySelector(selector){return selector==='.holder'?this.holder:selector==='.launcher'?this.launcher:null;}
    querySelectorAll(){return [];}
    getContext(){return this.context2d??={drawImage(){counts.draws++;},globalAlpha:1};}
    setPointerCapture(id){this.captured.add(id);}
    hasPointerCapture(id){return this.captured.has(id);}
    releasePointerCapture(id){if(this.captured.delete(id))dispatch(this,'lostpointercapture',{pointerId:id});}
    focus(){this.focused=true;}
  }
  const container=options.screen||options.liveWeb?new Element('div'):null;
  container?.setAttribute('data-screen',options.screen);
  if(options.liveWeb){
    container.id='fullscreen-container';container.style.position='fixed';
    container.getBoundingClientRect=()=>({left:0,top:0,width:980,height:900});
  }
  function createVideo(){
    const video=new Element('video');
    const videoValues={paused:false,ended:false,readyState:4,videoWidth:1920,videoHeight:1080};
    for(const [key,value] of Object.entries(videoValues))Object.defineProperty(video,key,{get(){counts.videoReads++;return value;}});
    video.getBoundingClientRect=()=>{counts.videoReads++;return {left:100,top:100,right:1060,bottom:640,width:960,height:540};};
    video.closest=selector=>selector==='.bpx-player-container'?container:null;
    video.parentElement=container;if(container)container.append(video);
    video.requestVideoFrameCallback=fn=>{const id=++nextId;frames.set(id,fn);return id;};
    video.cancelVideoFrameCallback=id=>{counts.cancelled++;frames.delete(id);};
    return video;
  }
  const video=createVideo();let currentVideo=video;
  const html=new Element('html'),body=new Element('body');
  const comments=[];
  const addComment=()=>{const host=new Element('bili-comment-box');host.attachShadow();comments.push(host);return host;};
  const composers=[];
  const addComposer=({wrapperPosition='static',bodyPosition='static'}={})=>{
    const host=new Element('bili-comments-header-renderer'),shadow=host.attachShadow();
    const wrapper=new Element('div'),body=new Element('div');
    wrapper.style.position=wrapperPosition;body.style.position=bodyPosition;
    body.style.backgroundColor='var(--bg1)';body.style.padding='15px 0px';
    shadow.append(wrapper);wrapper.append(body);
    const composer={host,wrapper,body};
    shadow.querySelectorAll=selector=>selector.startsWith('.bili-comments-bottom-fixed-wrapper')?[composer.wrapper,composer.body]:[];
    comments.push(host);composers.push(composer);return composer;
  };
  if(options.comments)addComment();
  if(options.composer)addComposer(options.composer);
  const document={documentElement:html,body,hidden:false,fullscreenElement:null,
    createElement:tag=>new Element(tag),querySelector(){return null;},addEventListener(type,fn){documentEvents.set(type,fn);},
    querySelectorAll(selector){if(selector==='video'||selector==='#live-player video'){counts.videoQueries++;return [currentVideo];}return comments.filter(host=>host.isConnected);}
  };
  const initialPromise=delayed?new Promise((resolve,reject)=>{resolveInitial=resolve;rejectInitial=reject;}):Promise.resolve(B.sanitize(initial));
  const api={...B,storage:{get:()=>initialPromise,subscribe(fn){onSettings=fn;}},
    mountPanel(_root,configuration){panelCalls.mounted++;panelCalls.close=configuration.onClose;return {setStatus(){},setBarStatus(){},focus(){panelCalls.focused++;}};}};
  const location=new URL(options.url||(live?'https://live.bilibili.com/25034104':'https://www.bilibili.com/video/example'));
  const context=vm.createContext({BiliGlow:api,document,location,
    window:{addEventListener(type,fn){windowEvents.set(type,fn);}},innerWidth:1280,innerHeight:900,
    getComputedStyle:el=>({objectFit:'contain',visibility:'visible',...el.style}),performance:{now:()=>100},console,
    requestAnimationFrame(fn){const id=++nextId;rafs.set(id,fn);return id;},
    setTimeout(fn){const id=++nextId;rafs.set(id,fn);return id;},clearTimeout(id){rafs.delete(id);},
    setInterval(fn){intervals.push(fn);},
    ResizeObserver:class{observe(){}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}},
    BiliGlowVideoBars:{create(boundVideo){counts.barCreates++;return {crop:{top:0,bottom:0,left:0,right:0},configure(settings,mode){barConfigurations.push({video:boundVideo,settings,mode});},layout(){return null;},
      sample(){counts.barSamples++;},reset(){},dispose(){counts.barDisposals++;}};}}
  });
  vm.runInContext(source('player.js'),context);
  vm.runInContext(source('content.js'),context);
  return {counts,html,body,frames,video,container,context,barConfigurations,panelCalls,comments,addComment,composers,addComposer,
    get ui(){return html.children.find(element=>'biliglowUi' in element.dataset);},
    get launcher(){return this.ui.shadowRoot.launcher;},get panelHost(){return this.ui.shadowRoot.holder;},
    pointer(type,values){return dispatch(this.launcher,type,values);},
    windowEvent(type,values){return dispatch(windowEvents,type,values);},
    documentEvent(type,values){return dispatch(documentEvents,type,values);},
    resize(width,height){context.innerWidth=width;context.innerHeight=height;dispatch(windowEvents,'resize');},
    async ready(){await initialPromise;await Promise.resolve();},
    change(values){onSettings(B.sanitize(values));},
    resolveInitial(values){resolveInitial(B.sanitize(values));},
    rejectInitial(error){rejectInitial(error);},
    flush(){const pending=[...rafs.values()];rafs.clear();for(const fn of pending)fn(120);},
    frame(now=1000){const [id,fn]=frames.entries().next().value||[];if(fn){frames.delete(id);fn(now);}},
    reconcile(){for(const fn of intervals)fn();},
    navigate(url){location.href=new URL(url,location).href;for(const fn of intervals)fn();},
    replaceVideo(){currentVideo.isConnected=false;currentVideo=createVideo();return currentVideo;}
  };
}

test('content script never queries a player until consent, and revocation stops queued work immediately',async()=>{
  const h=contentHarness({enabled:true,spread:310});
  await h.ready();h.flush();h.reconcile();
  assert.equal(h.counts.videoQueries,0);assert.equal(h.counts.videoReads,0);assert.equal(h.counts.draws,0);
  assert.equal(h.html.hasAttribute('data-biliglow-active'),false);
  assert.equal(h.html.hasAttribute('data-biliglow-dark'),false);
  h.change({privacyAccepted:true,enabled:true,spread:310});h.flush();
  assert.ok(h.counts.videoQueries>0);assert.ok(h.counts.draws>0);assert.ok(h.counts.barSamples>0);
  assert.equal(h.html.hasAttribute('data-biliglow-active'),true);
  assert.equal(h.html.hasAttribute('data-biliglow-dark'),true);
  assert.equal(h.frames.size,1);
  const lateFrame=[...h.frames.values()][0];
  h.change({privacyAccepted:false,enabled:true,spread:310});
  assert.equal(h.frames.size,0,'revoke cancels without waiting for the 1-second reconcile timer');
  assert.equal(h.video.events.size,0,'old player listeners are detached');
  assert.equal(h.counts.barDisposals,1);assert.ok(h.counts.cancelled>0);
  assert.equal(h.html.hasAttribute('data-biliglow-active'),false);
  assert.equal(h.html.hasAttribute('data-biliglow-dark'),false);
  const stopped={...h.counts};
  lateFrame(1000);h.flush();h.reconcile();
  assert.equal(h.counts.draws,stopped.draws);assert.equal(h.counts.barSamples,stopped.barSamples);
  assert.equal(h.counts.videoQueries,stopped.videoQueries);assert.equal(h.counts.videoReads,stopped.videoReads);
});

test('a stale startup storage result cannot restore consent after a newer revocation',async()=>{
  const h=contentHarness({},true);
  h.change({privacyAccepted:false,enabled:true});
  h.resolveInitial({privacyAccepted:true,enabled:true});await h.ready();h.flush();h.reconcile();
  assert.equal(h.counts.videoQueries,0);assert.equal(h.counts.draws,0);
  assert.equal(h.html.hasAttribute('data-biliglow-active'),false);
});


test('live room honors consent, never creates crop analysis, and revokes immediately',async()=>{
  const h=contentHarness({enabled:true},false,true);await h.ready();h.flush();h.reconcile();
  assert.equal(h.counts.videoQueries,0);assert.equal(h.counts.videoReads,0);
  h.change({privacyAccepted:true,enabled:true,removeHorizontalBars:true,removeVerticalBars:true});h.flush();
  assert.ok(h.counts.draws>0);assert.equal(h.counts.barSamples,0);
  assert.equal(h.html.hasAttribute('data-biliglow-live'),true);
  h.change({privacyAccepted:false,enabled:true});h.flush();
  assert.equal(h.frames.size,0);assert.equal(h.html.hasAttribute('data-biliglow-active'),false);
  assert.equal(h.html.hasAttribute('data-biliglow-live'),false);
});

test('blanc rooms share live consent, light toggles and SPA/player replacement lifecycle',async()=>{
  const url='https://live.bilibili.com/blanc/25034104/?broadcast_type=0#chat';
  const settings={enabled:true,removeHorizontalBars:true,removeVerticalBars:true};
  const h=contentHarness(settings,false,true,{url});await h.ready();h.flush();
  assert.equal(h.counts.videoQueries,0);assert.equal(h.counts.draws,0);
  h.change({...settings,privacyAccepted:true});h.flush();
  assert.equal(h.html.hasAttribute('data-biliglow-live'),true);
  assert.ok(h.counts.draws>0);assert.equal(h.counts.barCreates,0,'blanc must not use the VOD crop engine');
  h.navigate('/25034104');h.flush();
  h.navigate('/blanc/25034104');h.flush();
  assert.equal(h.html.hasAttribute('data-biliglow-live'),true);assert.equal(h.frames.size,1);
  const replacement=h.replaceVideo(),draws=h.counts.draws;h.reconcile();h.flush();
  assert.equal(h.video.events.size,0);assert.ok(replacement.events.size>0);assert.ok(h.counts.draws>draws);
  h.change({...settings,privacyAccepted:true,enabled:false});h.flush();
  assert.equal(h.html.hasAttribute('data-biliglow-active'),false);assert.equal(h.frames.size,0);
  h.change({...settings,privacyAccepted:true});h.flush();
  assert.equal(h.html.hasAttribute('data-biliglow-live'),true);
  h.navigate('/blanc/25034104/extra');h.flush();
  assert.equal(h.html.hasAttribute('data-biliglow-live'),false);assert.equal(h.frames.size,0);
  h.navigate(url);h.flush();assert.equal(h.html.hasAttribute('data-biliglow-live'),true);
  h.change({...settings,privacyAccepted:false});h.flush();
  assert.equal(h.html.hasAttribute('data-biliglow-active'),false);assert.equal(h.frames.size,0);
  assert.equal(h.counts.barCreates,0);
});

test('live web backdrop follows consent, mode exit, replacement and navigation without accumulating layers',async()=>{
  const settings={privacyAccepted:true,enabled:true};
  const h=contentHarness({enabled:true},false,true,{liveWeb:true});await h.ready();h.flush();
  const backdrops=()=>h.container.children.filter(el=>'biliglowBackdrop' in el.dataset);
  assert.equal(backdrops().length,0,'no backdrop before consent');
  h.change(settings);h.flush();
  assert.equal(backdrops().length,1);assert.equal(h.container.hasAttribute('data-biliglow-stage'),true);
  const backdrop=backdrops()[0];
  assert.equal(backdrop.getAttribute('aria-hidden'),'true');assert.match(backdrop.style.pointerEvents,/none/);
  const glow=h.container.children.find(el=>'biliglowRoot' in el.dataset);
  assert.equal(glow.dataset.mode,'fullscreen');assert.ok(h.counts.draws>0);
  h.reconcile();h.flush();h.replaceVideo();h.reconcile();h.flush();
  assert.equal(backdrops().length,1);assert.equal(backdrops()[0],backdrop);
  h.change({...settings,enabled:false});h.flush();
  assert.equal(backdrops().length,0);assert.equal(h.container.hasAttribute('data-biliglow-stage'),false);
  h.change(settings);h.flush();assert.equal(backdrops().length,1);
  h.container.style.position='absolute';h.reconcile();h.flush();
  assert.equal(backdrops().length,0);assert.equal(glow.parentNode,h.body);
  h.container.style.position='fixed';h.reconcile();h.flush();assert.equal(backdrops().length,1);
  h.navigate('/p/eden/area-tags');h.flush();assert.equal(backdrops().length,0);
  h.navigate('/blanc/25034104');h.flush();assert.equal(backdrops().length,1);
  h.change({...settings,privacyAccepted:false});h.flush();assert.equal(backdrops().length,0);
});

test('live backdrop is removed immediately if sampling fails',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true},false,true,{liveWeb:true});await h.ready();h.flush();
  assert.ok(h.container.children.some(el=>'biliglowBackdrop' in el.dataset));
  const canvas=h.container.children.find(el=>'biliglowRoot' in el.dataset).shadowRoot.children[0];
  // A source failure is handled by draw's catch, with no wait for reconcile.
  canvas.getContext().drawImage=()=>{throw new Error('sample unavailable');};
  h.frame(1000);h.flush();
  assert.equal(h.container.children.some(el=>'biliglowBackdrop' in el.dataset),false);
  assert.equal(h.container.hasAttribute('data-biliglow-stage'),false);
});

for(const path of ['/video/BV1example','/bangumi/play/ep123','/list/watchlater/?bvid=BV1example']){
  test(`VOD fullscreen backdrop lifecycle on ${path}`,async()=>{
    const settings={privacyAccepted:true,enabled:true};
    const h=contentHarness({enabled:true},false,false,{url:`https://www.bilibili.com${path}`,screen:'web'});await h.ready();h.flush();
    const backdrops=()=>h.container.children.filter(el=>'biliglowBackdrop' in el.dataset);
    assert.equal(backdrops().length,0,'no backdrop before consent');
    h.change(settings);h.flush();
    assert.equal(backdrops().length,1,'web fullscreen masks the underlying page');
    const backdrop=backdrops()[0],glow=h.container.children.find(el=>'biliglowRoot' in el.dataset);
    assert.equal(glow.dataset.mode,'fullscreen');assert.ok(h.counts.draws>0);
    for(const screen of ['wide','normal']){
      h.container.setAttribute('data-screen',screen);h.reconcile();h.flush();
      assert.equal(backdrops().length,0,'ordinary/wide pages still transmit light');assert.equal(glow.parentNode,h.body);
    }
    h.container.setAttribute('data-screen','web');h.reconcile();h.flush();
    h.change({...settings,dark:false,strength:0});h.flush();
    assert.equal(backdrops()[0],backdrop,'base is independent of light strength and page theme');
    h.replaceVideo();h.reconcile();h.flush();assert.equal(backdrops().length,1);
    h.change({...settings,enabled:false});h.flush();assert.equal(backdrops().length,0);
    h.change(settings);h.flush();assert.equal(backdrops().length,1);
    h.navigate('/');h.flush();assert.equal(backdrops().length,0);
    h.navigate(path);h.flush();assert.equal(backdrops().length,1);
    h.change({...settings,privacyAccepted:false});h.flush();assert.equal(backdrops().length,0);
  });
}

test('VOD native fullscreen moves the same backdrop; failed sampling keeps web background opaque',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true},false,false,{screen:'web'});await h.ready();h.flush();
  const doc=h.context.document,native=doc.createElement('div');
  native.parentElement=h.container;h.container.append(native);native.append(h.video);h.video.parentElement=native;
  const backdrop=h.container.children.find(el=>'biliglowBackdrop' in el.dataset);
  assert.ok(backdrop);
  doc.fullscreenElement=native;h.documentEvent('fullscreenchange');h.flush();assert.equal(backdrop.parentNode,native);
  doc.fullscreenElement=null;h.documentEvent('fullscreenchange');h.flush();assert.equal(backdrop.parentNode,h.container);
  const glow=h.container.children.find(el=>'biliglowRoot' in el.dataset);
  glow.shadowRoot.children[0].getContext().drawImage=()=>{throw new Error('sample unavailable');};
  h.frame(1000);h.flush();
  assert.equal(glow.style.display,'none');assert.equal(backdrop.parentNode,h.container,'even unavailable light must not expose page text');
  h.container.setAttribute('data-screen','normal');h.reconcile();h.flush();assert.equal(backdrop.parentNode,null);
});

test('switching live web/native fullscreen moves one backdrop and direct video fullscreen releases it',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true},false,true,{liveWeb:true});await h.ready();h.flush();
  const doc=h.context.document,native=doc.createElement('div');
  native.parentElement=h.container;h.container.append(native);native.append(h.video);h.video.parentElement=native;
  const backdrop=h.container.children.find(el=>'biliglowBackdrop' in el.dataset);
  doc.fullscreenElement=native;h.documentEvent('fullscreenchange');h.flush();
  assert.equal(backdrop.parentNode,native);assert.equal(h.container.hasAttribute('data-biliglow-stage'),false);
  assert.equal(native.hasAttribute('data-biliglow-stage'),true);
  doc.fullscreenElement=null;h.documentEvent('fullscreenchange');h.flush();
  assert.equal(backdrop.parentNode,h.container);assert.equal(native.hasAttribute('data-biliglow-stage'),false);
  doc.fullscreenElement=h.video;h.documentEvent('fullscreenchange');h.flush();
  assert.equal(backdrop.parentNode,null);assert.equal(h.html.hasAttribute('data-biliglow-active'),false);
  doc.fullscreenElement=null;h.documentEvent('fullscreenchange');h.flush();
  assert.equal(backdrop.parentNode,h.container);assert.equal(h.html.hasAttribute('data-biliglow-active'),true);
});

test('watch-later playback keeps consent gating and reuses the video-wide crop engine',async()=>{
  const url='https://www.bilibili.com/list/watchlater/?bvid=BV1example&oid=123456&t=42#reply123';
  const settings={enabled:true,spread:310,removeHorizontalBars:true,removeVerticalBars:true};
  const h=contentHarness(settings,false,false,{url,screen:'wide'});
  await h.ready();h.flush();h.reconcile();
  assert.equal(h.counts.videoQueries,0);assert.equal(h.counts.videoReads,0);
  assert.equal(h.counts.draws,0);assert.equal(h.counts.barCreates,0,'watch-later must not create crop analysis before consent');
  h.change({...settings,privacyAccepted:true});h.flush();
  assert.ok(h.counts.draws>0);assert.equal(h.counts.barCreates,1);assert.ok(h.counts.barSamples>0);
  assert.equal(h.html.hasAttribute('data-biliglow-active'),true);
  assert.equal(h.html.hasAttribute('data-biliglow-dark'),true);
  assert.equal(h.html.hasAttribute('data-biliglow-live'),false,'watch-later uses ordinary video styling');
  const configuration=h.barConfigurations.at(-1);
  assert.equal(configuration.video,h.video);assert.equal(configuration.mode,'theater');
  assert.equal(configuration.settings.enabled,true);
  assert.equal(configuration.settings.removeHorizontalBars,true);assert.equal(configuration.settings.removeVerticalBars,true);
  assert.equal(h.frames.size,1);
  const lateFrame=[...h.frames.values()][0];
  h.change({...settings,privacyAccepted:false});
  assert.equal(h.frames.size,0);assert.equal(h.video.events.size,0);assert.equal(h.counts.barDisposals,1);
  assert.equal(h.html.hasAttribute('data-biliglow-active'),false);assert.equal(h.html.hasAttribute('data-biliglow-dark'),false);
  const stopped={...h.counts};lateFrame(1000);h.flush();h.reconcile();
  assert.deepEqual(h.counts,stopped,'queued work cannot read or sample the watch-later player after revocation');
});

test('watch-later SPA exit/return and video replacement dispose and rebind the normal video engine',async()=>{
  const settings={privacyAccepted:true,enabled:true,removeHorizontalBars:true};
  const h=contentHarness(settings,false,false,{url:'https://www.bilibili.com/list/watchlater?bvid=BV1first',screen:'wide'});
  await h.ready();h.flush();
  assert.equal(h.counts.barCreates,1);assert.equal(h.frames.size,1);
  const staleFrame=[...h.frames.values()][0];
  h.navigate('/list/?bvid=BV1first');h.flush();
  assert.equal(h.frames.size,0);assert.equal(h.video.events.size,0);assert.equal(h.counts.barDisposals,1);
  assert.equal(h.html.hasAttribute('data-biliglow-active'),false);assert.equal(h.html.hasAttribute('data-biliglow-dark'),false);
  const stopped={...h.counts};staleFrame(1000);h.reconcile();h.flush();
  assert.deepEqual(h.counts,stopped,'unsupported list page must not query, sample or draw');
  h.navigate('/list/watchlater/?oid=456&t=12#reply456');h.flush();
  assert.equal(h.counts.barCreates,2);assert.ok(h.counts.draws>stopped.draws);assert.equal(h.frames.size,1);
  const previousDraws=h.counts.draws,next=h.replaceVideo();h.reconcile();h.flush();
  assert.equal(h.video.events.size,0);assert.ok(next.events.size>0);
  assert.equal(h.counts.barDisposals,2);assert.equal(h.counts.barCreates,3);assert.ok(h.counts.draws>previousDraws);
  assert.equal(h.frames.size,1,'replacing a playlist video must leave exactly one render callback');
  assert.equal(h.barConfigurations.at(-1).video,next);assert.equal(h.barConfigurations.at(-1).mode,'theater');
  const created=h.counts.barCreates;
  h.navigate('/list/watchlater?bvid=BV1second&t=30#t=30');h.flush();
  assert.equal(h.counts.barCreates,created,'query/hash-only navigation must retain the bound video');
  assert.equal(h.html.hasAttribute('data-biliglow-live'),false);assert.equal(h.html.hasAttribute('data-biliglow-active'),true);
  h.change({...settings,privacyAccepted:false});h.flush();
  assert.equal(h.frames.size,0);assert.equal(next.events.size,0);assert.equal(h.counts.barDisposals,3);
});

function dragLauncher(h,dx,dy,{id=1,end=true}={}){
  const r=h.launcher.getBoundingClientRect(),start={pointerId:id,clientX:r.left+24,clientY:r.top+24};
  h.pointer('pointerdown',start);
  const move=h.pointer('pointermove',{...start,clientX:start.clientX+dx,clientY:start.clientY+dy});
  if(end)h.pointer('pointerup',{pointerId:id});
  return move;
}

test('launcher ignores non-primary pointers and keeps sub-threshold movement as a click',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true});await h.ready();h.flush();
  const before=h.launcher.getBoundingClientRect();
  h.pointer('pointerdown',{button:2,pointerId:7});h.pointer('pointermove',{pointerId:7,clientX:-1000});
  h.pointer('pointerdown',{isPrimary:false,pointerId:8});h.pointer('pointermove',{pointerId:8,clientX:-1000});
  assert.equal(h.launcher.captured.size,0);assert.deepEqual(h.launcher.getBoundingClientRect(),before);
  const move=dragLauncher(h,3,3);
  assert.equal(move.defaultPrevented,false);assert.deepEqual(h.launcher.getBoundingClientRect(),before);
  assert.equal(h.launcher.hasAttribute('data-dragging'),false);
  const click=h.pointer('click');
  assert.equal(click.defaultPrevented,false);assert.equal(h.panelHost.hidden,false);
  assert.equal(h.launcher.getAttribute('aria-expanded'),'true');assert.equal(h.panelCalls.mounted,1);
});

test('launcher drag threshold suppresses only the drag click and preserves keyboard activation',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true});await h.ready();h.flush();
  const before=h.launcher.getBoundingClientRect(),move=dragLauncher(h,-3,-4);
  assert.equal(move.defaultPrevented,true,'a five-pixel movement starts dragging');
  assert.equal(h.launcher.getBoundingClientRect().left,before.left-3);
  assert.equal(h.launcher.getBoundingClientRect().top,before.top-4);
  assert.equal(h.launcher.captured.size,0);assert.equal(h.launcher.hasAttribute('data-dragging'),false);
  const click=h.pointer('click');
  assert.equal(click.defaultPrevented,true);assert.equal(click.propagationStopped,true);assert.equal(h.panelHost.hidden,true);
  h.pointer('click',{detail:0});assert.equal(h.panelHost.hidden,false,'Enter/Space activation still opens the panel');
  dragLauncher(h,-40,-30);
  h.pointer('click',{detail:0});assert.equal(h.panelHost.hidden,true,'keyboard activation is not swallowed even immediately after dragging');
  h.pointer('pointerdown');h.pointer('pointerup');h.pointer('click');
  assert.equal(h.panelHost.hidden,false,'a subsequent ordinary click is not suppressed');
  assert.equal(h.panelCalls.mounted,1,'the settings panel is reused across drags and activations');
});

test('launcher position resets on both light toggles and consent changes but survives preset adjustments',async()=>{
  const active={privacyAccepted:true,enabled:true};
  const h=contentHarness(active);await h.ready();h.flush();
  dragLauncher(h,-260,-180);const moved=h.launcher.getBoundingClientRect();
  h.change({...active,...B.presets.vivid});h.flush();
  assert.deepEqual(h.launcher.getBoundingClientRect(),moved,'changing a preset must not reset the launcher');
  h.change({...active,strength:65,spread:400,smoothing:45,dark:false});h.flush();
  assert.deepEqual(h.launcher.getBoundingClientRect(),moved,'individual light adjustments preserve the position');
  const assertDefault=()=>{
    assert.equal(h.ui.style.left,'auto');assert.equal(h.ui.style.top,'auto');
    assert.equal(h.ui.style.right,'24px');assert.equal(h.ui.style.bottom,'24px');
    const r=h.launcher.getBoundingClientRect();assert.equal(r.right,h.context.innerWidth-24);assert.equal(r.bottom,h.context.innerHeight-24);
  };
  h.change({...active,enabled:false});h.flush();assertDefault();
  dragLauncher(h,-150,-90);assert.notEqual(h.ui.style.left,'auto');
  h.change(active);h.flush();assertDefault();
  dragLauncher(h,-200,-80,{end:false});assert.equal(h.launcher.captured.size,1);
  h.change({privacyAccepted:false,enabled:true});h.flush();assertDefault();
  assert.equal(h.launcher.captured.size,0);assert.equal(h.launcher.hasAttribute('data-dragging'),false);
  dragLauncher(h,-120,-90);h.change(active);h.flush();assertDefault();
});

test('launcher clamps to the viewport and re-clamps after resize without leaving an active drag',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true});await h.ready();h.flush();
  dragLauncher(h,-10000,-10000);let r=h.launcher.getBoundingClientRect();
  assert.equal(r.left,8);assert.equal(r.top,8);
  dragLauncher(h,10000,10000,{end:false});r=h.launcher.getBoundingClientRect();
  assert.equal(r.right,h.context.innerWidth-8);assert.equal(r.bottom,h.context.innerHeight-8);
  assert.equal(h.launcher.captured.size,1);
  h.resize(640,400);h.flush();r=h.launcher.getBoundingClientRect();
  assert.equal(r.right,632);assert.equal(r.bottom,392);assert.equal(h.launcher.captured.size,0);
  assert.equal(h.launcher.hasAttribute('data-dragging'),false);
  h.pointer('pointermove',{clientX:0,clientY:0});assert.deepEqual(h.launcher.getBoundingClientRect(),r,'stale pointer moves after resize are ignored');
  h.html.clientWidth=625;h.resize(640,400);h.flush();
  assert.equal(h.launcher.getBoundingClientRect().right,617,'the vertical scrollbar gutter is excluded from the drag area');
});

test('pointer cancellation, lost capture and window blur terminate launcher dragging',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true});await h.ready();h.flush();
  for(const ending of ['pointercancel','lostpointercapture','blur']){
    dragLauncher(h,-50,-40,{id:3,end:false});
    assert.equal(h.launcher.hasPointerCapture(3),true);assert.equal(h.launcher.hasAttribute('data-dragging'),true);
    const position=h.launcher.getBoundingClientRect();
    h.pointer('pointermove',{pointerId:4,clientX:0,clientY:0});
    h.pointer('pointerup',{pointerId:4});assert.deepEqual(h.launcher.getBoundingClientRect(),position);assert.equal(h.launcher.hasPointerCapture(3),true);
    if(ending==='blur')h.windowEvent('blur');
    else if(ending==='lostpointercapture')h.launcher.releasePointerCapture(3);
    else h.pointer(ending,{pointerId:3});
    assert.equal(h.launcher.captured.size,0,ending);assert.equal(h.launcher.hasAttribute('data-dragging'),false,ending);
    h.pointer('pointermove',{pointerId:3,clientX:1,clientY:1});assert.deepEqual(h.launcher.getBoundingClientRect(),position,ending);
  }
  const nativeDrag=h.pointer('dragstart');assert.equal(nativeDrag.defaultPrevented,true,'the icon cannot trigger the browser image-drag behavior');
});

test('an open launcher panel stays inside the viewport while dragging and resizing',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true});await h.ready();h.flush();
  h.pointer('click',{detail:0});assert.equal(h.panelHost.hidden,false);
  const assertContained=()=>{const p=h.panelHost.getBoundingClientRect();assert.ok(p.left>=8&&p.top>=8);assert.ok(p.right<=h.context.innerWidth-8&&p.bottom<=h.context.innerHeight-8);};
  assertContained();dragLauncher(h,-10000,-10000);assertContained();
  let r=h.launcher.getBoundingClientRect(),p=h.panelHost.getBoundingClientRect();assert.ok(p.top>=r.bottom+12,'a launcher near the top opens its panel below');
  dragLauncher(h,10000,10000);assertContained();h.resize(600,420);h.flush();assertContained();
  assert.equal(h.panelHost.hidden,false,'moving or resizing does not close settings');
  h.ui.events.get('keydown')({key:'Escape',stopPropagation(){}});
  assert.equal(h.panelHost.hidden,true);assert.equal(h.launcher.getAttribute('aria-expanded'),'false');assert.equal(h.launcher.focused,true);
});

const assertLauncherHidden=h=>{
  assert.equal(h.launcher.style.visibility,'hidden');assert.equal(h.launcher.tabIndex,-1);
  assert.equal(h.launcher.getAttribute('aria-hidden'),'true');
};
const assertLauncherVisible=h=>{
  assert.notEqual(h.launcher.style.visibility,'hidden');assert.equal(h.launcher.tabIndex,0);
  assert.notEqual(h.launcher.getAttribute('aria-hidden'),'true');
};

test('launcher stays hidden until initial preferences arrive without flashing saved-hidden state',async()=>{
  const h=contentHarness({},true);assertLauncherHidden(h);
  h.flush();h.reconcile();assertLauncherHidden(h);assert.equal(h.counts.videoQueries,0);
  h.resolveInitial({privacyAccepted:true,enabled:true,hideLauncher:true});await h.ready();h.flush();
  assertLauncherHidden(h);assert.ok(h.counts.draws>0,'saved hidden launcher does not disable the light');
  const old=contentHarness({},true);assertLauncherHidden(old);
  old.resolveInitial({privacyAccepted:true,enabled:true,strength:90});await old.ready();old.flush();
  assertLauncherVisible(old);assert.ok(old.counts.draws>0,'preference-less upgrades regain their normal visible launcher');
});

test('failed initial settings read restores the launcher without bypassing consent',async()=>{
  const h=contentHarness({},true);assertLauncherHidden(h);
  h.rejectInitial(new Error('Storage unavailable'));await new Promise(setImmediate);h.flush();h.reconcile();
  assertLauncherVisible(h);assert.equal(h.counts.videoQueries,0);assert.equal(h.counts.draws,0);
  assert.equal(h.html.hasAttribute('data-biliglow-active'),false);
});

test('hiding the launcher preserves rendering, its position and the open settings panel',async()=>{
  const active={privacyAccepted:true,enabled:true,hideLauncher:false};
  const h=contentHarness(active);await h.ready();h.flush();
  dragLauncher(h,-250,-170);h.pointer('click',{detail:0});assert.equal(h.panelHost.hidden,false);
  const position=h.launcher.getBoundingClientRect(),engine=h.counts.barCreates,disposals=h.counts.barDisposals;
  h.change({...active,hideLauncher:true});h.flush();
  assertLauncherHidden(h);assert.equal(h.ui.style.pointerEvents,'none','hidden launcher must not leave an invisible click-blocking host');
  assert.deepEqual(h.launcher.getBoundingClientRect(),position);assert.equal(h.panelHost.hidden,false);
  assert.equal(h.launcher.getAttribute('aria-expanded'),'true');assert.equal(h.counts.barCreates,engine);assert.equal(h.counts.barDisposals,disposals);
  const draws=h.counts.draws;h.frame(1000);
  assert.ok(h.counts.draws>draws);assert.equal(h.frames.size,1);assert.equal(h.html.hasAttribute('data-biliglow-active'),true);
  h.launcher.focused=false;h.panelCalls.close();
  assert.equal(h.panelHost.hidden,true);assert.equal(h.launcher.getAttribute('aria-expanded'),'false');
  assert.equal(h.launcher.focused,false,'closing settings must not focus an aria-hidden launcher');
  h.change(active);h.flush();assertLauncherVisible(h);assert.deepEqual(h.launcher.getBoundingClientRect(),position);
  h.pointer('pointerdown');h.pointer('pointerup');h.pointer('click');
  assert.equal(h.panelHost.hidden,false);assert.equal(h.panelCalls.mounted,1,'showing the launcher restores access to the same settings panel');
});

test('hiding during a drag releases capture and ignores stale moves without resetting position',async()=>{
  const active={privacyAccepted:true,enabled:true,hideLauncher:false};
  const h=contentHarness(active);await h.ready();h.flush();
  dragLauncher(h,-180,-100,{id:3,end:false});assert.equal(h.launcher.hasPointerCapture(3),true);
  const position=h.launcher.getBoundingClientRect();
  h.change({...active,hideLauncher:true});h.flush();assertLauncherHidden(h);
  assert.equal(h.launcher.captured.size,0);assert.equal(h.launcher.hasAttribute('data-dragging'),false);
  h.pointer('pointermove',{pointerId:3,clientX:0,clientY:0});h.pointer('pointerup',{pointerId:3});
  assert.deepEqual(h.launcher.getBoundingClientRect(),position);
  h.change(active);h.flush();assertLauncherVisible(h);assert.deepEqual(h.launcher.getBoundingClientRect(),position);
  dragLauncher(h,-20,-20);assert.equal(h.launcher.getBoundingClientRect().left,position.left-20,'dragging works again after revealing the button');
});

test('hidden launcher preference remains effective across light off/on and preset changes',async()=>{
  const active={privacyAccepted:true,enabled:true,hideLauncher:true};
  const h=contentHarness(active);await h.ready();h.flush();assertLauncherHidden(h);assert.equal(h.frames.size,1);
  h.change({...active,enabled:false});h.flush();assertLauncherHidden(h);
  assert.equal(h.frames.size,0);assert.equal(h.html.hasAttribute('data-biliglow-active'),false);
  h.change({...active,...B.presets.soft,enabled:false});h.flush();assertLauncherHidden(h);assert.equal(h.frames.size,0);
  h.change({...active,...B.presets.soft});h.flush();assertLauncherHidden(h);assert.equal(h.frames.size,1);
  const draws=h.counts.draws;h.frame(1200);assert.ok(h.counts.draws>draws);
  h.change({...active,hideLauncher:false});h.flush();assertLauncherVisible(h);assert.equal(h.frames.size,1);
});


test('comment surface state follows native fullscreen immediately and never accumulates styles',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true},false,false,{comments:true});await h.ready();
  const host=h.comments[0];
  assert.equal(host.hasAttribute('data-biliglow-comments-active'),true);
  assert.equal(host.shadowRoot.children.length,1);
  h.context.document.fullscreenElement=h.video;h.documentEvent('fullscreenchange');h.flush();
  assert.equal(host.hasAttribute('data-biliglow-comments-active'),false,'video-only native fullscreen restores surfaces before discovery interval');
  h.context.document.fullscreenElement=null;h.documentEvent('fullscreenchange');h.flush();
  assert.equal(host.hasAttribute('data-biliglow-comments-active'),true);
  h.reconcile();h.reconcile();assert.equal(host.shadowRoot.children.length,1);
  h.change({privacyAccepted:false,enabled:true});
  assert.equal(host.hasAttribute('data-biliglow-comments-active'),false);
  assert.equal(host.shadowRoot.children.length,0,'revocation removes owned styles synchronously');
});

test('rebuilt comment hosts are adopted and old hosts lose all extension state',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true},false,false,{comments:true});await h.ready();
  const old=h.comments[0];old.isConnected=false;const next=h.addComment();h.reconcile();
  assert.equal(old.hasAttribute('data-biliglow-comments-active'),false);assert.equal(old.shadowRoot.children.length,0);
  assert.equal(next.hasAttribute('data-biliglow-comments-active'),true);assert.equal(next.shadowRoot.children.length,1);
  h.change({privacyAccepted:true,enabled:false});
  assert.equal(next.hasAttribute('data-biliglow-comments-active'),false);assert.equal(next.shadowRoot.children.length,0);
});

test('comment header styling leaves the native fixed and sticky composer base outside its override scope',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true},false,false,{composer:{wrapperPosition:'fixed'}});await h.ready();
  const {host,wrapper,body}=h.composers[0];
  const nativeWrapper={...wrapper.style},nativeBody={...body.style};
  const style=host.shadowRoot.children.find(child=>child.localName==='style');
  assert.ok(style);
  assert.doesNotMatch(style.textContent,/\.bili-comments-bottom-fixed-wrapper/,'the native full-row base must not be targeted by transparent background overrides');
  assert.deepEqual({...wrapper.style},nativeWrapper);assert.deepEqual({...body.style},nativeBody);
  wrapper.style.position='sticky';h.reconcile();
  assert.equal(wrapper.style.position,'sticky');assert.deepEqual({...body.style},nativeBody);
  h.change({privacyAccepted:true,enabled:true,dark:false});assert.deepEqual({...body.style},nativeBody,'theme is inherited through the native bg1 variable');
  h.change({privacyAccepted:false,enabled:true});
  assert.equal(host.shadowRoot.children.filter(child=>child.localName==='style').length,0);
  assert.equal(host.hasAttribute('data-biliglow-comments-active'),false);
  assert.deepEqual({...body.style},nativeBody,'revocation preserves all native composer declarations');
});

test('native composer base survives header rebuild, position changes and extension disable',async()=>{
  const h=contentHarness({privacyAccepted:true,enabled:true},false,false,{composer:{wrapperPosition:'fixed'}});await h.ready();
  const original=h.composers[0];original.host.isConnected=false;
  const next=h.addComposer({wrapperPosition:'sticky'});h.reconcile();h.reconcile();
  assert.equal(original.host.hasAttribute('data-biliglow-comments-active'),false);
  assert.equal(original.host.shadowRoot.children.filter(child=>child.localName==='style').length,0);
  assert.equal(next.host.shadowRoot.children.filter(child=>child.localName==='style').length,1);
  assert.equal(next.body.style.backgroundColor,'var(--bg1)');assert.equal(next.body.style.padding,'15px 0px');
  next.wrapper.remove();h.reconcile();
  assert.equal(next.wrapper.style.position,'sticky','leaving pinned mode does not overwrite detached native layout');
  h.change({privacyAccepted:true,enabled:false});
  assert.equal(next.host.hasAttribute('data-biliglow-comments-active'),false);
  assert.equal(next.host.shadowRoot.children.filter(child=>child.localName==='style').length,0);
  assert.equal(next.body.style.backgroundColor,'var(--bg1)');
});

const hasGlass=h=>h.html.hasAttribute('data-biliglow-glass-controls');

test('glass controls switch immediately with consent and preference changes, including queued work after revoke',async()=>{
  const active={privacyAccepted:true,enabled:true,glassControls:true};
  const h=contentHarness({enabled:true,glassControls:true},false,false,{screen:'normal'});await h.ready();
  assert.equal(hasGlass(h),false,'saved opt-in cannot bypass consent');
  h.change(active);assert.equal(hasGlass(h),true);
  h.change({...active,glassControls:false});assert.equal(hasGlass(h),false,'no timer or video frame is needed to turn the style off');
  h.change({...active,dark:false});assert.equal(hasGlass(h),true,'glass opt-in is independent of page theme');
  h.change({...active,enabled:false});assert.equal(hasGlass(h),false);
  h.change(active);assert.equal(hasGlass(h),true);
  const lateFrame=[...h.frames.values()][0];
  h.change({...active,privacyAccepted:false});assert.equal(hasGlass(h),false);
  lateFrame?.(1000);h.flush();h.reconcile();assert.equal(hasGlass(h),false,'queued work cannot restore a revoked appearance');
});

test('glass controls follow VOD mode changes, SPA routes and player replacement while excluding direct video fullscreen',async()=>{
  const active={privacyAccepted:true,enabled:true,glassControls:true};
  const h=contentHarness(active,false,false,{screen:'normal'});await h.ready();assert.equal(hasGlass(h),true);
  for(const screen of ['wide','web','normal']){h.container.setAttribute('data-screen',screen);h.reconcile();assert.equal(hasGlass(h),true,screen);}
  h.context.document.fullscreenElement=h.container;h.documentEvent('fullscreenchange');h.flush();assert.equal(hasGlass(h),true,'container fullscreen retains the bpx controls');
  h.context.document.fullscreenElement=h.video;h.documentEvent('fullscreenchange');h.flush();assert.equal(hasGlass(h),false,'direct video fullscreen has no bpx control layer');
  h.context.document.fullscreenElement=null;h.documentEvent('fullscreenchange');h.flush();assert.equal(hasGlass(h),true);
  h.navigate('/');assert.equal(hasGlass(h),false,'SPA exit clears the style');
  h.navigate('/list/watchlater/?bvid=fixture');assert.equal(hasGlass(h),true,'watch-later uses the same VOD player');
  h.replaceVideo();h.reconcile();assert.equal(hasGlass(h),true);
  h.navigate('/bangumi/play/ep123');assert.equal(hasGlass(h),true);
  h.change({...active,enabled:false});assert.equal(hasGlass(h),false);
});

test('glass controls do not activate on live streams or videos without a bpx player',async()=>{
  const active={privacyAccepted:true,enabled:true,glassControls:true};
  const live=contentHarness(active,false,true,{screen:'normal'});await live.ready();assert.equal(hasGlass(live),false);
  live.reconcile();live.flush();assert.equal(hasGlass(live),false);
  const other=contentHarness(active);await other.ready();assert.equal(hasGlass(other),false);
  const ordinary=contentHarness({privacyAccepted:true,enabled:true},false,false,{screen:'normal'});await ordinary.ready();
  assert.equal(hasGlass(ordinary),false,'existing users keep their original control appearance');
});
