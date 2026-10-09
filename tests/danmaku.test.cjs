const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {geometry}=require('../extension/bar-effects.js');

const ownedAttribute='data-biliglow-danmaku-bounds';
const ownedVariables=['left','top','width','height','radius','track-height'].map(name=>`--biliglow-danmaku-${name}`);
const trackProperty='--biliglow-danmaku-track-top';
const source=name=>fs.readFileSync(`${__dirname}/../extension/${name}`,'utf8');
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});

// The actual player puts a static, zero-height danmaku root next to the video
// wrapper. Its row/mask/BAS/cmd children are absolute, so a clip on that old
// zero-height box alone cannot contain them. This fixture keeps those layers
// separate from video transforms, native controls and the sending bar.
function fixture(){
  class Element{
    constructor(className='',nativeStyles={}){
      this.className=className;this.parentElement=null;this.children=[];this.isConnected=true;
      this.attributes=new Map();this.properties=new Map(Object.entries(nativeStyles));this.writes=0;
      this.computedStyles={};
      this.classList={contains:name=>this.className.split(/\s+/).includes(name),
        add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/),...names])].join(' ');},
        remove:(...names)=>{this.className=this.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');}};
      const cssName=name=>name.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`);
      this.style=new Proxy({
        setProperty:(name,value)=>{this.writes++;this.properties.set(name,String(value));},
        removeProperty:name=>{this.writes++;const value=this.properties.get(name)||'';this.properties.delete(name);return value;},
        getPropertyValue:name=>this.properties.get(name)||''
      },{
        get:(methods,name)=>name in methods?methods[name]:this.properties.get(cssName(name))||'',
        set:(_methods,name,value)=>{this.writes++;this.properties.set(cssName(name),String(value));return true;}
      });
      this.box=rect(100,50,960,540);this.offsetWidth=960;this.offsetHeight=540;
    }
    append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}
    hasAttribute(name){return this.attributes.has(name);}
    getAttribute(name){return this.attributes.get(name)??null;}
    setAttribute(name,value=''){this.writes++;this.attributes.set(name,String(value));}
    removeAttribute(name){this.attributes.delete(name);}
    toggleAttribute(name,on){if(on)this.setAttribute(name);else this.removeAttribute(name);}
    matches(selector){
      return selector.split(',').some(part=>{
        const direct=part.trim().split(/\s*>\s*/);
        if(direct.length===2)return this.parentElement?.matches(direct[0])&&this.matches(direct[1]);
        const names=[...part.matchAll(/\.([\w-]+)/g)].map(match=>match[1]);
        return names.length>0&&names.every(name=>this.classList.contains(name));
      });
    }
    closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
    querySelectorAll(selector){
      const descendants=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);
      return selector==='*'?descendants:descendants.filter(node=>node.matches(selector));
    }
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    getBoundingClientRect(){return {...this.box};}
  }
  const nativeRootStyles={position:'static',height:'0px',transform:'translateZ(0)','clip-path':'inset(1px)','--site-dm-token':'keep'};
  const makeRoot=()=>{
    const root=new Element('bpx-player-render-dm-wrap',nativeRootStyles);
    root.offsetHeight=0;root.box=rect(100,50,960,0);
    for(const name of ['bpx-player-dm-mask','bpx-player-row-dm-wrap','bpx-player-bas-dm-wrap','bpx-player-cmd-dm-wrap'])
      root.append(new Element(name,{position:'absolute',inset:'0px',transform:'translateX(123px)'}));
    return root;
  };
  const container=new Element('bpx-player-container');container.setAttribute('data-screen','normal');
  const area=new Element('bpx-player-video-area');container.append(area);
  const wrap=new Element('bpx-player-video-wrap');area.append(wrap);
  const video=new Element('',{'clip-path':'none',transform:'none'});video.videoWidth=1080;video.videoHeight=1080;wrap.append(video);
  const root=makeRoot();area.append(root);
  const makeTrack=(type,top,height=28.125,{show=true,parent=root.querySelector('.bpx-player-row-dm-wrap')}={})=>{
    const position=type==='roll'?'--top':'--translateY';
    const node=new Element(`bili-danmaku-x-dm bili-danmaku-x-${type}${show?' bili-danmaku-x-show':''}`,{
      [position]:`${top}px`,transform:type==='roll'?'translateX(-125px)':'translate(-50%, var(--translateY))',
      animation:type==='roll'?'roll 6s linear forwards':'none','--fontSize':'25px','--fontFamily':'Arial','--site-track-token':'keep'});
    node.computedStyles={lineHeight:`${height}px`,fontSize:'25px'};
    Object.defineProperty(node,'textContent',{get(){throw new Error('track adapter must not inspect comment text');}});
    parent?.append(node);return node;
  };
  const controls=new Element('bpx-player-control-wrap',{position:'absolute',bottom:'0px'});area.append(controls);
  const sending=new Element('bpx-player-sending-area',{height:'56px'});container.append(sending);
  const document={body:new Element(),createElement:()=>new Element()};
  const observers=[];
  class MutationObserver{
    constructor(callback){this.callback=callback;this.targets=new Map();this.disconnects=0;observers.push(this);}
    observe(node,options){this.targets.set(node,options);}
    disconnect(){this.targets.clear();this.disconnects++;}
    deliver(records=[]){if(this.targets.size)this.callback(records,this);}
  }
  const context=vm.createContext({document,innerWidth:1280,innerHeight:800,
    MutationObserver,
    getComputedStyle:node=>({objectFit:'contain',objectPosition:'50% 50%',position:'static',
      ...Object.fromEntries([...node.properties].map(([name,value])=>[name.replace(/-([a-z])/g,(_match,letter)=>letter.toUpperCase()),value])),
      ...node.computedStyles})});
  vm.runInContext(source('shared.js'),context);vm.runInContext(source('player.js'),context);
  assert.equal(typeof context.BiliGlowPlayer.createDanmakuBounds,'function','production danmaku bounds API is exported');
  const effect=context.BiliGlowPlayer.createDanmakuBounds();
  const settings={enabled:true,roundedCorners:true};
  return {context,effect,settings,container,area,wrap,video,root,controls,sending,makeRoot,makeTrack,observers,
    mutations(records=[]){for(const observer of observers)observer.deliver(records);},
    picture(){return context.BiliGlow.contentRect(video.getBoundingClientRect(),video.videoWidth,video.videoHeight,'contain');},
    update({nextVideo=video,nextSettings=settings,kind='video',mode='normal',picture=this.picture()}={}){
      return effect.update(nextVideo,nextSettings,kind,mode,picture);
    },
    box(left,top,width,height,localWidth=width,localHeight=height){
      area.box=rect(left,top,width,height);area.offsetWidth=localWidth;area.offsetHeight=localHeight;
      video.box={...area.box};wrap.box={...area.box};
    }
  };
}

function assertBounds(node,{left,top,width,height,radius,trackHeight=height},message=''){
  assert.equal(node.hasAttribute(ownedAttribute),true,`${message}: bounds owned`);
  for(const [name,value] of Object.entries({left,top,width,height,radius,'track-height':trackHeight})){
    const text=node.style.getPropertyValue(`--biliglow-danmaku-${name}`);
    assert.match(text,/^-?(?:\d+(?:\.\d*)?|\.\d+)px$/,`${message}: ${name} uses CSS pixels`);
    assert.ok(Math.abs(parseFloat(text)-value)<1e-7,`${message}: ${name}: ${text} vs ${value}px`);
  }
}
function assertCleared(node){
  assert.equal(node.hasAttribute(ownedAttribute),false);
  for(const name of ownedVariables)assert.equal(node.style.getPropertyValue(name),'',name);
  assert.equal(node.style.getPropertyValue('position'),'static','native zero-height root position survives');
  assert.equal(node.style.getPropertyValue('height'),'0px','native zero-height root height survives');
  assert.equal(node.style.getPropertyValue('transform'),'translateZ(0)');
  assert.equal(node.style.getPropertyValue('clip-path'),'inset(1px)');
  assert.equal(node.style.getPropertyValue('--site-dm-token'),'keep');
}

function fitTracks(tracks,height,gap){
  const fit=fixture().context.BiliGlowPlayer.fitDanmakuTracks;
  assert.equal(typeof fit,'function','production pure track fitter is exported');
  return [...fit(tracks,height,gap)];
}
function nativeTrackStyles(node){return [...node.properties].filter(([name])=>name!==trackProperty);}
function assertTrack(node,top){
  const value=node.style.getPropertyValue(trackProperty);assert.match(value,/px$/);
  assert.ok(Math.abs(parseFloat(value)-top)<1e-7,`complete track top: ${value} vs ${top}px`);
}

test('track fitter preserves safe native positions, input order and immutable input data',()=>{
  const tracks=Object.freeze([{top:200,height:28.125,type:'center'},{top:12,height:28.125,type:'roll'},
    {top:12,height:28.125,type:'center'},{top:100,height:28.125,type:'roll'}].map(Object.freeze));
  assert.deepEqual(fitTracks(tracks,540,12),[200,12,12,100]);
  assert.deepEqual(fitTracks([],540,12),[]);
});

test('two cached bottom tracks move fully inside without collapsing their separation',()=>{
  const positions=fitTracks([{top:647.75,height:28.125,type:'center'},{top:676.875,height:28.125,type:'center'}],701,12);
  assert.deepEqual(positions,[631.75,660.875]);
  assert.equal(positions[1]-positions[0],29.125,'28.125px full line plus 1px inter-track space');
  assert.equal(positions[1]+28.125,689,'last full line ends before the 12px lower inset');
});

test('top tracks with different line heights retain their complete line boxes',()=>{
  assert.deepEqual(fitTracks([{top:4,height:28.125,type:'roll'},{top:34,height:40,type:'roll'}],150,12),[12,41.125]);
  assert.deepEqual(fitTracks([{top:140,height:40,type:'roll'},{top:200,height:28.125,type:'roll'}],150,12),[68.875,109.875]);
});

test('same native track stays together while rolling and fixed tracks remain independent',()=>{
  assert.deepEqual(fitTracks([{top:4,height:20,type:'roll'},{top:4.5,height:30,type:'roll'},
    {top:4,height:25,type:'center'},{top:70,height:20,type:'roll'}],150,12),[12,12,12,70]);
  assert.deepEqual(fitTracks([{top:1,height:20,type:'roll'},{top:0,height:20,type:'roll'}],100,12),[33,12],
    'a full pixel difference starts a distinct track and preserves returned input order');
});

test('physically overfull cached tracks stay complete at the existing font size',()=>{
  const tracks=[{top:0,height:20,type:'roll'},{top:21,height:20,type:'roll'},{top:42,height:20,type:'roll'}];
  const positions=fitTracks(tracks,50,12);assert.deepEqual(positions,[12,12,18]);
  positions.forEach((top,index)=>{assert.ok(top>=12);assert.ok(top+tracks[index].height<=38);});
  assert.equal(tracks[0].height,20,'fitting does not shrink font or line dimensions');
});

test('stage resize and rounded/fullscreen gaps recalculate cached tracks independently',()=>{
  const tracks=[{top:490,height:28.125,type:'center'},{top:520,height:28.125,type:'center'}];
  assert.deepEqual(fitTracks(tracks,540,12),[470.75,499.875]);
  assert.deepEqual(fitTracks(tracks,540,2),[480.75,509.875]);
  assert.deepEqual(fitTracks(tracks,600,12),[490,520]);
});

test('production adapter fits two complete bottom DOM lines without changing native coordinates or text',()=>{
  const h=fixture();h.box(100,172,1267,701);
  const first=h.makeTrack('center',647.75),last=h.makeTrack('center',676.875);
  const before=[nativeTrackStyles(first),nativeTrackStyles(last)];h.update();
  assertTrack(first,631.75);assertTrack(last,660.875);
  assert.equal(parseFloat(last.style.getPropertyValue(trackProperty))-parseFloat(first.style.getPropertyValue(trackProperty)),29.125);
  assert.deepEqual([nativeTrackStyles(first),nativeTrackStyles(last)],before,'native translateY, transform and font remain exact');
  h.effect.clear();assert.equal(first.style.getPropertyValue(trackProperty),'');assert.equal(last.style.getPropertyValue(trackProperty),'');
  assert.deepEqual([nativeTrackStyles(first),nativeTrackStyles(last)],before);
});

test('55px native controls reserve ordinary track height without shrinking picture clipping',()=>{
  const h=fixture(),first=h.makeTrack('center',490),last=h.makeTrack('center',520);
  h.controls.box=rect(100,535,960,55);h.controls.computedStyles={opacity:'0',visibility:'hidden'};
  const controls=[...h.controls.properties],native=[nativeTrackStyles(first),nativeTrackStyles(last)];
  const actual=h.update();
  assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12,trackHeight:485});
  assert.equal(actual.height,540,'the picture root still covers the entire actual image');
  assertTrack(first,415.75);assertTrack(last,444.875);
  assert.equal(50+444.875+28.125,523,'last complete line ends 12px above the native control top=535');
  assert.deepEqual([...h.controls.properties],controls,'native hover controls remain untouched');
  assert.deepEqual([nativeTrackStyles(first),nativeTrackStyles(last)],native);
});

test('missing controls restore full track height and cleanup removes the control-safe variable',()=>{
  const h=fixture(),node=h.makeTrack('center',520);h.controls.box=rect(100,535,960,55);h.update();assertTrack(node,444.875);
  h.controls.remove();h.update();assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12});assertTrack(node,499.875);
  h.area.append(h.controls);h.area.querySelector=undefined;h.update();
  assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12},'optional control lookup unavailable');
  h.effect.clear();assertCleared(h.root);assert.equal(node.style.getPropertyValue(trackProperty),'');
});

test('unrelated or invalid controls do not take away ordinary track space',()=>{
  const h=fixture();
  for(const [label,box] of [
    ['no horizontal intersection',rect(1200,535,120,55)],
    ['upper half',rect(100,100,960,55)],
    ['zero height',rect(100,535,960,0)],
    ['negative width',rect(100,535,-1,55)],
    ['invalid top',rect(100,NaN,960,55)],
    ['below picture',rect(100,620,960,55)]
  ]){
    h.controls.box=box;h.update();assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12},label);
  }
});

test('control-safe height is converted back to local pixels under ancestor scaling',()=>{
  const h=fixture(),node=h.makeTrack('center',520);
  h.box(20,30,1920,1080,960,540);h.area.computedStyles={width:'960px',height:'540px',boxSizing:'border-box'};
  h.controls.box=rect(20,1000,1920,110);h.update();
  assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12,trackHeight:485});assertTrack(node,444.875);
  assert.equal(30+(444.875+28.125)*2,976,'scaled line ends 24 viewport pixels above the controls');
});

test('ordinary, wide and fullscreen all keep complete lines above native playback controls',()=>{
  const h=fixture(),node=h.makeTrack('center',520);h.controls.box=rect(100,535,960,55);
  for(const [mode,radius,top] of [['normal',12,444.875],['theater',12,444.875],['fullscreen',0,454.875]]){
    h.update({mode});assertBounds(h.root,{left:210,top:0,width:540,height:540,radius,trackHeight:485},mode);assertTrack(node,top);
    assert.ok(50+top+28.125<=h.controls.box.top,`${mode}: full line stays above the control band`);
  }
});

test('observer fits newly activated ordinary tracks and preserves native horizontal animation',()=>{
  const h=fixture();h.update();const first=h.makeTrack('roll',4),second=h.makeTrack('roll',34);
  const native=[nativeTrackStyles(first),nativeTrackStyles(second)];h.mutations([{type:'childList',target:first.parentElement}]);
  assertTrack(first,12);assertTrack(second,41.125);
  assert.deepEqual([nativeTrackStyles(first),nativeTrackStyles(second)],native);
  const observer=h.observers[0],options=observer.targets.get(h.root);assert.ok(options);
  assert.equal(options.subtree,true);assert.equal(options.childList,true);assert.equal(options.attributes,true);
  assert.deepEqual([...options.attributeFilter],['class','style'],'observe allocation changes without inspecting comment content');
  second.style.setProperty('--top','200px');h.mutations([{type:'attributes',attributeName:'style',target:second}]);
  assertTrack(second,200);assert.equal(second.style.getPropertyValue('--top'),'200px');
});

test('owned track mutation callbacks settle without repeated style writes',()=>{
  const h=fixture(),node=h.makeTrack('roll',4);h.update();const writes=node.writes,rootWrites=h.root.writes;
  for(let i=0;i<8;i++)h.mutations([{type:'attributes',attributeName:'style',target:node}]);
  assert.equal(node.writes,writes,'the callback caused by our own CSS variable produces no further write');
  assert.equal(h.root.writes,rootWrites);h.update();assert.equal(node.writes,writes);
});

test('inactive cached and nonordinary render layers are left unmodified',()=>{
  const h=fixture(),cached=h.makeTrack('center',520,28.125,{show:false});
  const bas=h.makeTrack('roll',4,28.125,{parent:h.root.querySelector('.bpx-player-bas-dm-wrap')});
  const unknown=h.makeTrack('advanced',4),before=[nativeTrackStyles(cached),nativeTrackStyles(bas),nativeTrackStyles(unknown)];
  h.update();for(const node of [cached,bas,unknown])assert.equal(node.style.getPropertyValue(trackProperty),'');
  assert.deepEqual([nativeTrackStyles(cached),nativeTrackStyles(bas),nativeTrackStyles(unknown)],before);
  cached.classList.add('bili-danmaku-x-show');h.mutations([{type:'attributes',attributeName:'class',target:cached}]);
  assertTrack(cached,499.875);cached.classList.remove('bili-danmaku-x-show');h.mutations([{type:'attributes',attributeName:'class',target:cached}]);
  assert.equal(cached.style.getPropertyValue(trackProperty),'','returning to the native pool clears only our track variable');
});

test('disabled or replaced render roots disconnect track observation and clear all owned node variables',()=>{
  for(const reason of ['disabled','live','clear','replace','missing']){
    const h=fixture(),node=h.makeTrack('roll',4);h.update();const native=nativeTrackStyles(node),observer=h.observers[0];
    assertTrack(node,12);
    if(reason==='clear')h.effect.clear();
    else if(reason==='disabled')h.update({nextSettings:{...h.settings,enabled:false}});
    else if(reason==='live')h.update({kind:'live'});
    else{h.root.remove();if(reason==='replace')h.area.append(h.makeRoot());h.update();}
    assert.equal(node.style.getPropertyValue(trackProperty),'',reason);assertCleared(h.root);
    assert.deepEqual(nativeTrackStyles(node),native);assert.equal(observer.targets.has(h.root),false);
    if(reason!=='replace')assert.equal(observer.targets.size,0);
    observer.callback([{type:'attributes',attributeName:'style',target:node}],observer);
    assert.equal(node.style.getPropertyValue(trackProperty),'','a stale callback cannot reapply old node styling');
  }
});

test('square danmaku is bounded by the actual contained picture, not the full player',()=>{
  const h=fixture();const before=h.root.children.map(node=>[...node.properties]);
  h.update();assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12});
  assert.deepEqual(h.root.children.map(node=>[...node.properties]),before,'native engines/row transforms are preserved');
  assert.equal(h.root.style.getPropertyValue('position'),'static','positioning is applied through owned CSS, not native inline');
  assert.equal(h.root.style.getPropertyValue('height'),'0px');
  assert.equal(h.controls.hasAttribute(ownedAttribute),false);assert.equal(h.sending.hasAttribute(ownedAttribute),false);
});

test('normal, wide and fullscreen follow the image rectangle with fullscreen square corners',()=>{
  const h=fixture();
  for(const [mode,screen,width,height,left,radius] of [
    ['normal','normal',960,540,210,12],
    ['theater','wide',1100,618.75,240.625,12],
    ['fullscreen','web',1780,1000,390,0]
  ]){
    h.container.setAttribute('data-screen',screen);h.box(100,50,width,height);h.update({mode});
    assertBounds(h.root,{left,top:0,width:height,height,radius},mode);
  }
});

test('portrait and 4:3 source switches recalculate the existing root without resizing native engines',()=>{
  const h=fixture();
  for(const [sourceWidth,sourceHeight,left,width] of [[1440,1080,120,720],[540,960,328.125,303.75],[810,1080,277.5,405],[1920,1080,0,960],[1080,1080,210,540]]){
    h.video.videoWidth=sourceWidth;h.video.videoHeight=sourceHeight;h.update();
    assertBounds(h.root,{left,top:0,width,height:540,radius:12},`${sourceWidth}:${sourceHeight}`);
    assert.equal(h.root.offsetHeight,0,'native DOM dimensions are not assigned by JavaScript');
  }
});

test('scrolling both player and image leaves stable local bounds',()=>{
  const h=fixture();h.update();
  for(const scrollY of [200,650,1200,1800,0]){
    h.box(100,50-scrollY,960,540);h.update();
    assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12},`scrollY=${scrollY}`);
  }
});

test('native internal scrollTop keeps the clipped root aligned with the visible picture',()=>{
  const h=fixture();h.box(100,172,1267,710);
  h.area.computedStyles={width:'1267px',height:'710px',boxSizing:'border-box'};
  h.area.scrollTop=9;h.video.box=rect(100,163,1267,710);
  const actual=h.update({picture:h.video.box});
  // The video starts 9px above the area, so its visible intersection is 701px.
  // Absolute top=9 is needed to cancel the area's native internal scroll=9.
  assertBounds(h.root,{left:0,top:9,width:1267,height:701,radius:12});
  assert.equal(actual.top,172);assert.equal(actual.height,701);
  const localTop=parseFloat(h.root.style.getPropertyValue('--biliglow-danmaku-top'));
  assert.equal(h.area.box.top+localTop-h.area.scrollTop,actual.top,'painted root top matches the viewport intersection');
  assert.equal(h.area.scrollTop,9,'the extension preserves native internal scrolling');
  h.area.scrollTop=0;h.video.box=rect(100,172,1267,710);h.update({picture:h.video.box});
  assertBounds(h.root,{left:0,top:0,width:1267,height:710,radius:12});
});

test('internal horizontal and vertical scrolling is added after restoring ancestor scale',()=>{
  const h=fixture();h.box(20,30,1920,1080,960,540);h.area.clientLeft=2;h.area.clientTop=3;
  h.area.computedStyles={width:'960px',height:'540px',boxSizing:'border-box'};
  h.area.scrollLeft=11;h.area.scrollTop=9;
  const actual=h.update({picture:rect(440,100,1080,600)});
  assertBounds(h.root,{left:219,top:41,width:540,height:300,radius:12});
  const left=parseFloat(h.root.style.getPropertyValue('--biliglow-danmaku-left'));
  const top=parseFloat(h.root.style.getPropertyValue('--biliglow-danmaku-top'));
  assert.equal(24+(left-h.area.scrollLeft)*2,actual.left,'border and scroll offsets recover the viewport left');
  assert.equal(36+(top-h.area.scrollTop)*2,actual.top,'scroll offset uses local pixels, not scaled viewport pixels');
  assert.equal(h.area.scrollLeft,11);assert.equal(h.area.scrollTop,9);
});

test('negative RTL scrollLeft is preserved in the owned local coordinates',()=>{
  const h=fixture();h.area.scrollLeft=-17;h.update({picture:rect(310,50,540,540)});
  assertBounds(h.root,{left:193,top:0,width:540,height:540,radius:12});
  assert.equal(h.area.scrollLeft,-17);
  h.effect.clear();assertCleared(h.root);assert.equal(h.area.scrollLeft,-17,'cleanup does not reset native scrolling');
});

test('ordinary rolling and centered line adapters are gated and leave native animation/font CSS alone',()=>{
  const css=source('page.css').replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({
    selector:selector.replace(/\s+/g,' ').trim(),
    declarations:new Map([...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(([,name,value])=>[name,value.trim()]))
  }));
  const rootSelector='html[data-biliglow-active] .bpx-player-render-dm-wrap[data-biliglow-danmaku-bounds]';
  const rootRule=rules.find(rule=>rule.selector===rootSelector);assert.ok(rootRule,'bounds CSS is gated by active state and owned root');
  assert.match(rootRule.declarations.get('--biliglow-danmaku-track-gap')||'',/^max\(\s*2px\s*,\s*var\(--biliglow-danmaku-radius\)\s*\)$/,'round corners reserve radius while straight corners retain shadow padding');
  const adapters=rules.filter(rule=>rule.selector.includes('.bili-danmaku-x-'));
  assert.equal(adapters.length,2,'ordinary rows are the only line adapters; advanced/BAS/cmd layers stay native');
  for(const [kind,position] of [['roll','--top'],['center','--translateY']]){
    const selector=`${rootSelector} .bpx-player-row-dm-wrap > .bili-danmaku-x-${kind}`;
    const rule=adapters.find(rule=>rule.selector===selector);assert.ok(rule,`${kind}: only direct ordinary row children are adapted`);
    assert.deepEqual([...rule.declarations.keys()],['top'],`${kind}: font, native transform, horizontal animation and inline variables stay untouched`);
    const top=rule.declarations.get('top');assert.match(top,/clamp\(/);assert.ok(top.includes(`var(${position}`));
    assert.ok(top.includes(`var(${trackProperty},`),'fitted whole-track coordinates override the fallback clamp');
    assert.ok(top.includes('var(--biliglow-danmaku-track-height)'),'fallback also avoids the native control band');
    assert.ok(!top.includes('var(--biliglow-danmaku-height)'),'ordinary tracks use their safe height while the picture root keeps its full height');
    assert.ok(top.includes('1lh'),'use the real computed line height, not a fixed font estimate');
    assert.ok(top.includes('var(--biliglow-danmaku-track-gap)'));assert.match(top,/!important$/);
    if(kind==='center')assert.match(top,/\)\s*-\s*var\(--translateY\s*,\s*0px\)\)\s*!important$/,'top offset subtracts native translateY instead of overwriting its transform');
  }
});

test('resize remeasures picture dimensions instead of preserving stale offsets',()=>{
  const h=fixture();h.update();h.box(80,90,640,360);h.update();
  assertBounds(h.root,{left:140,top:0,width:360,height:360,radius:12});
  h.box(32,24,1280,720);h.update();assertBounds(h.root,{left:280,top:0,width:720,height:720,radius:12});
});

test('fixed mini player uses its current local picture box, independently of page scrolling',()=>{
  const h=fixture();h.update();h.container.setAttribute('data-screen','mini');
  h.box(1000,570,360,203);h.update();assertBounds(h.root,{left:78.5,top:0,width:203,height:203,radius:12});
  h.box(100,50,960,540);h.container.setAttribute('data-screen','normal');h.update();
  assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12});
});

test('CSS-scaled player coordinates are converted back to local layout pixels',()=>{
  const h=fixture();
  h.box(200,100,1920,1080,960,540);h.update();
  assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12},'uniform scale2');
  h.box(20,30,1920,540,960,540);
  h.update({picture:rect(440,30,1080,540)});
  assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12},'different horizontal/vertical scale');
});

test('fractional wide-player CSS height is not expanded by offsetHeight rounding',()=>{
  const h=fixture();h.video.videoWidth=1920;h.video.videoHeight=1080;
  for(const [mode,width,height,top,pictureHeight] of [
    ['normal',951,535,.03125,534.9375],
    ['theater',1267,712.6875,0,712.6875]
  ]){
    // Chrome reports 713 for the wide player's offsetHeight even though its
    // untransformed computed and viewport height is exactly 712.6875px.
    h.box(100,50,width,height,Math.round(width),Math.round(height));
    h.area.computedStyles={width:`${width}px`,height:`${height}px`,boxSizing:'border-box'};
    const actual=h.update({mode});
    assertBounds(h.root,{left:0,top,width,height:pictureHeight,radius:12},mode);
    assert.equal(actual.height,pictureHeight,'returned visible height remains in viewport pixels');
    assert.ok(parseFloat(h.root.style.getPropertyValue('--biliglow-danmaku-top'))+
      parseFloat(h.root.style.getPropertyValue('--biliglow-danmaku-height'))<=height,
      'root bottom does not exceed the unscaled video area');
  }
});

test('computed fractional CSS border box still restores genuine ancestor scaling',()=>{
  const h=fixture();h.video.videoWidth=1920;h.video.videoHeight=1080;
  h.box(100,50,2534,1425.375,1267,713);
  h.area.computedStyles={width:'1267px',height:'712.6875px',boxSizing:'border-box'};
  h.update();assertBounds(h.root,{left:0,top:0,width:1267,height:712.6875,radius:12},'ancestor scale2');
  h.box(100,50,1900.5,1425.375,1267,713);
  h.update({picture:rect(235,140,450,400)});
  assertBounds(h.root,{left:90,top:45,width:300,height:200,radius:12},'ancestor scaleX1.5 scaleY2');
});

test('computed border-box dimensions already include padding and borders',()=>{
  const h=fixture();h.box(100,50,1920,1080,960,540);h.area.clientLeft=2;h.area.clientTop=3;
  h.area.computedStyles={width:'960px',height:'540px',boxSizing:'border-box',
    paddingLeft:'20px',paddingRight:'24px',paddingTop:'20px',paddingBottom:'30px',
    borderLeftWidth:'2px',borderRightWidth:'4px',borderTopWidth:'3px',borderBottomWidth:'7px'};
  h.update({picture:rect(520,56,1080,1068)});
  assertBounds(h.root,{left:208,top:0,width:540,height:534,radius:12});
});

test('computed content-box dimensions add padding and borders before restoring scale',()=>{
  const h=fixture();h.box(100,50,1920,1080,960,540);h.area.clientLeft=2;h.area.clientTop=3;
  // Local border box: width 910+20+24+2+4=960; height 480+20+30+3+7=540.
  h.area.computedStyles={width:'910px',height:'480px',boxSizing:'content-box',
    paddingLeft:'20px',paddingRight:'24px',paddingTop:'20px',paddingBottom:'30px',
    borderLeftWidth:'2px',borderRightWidth:'4px',borderTopWidth:'3px',borderBottomWidth:'7px'};
  h.update({picture:rect(520,56,1080,1068)});
  assertBounds(h.root,{left:208,top:0,width:540,height:534,radius:12});
});

test('image extending outside the video area is intersected at the player edges',()=>{
  const h=fixture();h.update({picture:rect(70,20,540,590)});
  assertBounds(h.root,{left:0,top:0,width:510,height:540,radius:12});
});

test('an image completely outside the player keeps a zero-size owned root to hide all danmaku',()=>{
  const h=fixture();h.update();h.update({picture:rect(2000,2000,540,540)});
  assert.equal(h.root.hasAttribute(ownedAttribute),true);
  assert.equal(parseFloat(h.root.style.getPropertyValue('--biliglow-danmaku-width')),0);
  assert.equal(parseFloat(h.root.style.getPropertyValue('--biliglow-danmaku-height')),0);
});

test('closing rounded corners keeps image bounds while removing the round radius',()=>{
  const h=fixture();h.update();h.update({nextSettings:{...h.settings,roundedCorners:false}});
  assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:0});
  h.update();assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12});
});

test('square black-bar removal with fill bounds danmaku to the transformed visible picture',()=>{
  const h=fixture();h.box(100,50,1100,618.75);h.video.videoWidth=720;h.video.videoHeight=720;
  const cropped=geometry(h.area.getBoundingClientRect(),720,720,{top:.125,bottom:.125,left:0,right:0},true);
  assert.ok(Math.abs(cropped.rect.width-825)<1e-7,'fixture visible width');
  h.video.style.setProperty('--biliglow-video-clip','inset(77.34375px 240.625px)');
  h.video.style.setProperty('--biliglow-video-transform','translate(-183.333333333333px,-103.125px) scale(1.333333333333)');
  h.video.setAttribute('data-biliglow-bar-crop');
  const native=[...h.video.properties];
  h.update({mode:'theater',picture:cropped.rect});
  assertBounds(h.root,{left:137.5,top:0,width:825,height:618.75,radius:12});
  h.update({mode:'theater',picture:cropped.rect,nextSettings:{...h.settings,roundedCorners:false}});
  assertBounds(h.root,{left:137.5,top:0,width:825,height:618.75,radius:0});
  assert.deepEqual([...h.video.properties],native,'bounds do not replace or clear bar-removal transforms');
  assert.equal(h.video.hasAttribute('data-biliglow-bar-crop'),true);
});

test('Mac recording and asymmetric crop use the supplied visible crop instead of full-source dimensions',()=>{
  const h=fixture();h.box(100,50,1100,711.375);h.video.videoWidth=1670;h.video.videoHeight=1080;
  const cropped=geometry(h.area.getBoundingClientRect(),1670,1080,{top:.125,bottom:.125,left:0,right:0},true);
  h.update({mode:'theater',picture:cropped.rect});
  const visibleHeight=1100*1080/1670*.75;
  assertBounds(h.root,{left:0,top:(711.375-visibleHeight)/2,width:1100,height:visibleHeight,radius:12});
  h.update({mode:'theater',picture:rect(180,105,600,500)});
  assertBounds(h.root,{left:80,top:55,width:600,height:500,radius:12});
});

test('disabled, disconnected and live gates release only extension-owned root styles',()=>{
  for(const reason of ['disabled','disconnected','live']){
    const h=fixture();h.update();
    if(reason==='disconnected')h.video.isConnected=false;
    const result=h.update({nextSettings:{...h.settings,enabled:reason!=='disabled'},kind:reason==='live'?'live':'video'});
    assert.equal(result,null,reason);assertCleared(h.root);
  }
});

test('missing or invalid metadata removes bounds before a new source is ready',()=>{
  for(const [width,height] of [[0,0],[0,1080],[1080,0],[-1,1080],[1080,-1],[NaN,1080],[1080,NaN]]){
    const h=fixture();h.update();h.video.videoWidth=width;h.video.videoHeight=height;
    assert.equal(h.update({picture:rect(310,50,540,540)}),null,`${width}:${height}`);assertCleared(h.root);
    h.video.videoWidth=1080;h.video.videoHeight=1080;h.update();
    assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12});
  }
});

test('explicit clear is idempotent and preserves root and all child native styles',()=>{
  const h=fixture();const children=h.root.children.map(node=>[...node.properties]);h.update();
  h.effect.clear();h.effect.clear();assertCleared(h.root);
  assert.deepEqual(h.root.children.map(node=>[...node.properties]),children);
});

test('video-area replacement cleans old bounds before applying the new player',()=>{
  const old=fixture(),next=fixture();old.update();next.video.videoWidth=1440;next.video.videoHeight=1080;
  old.effect.update(next.video,next.settings,'video','normal',next.picture());
  assertCleared(old.root);assertBounds(next.root,{left:120,top:0,width:720,height:540,radius:12});
  old.effect.clear();assertCleared(next.root);
});

test('danmaku engine replacement in the same area clears the detached root and binds its replacement',()=>{
  const h=fixture();h.update();const next=h.makeRoot();h.root.remove();h.root.isConnected=false;h.area.append(next);
  h.update();assertCleared(h.root);assertBounds(next,{left:210,top:0,width:540,height:540,radius:12});
});

test('missing danmaku root clears stale ownership without affecting controls or sending UI',()=>{
  const h=fixture();h.update();h.root.remove();h.root.isConnected=false;
  assert.equal(h.update(),null);assertCleared(h.root);
  assert.equal(h.controls.style.getPropertyValue('bottom'),'0px');assert.equal(h.sending.style.getPropertyValue('height'),'56px');
  const later=h.makeRoot();h.area.append(later);h.update();assertBounds(later,{left:210,top:0,width:540,height:540,radius:12});
});

test('all simultaneous render roots are bounded and a replaced engine loses only its owned state',()=>{
  const h=fixture(),second=h.makeRoot();h.area.append(second);h.update();
  for(const root of [h.root,second])assertBounds(root,{left:210,top:0,width:540,height:540,radius:12});
  second.remove();second.isConnected=false;h.update();assertCleared(second);
  assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12});
  h.effect.clear();assertCleared(h.root);
});

test('unchanged layout does not repeatedly rewrite root styles or attributes',()=>{
  const h=fixture();h.update();const writes=h.root.writes;
  for(let i=0;i<8;i++)h.update();assert.equal(h.root.writes,writes);
  h.box(100,-600,960,540);h.update();assert.equal(h.root.writes,writes,'scroll only changes viewport coordinates');
});

test('a bordered scaled video area uses its padding-edge containing-block origin',()=>{
  const h=fixture();h.box(100,50,1920,1080,960,540);h.area.clientLeft=2;h.area.clientTop=3;
  h.update({picture:rect(520,56,1080,1068)});
  assertBounds(h.root,{left:208,top:0,width:540,height:534,radius:12});
});

test('invalid picture rectangles clear obsolete bounds instead of generating invalid CSS',()=>{
  for(const picture of [null,rect(310,50,0,540),rect(310,50,540,0),rect(310,50,-10,540),rect(NaN,50,540,540),rect(310,Infinity,540,540)]){
    const h=fixture();h.update();assert.equal(h.update({picture}),null);assertCleared(h.root);
  }
});

test('a collapsed video area clears bounds and can recover after it becomes measurable again',()=>{
  const h=fixture();h.update();h.box(100,50,0,540);
  assert.equal(h.update({picture:rect(310,50,540,540)}),null);assertCleared(h.root);
  h.box(100,50,960,540);h.update();assertBounds(h.root,{left:210,top:0,width:540,height:540,radius:12});
});
