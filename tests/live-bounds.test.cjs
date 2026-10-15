const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=name=>fs.readFileSync(`${__dirname}/../extension/${name}`,'utf8');
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
const names=['left','top','width','height','radius','track-gap'];

function fixture(){
  class Element{
    constructor(id='',className='',native={}){
      this.id=id;this.className=className;this.tagName='DIV';this.parentElement=null;this.children=[];this.isConnected=true;
      this.attrs=new Set();this.properties=new Map(Object.entries(native));this.writes=0;this.dataset={};this.css={};
      this.box=rect(0,0,1428,773);this.offsetWidth=1428;this.offsetHeight=773;this.scrollLeft=0;this.scrollTop=0;
      const cssName=n=>n.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`);
      this.style=new Proxy({
        setProperty:(name,value)=>{this.writes++;this.properties.set(name,String(value));},
        removeProperty:name=>{this.writes++;return this.properties.delete(name);},
        getPropertyValue:name=>this.properties.get(name)||''
      },{get:(methods,name)=>name in methods?methods[name]:this.properties.get(cssName(name))||'',
        set:(_methods,name,value)=>{this.writes++;this.properties.set(cssName(name),String(value));return true;}});
    }
    hasAttribute(name){return this.attrs.has(name);}
    setAttribute(name){this.writes++;this.attrs.add(name);}
    removeAttribute(name){this.attrs.delete(name);}
    toggleAttribute(name,on){if(on)this.setAttribute(name);else this.removeAttribute(name);}
    matches(selector){return selector.split(',').some(s=>{s=s.trim();return s==='*'||(s.startsWith('#')?this.id===s.slice(1):s.startsWith('.')?this.className.split(/\s+/).includes(s.slice(1)):this.tagName.toLowerCase()===s);});}
    closest(selector){for(let e=this;e;e=e.parentElement)if(e.matches(selector))return e;return null;}
    append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(e=>e!==this);this.parentElement=null;}
    contains(node){return node===this||this.children.some(e=>e.contains(node));}
    querySelectorAll(selector){return this.children.flatMap(e=>[...(e.matches(selector)?[e]:[]),...e.querySelectorAll(selector)]);}
    getBoundingClientRect(){return {...this.box};}
  }
  const body=new Element(),stage=new Element('fullscreen-container'),area=new Element('live-player');body.append(stage);stage.append(area);
  stage.box=rect(0,0,1428,853);stage.css={position:'fixed',width:'1428px',height:'853px'};
  area.css={position:'relative',width:'1428px',height:'773px'};
  const video=new Element('','',{'clip-path':'inset(1px)',transform:'none','--site-video-token':'keep'});video.tagName='VIDEO';video.videoWidth=1920;video.videoHeight=1080;
  video.css={width:'1428px',height:'773px'};area.append(video);
  const native={position:'absolute',left:'0px',top:'0px',width:'100%',height:'100%',overflow:'visible','pointer-events':'auto','z-index':'31',transform:'translateZ(0)','clip-path':'inset(2px)','--site-layer-token':'keep'};
  const makeLayer=(id='',cls='')=>{const e=new Element(id,cls,native);Object.defineProperty(e,'textContent',{get(){throw new Error('do not inspect messages');}});return e;};
  const layers=[makeLayer('','web-player-danmaku'),makeLayer('animation-mask-wrapper'),makeLayer('','web-player-inject-wrap')];area.append(...layers);
  const controlNative={display:'none',position:'absolute',left:'0px',bottom:'0px',width:'100%',height:'56px','z-index':'40',overflow:'visible','clip-path':'none','pointer-events':'auto'};
  const makeControls=()=>new Element('web-player-controller-wrap-el','web-player-controller-wrap',controlNative);
  const controls=makeControls(),menu=new Element('','web-player-menu',{overflow:'visible'});area.append(controls);controls.append(menu);
  const otherControls=new Element('','web-player-controller-wrap'),giftbar=new Element('gift-control-vm'),nestedControls=makeControls();area.append(otherControls);stage.append(giftbar);menu.append(nestedControls);
  const nested=makeLayer('','web-player-danmaku');menu.append(nested);
  const shadeNative={display:'none',position:'absolute',bottom:'0px',width:'100%',height:'56px','z-index':'10','background-image':'linear-gradient(transparent, rgba(0, 0, 0, .7))','pointer-events':'none','clip-path':'inset(1px)',transform:'none'};
  const makeShade=()=>{const e=new Element('','web-player-controller-bg web-player-controller-wrap',shadeNative);e.getBoundingClientRect=()=>{throw new Error('a hidden shade has no usable rectangle');};return e;};
  const shade=makeShade(),nestedShade=makeShade();area.append(shade);menu.append(nestedShade);
  const trackContainer=new Element('','danmaku-item-container');layers[0].append(trackContainer);
  const makeTrack=(type,top,height=30.602)=>{
    const node=new Element('','bili-danmaku-x-dm bili-danmaku-x-show bili-danmaku-x-'+type,{[type==='roll'?'--top':'--translateY']:`${top}px`,'--translateX':'-100px','--offset':'500px','--duration':'8s','font-size':'27.202px','line-height':'30.602px',color:'#ff99cc',transform:type==='roll'?'translateX(var(--translateX))':'translate(-50%, var(--translateY))'});
    node.box=rect(200,top,300,height);Object.defineProperty(node,'textContent',{get(){throw new Error('never read a live message');}});return node;
  };
  const makeImage=(top,height)=>{const img=new Element();img.tagName='IMG';img.box=rect(200,top,49,height);return img;};
  const mutationObservers=[],resizeObservers=[];
  class MutationObserver{
    constructor(callback){this.callback=callback;this.targets=new Set();mutationObservers.push(this);}
    observe(target){this.targets.add(target);}
    disconnect(){this.targets.clear();}
  }
  class ResizeObserver{
    constructor(callback){this.callback=callback;this.targets=new Set();resizeObservers.push(this);}
    observe(target){this.targets.add(target);}
    unobserve(target){this.targets.delete(target);}
    disconnect(){this.targets.clear();}
  }
  const sandbox=vm.createContext({document:{body,createElement:()=>new Element()},innerWidth:1728,innerHeight:853,MutationObserver,ResizeObserver,
    getComputedStyle:e=>({objectFit:'contain',objectPosition:'50% 50%',boxSizing:'border-box',borderRadius:'0px',position:'static',
      paddingLeft:'0px',paddingRight:'0px',paddingTop:'0px',paddingBottom:'0px',borderLeftWidth:'0px',borderRightWidth:'0px',borderTopWidth:'0px',borderBottomWidth:'0px',
      ...Object.fromEntries([...e.properties].map(([k,v])=>[k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v])),...e.css})});
  vm.runInContext(source('shared.js'),sandbox);vm.runInContext(source('player.js'),sandbox);
  const P=sandbox.BiliGlowPlayer,settings={enabled:true,roundedCorners:true,frameShadow:30},shadowRoot=new Element(),frame=P.createFrame(shadowRoot),effect=P.createLiveBounds();
  const h={P,sandbox,body,stage,area,video,layers,controls,controlNative,makeControls,otherControls,giftbar,nestedControls,menu,nested,native,makeLayer,shade,shadeNative,makeShade,nestedShade,frame,effect,settings,shadow:shadowRoot.children[0],trackContainer,makeTrack,makeImage,mutationObservers,resizeObservers,
    mutations(records){for(const observer of mutationObservers)if(observer.targets.size)observer.callback(records);},
    resized(){for(const observer of resizeObservers)if(observer.targets.size)observer.callback([]);},
    picture:()=>sandbox.BiliGlow.contentRect(video.getBoundingClientRect(),video.videoWidth,video.videoHeight,'contain'),
    view:()=>P.presentation(video,'live',null),
    update({nextVideo=video,nextSettings=settings,mode='fullscreen',picture=h.picture(),view={native:false}}={}){return effect.update(nextVideo,nextSettings,mode,picture,view);},
    updateFrame({nextVideo=video,nextSettings=settings,mode='fullscreen',view={native:false}}={}){return frame.update(nextVideo,nextSettings,'live',mode,{left:0,top:0},undefined,view);},
    geometry(box,width=box.width,height=box.height){area.box={...box};video.box={...box};for(const e of [area,video]){e.offsetWidth=Math.round(width);e.offsetHeight=Math.round(height);e.css.width=`${width}px`;e.css.height=`${height}px`;}}
  };
  return h;
}
function near(actual,expected,label=''){assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} vs ${expected}`);}
function assertBounds(layer,expected){
  assert.equal(layer.hasAttribute('data-biliglow-live-bounds'),true);
  for(const [key,value] of Object.entries(expected))near(parseFloat(layer.style.getPropertyValue(`--biliglow-live-${key}`)),value,key);
}
function assertNative(layer,native){for(const [name,value] of Object.entries(native))assert.equal(layer.style.getPropertyValue(name),value,name);}
function assertCleared(layer,native){assert.equal(layer.hasAttribute('data-biliglow-live-bounds'),false);for(const name of names)assert.equal(layer.style.getPropertyValue(`--biliglow-live-${name}`),'');assertNative(layer,native);}
function assertShadeCleared(shade,native){assert.equal(shade.hasAttribute('data-biliglow-live-control-shade'),false);for(const name of ['radius','clip'])assert.equal(shade.style.getPropertyValue(`--biliglow-live-shade-${name}`),'');assertNative(shade,native);}
function trackTop(node){assert.equal(node.hasAttribute('data-biliglow-live-track'),true);return parseFloat(node.style.getPropertyValue('--biliglow-live-track-top'));}
function assertTrackCleared(node){assert.equal(node.hasAttribute('data-biliglow-live-track'),false);for(const name of ['top','size'])assert.equal(node.style.getPropertyValue(`--biliglow-live-track-${name}`),'');}
const styleText=node=>[...node.properties].map(([name,value])=>`${name}: ${value}`).join(';');
function assertControlCleared(control,native){assert.equal(control.hasAttribute('data-biliglow-live-control-frame'),false);for(const name of ['left','width','bottom'])assert.equal(control.style.getPropertyValue(`--biliglow-live-control-${name}`),'');assertNative(control,native);}
function controlGeometry(control){
  assert.equal(control.hasAttribute('data-biliglow-live-control-frame'),true);
  return Object.fromEntries(['left','width','bottom'].map(name=>[name,parseFloat(control.style.getPropertyValue(`--biliglow-live-control-${name}`))]));
}
function shadeGeometry(shade,width=controlGeometry(shade).width,height=56){
  assert.equal(shade.hasAttribute('data-biliglow-live-control-shade'),true);
  const radius=shade.style.getPropertyValue('--biliglow-live-shade-radius');
  const values=radius.match(/^0px 0px ([\d.e+-]+)px ([\d.e+-]+)px \/ 0px 0px ([\d.e+-]+)px ([\d.e+-]+)px$/);
  assert.ok(values,radius);const [rx,rx2,ry,ry2]=values.slice(1).map(Number);
  near(rx,rx2);near(ry,ry2);
  assert.equal(shade.style.getPropertyValue('--biliglow-live-shade-clip'),'','the shade must not receive an additional clip path');
  return {left:0,top:0,right:width,bottom:height,rx,ry};
}

test('live webpage mode keeps the fullscreen rendering contract but clips only the actual video picture',()=>{
  const h=fixture(),view=h.view();assert.equal(view.mode,'fullscreen');assert.equal(view.native,false);
  const result=h.updateFrame({view}),picture=h.picture();
  near(picture.left,26.888888888888914);near(picture.width,1374.2222222222222);
  for(const k of ['left','top','width','height'])near(result.rect[k],picture[k]);assert.equal(result.radius,12);
  assert.equal(h.video.hasAttribute('data-biliglow-live-picture-rounded'),true);
  assert.match(h.video.style.getPropertyValue('--biliglow-live-picture-clip'),/^inset\(0px 26\.888[\d.]*px 0px 26\.888[\d.]*px round 12px\)$/);
  assert.equal(h.area.hasAttribute('data-biliglow-rounded'),false,'live controls are not clipped with the entire stage');
  near(parseFloat(h.shadow.style.left),picture.left);near(parseFloat(h.shadow.style.width),picture.width);
  assert.equal(h.shadow.style.borderRadius,'12px');assert.match(h.P.roundedCutout(picture,result,{left:0,top:0},{width:1728,height:853}),/A12 12/);
  assert.equal(h.video.style.getPropertyValue('clip-path'),'inset(1px)','native video clipping is not overwritten inline');
});

test('live normal and webpage text spans the player while decorative overlays follow the picture',()=>{
  for(const [mode,view,radius] of [['normal',{native:false},12],['fullscreen',{native:false},12]]){
    const h=fixture(),picture=h.picture();h.update({mode,view});
    assertBounds(h.layers[0],{left:0,top:0,width:1428,height:773,radius});
    for(const layer of h.layers.slice(1))assertBounds(layer,{left:picture.left,top:0,width:picture.width,height:773,radius});
    assert.equal(h.controls.hasAttribute('data-biliglow-live-bounds'),false);assert.equal(h.menu.hasAttribute('data-biliglow-live-bounds'),false);assert.equal(h.nested.hasAttribute('data-biliglow-live-bounds'),false,'only direct renderer siblings are bounded');
    h.updateFrame({mode,view});assert.equal(h.video.hasAttribute('data-biliglow-live-picture-rounded'),radius===12);
  }
});

test('native live fullscreen bounds only messages while restoring native controls and square picture corners',()=>{
  const h=fixture(),view=h.P.presentation(h.video,'live',h.stage);
  assert.equal(view.native,true);assert.equal(view.mode,'fullscreen');assert.equal(view.stage,h.stage);
  h.update({view});
  for(const layer of h.layers){assertBounds(layer,{width:layer===h.layers[0]?1428:h.picture().width,height:773,radius:0});assertNative(layer,h.native);}
  assertControlCleared(h.controls,h.controlNative);assertControlCleared(h.shade,h.shadeNative);assert.equal(h.controls.writes,0);assert.equal(h.shade.writes,0);
  h.update();h.updateFrame();
  for(const layer of h.layers)assertBounds(layer,{radius:12});
  h.update({view});assert.equal(h.updateFrame({view}),null);
  for(const layer of h.layers)assertBounds(layer,{radius:0});
  assertControlCleared(h.controls,h.controlNative);assertControlCleared(h.shade,h.shadeNative);assertShadeCleared(h.shade,h.shadeNative);
  assert.equal(h.video.hasAttribute('data-biliglow-live-picture-rounded'),false);
  assert.equal(h.video.style.getPropertyValue('--biliglow-live-picture-clip'),'');
  assert.equal(h.video.style.getPropertyValue('clip-path'),'inset(1px)');assert.equal(h.shadow.style.display,'none');
  const replacement=h.makeLayer('animation-mask-wrapper');
  h.layers[1].remove();h.area.append(replacement);
  h.update({view});const writes=h.layers.map(layer=>layer.writes),replacementWrites=replacement.writes;h.update({view});
  assert.deepEqual(h.layers.map(layer=>layer.writes),writes);assert.equal(replacement.writes,replacementWrites);
  assertCleared(h.layers[1],h.native);assertBounds(replacement,{radius:0});
  h.update();h.updateFrame();const picture=h.picture();
  assertBounds(h.layers[0],{left:0,top:0,width:1428,height:773,radius:12});
  for(const layer of [h.layers[2],replacement])assertBounds(layer,{left:picture.left,top:0,width:picture.width,height:773,radius:12});
  assertCleared(h.layers[1],h.native);
  assert.equal(h.video.hasAttribute('data-biliglow-live-picture-rounded'),true);
});

test('live rolling and fixed tracks fit complete lines at both picture edges in all three modes',()=>{
  for(const [mode,view,gap] of [['normal',{native:false},12],['fullscreen',{native:false},12],['fullscreen',{native:true},2]]){
    const h=fixture(),rollTop=h.makeTrack('roll',-100),rollBottom=h.makeTrack('roll',9999),centerTop=h.makeTrack('center',-100),centerBottom=h.makeTrack('center',9999);
    h.trackContainer.append(rollTop,rollBottom,centerTop,centerBottom);const originals=[rollTop,rollBottom,centerTop,centerBottom].map(node=>Object.fromEntries(node.properties));
    h.update({mode,view});
    for(const node of [rollTop,centerTop])near(trackTop(node),gap);
    for(const node of [rollBottom,centerBottom])near(trackTop(node)+30.602,773-gap);
    [rollTop,rollBottom,centerTop,centerBottom].forEach((node,index)=>assertNative(node,originals[index]));
    assertBounds(h.layers[0],{radius:view.native?0:12,'track-gap':gap});
  }
});

test('cached live tracks reflow after resize without collapsing distinct bottom tracks',()=>{
  const h=fixture(),a=h.makeTrack('roll',710),b=h.makeTrack('roll',740),same=h.makeTrack('roll',740);
  h.trackContainer.append(a,b,same);h.update();h.geometry(rect(0,0,640,360));h.update();
  assert.ok(trackTop(b)>=trackTop(a)+30.602+1);near(trackTop(b),trackTop(same));near(trackTop(b)+30.602,348);
  h.update({view:{native:true}});near(trackTop(b)+30.602,358);assertControlCleared(h.controls,h.controlNative);
});

test('image and emoji bounds include overflow above the line box and react to image loading before paint',()=>{
  const h=fixture(),line=h.makeTrack('roll',740),image=h.makeImage(730,49);line.append(image);h.trackContainer.append(line);h.update();
  near(parseFloat(line.style.getPropertyValue('--biliglow-live-track-size')),49);
  near(trackTop(line)-10+49,761);assert.ok(h.resizeObservers[0].targets.has(image));
  image.box=rect(200,720,49,90);h.resized();
  near(parseFloat(line.style.getPropertyValue('--biliglow-live-track-size')),90);near(trackTop(line)-20+90,761);
  image.tagName='SPAN';const oldValue=styleText(image);image.style.setProperty('transform','translateY(-10px)');image.box=rect(200,710,49,90);
  h.mutations([{type:'attributes',attributeName:'style',target:image,oldValue}]);near(trackTop(line)-30+90,761);
  assert.equal(line.style.getPropertyValue('--top'),'740px');
});

test('text and overflowing images on the same live track retain one shared baseline',()=>{
  const h=fixture(),text=h.makeTrack('roll',740),emoji=h.makeTrack('roll',740),tall=h.makeTrack('roll',740);
  emoji.append(h.makeImage(730,49));tall.append(h.makeImage(720,60));h.trackContainer.append(text,emoji,tall);h.update();
  near(trackTop(text),trackTop(emoji));near(trackTop(text),trackTop(tall));
  near(trackTop(tall)-20+60,761);assert.ok(trackTop(tall)-20>=12);
  for(const node of [text,emoji,tall])assert.equal(node.style.getPropertyValue('--top'),'740px');
  const other=h.makeTrack('roll',710);h.trackContainer.append(other);h.update();
  assert.ok(trackTop(other)+30.602+1<=trackTop(tall)-20,'different native tracks stay separated despite upper image overflow');
});

test('arriving and departing live tracks never move an already scrolling message in any mode',()=>{
  for(const [mode,view,gap] of [['normal',{native:false},12],['fullscreen',{native:false},12],['fullscreen',{native:true},2]]){
    const h=fixture(),first=h.makeTrack('roll',680),last=h.makeTrack('roll',740),arriving=h.makeTrack('roll',710);
    h.trackContainer.append(first,last);h.update({mode,view});
    const baseline=[trackTop(first),trackTop(last)],native=[styleText(first),styleText(last)];
    near(baseline[0],680);near(baseline[1],Math.min(740,773-gap-30.602));
    for(let cycle=0;cycle<4;cycle++){
      h.trackContainer.append(arriving);h.mutations([{type:'childList',target:h.trackContainer}]);
      near(trackTop(first),baseline[0],'the old algorithm moved this message to 667.194px');
      near(trackTop(last),baseline[1]);
      assert.ok(trackTop(arriving)>=gap&&trackTop(arriving)+30.602<=773-gap,'the new track is also a complete line');
      h.update({mode,view});h.resized();
      near(trackTop(first),baseline[0],'unchanged layout and ResizeObserver deliveries preserve the allocation');
      near(trackTop(last),baseline[1]);
      arriving.remove();h.mutations([{type:'childList',target:h.trackContainer}]);
      assertTrackCleared(arriving);near(trackTop(first),baseline[0]);near(trackTop(last),baseline[1]);
    }
    assert.deepEqual([styleText(first),styleText(last)],native,'native and owned styles of existing messages remain stable');
  }
});

test('a later tall emoji on the same native track cannot displace existing live text',()=>{
  for(const [mode,view] of [['normal',{native:false}],['fullscreen',{native:false}],['fullscreen',{native:true}]]){
    const h=fixture(),text=h.makeTrack('roll',740),emoji=h.makeTrack('roll',740);
    const image=h.makeImage(720,60);emoji.append(image);h.trackContainer.append(text);h.update({mode,view});
    const baseline=trackTop(text),gap=view.native?2:12;
    h.trackContainer.append(emoji);h.mutations([{type:'childList',target:h.trackContainer}]);
    near(trackTop(text),baseline,'same native track does not make a new emoji rewrite existing text');
    assert.ok(trackTop(emoji)-20>=gap&&trackTop(emoji)-20+60<=773-gap,'the new emoji fits by its own visual bounds');
    image.box=rect(200,710,49,90);h.resized();
    near(trackTop(text),baseline,'loading the other message image only reflows that message');
    assert.ok(trackTop(emoji)-30>=gap&&trackTop(emoji)-30+90<=773-gap);
    emoji.remove();h.mutations([{type:'childList',target:h.trackContainer}]);
    assertTrackCleared(emoji);near(trackTop(text),baseline,'emoji departure cannot move old text back down');
  }
});

test('live cached node reuse clears the old allocation and follows its own native track changes',()=>{
  const h=fixture(),node=h.makeTrack('roll',740),peer=h.makeTrack('roll',680);
  h.trackContainer.append(node,peer);h.update();const peerTop=trackTop(peer);
  node.className=node.className.replace(' bili-danmaku-x-show','');
  h.mutations([{type:'attributes',attributeName:'class',target:node}]);assertTrackCleared(node);near(trackTop(peer),peerTop);
  node.style.setProperty('--top','120px');node.box=rect(200,120,300,30.602);node.className+=' bili-danmaku-x-show';
  h.mutations([{type:'attributes',attributeName:'class',target:node}]);near(trackTop(node),120);near(trackTop(peer),peerTop);
  let oldValue=styleText(node);node.style.setProperty('--top','200px');node.box=rect(200,200,300,30.602);
  h.mutations([{type:'attributes',attributeName:'style',target:node,oldValue}]);near(trackTop(node),200);near(trackTop(peer),peerTop);
  oldValue=styleText(node);node.className=node.className.replace('bili-danmaku-x-roll','bili-danmaku-x-center');node.style.setProperty('--translateY','300px');
  node.box=rect(200,300,300,30.602);h.mutations([{type:'attributes',attributeName:'class',target:node,oldValue}]);
  near(trackTop(node),300);near(trackTop(peer),peerTop);
  node.remove();h.mutations([{type:'childList',target:h.trackContainer}]);assertTrackCleared(node);
  node.style.setProperty('--translateY','90px');node.box=rect(200,90,300,30.602);h.trackContainer.append(node);
  h.mutations([{type:'childList',target:h.trackContainer}]);near(trackTop(node),90);near(trackTop(peer),peerTop);
  h.update({nextSettings:{...h.settings,enabled:false}});assertTrackCleared(node);assertTrackCleared(peer);
  node.style.setProperty('--translateY','260px');node.box=rect(200,260,300,30.602);h.update();near(trackTop(node),260);
});

test('releasing a live message discards its old crowded allocation even when its native top is reused',()=>{
  for(const release of ['hide','remove','disable','clear']){
    const h=fixture(),node=h.makeTrack('roll',710),bottom=h.makeTrack('roll',740);
    h.trackContainer.append(node,bottom);h.update();
    assert.ok(trackTop(node)<710,'both initial tracks fit without overlap near the bottom edge');
    if(release==='hide'){
      node.className=node.className.replace(' bili-danmaku-x-show','');
      h.mutations([{type:'attributes',attributeName:'class',target:node}]);
    }else if(release==='remove'){
      node.remove();h.mutations([{type:'childList',target:h.trackContainer}]);
    }else if(release==='disable')h.update({nextSettings:{...h.settings,enabled:false}});
    else h.effect.clear();
    assertTrackCleared(node);bottom.remove();
    if(release==='hide')node.className+=' bili-danmaku-x-show';
    if(release==='remove')h.trackContainer.append(node);
    h.update();near(trackTop(node),710,release+' recycles the same native position without its stale packed baseline');
    assert.equal(node.style.getPropertyValue('--top'),'710px');
  }
});

test('new and newly visible live tracks are fitted by the mutation observer without waiting for layout',()=>{
  const h=fixture();h.update();const line=h.makeTrack('roll',9999);h.trackContainer.append(line);
  h.mutations([{type:'childList',target:h.trackContainer}]);near(trackTop(line)+30.602,761);
  const oldValue=styleText(line);line.style.setProperty('--top','-80px');h.mutations([{type:'attributes',attributeName:'style',target:line,oldValue}]);near(trackTop(line),12);
  line.className=line.className.replace(' bili-danmaku-x-show','');h.mutations([{type:'attributes',attributeName:'class',target:line}]);assertTrackCleared(line);
  line.className+=' bili-danmaku-x-show';h.mutations([{type:'attributes',attributeName:'class',target:line}]);near(trackTop(line),12);
  const reads=line.getBoundingClientRect;line.getBoundingClientRect=()=>{throw new Error('horizontal animation must not remeasure tracks');};
  const horizontalOld=styleText(line);line.style.setProperty('--translateX','-120px');h.mutations([{type:'attributes',attributeName:'style',target:line,oldValue:horizontalOld}]);line.getBoundingClientRect=reads;
});

test('live track ownership skips rotation helpers and releases removed, replaced and disabled renderers',()=>{
  const h=fixture(),line=h.makeTrack('roll',9999),helper=h.makeTrack('roll',9999);helper.className+=' bili-danmaku-x-dm-rotate';h.trackContainer.append(line,helper);h.update();assertTrackCleared(helper);
  line.remove();h.mutations([{type:'childList',target:h.trackContainer}]);assertTrackCleared(line);assert.equal(h.resizeObservers[0].targets.has(line),false);
  h.trackContainer.append(line);h.mutations([{type:'childList',target:h.trackContainer}]);trackTop(line);
  h.layers[0].remove();h.update();assertTrackCleared(line);assert.equal(h.mutationObservers[0].targets.has(h.layers[0]),false);
  h.area.append(h.layers[0]);h.update();trackTop(line);h.update({nextSettings:{...h.settings,enabled:false}});assertTrackCleared(line);
  assert.equal(h.mutationObservers[0].targets.size,0);assert.equal(h.resizeObservers[0].targets.size,0);
  h.update();h.effect.clear();assertTrackCleared(line);
});

test('live bottom controls align with the picture and only the native shade background is rounded',()=>{
  for(const mode of ['normal','fullscreen']){
    const h=fixture(),picture=h.picture();h.update({mode});const clip=shadeGeometry(h.shade);
    for(const element of [h.controls,h.shade]){
      const geometry=controlGeometry(element);near(geometry.left,picture.left);near(geometry.width,picture.width);near(geometry.bottom,0);
    }
    near(clip.left,0);near(clip.right,picture.width);
    const expectedRadius=10;
    near(clip.top,0);near(clip.bottom,56);near(clip.rx,expectedRadius);near(clip.ry,expectedRadius);
    assertNative(h.shade,h.shadeNative);assertNative(h.controls,h.controlNative);
    for(const e of [h.controls,h.menu,h.nestedShade])assert.equal(e.hasAttribute('data-biliglow-live-control-shade'),false);
    for(const e of [h.menu,h.nestedShade,h.nestedControls,h.otherControls,h.giftbar])assert.equal(e.hasAttribute('data-biliglow-live-control-frame'),false,'only the two direct control roots are aligned');
    h.shade.style.setProperty('display','block');const before=h.shade.style.getPropertyValue('--biliglow-live-shade-radius');h.update({mode});
    assert.equal(h.shade.style.getPropertyValue('--biliglow-live-shade-radius'),before);assert.equal(h.shade.style.getPropertyValue('display'),'block');
    h.update({mode,nextSettings:{...h.settings,roundedCorners:false}});const square=shadeGeometry(h.shade);near(square.rx,0);near(square.ry,0);near(square.left,0);
  }
});

test('all live shade modes cover the physical-pixel fringe at DPR 1, 2 and 3 while video corners remain twelve pixels',()=>{
  for(const devicePixelRatio of [1,2,3]){
    const h=fixture();h.sandbox.devicePixelRatio=devicePixelRatio;
    for(const mode of ['normal','theater','fullscreen']){
      h.update({mode});const frame=h.updateFrame({mode}),shade=shadeGeometry(h.shade);
      const expected=12-2/devicePixelRatio;
      near(shade.rx,expected,`${mode} DPR ${devicePixelRatio} horizontal shade radius`);
      near(shade.ry,expected,`${mode} DPR ${devicePixelRatio} vertical shade radius`);
      near(frame.radius,12,'the video picture stays twelve pixels');
      assert.match(h.video.style.getPropertyValue('--biliglow-live-picture-clip'),/round 12px\)$/);
      for(const layer of h.layers)assertBounds(layer,{radius:12});
      assertNative(h.shade,h.shadeNative);assertNative(h.controls,h.controlNative);
    }
  }
});

