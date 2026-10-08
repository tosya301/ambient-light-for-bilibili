const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const body={};
const context=vm.createContext({document:{body},innerWidth:1280,innerHeight:800,getComputedStyle:e=>({display:'block',visibility:'visible',opacity:'1',position:'static',...e.style})});
vm.runInContext(fs.readFileSync(__dirname+'/../extension/player.js','utf8'),context);
const P=context.BiliGlowPlayer;
test('only desktop room URLs and existing playback routes are enabled',()=>{
  for(const url of ['https://live.bilibili.com/25034104','https://live.bilibili.com/1/?broadcast_type=0'])assert.equal(P.pageKind(new URL(url)),'live');
  for(const path of ['/','/p/eden/area-tags','/blackboard/activity','/25034104/extra','/0'])assert.equal(P.pageKind({hostname:'live.bilibili.com',pathname:path}),null);
  assert.equal(P.pageKind(new URL('https://www.bilibili.com/video/BV1test')),'video');
  assert.equal(P.pageKind(new URL('https://www.bilibili.com/bangumi/play/ep1')),'video');
  assert.equal(P.pageKind(new URL('https://example.com/video/a')),null);
});
test('blanc room routes use the live adapter with trailing slash, query and hash',()=>{
  for(const path of ['/blanc/1','/blanc/25034104','/blanc/25034104/']){
    for(const suffix of ['', '?broadcast_type=0', '?from=search#chat']){
      const url=new URL(`https://live.bilibili.com${path}${suffix}`);
      assert.equal(P.pageKind(url),'live',url.href);
    }
  }
});
test('blanc routing still excludes invalid IDs, nested pages and other hosts',()=>{
  for(const path of ['/blanc','/blanc/','/blanc/0','/blanc/01','/blanc/-1','/blanc/abc','/blanc/25034104/extra','/blanc/25034104//','/Blanc/25034104','/blanc%2F25034104']){
    assert.equal(P.pageKind(new URL(`https://live.bilibili.com${path}?room_id=25034104`)),null,path);
  }
  for(const host of ['www.bilibili.com','m.bilibili.com','live.bilibili.com.example.com']){
    assert.equal(P.pageKind(new URL(`https://${host}/blanc/25034104`)),null,host);
  }
});
test('watch-later playback is a video route with either trailing-slash form and playback parameters',()=>{
  for(const path of ['/list/watchlater','/list/watchlater/']){
    for(const suffix of ['', '?bvid=BV1example', '?oid=123456789&t=42', '?bvid=BV1example&oid=123456789&t=42#reply123', '#t=90']){
      const url=new URL(`https://www.bilibili.com${path}${suffix}`);
      assert.equal(P.pageKind(url),'video',url.href);
    }
  }
});
test('watch-later support excludes non-playback pages, similar paths and other domains',()=>{
  for(const path of ['/', '/list/', '/list/watchlater-extra', '/list/watchlater/extra', '/list/watchlater//', '/list/watchlater.html', '/list/watchlater2', '/list/Watchlater/', '/watchlater/', '/list/watchlater%2F']){
    const url=new URL(`https://www.bilibili.com${path}?bvid=BV1example&oid=123&t=42#watchlater`);
    assert.equal(P.pageKind(url),null,url.href);
  }
  for(const hostname of ['live.bilibili.com','m.bilibili.com','bilibili.com','example.com','www.bilibili.com.example.com']){
    const url=new URL(`https://${hostname}/list/watchlater/?bvid=BV1example`);
    assert.equal(P.pageKind(url),null,url.href);
  }
});
const element=(width=960,height=540,parentElement=body,style={})=>({parentElement,style,getBoundingClientRect:()=>({left:0,top:0,width,height}),closest:()=>null});
test('live selection excludes gift/preview videos and hidden ancestors',()=>{
  const main=element(),hidden=element(2400,1400,element(2400,1400,body,{opacity:'0'}));
  let selector;
  const chosen=P.selectVideo({querySelectorAll(s){selector=s;return [hidden,main];}},'live');
  assert.equal(selector,'#live-player video');assert.equal(chosen,main);
  assert.equal(P.selectVideo({querySelectorAll:()=>[hidden]},'live'),null);
});
test('live web fullscreen is based on a fixed viewport ancestor, not a large normal player',()=>{
  const web=element(1280,800,body,{position:'fixed'}),v=element(1280,800,web);
  assert.equal(P.presentation(v,'live',null).stage,web);
  assert.equal(P.presentation(v,'live',null).mode,'fullscreen');
  web.style.position='relative';assert.equal(P.presentation(v,'live',null).stage,null);
  const native={tagName:'DIV',contains:el=>el===v};
  assert.equal(P.presentation(v,'live',native).native,true);
  assert.equal(P.presentation(v,'live',{tagName:'VIDEO',contains:()=>true}).native,false);
});
test('video wide and web modes retain the 0.5.3 mapping',()=>{
  let screen='wide';const container={getAttribute:()=>screen};
  const v={closest:()=>container};assert.equal(P.presentation(v,'video',null).mode,'theater');
  screen='web';assert.equal(P.presentation(v,'video',null).stage,container);
  screen='normal';assert.equal(P.presentation(v,'video',null).mode,'normal');
});
test('live web mode with a chat sidebar remains fullscreen across browser-height changes',()=>{
  const web=element(1428,1117,body,{position:'fixed'});web.id='fullscreen-container';
  const v=element(1428,1033,web);
  assert.equal(P.presentation(v,'live',null,1728,1117).stage,web);
  assert.equal(P.presentation(v,'live',null,1728,1117).mode,'fullscreen');
  web.getBoundingClientRect=()=>({left:0,top:0,width:1428,height:910});
  assert.equal(P.presentation(v,'live',null,1728,910).stage,web);
  web.style.position='absolute';
  assert.equal(P.presentation(v,'live',null,1728,910).stage,null);
});
test('partial fixed ancestors, mini players and offset room stages are not live web mode',()=>{
  const web=element(500,800,body,{position:'fixed'}),v=element(500,300,web);
  assert.equal(P.presentation(v,'live',null).stage,null,'unknown narrow fixed ancestor');
  web.id='fullscreen-container';
  for(const rect of [
    {left:0,top:0,width:500,height:300},
    {left:780,top:0,width:500,height:800},
    {left:0,top:74,width:980,height:800},
    {left:0,top:0,width:100,height:800}
  ]){
    web.getBoundingClientRect=()=>rect;
    assert.equal(P.presentation(v,'live',null).stage,null,JSON.stringify(rect));
  }
});

