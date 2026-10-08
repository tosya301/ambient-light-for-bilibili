'use strict';
(() => {
  const player=document.querySelector('#player'),area=player.querySelector('.bpx-player-video-area');
  const video=()=>area.querySelector('video');
  const adapter=globalThis.BiliGlowPlayer;
  const awayPath='/demo/glass-fixture-away';
  // Localhost normally enables every route. Only this fixture's explicit away
  // route uses the production classifier for a real unsupported Bilibili page.
  globalThis.BiliGlowPlayer=Object.freeze({...adapter,pageKind:route=>route.pathname===awayPath
    ?adapter.pageKind({hostname:'www.bilibili.com',pathname:'/'})
    :adapter.pageKind(route)});

  const style=document.createElement('style');
  style.textContent=`
    :where([data-glass-fixture]).bpx-player-control-wrap{position:absolute;inset:auto 0 0;height:55px;z-index:75;color:#fff;font:12px/1.4 system-ui,sans-serif}
    :where([data-glass-fixture])[hidden]{display:none!important}
    :where([data-glass-fixture]) .bpx-player-control-mask{position:absolute;inset:auto 0 0;height:100px;z-index:-1;pointer-events:none;background:linear-gradient(0deg,rgba(0,0,0,.8),transparent);backdrop-filter:none;box-shadow:none}
    :where([data-glass-fixture]) .bpx-player-control-entity{position:relative;width:100%;height:55px}
    :where([data-glass-fixture]) .bpx-player-control-top{position:absolute;left:12px;right:12px;bottom:44px;height:10px;display:flex;align-items:center}
    :where([data-glass-fixture]) .bpx-player-control-bottom{position:absolute;inset:auto 0 0;height:35px;display:flex;align-items:center;gap:12px;padding:0 12px}
    :where([data-glass-fixture]) button{appearance:none;border:0;background:transparent;color:#fff;font:inherit;opacity:1;filter:none;cursor:pointer;padding:5px 7px;min-width:32px}
    :where([data-glass-fixture]) button:focus-visible{outline:2px solid #00aeec;outline-offset:1px}
    :where([data-glass-fixture]) input[type=range]{width:100%;height:10px;margin:0;accent-color:#00aeec;cursor:pointer;opacity:1;filter:none}
    :where([data-glass-fixture]) .fixture-time{color:#fff;opacity:1;filter:none;font:inherit}
    :where([data-glass-fixture]) .fixture-spacer{flex:1}
    :where([data-glass-fixture]) .fixture-settings-menu{position:absolute;right:8px;bottom:43px;z-index:2;min-width:168px;padding:12px;background:#1d2634;color:#fff;border:1px solid #536174;border-radius:8px;opacity:1;filter:none;pointer-events:auto}
    :where([data-glass-fixture]) .fixture-settings-menu[hidden]{display:none}
    :where([data-glass-fixture]) .fixture-settings-menu button{display:block;width:100%;text-align:left}
    :where([data-glass-fixture]).fixture-native-hidden .bpx-player-control-mask,
    :where([data-glass-fixture]).fixture-native-hidden .bpx-player-control-entity{display:none}
    #glass-results{white-space:pre-line;flex-basis:100%;line-height:1.8}
    #glass-fixture-note{flex-basis:100%;font-size:11px;color:#94a9c2}
  `;
  document.head.append(style);
  const wrap=document.createElement('div');wrap.className='bpx-player-control-wrap';wrap.dataset.glassFixture='';wrap.hidden=true;
  wrap.innerHTML=`<div class="bpx-player-control-mask" aria-hidden="true"></div><div class="bpx-player-control-entity"><div class="bpx-player-control-top"><input id="glass-progress" type="range" min="0" max="100" value="35" aria-label="本地进度交互，合成流不提供实际寻址"></div><div class="bpx-player-control-bottom"><button type="button" id="glass-play" aria-label="暂停演示视频">Ⅱ</button><span class="fixture-time" id="glass-time">进度交互 35%</span><span class="fixture-spacer"></span><span class="fixture-time">1080P</span><button type="button" id="glass-settings" aria-haspopup="menu" aria-expanded="false">设置 ⚙</button></div><div class="fixture-settings-menu" id="glass-menu" role="menu" hidden><strong>本地设置菜单</strong><button type="button" role="menuitem" id="glass-menu-item">标准速度 · 1×</button><small>菜单保留独立底色</small></div></div>`;
  area.append(wrap);
  const mask=wrap.querySelector('.bpx-player-control-mask'),entity=wrap.querySelector('.bpx-player-control-entity');
  const play=wrap.querySelector('#glass-play'),settings=wrap.querySelector('#glass-settings'),menu=wrap.querySelector('#glass-menu');
  const progress=wrap.querySelector('#glass-progress'),time=wrap.querySelector('#glass-time'),menuItem=wrap.querySelector('#glass-menu-item');
  const controls=document.querySelector('.checks');
  const toggle=document.createElement('button');toggle.id='glass-fixture-toggle';toggle.type='button';toggle.textContent='显示玻璃控制栏样本';toggle.setAttribute('aria-pressed','false');
  const run=document.createElement('button');run.id='glass-tests';run.type='button';run.textContent='玻璃控制栏自检';
  const output=document.createElement('output');output.id='glass-results';output.setAttribute('aria-live','polite');
  const note=document.createElement('p');note.id='glass-fixture-note';note.textContent='玻璃样本默认隐藏；进度条验证命中与输入，合成流不做实际 seek。原生全屏请显示样本后点击“全屏预览”人工检查。';
  controls.append(toggle,run,note,output);
  let nativeControls=true;
  function setVisible(visible){
    if(visible&&wrap.hidden){nativeControls=video()?.controls??true;if(video())video().controls=false;}
    if(!visible&&!wrap.hidden&&video())video().controls=nativeControls;
    wrap.hidden=!visible;toggle.setAttribute('aria-pressed',String(visible));toggle.textContent=visible?'隐藏玻璃控制栏样本':'显示玻璃控制栏样本';
    if(!visible){menu.hidden=true;settings.setAttribute('aria-expanded','false');}
  }
  toggle.addEventListener('click',()=>setVisible(wrap.hidden));
  function updatePlay(){const paused=video()?.paused;play.textContent=paused?'▶':'Ⅱ';play.setAttribute('aria-label',paused?'播放演示视频':'暂停演示视频');}
  play.addEventListener('click',async()=>{
    if(!video())return;
    if(video().paused){try{await video().play();}catch(error){output.textContent=`播放失败：${error.message}`;}}
    else video().pause();
    updatePlay();
  });
  settings.addEventListener('click',()=>{menu.hidden=!menu.hidden;settings.setAttribute('aria-expanded',String(!menu.hidden));});
  menuItem.addEventListener('click',()=>{if(video())video().playbackRate=1;menu.dataset.activations=String(Number(menu.dataset.activations||0)+1);});
  progress.addEventListener('input',()=>{
    time.textContent=`进度交互 ${progress.value}%`;progress.dataset.lastInput=progress.value;
    if(Number.isFinite(video()?.duration)&&video().duration>0)video().currentTime=video().duration*Number(progress.value)/100;
  });
  video()?.addEventListener('play',updatePlay);video()?.addEventListener('pause',updatePlay);
  setVisible(new URLSearchParams(location.search).get('glass')==='1');

  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const settle=async predicate=>{const end=performance.now()+2400;while(!predicate()&&performance.now()<end)await delay(40);return predicate();};
  const active=()=>document.documentElement.hasAttribute('data-biliglow-glass-controls');
  const maskStyle=()=>getComputedStyle(mask);
  const alpha=color=>color.startsWith('rgba(')?Number(color.split(',').at(-1).replace(')','')):color==='transparent'?0:1;
  function setMode(mode){
    document.body.classList.toggle('theater',mode==='wide');player.classList.toggle('web-fullscreen',mode==='web');player.dataset.screen=mode;
    document.querySelector('#theater').textContent=mode==='wide'?'返回小屏':'宽屏模式';window.dispatchEvent(new Event('resize'));
  }
  function hit(element){const r=element.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return top===element||element.contains(top);}
  function glassPaint(){const s=maskStyle();return active()&&s.backgroundImage==='none'&&alpha(s.backgroundColor)>.1&&alpha(s.backgroundColor)<.9&&s.backdropFilter.includes('blur(12px)')&&Math.abs(parseFloat(s.height)-55)<1;}
  async function runChecks(){
    const original=await BiliGlow.storage.get(),results=[];
    const check=(ok,label)=>{results.push({ok:Boolean(ok),label});output.textContent=results.map(item=>`${item.ok?'✓':'✗'} ${item.label}`).join('\n');};
    if(!original.privacyAccepted){output.textContent='请先阅读本地处理说明并同意开启，再运行玻璃自检。';output.dataset.passed='false';return;}
    if(document.fullscreenElement){output.textContent='请先退出浏览器原生全屏；本组仅自动验证网页全屏。';output.dataset.passed='false';return;}
    const before={shown:!wrap.hidden,screen:player.dataset.screen,url:location.href,paused:video()?.paused,rate:video()?.playbackRate,progress:progress.value,menu:!menu.hidden,scene:document.querySelector('[data-scene][aria-pressed=true]')?.dataset.scene,scrollX,scrollY};
    run.disabled=true;delete output.dataset.passed;output.dataset.nativeFullscreen='manual-not-tested';
    try{
      setVisible(true);setMode('normal');wrap.classList.remove('fixture-native-hidden');menu.hidden=true;
      await BiliGlow.storage.set({enabled:true,glassControls:false});
      await settle(()=>!active());
      const native={background:maskStyle().background,filter:maskStyle().backdropFilter,height:maskStyle().height,shadow:maskStyle().boxShadow};
      check(maskStyle().backgroundImage.includes('linear-gradient')&&parseFloat(native.height)===100,'默认关闭时保留原生 100px 黑色渐变底板');
      const originalText=[play,time,settings,progress].map(element=>{const s=getComputedStyle(element);return {color:s.color,font:s.font,opacity:s.opacity,filter:s.filter};});
      await BiliGlow.storage.set({glassControls:true});
      check(await settle(glassPaint),'开启后仅底板变为 55px 半透明底色与 12px 背景模糊');
      check([play,time,settings,progress].every((element,index)=>{const s=getComputedStyle(element),saved=originalText[index];return s.opacity==='1'&&s.filter==='none'&&s.color===saved.color&&s.font===saved.font;}),'按钮、时间文字与进度条保持原字体、原颜色、完整透明度且无前景模糊');
      check(maskStyle().pointerEvents==='none'&&getComputedStyle(entity).opacity==='1'&&getComputedStyle(entity).filter==='none','底板不接收指针，控制层不被整体淡化或模糊');
      player.scrollIntoView({block:'center',behavior:'instant'});await delay(80);
      check(hit(play)&&hit(settings)&&hit(progress),'播放、设置及进度条的真实命中位置未被底板遮挡');
      if(video().paused)await video().play();play.click();check(await settle(()=>video().paused),'播放按钮点击可暂停真实演示视频');
      play.click();check(await settle(()=>!video().paused),'播放按钮点击可恢复演示视频');
      progress.value='63';progress.dispatchEvent(new Event('input',{bubbles:true}));
      check(progress.dataset.lastInput==='63'&&time.textContent.includes('63%'),'进度条 input 事件到达并更新可见读数（合成流不做 seek）');
      settings.click();await delay(40);
      check(!menu.hidden&&alpha(getComputedStyle(menu).backgroundColor)===1&&getComputedStyle(menu).pointerEvents==='auto'&&hit(menuItem),'设置菜单保持独立不透明底色并可被指针命中');
      const menuClicks=Number(menu.dataset.activations||0);menuItem.click();check(Number(menu.dataset.activations)===menuClicks+1,'菜单按钮点击到达处理器');settings.click();
      wrap.classList.add('fixture-native-hidden');
      check(maskStyle().display==='none'&&getComputedStyle(entity).display==='none','站点原生隐藏状态仍能同时隐藏底板与控制层');wrap.classList.remove('fixture-native-hidden');
      await BiliGlow.storage.set({dark:false});document.querySelector('[data-scene=daylight]').click();
      check(await settle(glassPaint),'浅色页面与浅色视频保留同一玻璃底板，文字样式不变');
      await BiliGlow.storage.set({dark:true});
      check(await settle(glassPaint),'深色页面恢复后玻璃底板仍有效');
      setMode('wide');
      check(await settle(()=>glassPaint()&&document.querySelector('[data-biliglow-root]')?.dataset.mode==='theater'),'宽屏模式玻璃控制栏继续工作');
      setMode('web');
      check(await settle(()=>glassPaint()&&document.querySelector('[data-biliglow-root]')?.dataset.mode==='fullscreen'),'网页全屏使用真实全屏布局，玻璃控制栏继续工作');
      setMode('normal');await settle(()=>document.querySelector('[data-biliglow-root]')?.dataset.mode==='normal');
      await BiliGlow.storage.set({glassControls:false});
      check(!active()&&maskStyle().background===native.background&&maskStyle().backdropFilter===native.filter&&maskStyle().height===native.height&&maskStyle().boxShadow===native.shadow,'关闭玻璃开关立即完整恢复原生底板');
      await BiliGlow.storage.set({glassControls:true,enabled:false});
      check(!active()&&maskStyle().background===native.background,'关闭氛围光同时撤去玻璃效果');
      await BiliGlow.storage.set({enabled:true,glassControls:true});await settle(glassPaint);
      history.pushState({},'',awayPath);window.dispatchEvent(new PopStateEvent('popstate'));
      check(await settle(()=>!active()&&!document.documentElement.hasAttribute('data-biliglow-active')),'SPA 离开播放路径清除光效与玻璃状态');
      history.replaceState({},'',before.url);window.dispatchEvent(new PopStateEvent('popstate'));
      check(await settle(glassPaint),'SPA 返回播放页恢复保存的玻璃选项');
      await BiliGlow.storage.set({privacyAccepted:false});
      check(!active()&&maskStyle().background===native.background,'撤回同意立即恢复原生控制栏');
    }catch(error){check(false,error.message);}
    finally{
      history.replaceState({},'',before.url);setMode(before.screen);wrap.classList.remove('fixture-native-hidden');
      if(before.scene)document.querySelector(`[data-scene="${before.scene}"]`).click();
      progress.value=before.progress;progress.dispatchEvent(new Event('input',{bubbles:true}));
      await BiliGlow.storage.set(original);window.dispatchEvent(new PopStateEvent('popstate'));
      if(video()){video().playbackRate=before.rate;if(before.paused)video().pause();else await video().play().catch(()=>{});}
      setVisible(before.shown);menu.hidden=!before.menu;settings.setAttribute('aria-expanded',String(before.menu));updatePlay();
      window.scrollTo({left:before.scrollX,top:before.scrollY,behavior:'instant'});run.disabled=false;
      output.dataset.passed=String(results.length>0&&results.every(item=>item.ok));output.dataset.checks=String(results.length);
      output.textContent+='\n原生全屏：需点击“全屏预览”人工验证，本组未计入通过项。';
    }
    return results;
  }
  run.addEventListener('click',runChecks);
  window.glassFixture={setVisible,runChecks};
})();