test('live bottom controls rise above horizontal letterboxing without resizing the picture or gradient',()=>{
  const h=fixture();
  h.update({picture:rect(20,20,1388,705)});const thin=shadeGeometry(h.shade);
  near(controlGeometry(h.controls).bottom,48);near(thin.bottom,56);near(thin.bottom-thin.top,56);near(thin.rx,10);near(thin.ry,10);
  const shallow=shadeGeometry(h.shade,1388,8);near(shallow.bottom,8);near(shallow.bottom-shallow.top,8);near(shallow.ry,10);
  // This adapter only declares the requested radius. For a native strip
  // shorter than that radius, CSS reduces it to fit the strip's own height.
  h.video.videoWidth=2560;const picture=h.picture();h.update();const letterbox=shadeGeometry(h.shade);
  const frame=controlGeometry(h.shade),shadeTop=773-frame.bottom-56;
  near(frame.bottom,773-picture.top-picture.height);near(controlGeometry(h.controls).bottom,frame.bottom);
  near(letterbox.top+shadeTop,picture.top+picture.height-56);near(letterbox.bottom+shadeTop,picture.top+picture.height);
  assert.ok(frame.bottom>56,'the whole control bar is lifted to the picture bottom instead of left in the letterbox');
  assert.deepEqual(h.video.getBoundingClientRect(),rect(0,0,1428,773));assert.deepEqual(h.area.getBoundingClientRect(),rect(0,0,1428,773));
  h.update({picture:rect(1600,0,100,100)});assert.equal(h.shade.style.getPropertyValue('--biliglow-live-shade-clip'),'');
  near(controlGeometry(h.controls).width,0);assertNative(h.shade,h.shadeNative);assertNative(h.controls,h.controlNative);
});