function frameFixture(){
  const attrs=new Set(),rect={left:100,top:50,width:960,height:540};
  const frame={closest:()=>null,hasAttribute:key=>attrs.has(key),toggleAttribute(key,on){if(on)attrs.add(key);else attrs.delete(key);},removeAttribute:key=>attrs.delete(key),getBoundingClientRect:()=>({...rect})};
  const container={screen:'normal',tagName:'DIV',getAttribute(){return this.screen;},contains:()=>true};
  const video={isConnected:true,videoWidth:1920,videoHeight:1080,closest:selector=>selector==='.bpx-player-container'?container:frame};
  const root={children:[],append(child){this.children.push(child);}};
  const sandbox=vm.createContext({document:{createElement:()=>({dataset:{},style:{},setAttribute(){}})},
    innerWidth:1280,innerHeight:800,getComputedStyle:()=>({borderRadius:attrs.has('data-biliglow-rounded')?'12px':'0px'})});
  vm.runInContext(fs.readFileSync(__dirname+'/../extension/player.js','utf8'),sandbox);
  const api=sandbox.BiliGlowPlayer,effect=api.createFrame(root),origin={left:0,top:0};
  return {api,effect,video,container,frame,rect,origin,shadow:root.children[0],
    rounded:()=>attrs.has('data-biliglow-rounded'),
    update(settings,fullscreen=null,kind='video'){return effect.update(video,settings,kind,api.presentation(video,kind,fullscreen).mode,origin);}};
}

