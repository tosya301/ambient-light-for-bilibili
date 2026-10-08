/* Native-class chapter fixture. Only the production page.css may make the
   panel transparent; these styles reproduce its observed opaque defaults. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),B=window.BiliGlow;
  const host=$('.bpx-docker-minor'),checks=$('.checks');
  if(!host||!checks)return;
  const style=document.createElement('style');
  const indicator=`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><path fill="#00aeec" d="M1 7h2v6H1zm5-6h2v12H6zm5 3h2v9h-2z"/></svg>')}`;
  style.textContent=`
    :where([data-chapter-fixture]).bpx-player-viewpoint{position:relative;background:rgb(28,36,50);border-radius:6px;color:#e3e9f3;font:12px/1.5 system-ui,sans-serif;margin-top:12px}
    :where([data-chapter-fixture])[hidden],:where([data-chapter-fixture]) [hidden]{display:none!important}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;font-weight:500;background:transparent}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-header-actions{display:flex;align-items:center;gap:8px}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-header button{border:0;background:transparent;color:inherit;padding:2px 4px;font:inherit;cursor:pointer}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-body{max-height:260px;overflow-y:auto;background:rgb(28,36,50);scroll-behavior:auto}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-menu{padding:0 8px 8px;background:transparent}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-menu-item{display:flex;align-items:center;gap:10px;min-height:76px;padding:8px 6px;background:transparent;cursor:pointer;border-radius:4px;color:#e3e9f3}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-menu-item:focus-visible{outline:2px solid #00aeec;outline-offset:-2px}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-menu-item-cover{width:96px;height:54px;flex:0 0 96px;background:transparent;border-radius:4px;overflow:hidden}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-menu-item-cover img{display:block;width:100%;height:100%;object-fit:cover}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-menu-item-info{min-width:0;flex:1;background:transparent}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-menu-item-content{background:transparent;line-height:1.5;color:inherit}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-menu-item-time{margin-top:5px;background:transparent;color:#a4b2c5;font-size:11px}
    :where([data-chapter-fixture]) .bpx-state-active .bpx-player-viewpoint-menu-item-content{color:#00aeec}
    :where([data-chapter-fixture]) .bpx-player-viewpoint-menu-item-active{display:none;width:14px;height:14px;margin-right:5px;vertical-align:-2px;background-image:url("${indicator}");background-repeat:no-repeat;background-size:contain}
    :where([data-chapter-fixture]) .bpx-state-active .bpx-player-viewpoint-menu-item-active{display:inline-block}
    :where([data-chapter-fixture]) .chapter-popover{position:absolute;right:12px;top:42px;z-index:5;padding:12px;border:1px solid #536174;border-radius:6px;background:rgb(28,36,50);color:#e3e9f3;box-shadow:0 4px 14px #0005}
    :where([data-chapter-fixture]) .chapter-popover button{display:block;border:0;background:transparent;color:inherit;font:inherit;padding:4px;cursor:pointer}
  `;
  document.head.append(style);
  const toggle=document.createElement('button');toggle.id='chapter-fixture-toggle';toggle.type='button';toggle.setAttribute('aria-pressed','false');
  const rebuild=document.createElement('button');rebuild.id='chapter-fixture-rebuild';rebuild.type='button';rebuild.textContent='重建章节面板';
  const run=document.createElement('button');run.id='chapter-tests';run.type='button';run.textContent='章节面板自检';
  const output=document.createElement('output');output.id='chapter-results';output.setAttribute('aria-live','polite');
  checks.append(toggle,rebuild,run,output);
  let panel,activeIndex=0,shown=false;
  const chapters=[['极光漫游 · 开场','00:00','thumb-mountain.svg'],['进入深蓝海域','00:24','thumb-city.svg'],['落日染红沙丘','01:05','thumb-desert.svg'],['向远处的山脉出发','01:48','thumb-mountain.svg'],['城市灯光渐次亮起','02:32','thumb-city.svg'],['收尾 · 光随影动','03:18','thumb-desert.svg']];
  const body=()=>panel.querySelector('.bpx-player-viewpoint-body');
  const items=()=>[...panel.querySelectorAll('.bpx-player-viewpoint-menu-item')];
  const popover=()=>panel.querySelector('.chapter-popover');
  const menuToggle=()=>panel.querySelector('.chapter-menu-toggle');
  function setVisible(visible){
    shown=Boolean(visible);panel.hidden=!shown;toggle.setAttribute('aria-pressed',String(shown));
    toggle.textContent=shown?'隐藏章节面板样本':'显示章节面板样本';
    if(!shown){popover().hidden=true;menuToggle().setAttribute('aria-expanded','false');}
  }
  function select(index){
    activeIndex=index;
    items().forEach((item,i)=>{item.classList.toggle('bpx-state-active',i===index);item.setAttribute('aria-current',String(i===index));});
    panel.dataset.selectedChapter=String(index);
  }
  function build(){
    const next=document.createElement('div');next.className='bpx-player-viewpoint';next.dataset.chapterFixture='';
    next.innerHTML=`<div class="bpx-player-viewpoint-header"><span>视频看点 · 章节</span><div class="bpx-player-viewpoint-header-actions"><button type="button" class="chapter-menu-toggle" aria-label="章节选项" aria-expanded="false" aria-haspopup="menu">⋯</button><button type="button" class="bpx-player-viewpoint-header-close" aria-label="关闭章节面板">×</button></div><div class="chapter-popover" role="menu" hidden><button type="button" role="menuitem">顺序播放 · 保留菜单底色</button></div></div><div class="bpx-player-viewpoint-body"><div class="bpx-player-viewpoint-menu">${chapters.map(([title,time,image],index)=>`<div class="bpx-player-viewpoint-menu-item" role="button" tabindex="0" data-chapter="${index}"><div class="bpx-player-viewpoint-menu-item-cover"><img src="${image}" alt="${title}章节缩略图"></div><div class="bpx-player-viewpoint-menu-item-info"><div class="bpx-player-viewpoint-menu-item-content"><i class="bpx-player-viewpoint-menu-item-active" aria-hidden="true"></i><span>${title}</span></div><div class="bpx-player-viewpoint-menu-item-time">${time}</div></div></div>`).join('')}</div></div>`;
    if(panel)panel.replaceWith(next);else host.append(next);panel=next;
    items().forEach((item,index)=>{
      item.addEventListener('click',()=>select(index));
      item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(index);}});
    });
    panel.querySelector('.bpx-player-viewpoint-header-close').addEventListener('click',()=>setVisible(false));
    menuToggle().addEventListener('click',()=>{popover().hidden=!popover().hidden;menuToggle().setAttribute('aria-expanded',String(!popover().hidden));});
    popover().querySelector('button').addEventListener('click',()=>{popover().dataset.activations=String(Number(popover().dataset.activations||0)+1);});
    select(activeIndex);setVisible(shown);return panel;
  }
  build();setVisible(new URLSearchParams(location.search).get('chapters')==='1');
  toggle.addEventListener('click',()=>setVisible(!shown));rebuild.addEventListener('click',build);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function until(test){for(let i=0;i<60;i++){if(test())return;await wait(60);}throw new Error('章节面板状态未按预期更新');}
  const clear=element=>getComputedStyle(element).backgroundColor==='rgba(0, 0, 0, 0)';
  const surfaces=()=>[panel,body()];
  const active=()=>document.documentElement.hasAttribute('data-biliglow-active');
  const textAndImages=()=>[...panel.querySelectorAll('img,.bpx-player-viewpoint-menu-item-content,.bpx-player-viewpoint-menu-item-time,.bpx-player-viewpoint-header-close')];
  const noFade=element=>{
    for(let node=element;node&&node!==host.parentElement;node=node.parentElement){const s=getComputedStyle(node);if(s.opacity!=='1'||s.filter!=='none')return false;}
    return true;
  };
  const visibleIndicator=()=>{
    const element=panel.querySelector('.bpx-state-active .bpx-player-viewpoint-menu-item-active'),s=getComputedStyle(element);
    return s.display!=='none'&&s.backgroundImage!=='none'&&parseFloat(s.width)>0&&parseFloat(s.height)>0&&noFade(element);
  };
  async function runChecks(){
    const original=await B.storage.get();
    if(!B.isActive(original)){output.textContent='请先在设置中同意并开启氛围光';return;}
    const before={shown,index:activeIndex,scroll:body().scrollTop,menu:!popover().hidden,screen:$('#player').dataset.screen,scrollX,scrollY};
    const results=[],check=(passed,label)=>{results.push({passed:Boolean(passed),label});output.textContent=results.map(result=>`${result.passed?'✓':'✗'} ${result.label}`).join('\n');};
    run.disabled=true;output.dataset.state='running';delete output.dataset.passed;
    try{
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
      if($('#player').dataset.screen==='wide')$('#theater').click();
      setVisible(true);select(0);popover().hidden=true;body().scrollTop=0;
      await B.storage.set({enabled:false});await until(()=>!active());
      const nativeBackgrounds=surfaces().map(element=>getComputedStyle(element).backgroundColor);
      const nativeContent=textAndImages().map(element=>{const s=getComputedStyle(element);return {color:s.color,opacity:s.opacity,filter:s.filter};});
      const nativeIndicator=getComputedStyle(panel.querySelector('.bpx-player-viewpoint-menu-item-active')).backgroundImage;
      check(panel.parentElement===host&&nativeBackgrounds.every(color=>color==='rgb(28, 36, 50)'),'章节面板是 docker-minor 的直接子级，面板与 body 均复现原生实心底色');
      await B.storage.set({enabled:true,dark:true});await until(active);
      check(surfaces().every(clear)&&document.documentElement.hasAttribute('data-biliglow-dark'),'深色模式仅章节面板与 body 底色清为透明');
      check(textAndImages().every((element,index)=>{const s=getComputedStyle(element),native=nativeContent[index];return noFade(element)&&s.color===native.color&&s.opacity===native.opacity&&s.filter===native.filter;}),'缩略图、标题、时间与关闭按钮保持原色且无整体淡化或前景模糊');
      check(visibleIndicator()&&getComputedStyle(panel.querySelector('.bpx-state-active .bpx-player-viewpoint-menu-item-content')).color==='rgb(0, 174, 236)'&&getComputedStyle(panel.querySelector('.bpx-player-viewpoint-menu-item-active')).backgroundImage===nativeIndicator,'当前章节保留蓝色标题与 background-image 播放标记');
      await until(()=>[...panel.querySelectorAll('img')].every(image=>image.complete&&image.naturalWidth>0));
      check([...panel.querySelectorAll('img')].every(image=>image.getAttribute('src')===chapters[Number(image.closest('[data-chapter]').dataset.chapter)][2]&&getComputedStyle(image).objectFit==='cover'),'全部章节缩略图正常加载，源图和 cover 裁切保持原样');
      items()[1].click();
      check(activeIndex===1&&items().filter(item=>item.classList.contains('bpx-state-active')).length===1&&items()[1].getAttribute('aria-current')==='true'&&visibleIndicator(),'点击下一章节只更新一个高亮项，播放标记跟随选中项');
      body().scrollTop=100;await wait(60);
      check(body().scrollHeight>body().clientHeight&&body().scrollTop===100,'章节列表仍独立滚动，不因清背景失去溢出滚动');
      body().scrollTop=0;
      items()[2].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      check(activeIndex===2&&visibleIndicator(),'键盘 Enter 仍可选择章节并更新高亮');
      menuToggle().click();const menu=popover(),nativeMenu=getComputedStyle(menu).backgroundColor;
      menu.querySelector('button').click();
      check(!menu.hidden&&nativeMenu==='rgb(28, 36, 50)'&&getComputedStyle(menu).opacity==='1'&&menu.dataset.activations==='1','独立弹出菜单保持不透明底色，菜单点击处理正常');
      menuToggle().click();
      panel.querySelector('.bpx-player-viewpoint-header-close').click();
      check(panel.hidden&&toggle.getAttribute('aria-pressed')==='false','关闭按钮仍可隐藏面板并同步样本开关');toggle.click();
      check(!panel.hidden&&toggle.getAttribute('aria-pressed')==='true','样本开关可再次打开章节面板');
      await B.storage.set({dark:false});await until(()=>!document.documentElement.hasAttribute('data-biliglow-dark'));
      check(surfaces().every(clear)&&textAndImages().every(noFade)&&visibleIndicator(),'浅色模式面板继续透明，图片文字和选中标记保持完整');
      const oldPanel=panel;rebuild.click();
      check(oldPanel!==panel&&panel.parentElement===host&&surfaces().every(clear)&&activeIndex===2&&visibleIndicator(),'异步式重建使用同一原生结构，透明背景与选中标记自动继续生效');
      await B.storage.set({enabled:false});await until(()=>!active());
      check(surfaces().every((element,index)=>getComputedStyle(element).backgroundColor===nativeBackgrounds[index])&&getComputedStyle(popover()).backgroundColor===nativeMenu,'关闭氛围光恢复章节原生面板底色，独立菜单底色不变');
      await B.storage.set({enabled:true,dark:true});await until(active);
      check(surfaces().every(clear)&&visibleIndicator(),'重新开启恢复透明面板与原生播放标记');
      await B.storage.set({privacyAccepted:false});await until(()=>!active());
      check(surfaces().every((element,index)=>getComputedStyle(element).backgroundColor===nativeBackgrounds[index]),'撤回同意立即恢复章节原生背景');
    }catch(error){check(false,error.message);}
    finally{
      select(before.index);setVisible(before.shown);body().scrollTop=before.scroll;popover().hidden=!before.menu;menuToggle().setAttribute('aria-expanded',String(before.menu));
      await B.storage.set(original);
      if(before.screen==='wide'&&$('#player').dataset.screen!=='wide')$('#theater').click();
      else if(before.screen==='web')$('#web-fullscreen').click();
      window.scrollTo({left:before.scrollX,top:before.scrollY,behavior:'instant'});
      run.disabled=false;output.dataset.state='complete';output.dataset.passed=String(results.length>0&&results.every(result=>result.passed));
      output.dataset.total=String(results.length);output.dataset.failed=String(results.filter(result=>!result.passed).length);output.dataset.results=JSON.stringify(results);
    }
    return results;
  }
  run.addEventListener('click',runChecks);window.chapterFixture={setVisible,rebuild:build,runChecks};
})();