test('a normal aspect-matched player keeps the native control footprint and media geometry',()=>{
  const h=fixture();h.geometry(rect(90,120,1280,720));const before=h.video.getBoundingClientRect();h.update({mode:'normal'});
  for(const element of [h.controls,h.shade])assert.deepEqual(controlGeometry(element),{left:0,width:1280,bottom:0});
  assert.deepEqual(h.video.getBoundingClientRect(),before);assert.deepEqual(h.area.getBoundingClientRect(),before);
  assertNative(h.controls,h.controlNative);assertNative(h.shade,h.shadeNative);
});

test('live shade uses scaled padding-box coordinates and keeps a physical-pixel overlap on the media corner',()=>{
  const h=fixture();h.geometry(rect(100,50,1000,600),500,600);
  h.area.css={...h.area.css,borderLeftWidth:'4px',borderRightWidth:'6px',borderTopWidth:'3px',borderBottomWidth:'5px'};
  h.area.scrollLeft=7;h.area.scrollTop=11;
  h.update({picture:rect(148,96,800,460)});const clip=shadeGeometry(h.shade);
  for(const element of [h.controls,h.shade])assert.deepEqual(controlGeometry(element),{left:27,width:400,bottom:78});
  near(clip.left,0);near(clip.right,400);near(clip.bottom,56);near(clip.top,0);near(clip.rx*2,10);near(clip.ry,10);
  assertNative(h.shade,h.shadeNative);
});

