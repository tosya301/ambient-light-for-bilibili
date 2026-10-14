'use strict';
// Reproduce the actual Bilibili nesting and shadow boundaries, not just their appearance.
const sampleRegion=document.createElement('section');sampleRegion.className='surface-fixtures';
sampleRegion.innerHTML=`<div class="video-tag-container"><div class="tag-panel"><span class="bgm-tag"><button class="tag-link bgm-link"><svg class="tag-icon" width="14" height="14" viewBox="0 0 14 14"><path fill="currentColor" d="M4 2v7a2 2 0 1 0 1 2V4l6-1v5a2 2 0 1 0 1 2V1z"/></svg>发现《光随影动》</button></span><a class="tag-link" href="#surface-tests">氛围光</a><a class="tag-link" href="#surface-tests">风景</a><button class="show-more-btn" aria-label="展开标签">⌄</button></div></div><bili-comments></bili-comments><div class="fixture-actions"><button id="rebuild-comments">重建评论组件</button><button id="pin-comments">切换吸底评论栏</button><button id="surface-tests">透明组件自检</button><label>视频内边框 <select id="bar-fixture"><option value="none">无边框</option><option value="horizontal">上下黑边</option><option value="vertical">左右黑边</option><option value="colored">两侧彩色边框</option><option value="window">四周黑边</option><option value="black">全黑画面（不应裁切）</option></select></label><output id="surface-results"></output></div>`;
document.querySelector('.swatches').after(sampleRegion);
class DemoCommentRichTextarea extends HTMLElement{
  constructor(){
    super();this.attachShadow({mode:'open'}).innerHTML=`<style>:host{display:block}#input{font-size:14px;line-height:32px}.brt-root{position:relative}.brt-placeholder{position:absolute;left:8px;top:0;pointer-events:none;color:var(--text3,#9499a0);white-space:nowrap}.brt-placeholder[hidden]{display:none}.brt-editor{box-sizing:border-box;min-height:32px;line-height:32px;padding:0 8px;outline:none;white-space:pre-wrap;overflow-wrap:anywhere}</style><div id="input"><div class="brt-root"><div class="brt-placeholder" aria-hidden="true">本地占位提示：写下此刻的感受…</div><div class="brt-editor" contenteditable="true" role="textbox" aria-label="本地评论输入框" aria-multiline="true"></div></div></div>`;
    const editor=this.shadowRoot.querySelector('.brt-editor'),placeholder=this.shadowRoot.querySelector('.brt-placeholder');
    editor.addEventListener('input',()=>{placeholder.hidden=editor.textContent.length>0;});
  }
}
customElements.define('bili-comment-rich-textarea',DemoCommentRichTextarea);
class DemoCommentBox extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'}).innerHTML=`<style>:host{display:block}#editor{box-sizing:border-box;background:#252d3b;border:1px solid #667080;border-radius:6px;padding:8px 0;min-height:50px;color:var(--text1,#18191c)}#editor:hover,#editor.active{background:#10141d}#emoji-popover{background:#191f2b;padding:8px;border-radius:4px;position:absolute;z-index:10}#emoji-popover[hidden]{display:none}.tool-btn{background:#10141d;color:inherit;border:1px solid #ffffff30;border-radius:4px;margin-top:8px}#footer{background:#10141d}</style><div id="comment-area"><div id="body"><div id="editor"><bili-comment-rich-textarea></bili-comment-rich-textarea></div></div><div id="footer"><button class="tool-btn">☺ 表情</button><div id="emoji-popover" hidden>🌟 🌙 🌈（菜单保留底色）</div></div></div>`;
    this.shadowRoot.querySelector('.tool-btn').addEventListener('click',()=>{const e=this.shadowRoot.querySelector('#emoji-popover');e.hidden=!e.hidden;});
  }
}
customElements.define('bili-comment-box',DemoCommentBox);
customElements.define('bili-comments-header-renderer',class extends HTMLElement{
  constructor(){
    super();this.attachShadow({mode:'open'}).innerHTML=`<style>:host{display:block}#navbar{margin:18px 0 12px;font-size:13px}.composer-row{display:grid;grid-template-columns:42px minmax(0,1fr) 72px;align-items:start;gap:12px}.avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#00aeec,#7c4dff);display:grid;place-items:center;color:white;font-size:22px}.send{height:48px;background:#00aeec;color:white;border:0;border-radius:6px}.bili-comments-bottom-fixed-wrapper{bottom:0;left:8vw;width:60vw;z-index:20}.composer-surface{width:100%;padding:15px 0;position:relative;background-color:var(--bg1,#fff);border-top:.5px solid var(--graph_bg_thick,#e3e5e7);color:var(--text1,#222)}</style><div id="navbar">评论 · 本地透明测试</div><div id="commentbox"><div class="composer-row"><span class="avatar" aria-label="评论头像">◉</span><bili-comment-box></bili-comment-box><button class="send">发布</button></div></div>`;
    this.mode='inline';
  }
  setMode(mode){
    const row=this.shadowRoot.querySelector('.composer-row');
    this.shadowRoot.querySelector('#commentbox,.bili-comments-bottom-fixed-wrapper').remove();
    if(mode==='inline'){
      const inline=document.createElement('div');inline.id='commentbox';inline.append(row);this.shadowRoot.append(inline);
    }else{
      const wrapper=document.createElement('div');wrapper.className='bili-comments-bottom-fixed-wrapper';wrapper.style.position=mode;
      const surface=document.createElement('div');surface.className='composer-surface';surface.append(row);wrapper.append(surface);this.shadowRoot.append(wrapper);
    }
    this.mode=mode;
  }
});
customElements.define('bili-comments',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<bili-comments-header-renderer></bili-comments-header-renderer>';}});
const commentHeader=()=>sampleRegion.querySelector('bili-comments').shadowRoot.querySelector('bili-comments-header-renderer');
document.querySelector('#rebuild-comments').addEventListener('click',()=>{const old=commentHeader(),next=document.createElement('bili-comments-header-renderer');next.setMode(old.mode);old.replaceWith(next);});
document.querySelector('#pin-comments').addEventListener('click',()=>{const header=commentHeader();header.setMode(header.mode==='inline'?'fixed':'inline');});
// A local high-contrast image reveals missing full-row coverage behind the
// avatar, empty padding, editor, tools and send button when the composer pins.
const commentPicture=document.createElement('img');commentPicture.id='comment-picture-fixture';commentPicture.alt='本地评论配图：高对比彩格，用于检查吸底评论栏遮挡';
commentPicture.style.cssText='display:block;width:100%;height:260px;object-fit:cover;margin:24px 0';
commentPicture.src=`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="260"><defs><pattern id="checker" width="120" height="120" patternUnits="userSpaceOnUse"><path fill="#ff0055" d="M0 0h120v120H0z"/><path fill="#00e5ff" d="M0 0h60v60H0zm60 60h60v60H60z"/></pattern></defs><path fill="url(#checker)" d="M0 0h960v260H0z"/><circle cx="170" cy="140" r="96" fill="#ffe600"/><path d="m330 40 160 180 160-180 160 180" fill="none" stroke="#000" stroke-width="40"/></svg>')}`;
sampleRegion.querySelector('bili-comments').after(commentPicture);
const nested=document.createElement('div');nested.className='video-pod nested-collection';
nested.innerHTML=`<div class="video-pod__header">合集 · 嵌套分 P</div><div class="video-pod__body"><div class="video-pod__list section"><div class="pod-item video-pod__item simple"><div class="single-p"><button class="simple-base-item active normal"><i class="playing-gif">▥</i>极光漫游 <small>07:07</small></button></div></div><div class="pod-item video-pod__item simple"><div class="multi-p"><button class="simple-base-item head">深蓝时刻 · 分 P ⌄</button><div class="page-list simple"><button class="simple-base-item page-item active sub">▥ 第一章 <small>02:36</small></button></div></div></div></div></div>`;
document.querySelector('.video-pod').after(nested);
const recFooter=document.createElement('div');recFooter.className='recommend-list-v1';recFooter.innerHTML='<button class="rec-footer" aria-expanded="false">展开</button>';
document.querySelector('.rec-card').after(recFooter);
recFooter.querySelector('button').addEventListener('click',event=>{const e=event.currentTarget,on=e.getAttribute('aria-expanded')!=='true';e.setAttribute('aria-expanded',on);e.textContent=on?'收起':'展开';});
document.querySelector('#surface-tests').addEventListener('click',async()=>{
  const original=await BiliGlow.storage.get(),out=document.querySelector('#surface-results'),results=[];
  const check=(ok,label)=>{results.push(`${ok?'✓':'✗'} ${label}`);out.textContent=results.join('\n');};
  const roots=()=>{const header=commentHeader().shadowRoot;return {header,box:header.querySelector('bili-comment-box').shadowRoot};};
  const rich=()=>roots().box.querySelector('bili-comment-rich-textarea').shadowRoot;
  const editable=()=>rich().querySelector('.brt-editor');
  const setLocalText=text=>{const editor=editable();editor.textContent=text;editor.dispatchEvent(new Event('input',{bubbles:true,composed:true}));};
  const visiblePlaceholders=()=>[...rich().querySelectorAll('.brt-placeholder')].filter(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility==='visible'&&r.width>0&&r.height>0;});
  const clear=e=>getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)';
  const backgrounds=()=>[...document.querySelectorAll('.bpx-player-dm-btn-history,.nested-collection .simple-base-item,.rec-footer,.video-tag-container .tag-link,.show-more-btn'),roots().box.querySelector('#editor')];
  const surface=()=>roots().header.querySelector('.bili-comments-bottom-fixed-wrapper>div');
  const fixedRowCovered=()=>{const base=surface(),r=base.getBoundingClientRect();return [...roots().header.querySelectorAll('.avatar,bili-comment-box,.send')].every(e=>{const c=e.getBoundingClientRect();return c.left>=r.left&&c.right<=r.right&&c.top>=r.top&&c.bottom<=r.bottom;});};
  const smokeSurface=()=>{const s=getComputedStyle(surface());return s.backgroundColor==='rgba(18, 23, 31, 0.8)'&&(s.backdropFilter||s.webkitBackdropFilter||'').includes('blur(10px)')&&s.borderTopLeftRadius==='14px'&&s.borderTopRightRadius==='14px'&&s.borderBottomLeftRadius==='0px'&&s.borderBottomRightRadius==='0px';};
  try{
    commentHeader().setMode('inline');
    setLocalText('');
    await BiliGlow.storage.set({enabled:false});
    const nativeBackgrounds=backgrounds().map(e=>getComputedStyle(e).backgroundColor);
    await BiliGlow.storage.set({enabled:true});await wait(1200);
    check(backgrounds().every(clear),'历史弹幕按钮、嵌套合集、推荐按钮、标签、Shadow DOM 评论栏全部透明');
    editable().focus();
    check(clear(roots().box.querySelector('#editor'))&&getComputedStyle(roots().box.querySelector('#editor')).outlineStyle!=='none','评论输入聚焦时透明，保留键盘焦点提示');
    check(!clear(roots().box.querySelector('#emoji-popover')),'表情菜单仍有独立底色');
    const nativeEmojiBackground=getComputedStyle(roots().box.querySelector('#emoji-popover')).backgroundColor;
    check(getComputedStyle(document.querySelector('.tag-icon path')).fill!=='none'&&getComputedStyle(document.querySelector('#protected-thumbnail')).opacity==='1','标签图标与推荐缩略图未被淡化');
    document.querySelector('#rebuild-comments').click();await wait(1200);
    check(backgrounds().every(clear),'异步重建的评论组件自动恢复透明');
    document.querySelector('#pin-comments').click();await BiliGlow.storage.set({dark:true});
    check(smokeSurface()&&fixedRowCovered(),'深色吸底评论栏使用 80% 烟灰、10px 模糊和 14px 上圆角，底板完整覆盖整行');
    const baseRect=surface().getBoundingClientRect(),wrapperRect=surface().parentElement.getBoundingClientRect();
    const avatarRect=roots().header.querySelector('.avatar').getBoundingClientRect(),sendRect=roots().header.querySelector('.send').getBoundingClientRect();
    check(Math.abs(avatarRect.left-baseRect.left-16)<1&&Math.abs(baseRect.right-sendRect.right-16)<1&&Math.abs(baseRect.width-wrapperRect.width)<1,'头像和发布按钮距两侧各 16px，底板外宽保持不变');
    const smokeEditor=getComputedStyle(roots().box.querySelector('#editor'));
    const editorAlpha=Number(smokeEditor.backgroundColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1]);
    check(editorAlpha>0&&editorAlpha<.05&&smokeEditor.borderTopLeftRadius==='9px'&&smokeEditor.opacity==='1','吸底输入框有微弱底色和 9px 圆角，文字本身保持不透明');
    editable().focus();
    check(getComputedStyle(roots().box.querySelector('#editor')).outlineStyle!=='none','磨砂输入框保留键盘聚焦提示');
    const emptyEditorRect=roots().box.querySelector('#editor').getBoundingClientRect();
    check(editable().textContent===''&&visiblePlaceholders().length===1&&rich().querySelectorAll('.brt-root').length===1,'空白磨砂输入框只有一条可见占位提示');
    setLocalText('本地自检');
    check(editable().textContent==='本地自检'&&visiblePlaceholders().length===0,'输入本地测试文字后占位提示隐藏');
    setLocalText('');
    const clearedEditorRect=roots().box.querySelector('#editor').getBoundingClientRect();
    check(visiblePlaceholders().length===1&&['x','y','width','height'].every(key=>Math.abs(clearedEditorRect[key]-emptyEditorRect[key])<.5),'清空后仅恢复一条占位提示，外框位置和尺寸不变');
    check(getComputedStyle(roots().box.querySelector('#emoji-popover')).backgroundColor===nativeEmojiBackground&&getComputedStyle(surface()).overflow==='visible','磨砂底板保留表情菜单底色和溢出空间');
    commentHeader().setMode('sticky');
    check(smokeSurface()&&fixedRowCovered()&&getComputedStyle(surface().parentElement).position==='sticky','sticky 定位使用相同磨砂整行底板');
    commentHeader().setMode('fixed');document.querySelector('#rebuild-comments').click();await wait(1200);
    check(smokeSurface()&&fixedRowCovered(),'深色吸底组件重建后恢复磨砂材质和整行覆盖');
    await BiliGlow.storage.set({dark:false});
    const lightSurface=getComputedStyle(surface());
    check(lightSurface.backgroundColor==='rgb(255, 255, 255)'&&fixedRowCovered()&&(lightSurface.backdropFilter||lightSurface.webkitBackdropFilter)==='none'&&lightSurface.borderTopLeftRadius==='0px','浅色吸底评论栏恢复原生白色底板、边角和背景滤镜');
    const lightEditor=getComputedStyle(roots().box.querySelector('#editor'));
    check(lightEditor.color==='rgb(24, 25, 28)'&&lightEditor.opacity==='1'&&clear(roots().box.querySelector('#editor'))&&lightEditor.borderTopLeftRadius==='6px','浅色评论文字使用默认深色，并移除输入框磨砂底色和圆角覆盖');
    commentHeader().setMode('sticky');
    check(getComputedStyle(surface()).backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(surface().parentElement).position==='sticky','sticky 定位保留同一原生不透明底板');
    commentHeader().setMode('fixed');document.querySelector('#rebuild-comments').click();await wait(1200);
    check(getComputedStyle(surface()).backgroundColor==='rgb(255, 255, 255)'&&fixedRowCovered(),'吸底组件重建后仍完整遮挡，不依赖新增定位观察器');
    document.querySelector('#pin-comments').click();
    check(!surface()&&backgrounds().every(clear),'退出吸底移除原生固定wrapper，普通inline评论继续透明');
    document.querySelector('#pin-comments').click();await BiliGlow.storage.set({dark:true});
    await BiliGlow.storage.set({enabled:false});await wait(100);
    editable().blur();
    check(backgrounds().every((e,index)=>getComputedStyle(e).backgroundColor===nativeBackgrounds[index]),'关闭光效恢复原生背景');
    check(!roots().box.querySelector('[data-biliglow-comments]')&&!roots().header.querySelector('[data-biliglow-comments]'),'关闭后移除组件内注入样式');
    const disabledSurface=getComputedStyle(surface());
    check(disabledSurface.backgroundColor==='rgb(255, 255, 255)'&&(disabledSurface.backdropFilter||disabledSurface.webkitBackdropFilter)==='none'&&disabledSurface.borderTopLeftRadius==='0px','关闭光效后恢复站点原生吸底背景、边角和滤镜');
  }finally{setLocalText('');commentHeader().setMode('inline');await BiliGlow.storage.set(original);out.dataset.passed=String(results.every(s=>s.startsWith('✓')));}
});
