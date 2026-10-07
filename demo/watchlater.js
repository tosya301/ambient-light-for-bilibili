'use strict';
// Run the real route classifier against the production hostname, since the
// ordinary localhost demo intentionally allows every local path. This shim is
// fixture-only; neither production player selection nor rendering is replaced.
const watchlaterAdapter=BiliGlowPlayer;
globalThis.BiliGlowPlayer=Object.freeze({...watchlaterAdapter,pageKind:route=>watchlaterAdapter.pageKind({
  hostname:'www.bilibili.com',pathname:route.pathname==='/demo/watchlater.html'?'/list/watchlater/':route.pathname
})});
const watchlaterFixtures=document.createElement('section');
watchlaterFixtures.className='watchlater-comment';
watchlaterFixtures.innerHTML=`<bili-comments></bili-comments><div class="watchlater-fixtures"><button id="watchlater-rebuild">重建评论</button><label>视频内边框 <select id="bar-fixture"><option value="none">无边框</option><option value="textured-vertical">纹理画面与左右黑边</option></select></label><button id="queue-menu-toggle">列表菜单样本</button></div>`;
document.querySelector('.swatches').after(watchlaterFixtures);
customElements.define('bili-comment-box',class extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>#editor{background:var(--bg3,#f1f2f3);padding:12px;border-radius:5px;font-size:13px}#emoji-popover{background:var(--bg1_float,#fff);padding:8px}</style><div id="editor" contenteditable="true" role="textbox" aria-label="稍后再看评论输入框">本地评论结构复现</div><div id="emoji-popover" hidden>表情菜单保留底色</div>';}
});
customElements.define('bili-comment-thread-renderer',class extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>#div{padding:12px 0;font-size:12px;color:var(--text3,#666);border-bottom:1px solid #000}</style><div id="div">示例评论 · 分割线跟随页面主题</div>';}
});
customElements.define('bili-comments-header-renderer',class extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>#commentbox{padding:12px}</style><div id="commentbox"><bili-comment-box></bili-comment-box></div>';}
});
customElements.define('bili-comments',class extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<bili-comments-header-renderer></bili-comments-header-renderer><bili-comment-thread-renderer></bili-comment-thread-renderer>';}
});
const commentParts=()=>{const comments=document.querySelector('bili-comments').shadowRoot,header=comments.querySelector('bili-comments-header-renderer').shadowRoot;return {comments,header,box:header.querySelector('bili-comment-box').shadowRoot,thread:comments.querySelector('bili-comment-thread-renderer').shadowRoot};};
document.querySelector('#watchlater-rebuild').addEventListener('click',()=>document.querySelector('bili-comments').replaceWith(document.createElement('bili-comments')));
document.querySelector('#queue-menu-toggle').addEventListener('click',()=>{const menu=document.querySelector('.queue-menu');menu.hidden=!menu.hidden;});
document.querySelectorAll('[data-queue-scene]').forEach((button,index)=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-queue-scene]').forEach(b=>{b.setAttribute('aria-current',String(b===button));b.parentElement.classList.toggle('siglep-active',b===button);});
  document.querySelector(`[data-scene="${button.dataset.queueScene}"]`).click();
  document.querySelector('#queue-count').textContent=`${index+1}/3`;
  history.pushState({},'',`/demo/watchlater.html?bvid=fixture${index+1}&oid=${index+1}&t=0`);
  if(index===1)replace();
}));
document.querySelectorAll('[data-part]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-part]').forEach(b=>b.classList.toggle('multip-list-item-active',b===button));
  document.querySelector(`[data-scene="${button.dataset.part==='2'?'daylight':'sunset'}"]`).click();
  history.pushState({},'',`/demo/watchlater.html?bvid=fixture3&p=${button.dataset.part}`);
}));
document.querySelector('#watchlater-tests').addEventListener('click',async event=>{
  const out=document.querySelector('#watchlater-results'),button=event.currentTarget,original=await BiliGlow.storage.get(),originalURL=location.href,results=[];
  if(!original.privacyAccepted){out.textContent='请先打开氛围光，阅读说明并同意开启。';return;}
  button.disabled=true;delete out.dataset.cropDiagnostic;window.scrollTo({top:0,behavior:'instant'});
  const check=(ok,label)=>{results.push(`${ok?'✓':'✗'} ${label}`);out.textContent=results.join('\n');};
  const clear=e=>getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)';
  const root=()=>document.querySelector('[data-biliglow-root]');
  const cropped=()=>getComputedStyle(document.querySelector('video')).clipPath.startsWith('inset(');
  const settle=async predicate=>{const end=performance.now()+3000;while(!predicate()&&performance.now()<end)await wait(50);return predicate();};
  const queueSurfaces=()=>Array.from(document.querySelectorAll('.action-list-container,.action-list-header,.action-list-body,.action-list-item,.singlep-list-item-inner,.multip-list-item-inner,.multip-list-item-active'));
  try{
    await BiliGlow.storage.set({...BiliGlow.defaults,privacyAccepted:true,spread:400});theater(false);
    check(await settle(()=>root()?.dataset.frames>0),'稍后再看路由启动普通点播渲染');
    check(queueSurfaces().every(clear),'队列外壳、条目和选中分 P 全部透光');
    check(getComputedStyle(document.querySelector('.siglep-active .title')).color===getComputedStyle(document.documentElement).getPropertyValue('--brand_blue').trim().replace('#70c9dd','rgb(112, 201, 221)'),'当前播放项保留高亮');
    check(Array.from(document.querySelectorAll('.action-list img')).every(e=>e.complete&&e.naturalWidth>0&&getComputedStyle(e).opacity==='1'),'队列封面加载正常，保持完整透明度');
    document.querySelector('#queue-menu-toggle').click();check(!clear(document.querySelector('.queue-menu')),'列表操作菜单保留底色');document.querySelector('#queue-menu-toggle').click();
    check(await settle(()=>clear(commentParts().box.querySelector('#editor'))),'复用普通播放页的 Shadow DOM 评论透明样式');
    check(getComputedStyle(commentParts().thread.querySelector('#div')).borderBottomColor===getComputedStyle(document.querySelector('.split-line')).backgroundColor,'评论分割线与播放列表分割线同色');
    check(!clear(commentParts().box.querySelector('#emoji-popover')),'评论表情菜单保留独立底色');
    document.querySelector('#watchlater-rebuild').click();check(await settle(()=>clear(commentParts().box.querySelector('#editor'))),'评论重建后自动恢复透光');
    await BiliGlow.storage.set({dark:false});check(queueSurfaces().every(clear)&&!document.documentElement.hasAttribute('data-biliglow-dark'),'浅色模式队列仍透光');
    await BiliGlow.storage.set({enabled:false});check(!clear(document.querySelector('.action-list-container'))&&!clear(document.querySelector('.multip-list-item-active'))&&!document.documentElement.hasAttribute('data-biliglow-active'),'关闭后队列与选中项恢复原底色');
    await BiliGlow.storage.set({enabled:true,dark:true});
    const beforeVideo=document.querySelector('video');document.querySelector('[data-queue-scene="ocean"]').click();let start=count();
    check(await settle(()=>document.querySelector('video')!==beforeVideo&&count()>start+2&&document.querySelectorAll('[data-biliglow-root]').length===1),'点击下一项，替换播放器后继续投光且只有一个光层');
    const reused=document.querySelector('video');document.querySelector('[data-queue-scene="sunset"]').click();document.querySelector('[data-part="2"]').click();start=count();
    check(await settle(()=>count()>start+2)&&document.querySelector('video')===reused,'同一 video 切换视频和分 P 后持续绘制');
    check(clear(document.querySelector('.multip-list-item-active')),'切换后的分 P 选中项保持透光');
    document.querySelector('#bar-fixture').value='textured-vertical';await BiliGlow.storage.set({removeVerticalBars:true});theater(true);
    const cropReady=await settle(()=>cropped()&&root().dataset.mode==='theater');
    if(!cropReady){const v=document.querySelector('video'),c=getComputedStyle(v);out.dataset.cropDiagnostic=JSON.stringify({state:root().dataset.state,mode:root().dataset.mode,frames:count(),paused:v.paused,ready:v.readyState,time:v.currentTime,objectFit:c.objectFit,objectPosition:c.objectPosition,transform:c.transform,clip:c.clipPath,fixture:document.querySelector('#bar-fixture').value,detected:BiliGlowBars.detect(paint.getImageData(0,0,source.width,source.height),{horizontal:false,vertical:true})});}
    check(cropReady,'稍后再看宽屏复用自动去边');
    theater(false);check(await settle(()=>!cropped()),'返回普通模式还原完整视频画面');document.querySelector('#bar-fixture').value='none';
    history.pushState({},'','/?watchlater-fixture=1');
    check(await settle(()=>!document.documentElement.hasAttribute('data-biliglow-active')&&getComputedStyle(root()).display==='none'),'离开播放路由后清理光效与主题，首页不启用');
    history.pushState({},'','/list/watchlater/?bvid=fixture3&t=46');window.dispatchEvent(new PopStateEvent('popstate'));start=count();
    check(await settle(()=>document.documentElement.hasAttribute('data-biliglow-active')&&count()>start+2),'返回实际 /list/watchlater/ 路径恢复光效');
    await BiliGlow.storage.set({privacyAccepted:false});
    check(await settle(()=>!document.documentElement.hasAttribute('data-biliglow-active')&&!commentParts().box.querySelector('[data-biliglow-comments]')),'撤回同意立即清理光效和评论样式');
  }catch(error){check(false,error.message);}
  finally{
    history.replaceState({},'',originalURL);document.querySelector('#bar-fixture').value='none';theater(false);
    await BiliGlow.storage.set(original);window.dispatchEvent(new PopStateEvent('popstate'));
    document.querySelector('[data-queue-scene="aurora"]').click();
    button.disabled=false;out.dataset.passed=String(results.every(r=>r.startsWith('✓')));
  }
});