test('one rounded-corner preference applies in ordinary and widescreen modes without enabling a shadow',()=>{
  const h=frameFixture(),settings={enabled:true,roundedCorners:true,frameShadow:0};
  for(const screen of ['normal','wide','normal']){
    h.container.screen=screen;const result=h.update(settings);
    assert.equal(h.rounded(),true,screen);assert.equal(result.radius,12);
    assert.equal(h.shadow.style.display,'none','rounding must not opt into a shadow');
    assert.match(h.api.roundedCutout(h.rect,result,h.origin,{width:1280,height:800}),/A12 12/,'the light cutout follows the same radius in widescreen');
  }
  h.container.screen='wide';h.update({...settings,roundedCorners:false});
  assert.equal(h.rounded(),false);assert.equal(h.shadow.style.display,'none');
});

test('widescreen rounding keeps independent shadow strength and fullscreen cleanup',()=>{
  const h=frameFixture(),settings={enabled:true,roundedCorners:false,frameShadow:65};
  h.container.screen='wide';h.update(settings);
  assert.equal(h.rounded(),false);assert.equal(h.shadow.style.display,'block');
  const originalShadow=h.shadow.style.boxShadow;
  h.update({...settings,roundedCorners:true});
  assert.equal(h.rounded(),true);assert.equal(h.shadow.style.boxShadow,originalShadow);
  assert.equal(h.shadow.style.borderRadius,'12px','shadow follows the rounded frame without changing strength');
  h.container.screen='web';assert.equal(h.update({...settings,roundedCorners:true}),null);
  assert.equal(h.rounded(),false);assert.equal(h.shadow.style.display,'none');
  h.container.screen='wide';h.update({...settings,roundedCorners:true});assert.equal(h.rounded(),true);
  assert.equal(h.update({...settings,roundedCorners:true},h.container),null,'native container fullscreen also uses the fullscreen gate');
  assert.equal(h.rounded(),false);assert.equal(h.shadow.style.display,'none');
  h.update({...settings,roundedCorners:true});assert.equal(h.rounded(),true);assert.equal(h.shadow.style.boxShadow,originalShadow);
  h.update({...settings,roundedCorners:true,enabled:false});assert.equal(h.rounded(),false);assert.equal(h.shadow.style.display,'none');
});