test('live bottom control roots release owned geometry on replacement, fullscreen, disable and invalid geometry',()=>{
  const h=fixture();h.update();const previous=h.shade,next=h.makeShade(),nextControls=h.makeControls();previous.remove();h.controls.remove();h.area.append(next,nextControls);h.update();
  assertShadeCleared(previous,h.shadeNative);assertControlCleared(previous,h.shadeNative);assertControlCleared(h.controls,h.controlNative);assert.equal(next.hasAttribute('data-biliglow-live-control-shade'),true);
  const writes=[next.writes,nextControls.writes];h.update();h.update();assert.deepEqual([next.writes,nextControls.writes],writes);
  h.update({view:{native:true}});assertShadeCleared(next,h.shadeNative);assertControlCleared(next,h.shadeNative);assertControlCleared(nextControls,h.controlNative);
  const nativeWrites=[next.writes,nextControls.writes];h.update({view:{native:true}});assert.deepEqual([next.writes,nextControls.writes],nativeWrites);
  for(const reason of ['disabled','invalid','missing-player']){
    h.update();assert.equal(next.hasAttribute('data-biliglow-live-control-shade'),true);
    if(reason==='disabled')h.update({nextSettings:{...h.settings,enabled:false}});
    if(reason==='invalid')h.update({picture:rect(0,0,NaN,1)});
    if(reason==='missing-player'){h.video.remove();h.update();h.area.append(h.video);}
    assertShadeCleared(next,h.shadeNative);assertControlCleared(next,h.shadeNative);assertControlCleared(nextControls,h.controlNative);
  }
  h.update();h.effect.clear();assertShadeCleared(next,h.shadeNative);assertControlCleared(next,h.shadeNative);assertControlCleared(nextControls,h.controlNative);
});

