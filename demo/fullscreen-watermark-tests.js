/* Standalone production renderer. Synthetic consent/settings live in this page only. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),B=globalThis.BiliGlow;
  const player=$('#player'),video=$('video'),output=$('#watermark-results'),preview=$('#watermark-preview');
  const source=document.createElement('canvas'),ctx=source.getContext('2d');
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function until(test,label='等待生产状态超时',timeout=8000){const start=performance.now();while(performance.now()-start<timeout){if(test())return;await wait(75);}throw Error(label);}
  const root=()=>$('[data-biliglow-root]'),backdrop=()=>$('[data-biliglow-backdrop]'),frames=()=>Number(root()?.dataset.frames||0);
  const shown=e=>Boolean(e&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden');
  let pattern='unbarred',running=false;
  // Deliberately sparse glyph strokes, rather than a solid logo rectangle.
  // Their support is the rightmost quarter (watermark), or the middle 60%
  // (burned subtitles). Each row and total band occupancy are measured below.
  function glyphs(start,stop,y,height,count,inkWidth){
    const w=source.width,cell=(stop-start)*w/count,glyphWidth=cell*(count===22?.20:.48),stroke=w*inkWidth;
    ctx.fillStyle='#fff';
    for(let n=0;n<count;n++){
      const x=start*w+n*cell;
      ctx.fillRect(x,y,stroke,height);
      ctx.fillRect(x+glyphWidth-stroke,y+height*.15,stroke,height*.85);
      ctx.fillRect(x,y,glyphWidth,stroke);
      if(n%2===0)ctx.fillRect(x,y+height*.55,glyphWidth,stroke);
    }
  }
  function paint(){
    const w=source.width,h=source.height,bar=Math.round(h*.1);
    const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,'#20c7bd');gradient.addColorStop(.5,'#efaa66');gradient.addColorStop(1,'#a251dd');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=h/12)for(let x=0;x<w;x+=w/18){ctx.fillStyle=(Math.round(x/(w/18))+Math.round(y/(h/12)))%2?'#15355065':'#ffffff26';ctx.fillRect(x,y,w/18,h/12);}
    if(pattern!=='unbarred'){
      ctx.fillStyle=pattern==='colored'?'#446688':'#000';ctx.fillRect(0,0,w,bar);
      if(pattern!=='one-sided')ctx.fillRect(0,h-bar,w,bar);
    }
    const inset=pattern==='unbarred'?12:bar+12;
    ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.strokeRect(12,inset,w-24,h-inset*2);
    ctx.fillStyle='#072737';ctx.fillRect(w*.18,h*.38,w*.64,h*.24);
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=`bold ${Math.max(18,w*.035)}px system-ui`;ctx.fillText('FULL PICTURE · NO CROP',w/2,h*.47);
    ctx.font=`${Math.max(14,w*.02)}px system-ui`;ctx.fillText(`${w} × ${h} / ${pattern} / ${Math.floor(performance.now()/250)}`,w/2,h*.56);
    if(pattern==='watermark')glyphs(.751,.99,bar*.43,bar*.5,18,.0012);
    if(pattern==='subtitles')glyphs(.21,.79,h-bar*.72,bar*.45,22,.00085);
    if(pattern==='dense-line'){
      // Every top black-band row is >25% bright. No partial clean bar can pass.
      ctx.fillStyle='#fff';ctx.fillRect(w*.64,0,w*.34,bar);
    }
    if(pattern==='dense-band'){
      // Below25% per row, but above10% overall band occupancy.
      ctx.fillStyle='#fff';ctx.fillRect(w*.77,0,w*.15,bar);
    }
  }
  function resizeSource(shape){
    const r=player.getBoundingClientRect();
    source.width=shape==='reference'?1920:Math.round(r.width*2*(shape==='vertical'?.88:1));
    source.height=shape==='reference'?1080:Math.round(r.height*2*(shape==='horizontal'?.88:1));paint();
  }
  resizeSource('horizontal');video.srcObject=source.captureStream(24);video.play().catch(()=>{});setInterval(paint,60);
  B.storage.set({...B.defaults,privacyAccepted:true,enabled:true,roundedCorners:true,frameShadow:0,smoothing:0,hideLauncher:true,removeHorizontalBars:false,removeVerticalBars:false,detectColoredBars:false});
  const settingsReady=B.storage.get();
  function setMode(mode){player.dataset.screen=mode;window.dispatchEvent(new Event('resize'));}
  async function setPattern(next){pattern=next;paint();await wait(180);}
  async function setShape(shape){resizeSource(shape);await video.play();await until(()=>video.videoWidth===source.width&&video.videoHeight===source.height,'合成视频尺寸未更新');await wait(220);}
  function shield(color){const e=backdrop(),r=e?.getBoundingClientRect(),s=e&&getComputedStyle(e);return shown(e)&&s.backgroundColor===color&&s.opacity==='1'&&r.left<=1&&r.top<=1&&r.right>=innerWidth-1&&r.bottom>=innerHeight-1&&s.pointerEvents==='none';}
  const protectedState=()=>!shown(root())&&shield('rgb(0, 0, 0)');
  const litState=()=>shown(root())&&shield('rgb(16, 20, 29)');
  function preserved(){const css=getComputedStyle(video);return css.objectFit==='contain'&&css.transform==='none'&&!video.hasAttribute('data-biliglow-bar-crop')&&!video.style.getPropertyValue('--biliglow-video-clip')&&!video.style.getPropertyValue('--biliglow-video-transform');}
  function hit(){const e=$('#control-hit'),r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}
  function ink(bottom=false){
    const w=source.width,h=source.height,b=Math.round(h*.1),pixels=ctx.getImageData(0,bottom?h-b:0,w,b).data;let total=0,max=0;
    for(let y=0;y<b;y++){let row=0;for(let x=0;x<w;x++){const p=(y*w+x)*4;if(Math.max(pixels[p],pixels[p+1],pixels[p+2])>28)row++;}total+=row;max=Math.max(max,row/w);}
    return{maxRow:max,bandTotal:total/(w*b)};
  }
  async function leave(){if(document.fullscreenElement)await document.exitFullscreen();setMode('normal');}
  $('#normal').onclick=()=>{if(!running)leave();};$('#wide').onclick=async()=>{if(!running){await leave();setMode('wide');}};$('#leave').onclick=()=>{if(!running)leave();};
  async function showPreview(next,shape='horizontal'){
    if(running)return;await leave();setMode('web');await wait(100);await setShape(shape);await setPattern(next);await wait(3800);
    preview.textContent=JSON.stringify({preview:next,source:[video.videoWidth,video.videoHeight],rootVisible:shown(root()),backdrop:backdrop()&&getComputedStyle(backdrop()).backgroundColor,preserved:preserved(),topBandInk:ink()},null,2);
  }
  $('#preview-watermark').onclick=()=>showPreview('watermark');$('#preview-unbarred').onclick=()=>showPreview('unbarred');$('#preview-subtitles').onclick=()=>showPreview('subtitles');$('#preview-reference').onclick=()=>showPreview('watermark','reference');
  async function suite(native,request){
    if(running)return;running=true;preview.textContent='';output.dataset.state='running';output.textContent='运行中：各变化需要连续稳定样本确认…';
    const results=[],check=(passed,label)=>{results.push({passed:Boolean(passed),label});output.textContent=`${native?'原生':'网页'}检查 ${results.length} 项：${label}`;};
    function report(){
      const failed=results.filter(r=>r.passed===false).length,skipped=results.filter(r=>r.skipped).length;
      const data={suite:native?'native':'web',passed:failed===0&&skipped===0,total:results.length,failed,skipped,results};
      const destination=$(native?'#watermark-native-results':'#watermark-web-results');destination.textContent=JSON.stringify(data,null,2);
      const state={state:skipped?'skipped':'complete',passed:String(data.passed),total:String(data.total),failed:String(failed),skipped:String(skipped)};
      Object.assign(destination.dataset,state);Object.assign(output.dataset,state);output.textContent=`${data.suite}: ${data.total-failed-skipped}/${data.total} 通过；失败 ${failed}；跳过 ${skipped}。独立完整报告保留在下方。`;
    }
    async function initial(next){await setPattern('unbarred');await until(litState,'清空黑带后未恢复光效');await setPattern(next);}
    async function rejected(next){await initial(next);await wait(3500);return litState()&&preserved();}
    try{
      await settingsReady;await B.storage.set({enabled:true,removeHorizontalBars:false,removeVerticalBars:false,detectColoredBars:false});
      // Watermark is the first observed source; never establish clean bars first.
      await setPattern('watermark');
      if(native){try{await request;}catch(error){results.push({skipped:true,label:`原生全屏不可用：${error.name}`});return;}await until(()=>document.fullscreenElement===player);}
      else{await leave();setMode('web');}
      await until(()=>root()?.dataset.mode==='fullscreen'&&backdrop());await setShape('horizontal');
      const view=player.getBoundingClientRect(),ratio=video.videoWidth/video.videoHeight,gap=(view.height-view.width/ratio)/2/view.height;
      check(gap>.059&&gap<.061,'外侧上下每边6%留白，超过窄留白门槛');
      const wm=ink();check(wm.maxRow<=.125&&wm.bandTotal<=.05&&wm.bandTotal>.005,'稀疏白水印实测：每行不超过12.5%，全黑带不超过5%');
      await until(protectedState,'初始带稀疏水印的源黑边未被确认');check(true,'初始水印黑边独立确认，不依赖先前纯黑带');
      check(preserved()&&hit(),'确认后纯黑底板覆盖全屏，视频不裁剪、不缩放，控件可命中');
      let start=frames();await wait(500);check(frames()===start,'保护期间光效画布停止采样');
      await initial('subtitles');await until(protectedState,'初始稀疏烧录字幕黑边未被确认');const sub=ink(true);check(preserved()&&hit()&&sub.maxRow<=.15&&sub.bandTotal<=.05,'初始黑带中间60%含稀疏字幕（每行≤15%），独立确认且完整保留字幕');
      await setPattern('unbarred');await until(litState,'无黑边后未恢复动态光效');start=frames();await until(()=>frames()>start+1);check(preserved(),'持续确认无黑边后重新动态采样');
      check(await rejected('colored'),'彩色边不进入黑边纯黑保护');
      check(await rejected('one-sided'),'单侧黑带不进入上下黑边保护');
      check(await rejected('dense-line'),'初始每行超过25%亮覆盖物不进入保护');
      check(await rejected('dense-band'),'初始全黑带超过10%亮覆盖物不进入保护');
      await setPattern('watermark');await setShape('vertical');await wait(3500);check(litState()&&preserved(),'外侧左右留白与内置上下黑边轴向不匹配时仍发光');
      await setShape('horizontal');await until(protectedState);video.pause();await leave();await until(()=>root()?.dataset.mode==='normal'&&!backdrop(),'暂停退出全屏未恢复普通模式');setMode('web');await until(protectedState,'暂停重新全屏未重新确认水印黑边');check(video.paused&&preserved(),'暂停重新全屏无需视频帧回调也能确认水印黑边');
      await leave();await video.play();await until(()=>shown(root())&&!backdrop());check(preserved(),'普通模式保留原有光效、圆角及完整视频');
      await B.storage.set({removeHorizontalBars:true});setMode('wide');await until(()=>root()?.dataset.mode==='theater'&&shown(root()));await wait(3500);check(!backdrop()&&preserved(),'宽屏自动去边仍使用严格检测，水印黑带不被容错裁剪');
      await setPattern('encoded');await until(()=>video.hasAttribute('data-biliglow-bar-crop'),'宽屏纯净黑带未按原功能裁剪');check(shown(root())&&!backdrop(),'宽屏纯净黑带仍按原功能检测裁剪');
      setMode('web');await setPattern('watermark');await until(protectedState);check(preserved()&&hit(),'重新全屏释放去边效果，保留水印和原黑带');
      video.style.transform='scale(.95)';window.dispatchEvent(new Event('resize'));await until(litState,'已有第三方画面变换应退出黑边保护');await wait(1500);check(litState()&&!video.hasAttribute('data-biliglow-bar-crop'),'第三方画面变换时不进行自动黑边保护或裁剪');
      video.style.transform='none';window.dispatchEvent(new Event('resize'));await until(protectedState);check(preserved(),'恢复原始画面布局后能重新确认黑边');
      await B.storage.set({enabled:false});await until(()=>!backdrop());check(!player.hasAttribute('data-biliglow-stage')&&preserved(),'关闭扩展释放黑色底板，不残留视频变换');
      await B.storage.set({enabled:true});await until(protectedState);check(preserved()&&hit(),'重新开启后确认水印黑边，控件可正常命中');
      await setPattern('unbarred');await until(litState);check(preserved(),'重新开启后无黑边视频仍恢复外侧光效');
    }catch(error){check(false,error.message);}
    finally{await leave();await video.play().catch(()=>{});video.style.transform='none';await B.storage.set({enabled:true,roundedCorners:true,removeHorizontalBars:false,detectColoredBars:false});running=false;report();}
  }
  $('#run-web-suite').onclick=()=>suite(false);
  $('#run-native-suite').onclick=()=>{if(running)return;const request=player.requestFullscreen();suite(true,request);};
  setTimeout(()=>{if(output.dataset.state==='preparing'){output.dataset.state='ready';output.textContent='准备就绪；选择网页全屏或原生全屏套件。';}},600);
})();