// Unlike the frame-only fixture above, this keeps the native page wrapper in
// document flow while the same player can move into a fixed floating stage.
// The computed wrapper bottom includes our padding, as it does in a browser.
function spaceFixture(){
  const state={scrollY:0,overflow:80.25,floating:false},styles=new Map([['padding-bottom','24px'],['--site-token','keep']]);
  const attributes=()=>({attrs:new Set(),hasAttribute(key){return this.attrs.has(key);},setAttribute(key){this.attrs.add(key);},removeAttribute(key){this.attrs.delete(key);},toggleAttribute(key,on){if(on)this.attrs.add(key);else this.attrs.delete(key);}});
  let writes=0;
  const extra=()=>parseFloat(styles.get('--biliglow-player-extra'))||0;
  const wrapper={...attributes(),position:'relative',parentElement:null,style:{
    setProperty(key,value){writes++;styles.set(key,value);},removeProperty(key){writes++;styles.delete(key);}
  },computedStyle:()=>({boxSizing:'content-box',paddingBottom:`${24+extra()}px`}),
    getBoundingClientRect:()=>({left:100,top:100-state.scrollY,width:960,height:640+extra(),bottom:740-state.scrollY+extra()})};
  const host={position:'relative',parentElement:wrapper};
  const container={screen:'normal',position:'relative',parentElement:host,tagName:'DIV',getAttribute(){return this.screen;},contains:()=>true};
  const primary={position:'relative',parentElement:container,querySelector:()=>sending};
  const sending={getBoundingClientRect:()=>({bottom:state.floating?643:740+state.overflow-state.scrollY})};
  const frame={...attributes(),position:'relative',parentElement:primary,
    closest:selector=>selector==='#playerWrap'?wrapper:selector==='.bpx-player-primary-area'?primary:selector==='.bpx-player-container'?container:null,
    getBoundingClientRect:()=>({left:100,top:state.floating?440:144-state.scrollY,width:960,height:state.floating?203:540+state.overflow,bottom:state.floating?643:684+state.overflow-state.scrollY})};
  const video={isConnected:true,videoWidth:1670,videoHeight:1080,closest:selector=>selector==='.bpx-player-container'?container:frame};
  const sandbox=vm.createContext({document:{createElement:()=>({dataset:{},style:{},setAttribute(){}})},innerWidth:1280,innerHeight:800,
    getComputedStyle:element=>({position:element.position||'static',borderRadius:element.hasAttribute?.('data-biliglow-rounded')?'12px':'0px',
      ...element.computedStyle?.()})});
  vm.runInContext(fs.readFileSync(__dirname+'/../extension/player.js','utf8'),sandbox);
  const api=sandbox.BiliGlowPlayer,effect=api.createFrame({append(){}}),settings={enabled:true,roundedCorners:true,frameShadow:0},origin={left:0,top:0};
  return {state,styles,wrapper,container,primary,frame,video,effect,settings,origin,extra,
    writes:()=>writes,owns:()=>wrapper.hasAttribute('data-biliglow-player-space'),
    update(next=settings,fullscreen=null){return effect.update(video,next,'video',api.presentation(video,'video',fullscreen).mode,origin);},
    mini(){state.floating=true;container.screen='mini';container.position='fixed';},
    normal(){state.floating=false;container.screen='normal';container.position='relative';primary.position='relative';}
  };
}

function assertSpaceCleared(h){
  assert.equal(h.owns(),false);
  assert.equal(h.styles.has('--biliglow-player-extra'),false);
  assert.equal(h.styles.has('--biliglow-player-padding'),false);
  assert.equal(h.styles.get('padding-bottom'),'24px','native inline padding survives cleanup');
  assert.equal(h.styles.get('--site-token'),'keep','unrelated site styles survive cleanup');
}

test('normal player space is independent of page scroll and repeated measurements',()=>{
  const h=spaceFixture();h.update();
  assert.equal(h.owns(),true);assert.equal(h.extra(),81,'fractional media overflow rounds up once');
  assert.equal(h.styles.get('--biliglow-player-padding'),'24px');const writes=h.writes();
  for(const scrollY of [200,700.5,1400,0]){
    h.state.scrollY=scrollY;for(let i=0;i<3;i++)h.update();
    assert.equal(h.extra(),81,`scrollY=${scrollY}`);
  }
  assert.equal(h.writes(),writes,'stable layout performs no further wrapper mutations');
});

test('mini player preserves the last page footprint while scrolling to comments',()=>{
  const h=spaceFixture();h.update();const writes=h.writes();h.mini();
  // The mode can change before the fixed positioning rule takes effect.
  h.container.position='relative';
  for(const scrollY of [700,1000,2632.5,3600]){
    h.state.scrollY=scrollY;const result=h.update();
    assert.equal(h.extra(),81,`scrollY=${scrollY}`);assert.equal(h.owns(),true);
    assert.equal(result.radius,12,'floating playback retains the rounded frame');
  }
  assert.equal(h.writes(),writes,'entering mini mode neither grows nor removes the page footprint');
});

test('a player first seen in mini mode does not reserve viewport-to-page distance',()=>{
  const h=spaceFixture();h.mini();
  for(const scrollY of [700,1600,3000]){h.state.scrollY=scrollY;h.update();assertSpaceCleared(h);}
  assert.equal(h.writes(),0);
  h.normal();h.update();assert.equal(h.extra(),81,'normal layout can establish its real media overflow later');
});