test('the stable live parent retains hover geometry when native control styles and roots are replaced',()=>{
  const h=fixture();h.geometry(rect(100,50,1000,600),500,600);
  h.area.style.setProperty('--site-player-token','keep');h.update({picture:rect(140,90,800,460)});
  const inherited=Object.fromEntries(['control-left','control-width','control-bottom','shade-radius'].map(name=>
    [name,h.area.style.getPropertyValue(`--biliglow-live-${name}`)]));
  assert.equal(h.area.hasAttribute('data-biliglow-live-control-surface'),true);
  assert.equal(inherited['control-left'],'20px');assert.equal(inherited['control-width'],'400px');
  assert.equal(inherited['control-bottom'],'100px');assert.match(inherited['shade-radius'],/^0px 0px 5px 5px \/ 0px 0px 10px 10px$/);
  assert.equal(h.area.style.getPropertyValue('--biliglow-live-shade-clip'),'');
  h.shade.properties=new Map(Object.entries(h.shadeNative));h.shade.attrs.clear();
  h.controls.properties=new Map(Object.entries(h.controlNative));h.controls.attrs.clear();
  h.shade.remove();h.controls.remove();h.area.append(h.makeShade(),h.makeControls());
  // No layout call here: the new native roots already inherit their geometry.
  for(const [name,value] of Object.entries(inherited))assert.equal(h.area.style.getPropertyValue(`--biliglow-live-${name}`),value);
  const assertReleased=()=>{
    assert.equal(h.area.hasAttribute('data-biliglow-live-control-surface'),false);
    for(const name of Object.keys(inherited))assert.equal(h.area.style.getPropertyValue(`--biliglow-live-${name}`),'');
    assert.equal(h.area.style.getPropertyValue('--site-player-token'),'keep');
  };
  h.update({view:{native:true}});assertReleased();
  h.update();h.update({nextSettings:{...h.settings,enabled:false}});assertReleased();
  h.update();h.effect.clear();assertReleased();
});

