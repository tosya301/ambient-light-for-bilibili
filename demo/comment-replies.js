'use strict';
// Observed in bili-comments.2b3a21ab39.js (2026-10-21). Only the local data and
// request completion are simulated; the overlay geometry/background are native.
// The optional footer theme below reproduces the reported opaque collapsed row.
customElements.define('bili-comments-spinner',class extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>#spinner{display:flex;align-items:center;gap:8px;color:var(--text3);font-size:14px}i{color:#00aeec;font-style:normal}</style><div id="spinner"><i>◌</i>正在玩命加载…</div>';}
});
customElements.define('bili-comment-box',class extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>#editor{background:var(--bg1);border:1px solid #aaa;padding:8px}#menu{background:var(--bg1);padding:8px}</style><div id="editor" contenteditable="true" role="textbox" aria-label="本地回复框">回复输入框</div><div id="menu" hidden>表情菜单</div>';}
});
customElements.define('bili-comment-reply-renderer',class extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>:host{display:block}#body{padding:10px 0;min-height:40px}.spotlight{background:#00aeec22}small{color:var(--text3)}button{color:inherit;background:transparent;border:0;cursor:pointer}</style><div id="body"><span>本地用户 · </span><slot></slot><br><small>10-21　<button>回复</button></small></div>';}
});
customElements.define('bili-comment-renderer',class extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>#body.light #tags>.tag{background:var(--bili-comment-tag-bg-light);color:var(--bili-comment-tag-color-light)}.tag{display:inline-block;font-size:12px;line-height:12px;padding:6px;border-radius:2px}#pubdate{font-size:13px;line-height:1.5;color:var(--text3)}</style><div id="body" class="light"><strong>主评论</strong><p>点开单条评论下的更多回复，再切换回复页。</p><div id="pubdate">2026-11-05 10:00</div><div id="tags"><div class="tag" style="--bili-comment-tag-color-light:#757575;--bili-comment-tag-color-dark:#939393;--bili-comment-tag-bg-light:#F4F4F4;--bili-comment-tag-bg-dark:#1E1E1E;">UP主觉得很赞</div><div class="tag"></div></div></div>';}
});
customElements.define('bili-comment-replies-renderer',class extends HTMLElement{
  constructor(){
    super();this.attachShadow({mode:'open'}).innerHTML=`<style>
      #expander{padding-left:80px;margin-top:2px}#expander-contents{position:relative}
      #spinner{position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(var(--bg1_rgb),0.85);display:flex;align-items:center;justify-content:center}
      #view-more{font-size:13px;color:var(--text3)}#pagination{display:flex;align-items:center;font-size:13px;color:var(--text1)}
      :host([data-opaque-footer]) #expander-footer,:host([data-opaque-footer]) #view-more{background:var(--reply-footer-bg,#10141d)}
      #menu{background:var(--bg1);padding:8px}
      button{border:0;background:transparent;color:inherit;cursor:pointer;padding:4px 8px}
    </style><div id="expander"><div id="expander-contents"><div id="expander-footer"></div></div></div>`;
    this.page=0;this.renderRows(0);
  }
  get contents(){return this.shadowRoot.querySelector('#expander-contents');}
  renderRows(page){
    this.page=page;this.contents.querySelectorAll('bili-comment-reply-renderer').forEach(e=>e.remove());
    const footer=this.shadowRoot.querySelector('#expander-footer');
    for(let i=0;i<(page?4:2);i++){
      const row=document.createElement('bili-comment-reply-renderer');
      row.textContent=`第 ${page||1} 页回复 ${i+1}：用于检查加载时文字是否重叠。`;
      footer.before(row);
    }
    footer.innerHTML=page?'<div id="pagination">共 2 页　<button data-page="1">1</button><button data-page="2">2</button><button data-page="2">下一页</button><button data-collapse>收起</button></div>':'<div id="view-more">共15条回复，<button data-page="1">点击查看</button></div>';
    footer.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>this.start(Number(b.dataset.page)));
    const collapse=footer.querySelector('[data-collapse]');if(collapse)collapse.onclick=()=>this.renderRows(0);
  }
  start(page=2){
    if(this.shadowRoot.querySelector('#spinner'))return;
    this.pendingPage=page;const spinner=document.createElement('div');spinner.id='spinner';
    spinner.innerHTML='<bili-comments-spinner></bili-comments-spinner>';
    this.shadowRoot.querySelector('#expander-footer').before(spinner);
  }
  finish(success=true){
    this.shadowRoot.querySelector('#spinner')?.remove();
    if(success)this.renderRows(this.pendingPage||1);
  }
});
customElements.define('bili-comment-thread-renderer',class extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>#div{border-bottom:1px solid #ccc;padding-bottom:20px}</style><div id="div"><bili-comment-renderer></bili-comment-renderer><bili-comment-replies-renderer></bili-comment-replies-renderer></div>';}
});
customElements.define('bili-comments',class extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<bili-comment-thread-renderer></bili-comment-thread-renderer>';}
});
const replyHost=()=>document.querySelector('bili-comments').shadowRoot.querySelector('bili-comment-thread-renderer').shadowRoot.querySelector('bili-comment-replies-renderer');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const settled=async()=>{await Promise.resolve();};
const waitUntil=async predicate=>{for(let i=0;i<40;i++){if(predicate())return;await delay(100);}throw new Error('等待生产样式同步超时');};
const active=()=>replyHost().hasAttribute('data-biliglow-comments-active');
const localSettings=patch=>BiliGlow.storage.set(patch);
const startFixture=async()=>{await localSettings({privacyAccepted:true,enabled:true,dark:true,hideLauncher:true});await waitUntil(active);};
document.querySelector('#load').onclick=()=>replyHost().start(2);
document.querySelector('#finish').onclick=()=>replyHost().finish();
document.querySelector('#fail').onclick=()=>replyHost().finish(false);
document.querySelector('#enabled').onclick=async()=>{const s=await BiliGlow.storage.get();await localSettings({enabled:!s.enabled});};
document.querySelector('#dark').onclick=async()=>{const s=await BiliGlow.storage.get();await localSettings({dark:!s.dark});};
document.querySelector('#run').onclick=async()=>{
  const out=document.querySelector('#results'),results=[];
  out.dataset.status='running';out.textContent='运行中';
  const check=(pass,name,details={})=>{results.push({name,pass:Boolean(pass),details});out.textContent=results.map(r=>`${r.pass?'✓':'✗'} ${r.name}`).join('\n');};
  const root=()=>replyHost().shadowRoot;
  const spinner=()=>root().querySelector('#expander-contents > #spinner');
  const rows=()=>[...root().querySelectorAll('bili-comment-reply-renderer')];
  const visibility=state=>[...rows(),root().querySelector('#expander-footer')].every(e=>getComputedStyle(e).visibility===state);
  const height=()=>replyHost().contents.getBoundingClientRect().height;
  const background=()=>getComputedStyle(spinner()).backgroundColor;
  const tag=()=>document.querySelector('bili-comments').shadowRoot.querySelector('bili-comment-thread-renderer').shadowRoot.querySelector('bili-comment-renderer').shadowRoot.querySelector('#tags > .tag');
  const tagPalette=(background,color)=>{const style=getComputedStyle(tag());return style.backgroundColor===background&&style.color===color;};
  const likeDate=()=>{const t=tag(),date=t.getRootNode().querySelector('#pubdate'),s=getComputedStyle(t),d=getComputedStyle(date);return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.color===d.color&&s.fontSize===d.fontSize&&s.lineHeight===d.lineHeight&&s.padding==='0px'&&Math.abs(t.getBoundingClientRect().left-date.getBoundingClientRect().left)<.1;};
  const footerClear=()=>['#expander-footer','#view-more'].every(selector=>getComputedStyle(root().querySelector(selector)).backgroundColor==='rgba(0, 0, 0, 0)');
  const setFooterTheme=dark=>{
    replyHost().setAttribute('data-opaque-footer','');
    replyHost().style.setProperty('--reply-footer-bg',dark?'#10141d':'#f1f2f3');
  };
  try{
    await startFixture();replyHost().finish(false);replyHost().renderRows(0);
    check(active(),'生产脚本同步至嵌套 Shadow DOM');
    check(likeDate(),'深色模式：UP主标签无底色，与日期的颜色、字号和左边缘一致');
    const placeholder=tag().nextElementSibling;
    check(getComputedStyle(placeholder).backgroundColor==='rgba(0, 0, 0, 0)','空标签占位保持透明，不出现多余方块');
    placeholder.style.cssText=tag().style.cssText;placeholder.textContent='动态标签';await settled();
    check(getComputedStyle(placeholder).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(placeholder).color===getComputedStyle(tag()).color,'动态标签同样无底色，保持与日期一致的文字颜色');
    // The native light palette itself paints a background, even on an empty tag.
    // Remove that native fill so this check isolates our tag selector.
    placeholder.style.removeProperty('--bili-comment-tag-bg-light');
    placeholder.textContent='';await settled();
    check(getComputedStyle(placeholder).backgroundColor==='rgba(0, 0, 0, 0)','标签清空后即使保留暗色变量也不出现方块');
    placeholder.removeAttribute('style');
    setFooterTheme(true);
    const themedHeight=height(),viewMore=root().querySelector('#view-more');
    const menu=document.createElement('div');menu.id='menu';menu.textContent='主题菜单';root().querySelector('#expander-footer').append(menu);
    check(footerClear(),'折叠回复：深色主题外层和点击查看栏均透明');
    check(getComputedStyle(menu).backgroundColor!=='rgba(0, 0, 0, 0)','仅清理折叠栏，内部菜单保留底色');
    menu.remove();
    check(height()===themedHeight&&getComputedStyle(viewMore).visibility==='visible','折叠回复：文字可见，原有栏高不变');
    await localSettings({enabled:false});await settled();
    check(['#expander-footer','#view-more'].every(selector=>getComputedStyle(root().querySelector(selector)).backgroundColor==='rgb(16, 20, 29)'),'关闭光效：折叠栏恢复站点主题背景');
    check(tagPalette('rgb(244, 244, 244)','rgb(117, 117, 117)'),'关闭扩展：UP主标签恢复站点原样');
    await localSettings({enabled:true,dark:false});await waitUntil(active);setFooterTheme(false);
    check(footerClear(),'折叠回复：浅色主题同样透明');
    check(likeDate(),'浅色模式：UP主标签同样透明并与日期一致');
    await localSettings({privacyAccepted:false});await settled();
    check(getComputedStyle(root().querySelector('#view-more')).backgroundColor==='rgb(241, 242, 243)','撤回同意：折叠栏恢复站点背景');
    await localSettings({privacyAccepted:true,dark:true});await waitUntil(active);setFooterTheme(true);
    check(likeDate(),'重新启用深色：UP主标签保持透明并与日期一致');
    root().querySelector('[data-page]').focus();
    check(root().activeElement===root().querySelector('[data-page]'),'折叠回复：点击查看仍可键盘聚焦');
    const collapsedHeight=height();root().querySelector('[data-page]').click();await settled();
    check(background()==='rgba(0, 0, 0, 0)'&&visibility('hidden'),'首次展开：白底消失，旧回复和控件暂时隐藏');
    check(height()===collapsedHeight&&getComputedStyle(spinner()).visibility==='visible','首次展开：保留原高度和加载提示');
    replyHost().finish();await settled();check(rows().length===4&&visibility('visible')&&!spinner(),'加载成功：完整回复和分页恢复');
    const expandedHeight=height();root().querySelector('[data-page="2"]').click();await settled();
    check(background()==='rgba(0, 0, 0, 0)'&&visibility('hidden')&&height()===expandedHeight,'翻页：不闪白，不重叠，不收缩');
    const r=spinner().getBoundingClientRect();
    check(replyHost().shadowRoot.elementFromPoint(r.left+4,r.top+4)===spinner()&&getComputedStyle(spinner()).pointerEvents==='auto','透明遮罩仍阻挡旧回复点击');
    const oldButton=rows()[0].shadowRoot.querySelector('button');oldButton.focus();
    check(rows()[0].shadowRoot.activeElement!==oldButton,'加载时旧回复按钮不可键盘聚焦');
    replyHost().finish(false);await settled();check(visibility('visible')&&!spinner()&&height()===expandedHeight,'加载失败：旧回复和分页恢复');
    replyHost().start(2);await localSettings({dark:false});await settled();
    check(background()==='rgba(0, 0, 0, 0)'&&visibility('hidden'),'浅色模式同样移除加载白底');
    await localSettings({enabled:false});await settled();
    check(background()==='rgba(255, 255, 255, 0.85)'&&visibility('visible')&&!root().querySelector('[data-biliglow-comments]'),'关闭光效：原生遮罩和回复可见性恢复');
    rows()[0].style.visibility='hidden';rows()[1].style.visibility='visible';
    check(getComputedStyle(rows()[0]).visibility==='hidden'&&getComputedStyle(rows()[1]).visibility==='visible','关闭时仍尊重站点原有逐条回复可见性');
    rows().forEach(row=>row.style.removeProperty('visibility'));
    await localSettings({enabled:true,dark:true});await waitUntil(active);
    check(background()==='rgba(0, 0, 0, 0)'&&visibility('hidden'),'加载途中重新开启立即恢复透明');
    await localSettings({privacyAccepted:false});await settled();
    check(background()==='rgba(255, 255, 255, 0.85)'&&visibility('visible')&&!active(),'撤回同意：恢复原生状态');
    await localSettings({privacyAccepted:true});await waitUntil(active);replyHost().finish();await settled();
    check(replyHost().page===2&&visibility('visible'),'第二页完成后显示新回复');
    root().querySelector('[data-collapse]').click();await settled();
    check(rows().length===2&&visibility('visible')&&footerClear(),'展开再收起：原始回复与透明折叠栏恢复');
    const removed=replyHost(),next=document.createElement('bili-comment-replies-renderer');
    removed.replaceWith(next);next.start(1);await waitUntil(active);
    setFooterTheme(true);
    check(background()==='rgba(0, 0, 0, 0)'&&visibility('hidden')&&!removed.hasAttribute('data-biliglow-comments-active'),'异步重建组件：新组件透明，旧组件清理');
    removed.start(2);await settled();
    check(!removed.hasAttribute('data-biliglow-replies-loading'),'断开的组件不再观察加载变化');
    await delay(1200);check(root().querySelectorAll('[data-biliglow-comments]').length===1,'多次生命周期同步不重复注入样式');
    next.finish();await settled();next.contents.replaceWith(next.contents.cloneNode(true));
    next.start(2);await settled();
    check(background()==='rgba(0, 0, 0, 0)'&&visibility('hidden'),'同一 ShadowRoot 内替换回复容器后仍跟踪加载');
    next.finish();await settled();const row=rows()[0],body=row.shadowRoot.querySelector('#body');body.classList.add('spotlight');
    const box=document.createElement('bili-comment-box');body.append(box);await waitUntil(()=>box.hasAttribute('data-biliglow-comments-active'));
    check(getComputedStyle(body).backgroundColor==='rgba(0, 174, 236, 0.133)'&&getComputedStyle(box.shadowRoot.querySelector('#menu')).backgroundColor!=='rgba(0, 0, 0, 0)','回复高亮与表情菜单保留底色');
    check(getComputedStyle(box.shadowRoot.querySelector('#editor')).backgroundColor==='rgba(0, 0, 0, 0)','嵌套回复输入框维持透明');
    next.renderRows(0);next.contents.replaceWith(next.contents.cloneNode(true));await settled();
    check(footerClear(),'同一组件替换折叠栏后透明样式仍生效');
    await localSettings({enabled:false});await settled();
    check(getComputedStyle(root().querySelector('#view-more')).backgroundColor==='rgb(16, 20, 29)','停用后新折叠栏恢复主题背景');
  }catch(error){check(false,'运行异常',{message:error.message});}
  finally{
    replyHost().finish(false);await localSettings({privacyAccepted:true,enabled:true,dark:true});
    out.dataset.results=JSON.stringify(results);out.dataset.status=results.every(r=>r.pass)?'passed':'failed';
    out.textContent=`${results.filter(r=>r.pass).length}/${results.length} 通过\n`+out.textContent;
  }
};
startFixture().catch(error=>{document.querySelector('#results').textContent=error.message;});
