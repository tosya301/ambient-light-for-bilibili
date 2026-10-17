/* Standalone production-renderer regression; synthetic consent applies here only. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),B=globalThis.BiliGlow;
  const player=$('#player'),video=$('video'),output=$('#encoded-results'),preview=$('#encoded-preview');
  const source=document.createElement('canvas'),ctx=source.getContext('2d');
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function until(test,label='等待生产状态超时',timeout=8000){const start=performance.now();while(performance.now()-start<timeout){if(test())return;await wait(75);}throw Error(label);}
  const root=()=>$('[data-biliglow-root]'),backdrop=()=>$('[data-biliglow-backdrop]'),frames=()=>Number(root()?.dataset.frames||0);
  const shown=e=>Boolean(e&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden');
  let pattern='unbarred',shape='horizontal',running=false;
  function paint(){
    const w=source.width,h=source.height,bar=Math.round(h*.12);
    if(pattern==='dark'){ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);return;}
    const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,'#20c7bd');gradient.addColorStop(.5,'#efaa66');gradient.addColorStop(1,'#a251dd');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=h/12)for(let x=0;x<w;x+=w/18){ctx.fillStyle=(Math.round(x/(w/18))+Math.round(y/(h/12)))%2?'#15355065':'#ffffff26';ctx.fillRect(x,y,w/18,h/12);}
    if(pattern!=='unbarred'){
      ctx.fillStyle=pattern==='colored'?'#446688':'#000';ctx.fillRect(0,0,w,bar);ctx.fillRect(0,h-bar,w,bar);
    }
    const inset=pattern==='unbarred'?12:bar+12;
    ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.strokeRect(12,inset,w-24,h-inset*2);
    ctx.fillStyle='#072737';ctx.fillRect(w*.18,h*.38,w*.64,h*.24);
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=`bold ${Math.max(18,w*.035)}px system-ui`;ctx.fillText('FULL PICTURE · NO CROP',w/2,h*.47);
    ctx.font=`${Math.max(14,w*.02)}px system-ui`;ctx.fillText(`${w} × ${h} / ${pattern} / ${Math.floor(performance.now()/250)}`,w/2,h*.56);
    if(pattern==='subtitles'){
      ctx.fillStyle='#fff';ctx.fillRect(w*.28,h-bar*.7,w*.44,Math.max(8,h*.027));
      ctx.fillStyle='#d6e3ff';ctx.font=`${Math.max(14,w*.02)}px system-ui`;ctx.fillText('SUBTITLES INSIDE ORIGINAL BLACK BAR',w/2,h-bar*.26);
    }
  }
  function resizeSource(nextShape){
    shape=nextShape;const r=player.getBoundingClientRect();
    // At fullscreen this is 6% CSS contain space per side, independently of
    // viewport aspect. The encoded bars are pixels within that source frame.
    source.width=shape==='reference'?3456:Math.round(r.width*2*(shape==='vertical'?.88:1));
    source.height=shape==='reference'?1944:Math.round(r.height*2*(shape==='horizontal'?.88:1));
    paint();
  }
  resizeSource('horizontal');video.srcObject=source.captureStream(24);video.play().catch(()=>{});setInterval(paint,60);
  B.storage.set({...B.defaults,privacyAccepted:true,enabled:true,roundedCorners:true,frameShadow:0,smoothing:0,hideLauncher:true,removeHorizontalBars:false,removeVerticalBars:false,detectColoredBars:false});
  const settingsReady=B.storage.get();
  function setMode(mode){player.dataset.screen=mode;window.dispatchEvent(new Event('resize'));}
  async function setPattern(next){pattern=next;paint();await wait(180);}
  async function setShape(next){resizeSource(next);await video.play();await until(()=>video.videoWidth===source.width&&video.videoHeight===source.height,'合成视频尺寸未更新');await wait(220);}
  function shield(color){const e=backdrop(),r=e?.getBoundingClientRect(),s=e&&getComputedStyle(e);return shown(e)&&s.backgroundColor===color&&s.opacity==='1'&&r.left<=1&&r.top<=1&&r.right>=innerWidth-1&&r.bottom>=innerHeight-1&&s.pointerEvents==='none';}
  const protectedState=()=>!shown(root())&&shield('rgb(0, 0, 0)');
  const litState=()=>shown(root())&&shield('rgb(16, 20, 29)');
  function preserved(){const css=getComputedStyle(video);return css.objectFit==='contain'&&css.transform==='none'&&!video.hasAttribute('data-biliglow-bar-crop')&&!video.style.getPropertyValue('--biliglow-video-clip')&&!video.style.getPropertyValue('--biliglow-video-transform');}
  function hit(){const e=$('#control-hit'),r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}
  async function leave(){if(document.fullscreenElement)await document.exitFullscreen();setMode('normal');}
  $('#normal').onclick=()=>{if(!running)leave();};$('#wide').onclick=async()=>{if(!running){await leave();setMode('wide');}};$('#leave').onclick=()=>{if(!running)leave();};
  async function showPreview(next,nextShape='horizontal'){
    if(running)return;await leave();setMode('web');await wait(100);await setShape(nextShape);await setPattern(next);await wait(3800);
    preview.textContent=JSON.stringify({preview:next,source:[video.videoWidth,video.videoHeight],rootVisible:shown(root()),backdrop:backdrop()&&getComputedStyle(backdrop()).backgroundColor,preserved:preserved()},null,2);
  }
  $('#preview-encoded').onclick=()=>showPreview('encoded');$('#preview-unbarred').onclick=()=>showPreview('unbarred');$('#preview-colored').onclick=()=>showPreview('colored');
  $('#preview-reference').onclick=()=>showPreview('encoded','reference');
  async function suite(native,fullscreenRequest){
    if(running)return;running=true;preview.textContent='';output.dataset.state='running';output.textContent='正在执行；每种黑边变化需连续稳定样本确认…';
    const results=[],check=(passed,label)=>{results.push({passed:Boolean(passed),label});output.textContent=`${native?'原生':'网页'}全屏检查 ${results.length} 项：${label}`;};
    function report(){
      const failed=results.filter(r=>r.passed===false).length,skipped=results.filter(r=>r.skipped).length;
      const data={suite:native?'native':'web',passed:failed===0&&skipped===0,total:results.length,failed,skipped,results};
      const destination=$(native?'#encoded-native-results':'#encoded-web-results');destination.textContent=JSON.stringify(data,null,2);
      const state={state:skipped?'skipped':'complete',passed:String(data.passed),total:String(data.total),failed:String(failed),skipped:String(skipped)};
      Object.assign(destination.dataset,state);Object.assign(output.dataset,state);output.textContent=`${data.suite}: ${data.total-failed-skipped}/${data.total} 通过；失败 ${failed}；跳过 ${skipped}。完整记录保留在下方。`;
    }
    try{
      await settingsReady;await B.storage.set({enabled:true,removeHorizontalBars:false,removeVerticalBars:false,detectColoredBars:false});await setPattern('unbarred');
      if(native){try{await fullscreenRequest;}catch(error){results.push({skipped:true,label:`原生全屏不可用：${error.name}`});return;}await until(()=>document.fullscreenElement===player);}
      else{await leave();setMode('web');}
      await until(()=>root()?.dataset.mode==='fullscreen'&&backdrop());await setShape('horizontal');await until(litState,'无内置黑边时应保留外侧光效');
      const view=player.getBoundingClientRect(),ratio=video.videoWidth/video.videoHeight,gap=(view.height-view.width/ratio)/2/view.height;
      check(gap>.059&&gap<.061,'外侧上下每边约 6%，超过窄留白门槛');
      check(preserved()&&hit(),'无内置黑边时完整画面及控件命中正常');
      let start=frames();await until(()=>frames()>start+1,'大留白光效未继续采样');check(true,'无内置黑边的大留白继续动态发光');
      await setPattern('encoded');await until(protectedState,'内置上下黑边连续确认后未保持纯黑');
      check(true,'上下内置黑边确认后停止外侧光效并保持纯黑');
      check(preserved()&&hit(),'内置黑边保护不裁剪、缩放视频且控件命中正常');
      start=frames();await wait(500);check(frames()===start,'保护期间光效画布停止更新');
      await setPattern('dark');await wait(3500);check(protectedState(),'已确认后遇到整幅黑场仍保持保护');
      await setPattern('subtitles');await wait(3500);check(protectedState(),'已确认后黑带字幕造成不确定样本仍保持保护');
      await setPattern('unbarred');await until(litState,'无黑带连续确认后未恢复光效');check(true,'连续确认无黑带后恢复大留白光效');
      await setPattern('encoded');await until(protectedState);await B.storage.set({detectColoredBars:true});await setPattern('colored');await until(litState,'彩色边不应触发全屏纯黑保护');check(true,'开启彩色边检测仍不把内置彩色边当作黑边保护');
      await B.storage.set({detectColoredBars:false});await setPattern('encoded');await until(protectedState);video.pause();await wait(150);
      await leave();await until(()=>!backdrop()&&shown(root()),'退出全屏未清理黑色底板');check(preserved(),'暂停退出全屏恢复普通光效并清理底板');
      // Reenter web fullscreen while paused: there is no rVFC callback. The
      // production lifecycle must reconfirm the still frame independently.
      setMode('web');await until(protectedState,'暂停重新进入全屏后未确认内置黑边');check(video.paused&&preserved(),'暂停重新进入全屏也确认黑边且不变换画面');
      await leave();await video.play();await until(()=>shown(root())&&!backdrop());check(preserved()&&root()?.dataset.mode==='normal','普通模式内置黑边视频保留光效与完整画面');
      setMode('wide');await until(()=>root()?.dataset.mode==='theater'&&shown(root()));check(!backdrop()&&preserved(),'宽屏模式不受全屏内置黑边保护影响');
      setMode('web');await setShape('vertical');await setPattern('encoded');await until(litState,'左右外侧大留白不应因上下内置黑边停光');await wait(3500);check(litState()&&preserved(),'外侧留白轴向不匹配时保留光效');
      await setShape('horizontal');await until(protectedState);await B.storage.set({enabled:false});await until(()=>!backdrop());check(!player.hasAttribute('data-biliglow-stage')&&preserved(),'关闭扩展释放黑色底板且保留原视频');
      await B.storage.set({enabled:true});await until(protectedState,'重启扩展后未重新确认内置黑边');check(preserved()&&hit(),'重新开启恢复黑边保护与控件命中');
      await setPattern('unbarred');await until(litState);check(preserved(),'重新开启后仍能恢复无内置黑边的大留白光效');
    }catch(error){check(false,error.message);}
    finally{await leave();await video.play().catch(()=>{});await B.storage.set({enabled:true,roundedCorners:true,detectColoredBars:false});running=false;report();}
  }
  $('#run-web-suite').onclick=()=>suite(false);
  $('#run-native-suite').onclick=()=>{if(running)return;const request=player.requestFullscreen();suite(true,request);};
  setTimeout(()=>{if(output.dataset.state==='preparing'){output.dataset.state='ready';output.textContent='准备就绪；选择网页全屏或原生全屏套件。';}},600);
})();