test('portrait, radio and letterboxed live text keep full player width in all three modes',()=>{
  for(const [vw,vh] of [[1920,1080],[1080,1920],[2560,1080],[1080,1080]]){
    for(const [mode,view] of [['normal',{native:false}],['fullscreen',{native:false}],['fullscreen',{native:true}]]){
      const h=fixture();h.video.videoWidth=vw;h.video.videoHeight=vh;const picture=h.picture();
      h.update({mode,view,nextSettings:{...h.settings,roundedCorners:false}});
      assertBounds(h.layers[0],{left:0,top:picture.top,width:1428,height:picture.height,radius:0});
      for(const layer of h.layers.slice(1))assertBounds(layer,{left:picture.left,top:picture.top,width:picture.width,height:picture.height,radius:0});
      if(!view.native){
        const controls=controlGeometry(h.controls);
        near(controls.left,picture.left);near(controls.width,picture.width);near(controls.bottom,773-picture.top-picture.height);
        const frame=h.updateFrame({mode,view,nextSettings:{...h.settings,roundedCorners:false}});
        for(const k of ['left','top','width','height'])near(frame.rect[k],picture[k]);
        assert.equal(h.shadow.style.borderRadius,'0px');
      }
      assert.equal(h.video.hasAttribute('data-biliglow-live-picture-rounded'),false);
    }
  }
});

