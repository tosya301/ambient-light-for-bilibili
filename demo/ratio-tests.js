/* VOD flex sizing regression, based on BV1f5Hm69Enr. The normal demo's
   absolute video cannot exercise min-height:auto. This fixture temporarily
   uses an in-flow, intrinsically sized video in the native wrapper hierarchy.
   The original fixed-height chain is independent from the outer player shell:
   the real extension must reserve space there for the expanded media. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),B=window.BiliGlow;
  const player=$('#player'),checks=$('.checks'),primary=player?.querySelector('.bpx-player-primary-area');
  if(!player||!checks||!primary)return;
  const frame=primary.querySelector('.bpx-player-video-area');
  const sending=primary.querySelector('.bpx-player-sending-area');
  const toolbar=$('#arc_toolbar_report')||$('#playlistToolbar');
  const shell=$('#playerWrap');
  const ratios=[
    {name:'Mac 录屏 1670:1080',width:1670,height:1080},
    {name:'16:10',width:1600,height:1000},
    {name:'4:3',width:1440,height:1080},
    {name:'竖屏 9:16',width:540,height:960},
    {name:'16:9',width:1920,height:1080}
  ];
  const style=document.createElement('style');
  style.textContent=`
    #playerWrap[data-ratio-fixture]{height:var(--ratio-player-height);box-sizing:content-box}
    #playerWrap[data-ratio-fixture] > #bilibili-player{box-sizing:content-box}
    #playerWrap[data-ratio-fixture] > #bilibili-player,
    #player[data-ratio-fixture]{width:100%;height:100%}
    #player[data-ratio-fixture] .bpx-player-primary-area{display:flex;flex-direction:column;width:100%;height:100%;overflow:visible}
    #player[data-ratio-fixture] .bpx-player-video-area{flex:1 1 0%;width:100%;height:auto;min-height:auto;aspect-ratio:auto;overflow:hidden}
    #player[data-ratio-fixture] .bpx-player-video-perch{display:flex;position:relative;flex:0 0 auto;min-height:0;width:100%;height:100%}
    #player[data-ratio-fixture] .bpx-player-video-wrap{display:block;position:static;flex:0 1 auto;min-height:auto;width:100%;height:100%;overflow:visible}
    #player[data-ratio-fixture] video{position:static;inset:auto;width:100%;height:100%;display:block;object-fit:contain}
    #player[data-ratio-fixture] .bpx-player-sending-area{flex:0 0 56px;width:100%;height:56px;max-width:none;margin:0}
    #player[data-ratio-fixture] .bpx-player-sending-bar{height:56px}
    #player[data-ratio-fixture] [data-ratio-controls]{position:absolute;inset:auto 0 0;height:35px;z-index:75;display:flex;align-items:center;padding:0 12px;gap:12px;color:#fff;background:rgba(0,0,0,.5);font:12px/1.4 system-ui,sans-serif}
    #player[data-ratio-fixture] [data-ratio-controls] button{border:0;border-radius:3px;background:transparent;color:inherit;padding:4px;font:inherit}
    #ratio-preview-note{flex-basis:100%;line-height:1.8}
  `;
  document.head.append(style);
  const run=document.createElement('button');run.id='ratio-tests';run.type='button';run.textContent='视频比例与布局自检';
  const preview=document.createElement('button');preview.id='ratio-preview';preview.type='button';preview.textContent='预览 Mac 录屏布局';preview.setAttribute('aria-pressed','false');
  const output=document.createElement('output');output.id='ratio-results';output.setAttribute('aria-live','polite');
  const note=document.createElement('span');note.id='ratio-preview-note';note.textContent='真实固定高度链与 flex 布局：圆角保留较高比例的大画面，外层为内容补足空间，发送栏与下方工具栏不能重叠。覆盖普通/宽屏及 5 种媒体比例。';
  checks.append(run,preview,note,output);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function until(test,label){for(let i=0;i<80;i++){if(test())return;await wait(50);}throw new Error(label||'视频比例场景未按预期更新');}
  const light=()=>$('[data-biliglow-root]');
  const rounded=()=>frame.hasAttribute('data-biliglow-rounded');
  const close=(a,b)=>Math.abs(a-b)<.75;
  // Space reservation rounds upward to a whole CSS pixel to avoid leaving a
  // fractional overlap. The picture/sending delta itself remains unrounded.
  const coversDelta=(shift,delta)=>shift>=delta-.1&&shift-delta<1.1;
  const equalRect=(a,b)=>['left','top','width','height'].every(key=>close(a[key],b[key]));
  const relativeRect=(element,origin)=>{
    const rect=element.getBoundingClientRect();
    return {left:rect.left-origin.left,top:rect.top-origin.top,width:rect.width,height:rect.height,right:rect.right-origin.left,bottom:rect.bottom-origin.top};
  };
  let fixture=null,previewSettings=null;
  function mode(screen){
    player.classList.remove('web-fullscreen');document.body.classList.toggle('theater',screen==='wide');player.dataset.screen=screen;
    $('#theater').textContent=screen==='wide'?'返回小屏':'宽屏模式';
    // Native height lives at the outer shell; every inner player layer uses
    // height:100%. Additional outer padding must not resize this content box.
    shell.style.setProperty('--ratio-player-height',`${shell.getBoundingClientRect().width*9/16+56}px`);
    window.dispatchEvent(new Event('resize'));
  }
  function install(){
    if(fixture)return fixture;
    const video=frame.querySelector('video');if(!video)throw new Error('请先恢复演示播放器');
    const before={parent:video.parentElement,next:video.nextSibling,srcObject:video.srcObject,controls:video.controls,paused:video.paused,
      screen:player.dataset.screen,playerClass:player.className,bodyTheater:document.body.classList.contains('theater'),
      height:shell.style.getPropertyValue('--ratio-player-height'),scrollX,scrollY,
      controlsHidden:frame.querySelector('[data-glass-fixture]')?.hidden};
    const host=document.createElement('div');host.id='bilibili-player';
    player.replaceWith(host);host.append(player);
    const perch=document.createElement('div');perch.className='bpx-player-video-perch';
    const wrap=document.createElement('div');wrap.className='bpx-player-video-wrap';
    video.replaceWith(perch);perch.append(wrap);wrap.append(video);video.controls=false;
    const controls=document.createElement('div');controls.className='bpx-player-control-wrap';controls.dataset.ratioControls='';
    const controlButton=document.createElement('button');controlButton.type='button';controlButton.textContent='▶ 播放控件';
    const label=document.createElement('span');label.textContent='比例布局测试';controls.append(controlButton,label);frame.append(controls);
    const toolButton=document.createElement('button');toolButton.type='button';toolButton.textContent='工具栏命中测试';toolbar.append(toolButton);
    if(before.controlsHidden!==undefined)frame.querySelector('[data-glass-fixture]').hidden=true;
    player.classList.remove('portrait','letterbox','web-fullscreen');player.dataset.ratioFixture='';shell.dataset.ratioFixture='';
    let stream=null,timer=null;
    fixture={video,host,controls,controlButton,toolButton,before,
      async source(ratio){
        if(timer)clearInterval(timer);stream?.getTracks().forEach(track=>track.stop());
        const canvas=document.createElement('canvas');canvas.width=ratio.width;canvas.height=ratio.height;
        const paint=canvas.getContext('2d');let tick=0;
        const draw=()=>{
          const gradient=paint.createLinearGradient(0,0,canvas.width,canvas.height);gradient.addColorStop(0,'#0f677d');gradient.addColorStop(1,'#633889');
          paint.fillStyle=gradient;paint.fillRect(0,0,canvas.width,canvas.height);
          paint.strokeStyle='#9df2df';paint.lineWidth=8;paint.strokeRect(8,8,canvas.width-16,canvas.height-16);
          paint.strokeStyle='#ffffff30';paint.lineWidth=2;
          for(let x=1;x<8;x++){paint.beginPath();paint.moveTo(canvas.width*x/8,0);paint.lineTo(canvas.width*x/8,canvas.height);paint.stroke();}
          for(let y=1;y<6;y++){paint.beginPath();paint.moveTo(0,canvas.height*y/6);paint.lineTo(canvas.width,canvas.height*y/6);paint.stroke();}
          paint.fillStyle='#fff';paint.font=`${Math.max(20,canvas.width/25)}px system-ui`;paint.fillText(`${ratio.width} × ${ratio.height}`,24,canvas.height/2);
          paint.fillStyle=tick++%2?'#efff9b':'#86d9ed';paint.fillRect(18,canvas.height-44,22,22);
        };
        draw();stream=canvas.captureStream(5);video.srcObject=stream;timer=setInterval(draw,180);
        await video.play();await until(()=>video.readyState>=2&&video.videoWidth===ratio.width&&video.videoHeight===ratio.height,'合成视频元数据未更新');
        label.textContent=`${ratio.name} · 视频完整边界以绿色描边显示`;
        await wait(160);
      },
      remove(){
        if(timer)clearInterval(timer);stream?.getTracks().forEach(track=>track.stop());
        before.parent.insertBefore(video,before.next?.parentNode===before.parent?before.next:null);perch.remove();controls.remove();toolButton.remove();
        video.srcObject=before.srcObject;video.controls=before.controls;
        if(!before.paused)video.play().catch(()=>{});else video.pause();
        if(before.controlsHidden!==undefined)frame.querySelector('[data-glass-fixture]').hidden=before.controlsHidden;
        host.replaceWith(player);player.removeAttribute('data-ratio-fixture');shell.removeAttribute('data-ratio-fixture');player.className=before.playerClass;player.dataset.screen=before.screen;
        if(before.height)shell.style.setProperty('--ratio-player-height',before.height);else shell.style.removeProperty('--ratio-player-height');
        document.body.classList.toggle('theater',before.bodyTheater);$('#theater').textContent=before.screen==='wide'?'返回小屏':'宽屏模式';
        window.dispatchEvent(new Event('resize'));window.scrollTo({left:before.scrollX,top:before.scrollY,behavior:'instant'});fixture=null;
      }
    };
    return fixture;
  }
  function snapshot(){
    const origin=shell.getBoundingClientRect(),video=fixture.video,rect=video.getBoundingClientRect();
    const content=B.contentRect(rect,video.videoWidth,video.videoHeight,getComputedStyle(video).objectFit);
    return {
      shell:relativeRect(shell,origin),host:relativeRect(fixture.host,origin),player:relativeRect(player,origin),primary:relativeRect(primary,origin),frame:relativeRect(frame,origin),video:relativeRect(video,origin),
      content:{left:content.left-origin.left,top:content.top-origin.top,width:content.width,height:content.height},
      controls:relativeRect(fixture.controls,origin),sending:relativeRect(sending,origin),toolbar:relativeRect(toolbar,origin),
      primaryScrollHeight:primary.scrollHeight,videoWidth:video.videoWidth,videoHeight:video.videoHeight,
      frameOverflow:getComputedStyle(frame).overflow,frameMinHeight:getComputedStyle(frame).minHeight,
      objectFit:getComputedStyle(video).objectFit,transform:getComputedStyle(video).transform,
      shellPadding:getComputedStyle(shell).paddingBottom,extraSpace:shell.style.getPropertyValue('--biliglow-player-extra'),
      ownsSpace:shell.hasAttribute('data-biliglow-player-space')
    };
  }
  async function settled(){
    // Renderer updates the outer reservation after its geometry measurement.
    // Require a stable layout over two frames rather than inspect mid-update.
    let previous=snapshot();
    for(let i=0;i<30;i++){
      await wait(100);const current=snapshot();
      if(['shell','frame','sending','toolbar'].every(key=>equalRect(previous[key],current[key]))){await wait(100);return;}
      previous=current;
    }
    throw new Error('播放器尺寸持续变化，疑似增高量被反复累加');
  }
  async function setRounded(value){await B.storage.set({roundedCorners:value});await until(()=>rounded()===value);await settled();}
  function hit(element){
    element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    const r=element.getBoundingClientRect(),target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return target===element||element.contains(target);
  }
  async function closePreview(){
    if(!previewSettings)return;
    await B.storage.set({roundedCorners:false});await until(()=>!rounded()&&!shell.hasAttribute('data-biliglow-player-space'));
    fixture?.remove();await B.storage.set(previewSettings);previewSettings=null;preview.setAttribute('aria-pressed','false');preview.textContent='预览 Mac 录屏布局';
  }
  preview.addEventListener('click',async()=>{
    preview.disabled=true;
    try{
      if(previewSettings){await closePreview();return;}
      const original=await B.storage.get();if(!B.isActive(original)){output.textContent='请先在设置中同意并开启氛围光';return;}
      previewSettings=original;install();mode('normal');await B.storage.set({roundedCorners:true,frameShadow:0,removeHorizontalBars:false,removeVerticalBars:false,fillRemovedBars:false});
      await fixture.source(ratios[0]);preview.setAttribute('aria-pressed','true');preview.textContent='恢复原演示布局';frame.scrollIntoView({block:'center',behavior:'instant'});
      output.textContent='Mac 录屏 1670:1080 样本已打开；圆角开启时保留较大画面，并把发送栏与工具栏一起顺延，关闭时恢复原生布局。可在设置中切换圆角对比。';
    }catch(error){output.textContent=error.message;await closePreview();}
    finally{preview.disabled=false;}
  });
  async function runChecks(){
    if(run.disabled)return;
    await closePreview();const original=await B.storage.get();
    if(!B.isActive(original)){output.textContent='请先在设置中同意并开启氛围光';return;}
    const results=[],cases=[];
    const check=(passed,label)=>{results.push({passed:Boolean(passed),label});output.textContent=results.map(result=>`${result.passed?'✓':'✗'} ${result.label}`).join('\n');};
    run.disabled=true;preview.disabled=true;output.dataset.state='running';delete output.dataset.passed;
    try{
      install();await B.storage.set({frameShadow:0,glassControls:false,removeHorizontalBars:false,removeVerticalBars:false,fillRemovedBars:false});
      // Close the extension panel so a floating settings card cannot intercept
      // the hit tests of otherwise unobscured playback and sending controls.
      const ui=$('[data-biliglow-ui]')?.shadowRoot;ui?.querySelector('.holder')?.shadowRoot?.querySelector('.close')?.click();
      for(const screen of ['normal','wide'])for(const ratio of ratios){
        await setRounded(false);mode(screen);await fixture.source(ratio);
        await until(()=>light()?.dataset.mode===(screen==='wide'?'theater':'normal'));
        const label=`${screen==='wide'?'宽屏':'普通'} · ${ratio.name}`;
        const before=snapshot(),expectedVideo=before.primary.width*9/16;
        check(before.videoWidth===ratio.width&&before.videoHeight===ratio.height,`${label}：真实媒体元数据正确`);
        check(close(before.frame.height,expectedVideo)&&close(before.sending.height,56)&&close(before.sending.bottom,before.primary.bottom)&&before.frameOverflow==='hidden',`${label}：原生 hidden 按剩余空间收缩，发送栏保留 56px`);
        await setRounded(true);const after=snapshot(),delta=after.frame.height-before.frame.height;
        const taller=ratio.height/ratio.width>9/16;
        cases.push({screen,ratio,before,rounded:after,delta});
        check(rounded()&&getComputedStyle(frame).borderRadius==='12px'&&after.frameOverflow==='clip',`${label}：实际圆角规则已生效`);
        check(taller
          ?delta>.75&&close(after.frame.height,after.frame.width*ratio.height/ratio.width)&&close(after.content.height,after.frame.height)&&close(after.content.width,after.frame.width)
          :['shell','frame','video','content','controls','sending','toolbar'].every(key=>equalRect(before[key],after[key])),
        `${label}：${taller?'保留较高比例完整大画面，不压回原生高度':'普通 16:9 画面与页面布局保持不变'}`);
        check(close(after.sending.top-before.sending.top,delta)&&coversDelta(after.toolbar.top-before.toolbar.top,delta)&&['sending','toolbar'].every(key=>close(after[key].left,before[key].left)&&close(after[key].width,before[key].width)&&close(after[key].height,before[key].height)),`${label}：发送栏和工具栏按画面增高量下移，预留空间最多向上取整 1px`);
        check(coversDelta(after.shell.height-before.shell.height,delta)&&after.sending.bottom<=after.shell.bottom+.75&&['host','player','primary'].every(key=>equalRect(before[key],after[key])),`${label}：外层补足空间，原生内部高度链保持不变且增量不累加`);
        check(after.frame.bottom<=after.sending.top+.75&&after.sending.bottom<=after.toolbar.top+.75&&close(after.controls.bottom,after.frame.bottom),`${label}：控制栏贴合画面底部，画面、发送栏和工具栏互不覆盖`);
        check(after.objectFit==='contain'&&after.transform===before.transform&&Math.abs(after.content.width/after.content.height-ratio.width/ratio.height)<.001,`${label}：媒体保持原比例 contain，无 CSS 变换或拉伸裁切`);
        check([fixture.controlButton,sending.querySelector('input'),fixture.toolButton].every(hit),`${label}：播放控件、发送框和工具栏按钮都能命中`);
        await setRounded(false);const restored=snapshot();cases[cases.length-1].restored=restored;
        check(['shell','host','player','primary','frame','video','content','controls','sending','toolbar'].every(key=>equalRect(before[key],restored[key]))&&!restored.ownsSpace&&restored.shellPadding===before.shellPadding,`${label}：关闭圆角清理额外空间并恢复原生布局`);
      }
      for(const screen of ['normal','wide']){
        const label=`${screen==='wide'?'宽屏':'普通'} · 动态清理`;
        await setRounded(false);mode(screen);await fixture.source(ratios[0]);await settled();const native=snapshot();
        await setRounded(true);const expanded=snapshot();
        check(expanded.shell.height>native.shell.height+.75&&expanded.ownsSpace,`${label}：较高比例视频建立外层空间预留`);
        await wait(650);const stable=snapshot();
        check(equalRect(expanded.shell,stable.shell)&&equalRect(expanded.toolbar,stable.toolbar),`${label}：连续渲染不会累加额外高度`);
        await fixture.source(ratios[4]);await settled();const standard=snapshot();
        check(close(standard.shell.height,native.shell.height)&&close(standard.frame.height,native.frame.height)&&!standard.ownsSpace,`${label}：同一播放器切回 16:9 自动撤去预留空间`);
        await fixture.source(ratios[0]);await settled();const returned=snapshot();
        check(equalRect(expanded.shell,returned.shell)&&equalRect(expanded.toolbar,returned.toolbar),`${label}：再切回较高比例恢复相同增量`);
        await B.storage.set({enabled:false});await until(()=>!rounded()&&!shell.hasAttribute('data-biliglow-player-space'));await settled();const disabled=snapshot();
        check(['shell','frame','sending'].every(key=>equalRect(native[key],disabled[key]))&&close(native.toolbar.top,disabled.toolbar.top),`${label}：关闭氛围光恢复原生高度和布局`);
        await B.storage.set({enabled:true});await until(rounded);await settled();const reenabled=snapshot();
        check(equalRect(expanded.shell,reenabled.shell)&&equalRect(expanded.toolbar,reenabled.toolbar),`${label}：重新开启只添加一次所需空间`);
        $('#web-fullscreen').click();await until(()=>light()?.dataset.mode==='fullscreen'&&!rounded()&&!shell.hasAttribute('data-biliglow-player-space'));await settled();
        check(close(shell.getBoundingClientRect().height,native.shell.height),`${label}：网页全屏清理页面外层预留空间`);
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await until(()=>light()?.dataset.mode===(screen==='wide'?'theater':'normal')&&rounded());await settled();const exited=snapshot();
        check(equalRect(expanded.shell,exited.shell)&&equalRect(expanded.toolbar,exited.toolbar),`${label}：退出全屏恢复同一增量且工具栏不重叠`);
        await B.storage.set({privacyAccepted:false});await until(()=>!rounded()&&!shell.hasAttribute('data-biliglow-player-space'));await settled();const withdrawn=snapshot();
        check(['shell','frame','sending'].every(key=>equalRect(native[key],withdrawn[key]))&&close(native.toolbar.top,withdrawn.toolbar.top),`${label}：撤回同意清理预留空间并恢复原生布局`);
        await B.storage.set({privacyAccepted:true});await until(rounded);await settled();
        cases.push({screen,lifecycle:{native,expanded,stable,standard,returned,disabled,reenabled,exited,withdrawn}});
      }
    }catch(error){check(false,error.message);}
    finally{
      await B.storage.set({roundedCorners:false});
      try{await until(()=>!rounded()&&!shell.hasAttribute('data-biliglow-player-space'));}catch(error){check(false,`结束清理：${error.message}`);}
      fixture?.remove();await B.storage.set(original);run.disabled=false;preview.disabled=false;
      output.dataset.state='complete';output.dataset.passed=String(results.length===118&&results.every(result=>result.passed));
      output.dataset.total=String(results.length);output.dataset.failed=String(results.filter(result=>!result.passed).length);
      output.dataset.results=JSON.stringify(results);output.dataset.cases=JSON.stringify(cases);
    }
    return results;
  }
  run.addEventListener('click',runChecks);
  window.ratioFixture={runChecks,closePreview};
})();
