/* Real-browser regression for a native live control strip that is hidden,
   shown, fully restyled and replaced between extension layout updates. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),B=window.BiliGlow,P=window.BiliGlowPlayer;
  const shell=$('#fixture-shell'),area=$('#live-player'),video=$('#hover-video');
  const output=$('#hover-results'),summary=$('#hover-summary');
  const effect=P.createLiveBounds(),frameRoot=$('#frame-host').attachShadow({mode:'open'}),pictureFrame=P.createFrame(frameRoot);
  const config={...B.defaults,enabled:true,roundedCorners:true,frameShadow:40};
  const modes={normal:{width:800,ratio:9/16,label:'普通'},wide:{width:1000,ratio:9/16,label:'宽屏'},letterbox:{width:1000,ratio:.6,label:'上下留白'},web:{label:'网页全屏'}};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const tick=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const box=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.8;
  const shade=()=>area.querySelector(':scope > .web-player-controller-bg');
  const controls=()=>$('#web-player-controller-wrap-el');
  const picture=()=>B.contentRect(box(video),video.videoWidth,video.videoHeight,getComputedStyle(video).objectFit);
  const nativeStyle=visible=>'display:'+(visible?'block':'none')+';position:absolute;left:0;bottom:0;width:100%;height:56px;z-index:10;background-image:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.9));';
  const nativeControls='position:absolute;left:0;bottom:0;width:100%;height:0;z-index:13;';
  let mode='normal',running=false,report=null,stream=null,paintTimer=null;
  const expectedShadeRadius=()=>Math.max(0,12-2/(Number.isFinite(devicePixelRatio)&&devicePixelRatio>0?devicePixelRatio:1));
  function nativeOwnershipReset(node){for(const name of [...node.attributes].map(attr=>attr.name))if(name.startsWith('data-biliglow-'))node.removeAttribute(name);}
  function freshControls(){
    const next=document.createElement('div');next.id='web-player-controller-wrap-el';next.className='web-player-controller-wrap';next.style.cssText=nativeControls;
    next.innerHTML='<button type="button" class="play-button">播放 / 暂停</button><button type="button" class="quality-button">画质</button><div class="quality-menu"><strong>向上展开菜单</strong><button type="button">1080P</button></div>';
    controls().replaceWith(next);return next;
  }
  function freshShade(visible){const next=document.createElement('div');next.className='web-player-controller-bg web-player-controller-wrap';next.style.cssText=nativeStyle(visible);shade().replaceWith(next);return next;}
  function layout(settings=config,view={native:false}){
    const screen=mode==='web'?'fullscreen':mode==='wide'?'theater':'normal';
    const p=picture();pictureFrame.update(video,settings,'live',screen,{left:0,top:0},undefined,view);effect.update(video,settings,screen,p,view);
  }
  async function media(){
    if(video.videoWidth)return;
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
    const paint=()=>{const context=canvas.getContext('2d');context.fillStyle='#40cce2';context.fillRect(0,0,960,540);context.fillStyle='#075e79';context.fillRect(8,8,944,524);context.fillStyle='#defcff';context.textAlign='center';context.font='28px sans-serif';context.fillText('本地直播 · 960 × 540',480,240);context.fillText('黑色底栏的左右下角应露出粉色',480,290);context.fillStyle='#9df5ff';context.fillRect(400+Math.sin(performance.now()/600)*120,350,28,28);};
    paint();if(!canvas.captureStream)throw new Error('浏览器不支持 Canvas captureStream');stream=canvas.captureStream(12);paintTimer=setInterval(paint,80);video.srcObject=stream;await video.play();
    const end=performance.now()+5000;while(video.videoWidth!==960&&performance.now()<end)await wait(30);if(video.videoWidth!==960)throw new Error('本地视频元数据未就绪');
  }
  async function scene(nextMode){
    effect.clear();pictureFrame.clear();area.removeAttribute('data-fixture-native-hover');mode=nextMode;shell.dataset.mode=mode;
    const size=modes[mode],width=Math.min(size.width||innerWidth,innerWidth-48);
    if(mode!=='web'){shell.style.width=width+'px';shell.style.height=Math.min(width*size.ratio,innerHeight-64)+'px';}
    $('#live-player-ctnr').className=mode==='web'?'webfullscreen':mode==='wide'?'wide':'normal';
    $('#fixture-label').textContent=modes[mode].label+' · 本地合成画面';freshShade(false);freshControls();await media();await tick();layout();await tick();
  }
  function targetAt(x,y){const element=document.elementFromPoint(x,y);return element?.id||element?.className||element?.tagName||null;}
  function measured(){
    const p=picture(),s=shade(),r=box(s),css=getComputedStyle(s),wrap=controls();
    const corners=[{x:p.left+.75,y:p.top+p.height-.75},{x:p.left+p.width-.75,y:p.top+p.height-.75}];
    const cornerHits=corners.map(point=>({point,shadeHit:document.elementFromPoint(point.x,point.y)===s,target:targetAt(point.x,point.y)}));
    const center={x:p.left+p.width/2,y:p.top+p.height-28};
    const buttons=[...wrap.querySelectorAll('button')].map(button=>{const b=box(button),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return {label:button.textContent,visible:b.width>0&&b.height>0,hit:hit===button||button.contains(hit)};});
    const menu=wrap.querySelector('.quality-menu'),m=box(menu),menuPoint={x:m.left+8,y:m.top+8};
    const menuHit=document.elementFromPoint(menuPoint.x,menuPoint.y);
    const cornersCSS=['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'].map(name=>css[name].split(/\s+/).map(parseFloat));
    return {mode,picture:p,pictureClip:getComputedStyle(video).clipPath,shade:r,style:{display:css.display,clipPath:css.clipPath,borderRadius:css.borderRadius,corners:cornersCSS},nativeHover:{actualPointer:area.matches(':hover'),simulated:area.hasAttribute('data-fixture-native-hover'),ruleActive:css.getPropertyValue('--fixture-hover-style-active').trim()==='1'},cornerHits,centerHit:document.elementFromPoint(center.x,center.y)===s,buttons,menu:{rect:m,extendsAboveRoot:m.top<box(wrap).top-20,hit:menuHit===menu||menu.contains(menuHit)},root:{marked:area.hasAttribute('data-biliglow-live-control-surface'),style:area.getAttribute('style')},childStyle:s.getAttribute('style')};
  }
  function render(){output.dataset.results=JSON.stringify(report.results);output.dataset.total=String(report.results.length);output.dataset.failed=String(report.results.filter(row=>!row.passed).length);output.dataset.passedCount=String(report.results.filter(row=>row.passed).length);summary.textContent=output.dataset.passedCount+' / '+output.dataset.total+' 通过，失败 '+output.dataset.failed;output.textContent=report.results.map(row=>(row.passed?'✓ ':'✗ ')+row.label+(row.detail?' · '+row.detail:'')).join('\n');}
  function check(passed,label,detail='',evidence){report.results.push({passed:Boolean(passed),label,detail,...(evidence?{evidence}:{})});render();}
  function inspect(label){
    const sample=measured();report.samples.push({label,...sample});
    check(sample.cornerHits.every(hit=>!hit.shadeHit),label+'：左右下角均被实际裁掉',sample.cornerHits.map(hit=>hit.target).join(' / '),sample);
    const expectedRadius=expectedShadeRadius();
    check(sample.style.clipPath==='none'&&sample.style.corners.every((values,index)=>values.every(value=>Math.abs(value-(index<2?0:expectedRadius))<.1))&&/round\s+12px/.test(sample.pictureClip),label+'：背景下角匹配本模式，不叠加 clip-path',`预期 ${expectedRadius.toFixed(3)}px；视频仍为 12px`);
    check(sample.centerHit,label+'：中央渐变仍完整显示');
    check(close(sample.shade.left,sample.picture.left)&&close(sample.shade.width,sample.picture.width)&&close(sample.shade.bottom,sample.picture.top+sample.picture.height),label+'：底栏贴合真实画面',`left ${sample.shade.left.toFixed(2)} / width ${sample.shade.width.toFixed(2)} / bottom ${sample.shade.bottom.toFixed(2)}`);
    check(sample.buttons.every(button=>button.visible&&button.hit)&&sample.menu.extendsAboveRoot&&sample.menu.hit,label+'：播放、画质及向上展开菜单均可命中');
  }
  function cleanRoot(){return !area.hasAttribute('data-biliglow-live-control-surface')&&![...area.style].some(name=>/^--biliglow-live-(control-|shade-)/.test(name));}
  function cleanChildren(){return [shade(),controls()].every(node=>![...node.attributes].some(attr=>/^data-biliglow-live-control-/.test(attr.name))&&![...node.style].some(name=>/^--biliglow-live-(control-|shade-)/.test(name)));}
  async function run(){
    if(running)return report;running=true;document.body.dataset.running='true';document.body.dataset.preview='false';document.documentElement.setAttribute('data-biliglow-active','');
    report={version:1,started:new Date().toISOString(),userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},devicePixelRatio,results:[],samples:[]};output.dataset.state='running';delete output.dataset.passed;for(const button of document.querySelectorAll('main> .actions button,main> .actions select'))button.disabled=true;
    try{
      for(const key of Object.keys(modes)){
        await scene(key);const label=modes[key].label;
        check(getComputedStyle(shade()).display==='none',label+'：原生渐变初始隐藏');
        shade().style.display='block';inspect(label+' / 首次显示');
        // No effect.update between native mutations and measurements. A full
        // style overwrite discards every per-child extension custom property.
        shade().style.cssText=nativeStyle(true);controls().style.cssText=nativeControls;inspect(label+' / 整段 style 重写后同步');
        await tick();inspect(label+' / 整段 style 重写后的首帧');
        shade().className='web-player-controller-bg web-player-controller-wrap';controls().className='web-player-controller-wrap';nativeOwnershipReset(shade());nativeOwnershipReset(controls());inspect(label+' / 原生 class 和属性重写');
        const oldShade=shade(),oldControls=controls();freshShade(true);freshControls();check(!oldShade.isConnected&&!oldControls.isConnected,label+'：模拟控制栏节点已重建');inspect(label+' / 节点重建后同步');
        await tick();inspect(label+' / 节点重建后的首帧');
        area.setAttribute('data-fixture-native-hover','');
        check(measured().nativeHover.ruleActive,label+'：已启用与 :hover 共用的模拟原生样式','模拟状态，不代表实际鼠标悬停');
        inspect(label+' / 模拟原生 hover 组合样式');
        await wait(1500);inspect(label+' / 停留 1500 ms 后');
        shade().style.height='8px';const shallow=measured(),shallowRect=shallow.shade;
        const insetHit=document.elementFromPoint(shallowRect.right-9,shallowRect.bottom-.75)===shade();
        check(close(shallowRect.height,8)&&shallow.cornerHits.every(hit=>!hit.shadeHit)&&insetHit&&shallow.style.clipPath==='none',label+'：8px 原生浅条由 CSS 自动缩减圆角，无额外裁切',`声明 ${expectedShadeRadius().toFixed(3)}px，实际圆角受原生 8px 高度约束`);
        shade().style.height='56px';area.removeAttribute('data-fixture-native-hover');
        layout({...config,roundedCorners:false});const square=measured();check(square.cornerHits.every(hit=>hit.shadeHit),label+'：关闭圆角恢复原生方角');
        layout(config,{native:true});check(cleanRoot()&&cleanChildren(),label+'：原生全屏清除控制栏适配');
        layout(config);effect.clear();pictureFrame.clear();check(cleanRoot()&&cleanChildren()&&!video.hasAttribute('data-biliglow-live-picture-rounded'),label+'：关闭适配清理根与子节点的样式和标记');
      }
    }catch(error){check(false,'回归中断',error.stack||error.message);}
    finally{
      document.body.dataset.running='false';try{await scene('normal');shade().style.display='block';}catch(error){check(false,'恢复预览失败',error.message);}
      running=false;report.finished=new Date().toISOString();report.passed=report.results.length>0&&report.results.every(row=>row.passed);output.dataset.state='complete';output.dataset.passed=String(report.passed);render();window.liveHoverReport=report;for(const control of document.querySelectorAll('main> .actions button,main> .actions select'))control.disabled=false;$('#download-hover-report').disabled=false;
    }
    return report;
  }
  async function preview(){if(running)return;document.documentElement.setAttribute('data-biliglow-active','');document.body.dataset.preview='true';await scene($('#preview-mode').value);shade().style.display='block';}
  $('#run-hover-tests').addEventListener('click',run);$('#preview-hover').addEventListener('click',()=>preview().catch(error=>$('#error-note').textContent=error.message));
  $('#preview-rebuild').addEventListener('click',()=>{
    if(running)return;
    if(!video.videoWidth){$('#error-note').textContent='本地视频正在准备，请稍后重试。';return;}
    freshShade(true);freshControls();
    const sample=measured();
    summary.textContent='已模拟原生控制栏重建，未重新执行布局；左下角命中：'+sample.cornerHits[0].target+'，右下角命中：'+sample.cornerHits[1].target+'。';
    summary.dataset.rebuildEvidence=JSON.stringify(sample);
  });
  $('#download-hover-report').addEventListener('click',()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='live-hover-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const exit=async()=>{if(running)return;document.body.dataset.preview='false';$('#preview-mode').value='normal';await scene('normal');shade().style.display='block';};
  $('#exit-preview').addEventListener('click',exit);document.addEventListener('keydown',event=>{if(event.key==='Escape')exit().catch(error=>$('#error-note').textContent=error.message);});
  window.addEventListener('pagehide',()=>{clearInterval(paintTimer);stream?.getTracks().forEach(track=>track.stop());effect.clear();pictureFrame.clear();});
  window.liveHoverFixture={run,preview,measured};scene('normal').catch(error=>$('#error-note').textContent=error.message);
})();