test('fractional native CSS geometry does not become a false ancestor scale',()=>{
  const h=fixture();h.geometry(rect(18.5,40.25,1100,711.375));h.video.videoWidth=1920;h.video.videoHeight=1080;
  h.update();const picture=h.picture();
  for(const layer of h.layers)assertBounds(layer,{left:0,top:picture.top-40.25,width:1100,height:618.75,radius:12});
});

test('scaled border boxes and content-box dimensions map to native local overlay coordinates',()=>{
  for(const sizing of ['border-box','content-box']){
    const h=fixture();h.geometry(rect(100,50,1000,600),500,300);
    h.area.css={...h.area.css,boxSizing:sizing,borderLeftWidth:'4px',borderRightWidth:'6px',borderTopWidth:'3px',borderBottomWidth:'5px',paddingLeft:'10px',paddingRight:'20px',paddingTop:'7px',paddingBottom:'9px'};
    if(sizing==='content-box'){h.area.css.width='460px';h.area.css.height='276px';}
    h.area.scrollLeft=7;h.area.scrollTop=11;
    h.update({picture:rect(148,96,800,460)});
    assertBounds(h.layers[0],{left:7,top:31,width:490,height:230,radius:6});
    for(const layer of h.layers.slice(1))assertBounds(layer,{left:27,top:31,width:400,height:230,radius:6});
  }
});