test('fixed or sticky ancestors freeze the footprint even without a mini mode attribute',()=>{
  for(const position of ['fixed','sticky']){
    const h=spaceFixture();h.update();const writes=h.writes();
    h.state.floating=true;h.primary.position=position;
    for(const scrollY of [700,1800,3600]){h.state.scrollY=scrollY;h.update();assert.equal(h.extra(),81,position);}
    assert.equal(h.writes(),writes,position);
    h.normal();h.state.overflow=120.5;h.update();assert.equal(h.extra(),121,`${position} returns to normal flow`);
  }
});

test('returning from mini mode recomputes changed media overflow and removes an obsolete reservation',()=>{
  const h=spaceFixture();h.update();h.mini();h.state.scrollY=1800;h.state.overflow=132.5;h.update();
  assert.equal(h.extra(),81,'source changes in mini mode cannot measure the offscreen page footprint');
  h.normal();h.update();assert.equal(h.extra(),133,'normal flow recalculates the current source');
  h.mini();h.state.overflow=0;h.update();assert.equal(h.extra(),133);
  h.normal();h.update();assertSpaceCleared(h);
});

test('turning rounded corners off in mini mode clears the page footprint while preserving an independent shadow',()=>{
  const h=spaceFixture();h.update();h.mini();h.state.scrollY=1800;
  const result=h.update({...h.settings,roundedCorners:false,frameShadow:35});
  assert.equal(result.radius,0);assertSpaceCleared(h);
  h.update();assertSpaceCleared(h);h.normal();h.update();assert.equal(h.extra(),81);
});

test('disabled and disconnected floating players release the page footprint',()=>{
  for(const reason of ['disabled','disconnected']){
    const h=spaceFixture();h.update();h.mini();h.state.scrollY=1800;
    if(reason==='disconnected')h.video.isConnected=false;
    assert.equal(h.update(reason==='disabled'?{...h.settings,enabled:false}:h.settings),null,reason);
    assertSpaceCleared(h);assert.equal(h.frame.hasAttribute('data-biliglow-rounded'),false,reason);
  }
});

test('fullscreen clears a floating footprint and returning to mini mode does not recreate it',()=>{
  const h=spaceFixture();h.update();h.mini();h.state.scrollY=1800;
  assert.equal(h.update(h.settings,h.container),null);assertSpaceCleared(h);
  h.update();assertSpaceCleared(h);h.normal();h.update();assert.equal(h.extra(),81);
});

test('replacing a floating player clears its old wrapper before binding another floating player',()=>{
  const old=spaceFixture(),next=spaceFixture();old.update();old.mini();next.mini();next.state.scrollY=2400;
  old.effect.update(next.video,old.settings,'video','normal',old.origin);
  assertSpaceCleared(old);assertSpaceCleared(next);
  assert.equal(old.frame.hasAttribute('data-biliglow-rounded'),false);
  assert.equal(next.frame.hasAttribute('data-biliglow-rounded'),true);
  next.normal();old.effect.update(next.video,old.settings,'video','normal',old.origin);assert.equal(next.extra(),81);
  old.effect.clear();assertSpaceCleared(next);
});

test('rounded square, 4:3 and portrait VOD frames opt into native sizing in normal and widescreen modes',()=>{
  const h=frameFixture(),settings={enabled:true,roundedCorners:true,frameShadow:0};
  for(const screen of ['normal','wide'])for(const [width,height] of [[1440,1080],[1080,1080],[810,1080],[540,960]]){
    h.container.screen=screen;h.video.videoWidth=width;h.video.videoHeight=height;h.update(settings);
    assert.equal(h.frame.hasAttribute('data-biliglow-native-size'),true,`${screen} ${width}:${height}`);
    assert.equal(h.rounded(),true,`${screen} ${width}:${height} retains rounded corners`);
  }
});

