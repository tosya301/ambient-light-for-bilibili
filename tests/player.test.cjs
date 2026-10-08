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
  const frame={hasAttribute:key=>attrs.has(key),toggleAttribute(key,on){if(on)attrs.add(key);else attrs.delete(key);},removeAttribute:key=>attrs.delete(key),getBoundingClientRect:()=>({...rect})};
  const container={screen:'normal',tagName:'DIV',getAttribute(){return this.screen;},contains:()=>true};
  const video={isConnected:true,closest:selector=>selector==='.bpx-player-container'?container:frame};
  const root={children:[],append(child){this.children.push(child);}};
  const sandbox=vm.createContext({document:{createElement:()=>({dataset:{},style:{},setAttribute(){}})},
    innerWidth:1280,innerHeight:800,getComputedStyle:()=>({borderRadius:attrs.has('data-biliglow-rounded')?'12px':'0px'})});
  vm.runInContext(fs.readFileSync(__dirname+'/../extension/player.js','utf8'),sandbox);
  const api=sandbox.BiliGlowPlayer,effect=api.createFrame(root),origin={left:0,top:0};
  return {api,effect,video,container,frame,rect,origin,shadow:root.children[0],
    rounded:()=>attrs.has('data-biliglow-rounded'),
    update(settings,fullscreen=null){return effect.update(video,settings,'video',api.presentation(video,'video',fullscreen).mode,origin);}};
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