test('anisotropic ancestor scaling converts picture clips and rounded overlays without enlarging the visible corner',()=>{
  const h=fixture();h.geometry(rect(100,50,1000,600),500,600);h.video.videoWidth=1920;h.video.videoHeight=1080;
  h.update();h.updateFrame();
  for(const layer of h.layers)assert.equal(layer.style.getPropertyValue('--biliglow-live-radius'),'6px / 12px');
  assert.match(h.video.style.getPropertyValue('--biliglow-live-picture-clip'),/round 6px \/ 12px\)$/);
});

test('live overlay clipping intersects the player padding box and preserves native pointer, z-index and animation declarations',()=>{
  const h=fixture();h.area.css={...h.area.css,borderLeftWidth:'2px',borderRightWidth:'3px',borderTopWidth:'4px',borderBottomWidth:'5px'};
  h.update({picture:rect(-100,-100,2000,1000)});
  for(const layer of h.layers){assertBounds(layer,{left:0,top:0,width:1423,height:764,radius:12});assertNative(layer,h.native);}
  h.update({picture:rect(1600,0,100,100)});
  for(const layer of h.layers)assertBounds(layer,{width:0});
});

test('renderer replacement and repeated layouts adopt only current direct children without redundant writes',()=>{
  const h=fixture();h.update();const previous=h.layers[1],next=h.makeLayer('animation-mask-wrapper');previous.remove();h.area.append(next);h.update();
  assertCleared(previous,h.native);assert.equal(next.hasAttribute('data-biliglow-live-bounds'),true);
  const writes=next.writes;h.update();h.update();assert.equal(next.writes,writes);
  next.remove();h.update();assertCleared(next,h.native);h.effect.clear();for(const layer of h.layers)assertCleared(layer,h.native);
});

test('replacing the live player releases the former roots and binds the replacement player',()=>{
  const first=fixture(),next=fixture();first.update();
  first.update({nextVideo:next.video,picture:next.picture()});
  for(const layer of first.layers)assertCleared(layer,first.native);
  assertControlCleared(first.controls,first.controlNative);assertControlCleared(first.shade,first.shadeNative);assertShadeCleared(first.shade,first.shadeNative);
  for(const layer of next.layers)assert.equal(layer.hasAttribute('data-biliglow-live-bounds'),true);
  first.effect.clear();for(const layer of next.layers)assertCleared(layer,next.native);
});

test('turning off rounding and shadow restores the video while live message bounds remain active',()=>{
  const h=fixture();h.updateFrame();h.update();
  const settings={...h.settings,roundedCorners:false,frameShadow:0};
  assert.equal(h.updateFrame({nextSettings:settings}),null);h.update({nextSettings:settings});
  assert.equal(h.video.hasAttribute('data-biliglow-live-picture-rounded'),false);
  assert.equal(h.video.style.getPropertyValue('--biliglow-live-picture-clip'),'');
  for(const layer of h.layers)assertBounds(layer,{radius:0});
});

test('live video replacement, disabled state and native fullscreen restore only owned picture styles',()=>{
  const h=fixture();h.updateFrame();
  const next=h.makeLayer();next.tagName='VIDEO';next.videoWidth=1080;next.videoHeight=1920;next.box={...h.video.box};next.css={...h.video.css};h.area.append(next);
  h.updateFrame({nextVideo:next});assert.equal(h.video.hasAttribute('data-biliglow-live-picture-rounded'),false);assert.equal(h.video.style.getPropertyValue('--biliglow-live-picture-clip'),'');
  assert.equal(next.hasAttribute('data-biliglow-live-picture-rounded'),true);
  h.updateFrame({nextVideo:next,view:{native:true}});assert.equal(next.hasAttribute('data-biliglow-live-picture-rounded'),false);assert.equal(h.shadow.style.display,'none');
  h.updateFrame();h.updateFrame({nextSettings:{...h.settings,enabled:false}});assert.equal(h.video.hasAttribute('data-biliglow-live-picture-rounded'),false);assert.equal(h.video.style.getPropertyValue('clip-path'),'inset(1px)');
});

test('live bounds clear on disabled, disconnected, unsupported nesting and invalid media geometry',()=>{
  for(const reason of ['disabled','disconnected','nested-video','metadata','invalid-rect','collapsed-player']){
    const h=fixture();h.update();let settings=h.settings,picture=h.picture();
    if(reason==='disabled')settings={...settings,enabled:false};
    if(reason==='disconnected')h.video.isConnected=false;
    if(reason==='nested-video')h.menu.append(h.video);
    if(reason==='metadata')h.video.videoWidth=0;
    if(reason==='invalid-rect')picture={...picture,width:NaN};
    if(reason==='collapsed-player')h.area.box.width=0;
    assert.equal(h.update({nextSettings:settings,picture}),null,reason);
    for(const layer of h.layers)assertCleared(layer,h.native);
  }
});
