'use strict';
const portraitSource=new URLSearchParams(location.search).has('portrait');
const source=document.createElement('canvas');source.width=portraitSource?540:960;source.height=portraitSource?960:540;
const paint=source.getContext('2d'),player=document.querySelector('#player');
let scene='aurora',removed=null;
const palettes={aurora:['#071c30','#2fcbb0','#9666db'],ocean:['#061c41','#008ed9','#36cae4'],sunset:['#372238','#f9aa5b','#d95464'],daylight:['#bddbed','#fff0e6','#eaa9db']};
function animate(ms){
  // Keep the synthetic scene while exercising an actual 9:16 media stream.
  paint.setTransform(source.width/960,0,0,source.height/540,0,0);
  const t=ms/1000,c=palettes[scene];paint.fillStyle=c[0];paint.fillRect(0,0,960,540);
  for(let i=0;i<4;i++){
    const x=180+i*220+Math.sin(t*.25+i)*140,y=250+Math.cos(t*.3+i)*150;
    const g=paint.createRadialGradient(x,y,0,x,y,500);g.addColorStop(0,c[1+i%2]+'bb');g.addColorStop(.5,c[1+i%2]+'44');g.addColorStop(1,c[0]+'00');paint.fillStyle=g;paint.fillRect(0,0,960,540);
  }
  for(let i=0;i<40;i++){
    paint.beginPath();paint.moveTo(-60,350+i*6);
    for(let x=-60;x<=1020;x+=30)paint.lineTo(x,280+i*6+Math.sin(x/230+t*.45+i*.07)*80+Math.cos(x/500+t*.2)*50);
    paint.strokeStyle=`rgba(208,255,241,${.012+Math.sin(t*.3+i*.1)**2*.026})`;paint.lineWidth=2;paint.stroke();
  }
  for(let i=0;i<75;i++){const x=(Math.sin(i*127)*.5+.5)*960,y=(Math.cos(i*119)*.5+.5)*410;paint.fillStyle=`rgba(232,255,248,${.1+(Math.sin(t+i)*.5+.5)*.35})`;paint.fillRect(x,y,i%3===0?2:1,i%3===0?2:1);}
  const bars=document.querySelector('#bar-fixture')?.value;
  // A deterministic textured source for the watch-later crop integration test.
  // Pale animated gradients may correctly trigger the detector's flat-frame guard.
  if(bars==='textured-vertical'){
    for(let y=0;y<540;y+=30)for(let x=120;x<840;x+=30){paint.fillStyle=(Math.floor(x/30)+Math.floor(y/30))%2?'#37cdb3':'#613586';paint.fillRect(x,y,30,30);}
    paint.fillStyle='#000';paint.fillRect(0,0,120,540);paint.fillRect(840,0,120,540);
  }
  if(bars==='horizontal'||bars==='window'){paint.fillStyle='#000';paint.fillRect(0,0,960,54);paint.fillRect(0,486,960,54);}
  if(bars==='vertical'||bars==='window'||bars==='colored'){paint.fillStyle=bars==='colored'?'#754b77':'#000';paint.fillRect(0,0,120,540);paint.fillStyle=bars==='colored'?'#427c91':'#000';paint.fillRect(840,0,120,540);}
  if(bars==='black'){paint.fillStyle='#000';paint.fillRect(0,0,960,540);}
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
const stream=source.captureStream(30);
function connect(v){v.srcObject=stream;v.muted=true;v.play().catch(()=>{});}
connect(document.querySelector('video'));
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>{
  scene=button.dataset.scene;document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  document.querySelector('.scene-label').textContent=({aurora:'01 / 极光漫游',ocean:'02 / 深蓝时刻',sunset:'03 / 落日余晖',daylight:'04 / 浅色晴空'})[scene];
}));
document.querySelector('#fullscreen').addEventListener('click',()=>player.requestFullscreen().catch(()=>{document.querySelector('#test-results').textContent='浏览器未授予原生全屏请求，可手动点击或使用网页全屏预览。';}));
let previousScreen='normal';
document.querySelector('#web-fullscreen').addEventListener('click',()=>{previousScreen=player.dataset.screen;player.classList.add('web-fullscreen');player.dataset.screen='web';});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){player.classList.remove('web-fullscreen');player.dataset.screen=previousScreen;}});
function theater(on){document.body.classList.toggle('theater',on);player.dataset.screen=on?'wide':'normal';document.querySelector('#theater').textContent=on?'返回小屏':'宽屏模式';}
document.querySelector('#theater').addEventListener('click',()=>theater(player.dataset.screen!=='wide'));
function replace(){const v=document.querySelector('video');if(!v)return;const next=v.cloneNode();next.removeAttribute('src');v.replaceWith(next);connect(next);}
document.querySelector('#replace').addEventListener('click',replace);
document.querySelector('#portrait').addEventListener('click',()=>player.classList.toggle('portrait'));
document.querySelector('#letterbox').addEventListener('click',()=>player.classList.toggle('letterbox'));
document.querySelector('#remove').addEventListener('click',()=>{const v=document.querySelector('video');if(v){removed=v;v.remove();}else if(removed){player.querySelector('.bpx-player-video-area').prepend(removed);connect(removed);removed=null;}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const count=()=>Number(document.querySelector('[data-biliglow-root]')?.dataset.frames||0);
document.querySelector('#run-tests').addEventListener('click',async event=>{
  window.scrollTo({top:0,behavior:'instant'});
  const out=document.querySelector('#test-results'),button=event.currentTarget;button.disabled=true;const original=await BiliGlow.storage.get();const results=[];
  const check=(ok,text)=>{results.push(`${ok?'✓':'✗'} ${text}`);out.textContent=results.join('\n');};
  if(!original.privacyAccepted){out.textContent='请先打开氛围光设置，阅读说明并点击同意开启，再运行自检。';button.disabled=false;out.dataset.passed='false';return;}
  try{
    await BiliGlow.storage.set({...BiliGlow.defaults,privacyAccepted:original.privacyAccepted});player.classList.remove('portrait');
    theater(false);
    const playlistFixture=Boolean(document.querySelector('.playlist-app'));
    const largeSurfaces=['.bili-header__bar',playlistFixture?'.video-info-container':'#viewbox_report',playlistFixture?'.playlist-container--right':'.right-container',playlistFixture?'#playlistToolbar':'#arc_toolbar_report','.bpx-player-sending-area','.bpx-player-sending-bar','.bpx-player-video-info','.bpx-player-dm-root','.bpx-player-dm-input'];
    const alpha=el=>{const c=getComputedStyle(el).backgroundColor;return c.startsWith('rgba')?Number(c.split(',').pop().replace(')','')):1;};
    const playerSurfaces=['#bilibili-player-placeholder','#bilibili-player-placeholder-top','#bilibili-player-placeholder-bottom','#bilibili-player-placeholder-bottom-left','#bilibili-player-placeholder-bottom-right','.bpx-player-video-inputbar','.bui-button-blue'];
    const listSurfaces=['.danmaku-wrap','.bpx-docker-minor','.bpx-player-auxiliary','.bpx-player-collapse','.bui-collapse-header','.bui-collapse-body','.bpx-player-dm-management','.bpx-player-dm-function','.bpx-player-auxiliary .bpx-player-dm-wrap'];
    check(playerSurfaces.every(selector=>alpha(document.querySelector(selector))===0),'弹幕输入框、发送按钮和背后的占位底板全部透明');
    check(getComputedStyle(player).boxShadow==='none'&&getComputedStyle(document.querySelector('#bilibili-player-placeholder')).boxShadow==='none','实际播放器与占位播放器都没有外框阴影');
    const line=getComputedStyle(document.querySelector('.bpx-player-sending-area'),'::before');
    check(line.backgroundColor==='rgba(0, 0, 0, 0)','弹幕栏原生伪元素分隔线不再形成亮边');
    document.querySelector('.bui-collapse-wrap').open=true;
    check(listSurfaces.every(selector=>alpha(document.querySelector(selector))===0),'弹幕列表外层、标题及展开内容均透明');
    document.querySelector('.bui-collapse-wrap').open=false;
    check(largeSurfaces.every(selector=>alpha(document.querySelector(selector))===0),'导航、标题、推荐栏及嵌套弹幕区全部零底色');
    check(alpha(document.querySelector('#nav-searchform'))<=.1&&alpha(document.querySelector('.nav-search-content'))===0&&alpha(document.querySelector('.nav-search-input'))===0,'搜索框仅一层 10% 透光底，内部无实心底');
    check(getComputedStyle(document.querySelector(playlistFixture?'.playlist-container--right':'.right-container')).opacity==='1'&&getComputedStyle(document.querySelector('#protected-thumbnail')).opacity==='1','推荐栏及缩略图未通过整体透明度淡化');
    await BiliGlow.storage.set({dark:false});
    check(largeSurfaces.every(selector=>alpha(document.querySelector(selector))===0),'关闭深色背景后仍保持面板真正透明');
    await BiliGlow.storage.set({enabled:false});
    check(largeSurfaces.every(selector=>alpha(document.querySelector(selector))===1),'关闭光效后恢复原有页面底色');
    check(alpha(document.querySelector('#bilibili-player-placeholder-bottom'))===1&&alpha(document.querySelector('.bpx-docker-minor'))===1&&getComputedStyle(player).boxShadow!=='none','关闭光效恢复原生占位底板、列表底色和播放器阴影');
    await BiliGlow.storage.set({...BiliGlow.defaults,privacyAccepted:original.privacyAccepted});
    if(removed){player.querySelector('.bpx-player-video-area').prepend(removed);connect(removed);removed=null;}
    await document.querySelector('video').play();await wait(1250);let start=count();await wait(700);
    check(count()>start+3,'播放时持续更新视频光色');
    document.querySelector('video').pause();await wait(200);start=count();await wait(1150);
    check(count()===start,'暂停后停止绘制，保留光色');
    const root=document.querySelector('[data-biliglow-root]');
    check(root.parentNode===document.body&&getComputedStyle(root).zIndex==='-1'&&getComputedStyle(document.body).isolation==='isolate','光层位于页面内容下方');
    theater(true);await wait(250);
    const glow=root.shadowRoot.querySelector('canvas');
    const gr=glow.getBoundingClientRect();
    check(root.dataset.mode==='theater'&&gr.left<0&&gr.right>innerWidth,'宽屏自动扩散到视口两侧');
    check(playerSurfaces.every(selector=>alpha(document.querySelector(selector))===0),'宽屏左侧占位底板也保持透明');
    await BiliGlow.storage.set({spread:400});await wait(200);
    const coversViewport=()=>{const g=glow.getBoundingClientRect(),blur=Number(glow.style.filter.match(/blur\(([\d.]+)px\)/)[1]);return g.left<=-blur*3&&g.top<=-blur*3&&g.right>=innerWidth+blur*3&&g.bottom>=innerHeight+blur*3;};
    check(coversViewport()&&(await BiliGlow.storage.get()).spread===400,'400% 宽屏覆盖窗口四边，并为模糊留出足够外沿');
    theater(false);await wait(250);
    check(coversViewport(),'400% 小屏也覆盖右侧推荐栏和窗口四角');
    check(root.dataset.mode==='normal'&&!document.querySelector('[data-biliglow-stage]'),'切回小屏恢复光效范围');
    player.classList.add('letterbox');await wait(250);
    const vrect=document.querySelector('video').getBoundingClientRect();
    const imageRect=BiliGlow.contentRect(vrect,960,540);
    check(vrect.width-imageRect.width>1&&alpha(document.querySelector('.bpx-player-video-area'))===0&&getComputedStyle(document.querySelector('video')).objectFit==='contain','复现宽屏比例留白：黑底透明，画面保持比例且未裁切');
    await BiliGlow.storage.set({enabled:false});
    check(alpha(document.querySelector('.bpx-player-video-area'))===1,'关闭氛围光恢复原生播放器黑底');
    await BiliGlow.storage.set({enabled:true});player.classList.remove('letterbox');
    const preserved=player.dataset.screen;player.classList.add('web-fullscreen');player.dataset.screen='web';await wait(250);
    check(root.parentNode===player&&player.hasAttribute('data-biliglow-stage'),'网页全屏光层进入播放器底层');
    check(coversViewport(),'400% 网页全屏同样覆盖窗口外沿');
    await BiliGlow.storage.set({enabled:false});await wait(150);
    check(getComputedStyle(root).display==='none'&&!document.documentElement.hasAttribute('data-biliglow-dark')&&!document.documentElement.hasAttribute('data-biliglow-active')&&!document.querySelector('[data-biliglow-stage]'),'关闭后清理全屏宿主、光层和背景样式');
    player.classList.remove('web-fullscreen');player.dataset.screen=preserved;
    await BiliGlow.storage.set({enabled:true});await document.querySelector('video').play();await wait(250);start=count();await wait(500);
    check(count()>start,'重新开启后恢复绘制');
    replace();await wait(1300);start=count();await wait(500);
    check(count()>start&&document.querySelectorAll('[data-biliglow-root]').length===1,'替换播放器后重绑，只有一个光层');
    const v=document.querySelector('video');v.remove();await wait(1200);
    check(getComputedStyle(document.querySelector('[data-biliglow-root]')).display==='none'&&!document.documentElement.hasAttribute('data-biliglow-dark'),'播放器移除后清理光效和主题');player.querySelector('.bpx-player-video-area').prepend(v);connect(v);await wait(1300);
    check(getComputedStyle(document.querySelector('[data-biliglow-root]')).display!=='none','播放器恢复后重新生效');
    await BiliGlow.storage.set({fps:8});await wait(300);start=count();await wait(1000);const delta=count()-start;
    check(delta>=4&&delta<=10,`帧率限制生效（8 fps 设置 / 1 秒绘制 ${delta} 次）`);
  }catch(error){check(false,error.message);}
  finally{await BiliGlow.storage.set(original);button.disabled=false;out.dataset.passed=String(results.every(r=>r.startsWith('✓')));}
});
document.querySelector('#cross-origin').addEventListener('click',async()=>{
  const out=document.querySelector('#cors-results');
  if(!(await BiliGlow.storage.get()).privacyAccepted){out.textContent='请先在氛围光设置中阅读说明并同意开启。';return;}
  const v=document.querySelector('video');
  if(!v){out.textContent='请先恢复播放器';return;}
  try{
    v.srcObject=null;v.removeAttribute('crossorigin');v.src=new URL('/demo/test-colors.mp4',location.href.replace(location.hostname,location.hostname==='localhost'?'127.0.0.1':'localhost')).href;v.loop=true;
    await v.play();await wait(1400);const before=count();await wait(500);
    let tainted=false;
    try{document.querySelector('[data-biliglow-root]').shadowRoot.querySelector('canvas').getContext('2d').getImageData(0,0,1,1);}catch(e){tainted=e.name==='SecurityError';}
    out.textContent=tainted&&count()>before?'✓ 无 CORS 视频可持续绘制；读回被浏览器正确禁止':'✗ 跨域测试未达到预期，请从 127.0.0.1 打开演示';
    out.dataset.passed=String(tainted&&count()>before);
  }catch(error){out.textContent='✗ '+error.message;}
});

const episodeList=document.querySelector('.video-pod__list');
document.querySelector('.view-mode')?.addEventListener('click',()=>{
  const grid=episodeList.classList.toggle('grid');episodeList.classList.toggle('list',!grid);
  episodeList.querySelectorAll('.video-pod__item').forEach(item=>{item.classList.toggle('page',grid);item.classList.toggle('normal',!grid);item.classList.toggle('simple-base-item',!grid);});
});
episodeList?.querySelectorAll('.video-pod__item').forEach((item,index)=>item.addEventListener('click',()=>{
  episodeList.querySelectorAll('.video-pod__item').forEach(row=>{row.classList.toggle('active',row===item);row.setAttribute('aria-current',String(row===item));row.querySelector('.playing-gif').hidden=row!==item;});
  document.querySelector(`[data-scene="${index?'ocean':'aurora'}"]`).click();
}));
