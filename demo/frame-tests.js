/* Browser checks use the actual shared controls and renderer, not CSS copies. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),B=window.BiliGlow,live=Boolean($('#live-player'));
  const frame=()=>$(live?'#live-player':'.bpx-player-video-area');
  const video=()=>frame().querySelector('video');
  const light=()=>$('[data-biliglow-root]');
  const shadow=()=>light().shadowRoot.querySelector('[data-biliglow-frame-shadow]');
  const rounded=()=>frame().hasAttribute('data-biliglow-rounded');
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function until(test){for(let i=0;i<60;i++){if(test())return;await wait(60);}throw new Error('播放器外观未按预期更新');}
  // Reproduce the live VOD DOM's 9px downward overflow. A hidden overflow
  // container can scroll both its video and absolutely positioned controls;
  // clipping the rounded frame must not create that scrolling mechanism.
  function scrollFixture(){
    const overflow=document.createElement('div');overflow.dataset.frameOverflowProbe='';overflow.setAttribute('aria-hidden','true');
    overflow.style.cssText='position:absolute;top:100%;left:0;width:1px;height:9px;pointer-events:none';
    const controls=document.createElement('div');controls.dataset.frameControlProbe='';controls.className='bpx-player-control-wrap';controls.setAttribute('aria-hidden','true');
    controls.style.cssText='position:absolute;left:0;right:0;bottom:0;height:35px;pointer-events:none';
    frame().append(overflow,controls);
    return {overflow,controls,remove(){frame().scrollTop=0;overflow.remove();controls.remove();}};
  }
  const button=document.createElement('button');button.id='frame-tests';button.textContent='圆角与阴影自检';
  const output=document.createElement('output');output.id='frame-results';output.style.cssText='display:block;white-space:pre-line;font-size:11px;line-height:1.8';
  $(live?'.lab-controls':'.checks').append(button,output);
  button.addEventListener('click',async()=>{
    const original=await B.storage.get();
    if(!B.isActive(original)){output.textContent='请先在设置中同意并开启氛围光';return;}
    button.disabled=true;const results=[];output.dataset.state='running';let fixture;
    const check=(passed,label)=>{results.push({passed:Boolean(passed),label});output.textContent=results.map(r=>`${r.passed?'✓':'✗'} ${r.label}`).join('\n');};
    const stableRect=(a,b)=>['left','top','width','height'].every(key=>Math.abs(a[key]-b[key])<.1);
    const checkNoScroll=async label=>{
      frame().scrollTop=0;
      const before={frame:frame().getBoundingClientRect(),video:video().getBoundingClientRect(),controls:fixture.controls.getBoundingClientRect()};
      frame().scrollTop=9;await wait(80);
      check(frame().scrollTop===0,`${label}：9px 溢出不会形成隐藏滚动，scrollTop 保持 0`);
      check(stableRect(before.frame,frame().getBoundingClientRect())&&stableRect(before.video,video().getBoundingClientRect())&&stableRect(before.controls,fixture.controls.getBoundingClientRect()),`${label}：尝试滚动后视频、控制层与圆角边框位置均不偏移`);
      frame().scrollTop=0;
    };
    const leave=()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    try{
      leave();if(!live&&$('#player').dataset.screen==='wide')$('#theater').click();
      await B.storage.set({...B.defaults,privacyAccepted:true,hideLauncher:false});
      frame().scrollIntoView({block:'center',behavior:'instant'});await until(()=>light()?.dataset.frames>0);
      check(!rounded()&&shadow().style.display==='none','旧设置默认不增加圆角或阴影');
      const before=video().getBoundingClientRect(),baseRadius=getComputedStyle(frame()).borderRadius,baseOverflow=getComputedStyle(frame()).overflow;
      if(!live){
        fixture=scrollFixture();frame().scrollTop=9;
        check(frame().scrollHeight-frame().clientHeight>=8&&frame().scrollTop===9,'原生 overflow:hidden 与 9px 溢出确实可复现播放器隐藏滚动');
        frame().scrollTop=0;
      }
      const ui=$('[data-biliglow-ui]').shadowRoot;if(ui.querySelector('.holder').hidden)ui.querySelector('.launcher').click();
      const panel=ui.querySelector('.holder').shadowRoot;panel.querySelector('[data-tab=picture]').click();
      panel.querySelector('#roundedCorners').click();await until(()=>rounded());
      check(getComputedStyle(frame()).borderRadius==='12px'&&getComputedStyle(frame()).overflow===(live?'hidden':'clip'),'设置开关使四个角均为 YouTube 的 12px 圆角');
      if(!live)await checkNoScroll('普通模式');
      check(shadow().style.display==='none','只开圆角不会自动添加阴影');
      const slider=panel.querySelector('#frameShadow');slider.value='35';slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));
      await until(()=>shadow().style.display==='block');const weak=shadow().style.boxShadow;
      slider.value='80';slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));
      await until(()=>shadow().style.boxShadow!==weak);
      check(panel.querySelector('[data-output=frameShadow]').textContent==='80%'&&(await B.storage.get()).frameShadow===80,'阴影滑块即时更新强度、读数与本地设置');
      panel.querySelector('.close').click();
      const after=video().getBoundingClientRect(),cs=getComputedStyle(video());
      check(before.width===after.width&&before.height===after.height&&cs.opacity==='1'&&cs.filter==='none'&&cs.objectFit==='contain','圆角与阴影不缩放、不淡化、不改色视频');
      check(getComputedStyle(shadow()).pointerEvents==='none'&&getComputedStyle(shadow()).backgroundColor==='rgba(0, 0, 0, 0)','阴影层不覆盖画面或拦截点击');
      const control=$(live?'.player-toolbar':'.bpx-player-dm-input'),cr=control.getBoundingClientRect(),hit=document.elementFromPoint(cr.x+cr.width/2,cr.y+cr.height/2);
      check(hit===control||control.contains(hit),'播放器控件或弹幕输入框仍可命中');
      const r=frame().getBoundingClientRect(),sr=shadow().getBoundingClientRect();
      check(['left','top','width','height'].every(k=>Math.abs(r[k]-sr[k])<1),'阴影准确贴合画面区，不包住聊天或发送栏');
      check(getComputedStyle(light()).clipPath!=='none','圆角光效遮罩是浏览器支持的有效路径');
      await B.storage.set({roundedCorners:false});await until(()=>!rounded());
      check(getComputedStyle(frame()).borderRadius===baseRadius&&getComputedStyle(frame()).overflow===baseOverflow&&shadow().style.display==='block','关闭圆角恢复原生圆角与溢出样式，阴影仍独立保留');
      await B.storage.set({roundedCorners:true,strength:0});await until(()=>rounded());
      check(shadow().style.display==='block'&&light().style.display==='block','零光强仍可保留边框阴影');
      await B.storage.set({strength:80});
      $(live?'#replace-video':'#replace').click();await wait(1300);await until(()=>rounded()&&video().readyState>=2);
      check(light().shadowRoot.querySelectorAll('[data-biliglow-frame-shadow]').length===1,'换片后继续生效，阴影不重复叠加');
      if(!live){
        $('#theater').click();await until(()=>light().dataset.mode==='theater');
        check(rounded()&&getComputedStyle(frame()).borderRadius==='12px'&&shadow().style.display==='block','宽屏保留同一设置的 12px 圆角，独立阴影继续可用');
        await checkNoScroll('宽屏模式');
        const wideShadow=shadow().style.boxShadow;
        await B.storage.set({roundedCorners:false});await until(()=>!rounded());
        check(shadow().style.display==='block'&&shadow().style.boxShadow===wideShadow&&getComputedStyle(frame()).overflow===baseOverflow,'宽屏关闭圆角恢复原生溢出样式且不改变阴影强度');
        await B.storage.set({roundedCorners:true,frameShadow:0});await until(()=>rounded()&&shadow().style.display==='none');
        check(getComputedStyle(frame()).borderRadius==='12px','宽屏 0% 阴影时仍保留 12px 圆角');
        await B.storage.set({frameShadow:80});await until(()=>shadow().style.display==='block');
        $('#theater').click();await until(()=>light().dataset.mode==='normal'&&rounded());
      }
      $('#web-fullscreen').click();await until(()=>light().dataset.mode==='fullscreen');
      check(!rounded()&&shadow().style.display==='none'&&getComputedStyle(frame()).borderRadius===baseRadius&&getComputedStyle(frame()).overflow===baseOverflow,'网页全屏自动撤去圆角和阴影，恢复原生溢出样式');
      check(Boolean($('[data-biliglow-backdrop]')),'全屏遮挡底层页面的修复仍然保留');
      leave();await until(()=>rounded()&&shadow().style.display==='block');check(true,'退出全屏自动恢复保存的外观');
      await B.storage.set({enabled:false});await until(()=>!rounded());
      check(shadow().style.display==='none'&&getComputedStyle(frame()).borderRadius===baseRadius&&getComputedStyle(frame()).overflow===baseOverflow,'关闭氛围光清理圆角、阴影和溢出样式');
      await B.storage.set({enabled:true});await until(()=>rounded());
      await B.storage.set({privacyAccepted:false});await until(()=>!rounded());
      check(shadow().style.display==='none','撤回同意立即清理装饰');
      await B.storage.set({privacyAccepted:true});await until(()=>rounded());
      await B.storage.set({frameShadow:0});await until(()=>shadow().style.display==='none');check(rounded(),'0% 阴影完全关闭，圆角继续保留');
    }catch(error){check(false,error.message);}finally{
      fixture?.remove();leave();await B.storage.set(original);button.disabled=false;output.dataset.state='complete';
      output.dataset.passed=String(results.every(r=>r.passed));output.dataset.total=String(results.length);
      output.dataset.results=JSON.stringify(results);
    }
  });
})();