test('Mac recordings and 16:10 retain the existing enlarged layout while standard 16:9 stays native',()=>{
  const h=frameFixture(),settings={enabled:true,roundedCorners:true,frameShadow:0};
  for(const [width,height] of [[1670,1080],[1600,1000],[1920,1080],[1441,1080]]){
    h.video.videoWidth=width;h.video.videoHeight=height;h.update(settings);
    assert.equal(h.frame.hasAttribute('data-biliglow-native-size'),false,`${width}:${height} is outside the <=4:3 native-size gate`);
    assert.equal(h.rounded(),true);
  }
  const expanded=spaceFixture();expanded.update();assert.equal(expanded.extra(),81,'Mac-sized overflow is still reserved');
});

test('native-size classification follows source metadata changes on the same video',()=>{
  const h=frameFixture(),settings={enabled:true,roundedCorners:true,frameShadow:0};
  for(const [width,height,expected] of [[1080,1080,true],[1670,1080,false],[810,1080,true],[1600,1000,false],[1440,1080,true],[1920,1080,false]]){
    h.video.videoWidth=width;h.video.videoHeight=height;h.update(settings);
    assert.equal(h.frame.hasAttribute('data-biliglow-native-size'),expected,`${width}:${height}`);
  }
});

test('missing or invalid source metadata never acquires the native-size attribute',()=>{
  const h=frameFixture(),settings={enabled:true,roundedCorners:true,frameShadow:0};
  for(const [width,height] of [[0,0],[0,1080],[1080,0],[-1,1080],[1080,-1],[NaN,1080],[1080,NaN],[undefined,undefined]]){
    // Start each metadata transition from a qualifying source to catch stale attributes.
    h.video.videoWidth=1080;h.video.videoHeight=1080;h.update(settings);
    h.video.videoWidth=width;h.video.videoHeight=height;h.update(settings);
    assert.equal(h.frame.hasAttribute('data-biliglow-native-size'),false,`${width}:${height}`);
  }
});

test('rounded-off, disabled, disconnected and fullscreen gates remove native-size classification',()=>{
  for(const reason of ['rounded-off','disabled','disconnected','web-fullscreen','native-fullscreen']){
    const h=frameFixture(),settings={enabled:true,roundedCorners:true,frameShadow:30};
    h.video.videoWidth=1080;h.video.videoHeight=1080;h.update(settings);
    assert.equal(h.frame.hasAttribute('data-biliglow-native-size'),true,reason);
    if(reason==='disconnected')h.video.isConnected=false;
    if(reason==='web-fullscreen')h.container.screen='web';
    h.update({...settings,roundedCorners:reason!=='rounded-off',enabled:reason!=='disabled'},reason==='native-fullscreen'?h.container:null);
    assert.equal(h.frame.hasAttribute('data-biliglow-native-size'),false,reason);
  }
});

test('replacing a native-sized frame removes its owned attribute from the old frame',()=>{
  const old=frameFixture(),next=frameFixture(),settings={enabled:true,roundedCorners:true,frameShadow:0};
  old.video.videoWidth=1080;old.video.videoHeight=1080;old.update(settings);
  next.video.videoWidth=810;next.video.videoHeight=1080;
  old.effect.update(next.video,settings,'video','normal',old.origin);
  assert.equal(old.frame.hasAttribute('data-biliglow-native-size'),false);
  assert.equal(next.frame.hasAttribute('data-biliglow-native-size'),true);
  old.effect.clear();assert.equal(next.frame.hasAttribute('data-biliglow-native-size'),false);
});

test('live frames retain their existing rounded behavior without VOD native-size classification',()=>{
  const h=frameFixture(),settings={enabled:true,roundedCorners:true,frameShadow:0};
  h.video.videoWidth=1080;h.video.videoHeight=1080;h.update(settings);assert.equal(h.frame.hasAttribute('data-biliglow-native-size'),true);
  h.update(settings,null,'live');
  assert.equal(h.frame.hasAttribute('data-biliglow-native-size'),false);
  assert.equal(h.rounded(),true);
});
