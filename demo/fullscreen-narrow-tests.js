/* Standalone production-renderer regression; synthetic consent applies here only. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),B=globalThis.BiliGlow;
  const player=$('#player'),video=$('video'),output=$('#gap-results'),source=document.createElement('canvas'),ctx=source.getContext('2d');
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function until(test){for(let i=0;i<60;i++){if(test())return;await wait(60);}throw Error('等待生产状态超时');}
  const root=()=>$('[data-biliglow-root]'),backdrop=()=>$('[data-biliglow-backdrop]'),frames=()=>Number(root()?.dataset.frames||0);
  const shown=e=>Boolean(e&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden');
  function paint(){
    const w=source.width,h=source.height,g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#17c8ad');g.addColorStop(1,'#e64fae');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#effaff';ctx.lineWidth=6;ctx.strokeRect(12,12,w-24,h-24);ctx.fillStyle='#082e42';ctx.fillRect(w*.2,h*.25,w*.6,h*.5);
    ctx.fillStyle='#fff';ctx.font=`bold ${Math.max(20,w*.04)}px system-ui`;ctx.textAlign='center';ctx.fillText('CONTAIN · COMPLETE PICTURE',w/2,h/2);ctx.font=`${Math.max(16,w*.025)}px system-ui`;ctx.fillText(`${w} × ${h}  /  ${Math.floor(performance.now()/250)}`,w/2,h*.62);
  }
  function dimensions(shape){
    const r=player.getBoundingClientRect(),w=Math.round(r.width*2),h=Math.round(r.height*2);
    return shape==='near-top'?[w,Math.round(h*.95)]:shape==='near-side'?[Math.round(w*.95),h]:shape==='wide-top'?[w,Math.round(h*.93)]:shape==='wide-side'?[Math.round(w*.93),h]:shape==='portrait'?[540,960]:shape==='4:3'?[960,720]:shape==='cinema'?[1440,600]:[960,540];
  }
  function setSource(shape){[source.width,source.height]=dimensions(shape);paint();}
  setSource('16:9');video.srcObject=source.captureStream(24);video.play().catch(()=>{});setInterval(paint,60);
  B.storage.set({...B.defaults,privacyAccepted:true,enabled:true,roundedCorners:true,frameShadow:0,smoothing:0,hideLauncher:true});
  const settingsReady=B.storage.get();
  function setMode(mode){player.dataset.screen=mode;window.dispatchEvent(new Event('resize'));}
  async function load(shape){setSource(shape);await video.play();await until(()=>video.videoWidth===source.width&&video.videoHeight===source.height);await wait(220);}
  function shield(color){const e=backdrop(),r=e?.getBoundingClientRect(),s=e&&getComputedStyle(e);return shown(e)&&s.backgroundColor===color&&s.opacity==='1'&&r.left<=1&&r.top<=1&&r.right>=innerWidth-1&&r.bottom>=innerHeight-1&&s.pointerEvents==='none';}
  function preserved(){return getComputedStyle(video).objectFit==='contain'&&getComputedStyle(video).transform==='none';}
  function hit(){const e=$('#control-hit'),r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}
  async function leave(){if(document.fullscreenElement)await document.exitFullscreen();setMode('normal');}
  $('#normal').onclick=()=>leave();$('#wide').onclick=async()=>{await leave();setMode('wide');};$('#leave').onclick=()=>leave();
  for(const [id,shape] of [['preview-near','near-top'],['preview-wide','wide-top'],['preview-sides','near-side'],['preview-portrait','portrait']])$( '#'+id).onclick=async()=>{setMode('web');await wait(80);await load(shape);output.textContent=JSON.stringify({preview:shape,source:[video.videoWidth,video.videoHeight],rootVisible:shown(root()),backdrop:getComputedStyle(backdrop()).backgroundColor},null,2);};
  let running=false;
  async function suite(native,fullscreenRequest){
    if(running)return;running=true;output.dataset.state='running';const results=[],check=(passed,label)=>{results.push({passed:Boolean(passed),label});};
    const report=()=>{const failed=results.filter(r=>r.passed===false).length,skipped=results.filter(r=>r.skipped).length;const data={suite:native?'native':'web',passed:failed===0&&skipped===0,total:results.length,failed,skipped,results};output.textContent=JSON.stringify(data,null,2);Object.assign(output.dataset,{state:skipped?'skipped':'complete',passed:String(data.passed),total:String(data.total),failed:String(failed),skipped:String(skipped)});};
    try{
      await settingsReady;
      if(native){try{await fullscreenRequest;}catch(error){results.push({skipped:true,label:`原生全屏不可用：${error.name}`});return;}await until(()=>document.fullscreenElement===player);}
      else{
        await leave();await load('16:9');await until(()=>shown(root()));check(!backdrop()&&root().dataset.mode==='normal','普通模式保留光效且无全屏底板');
        setMode('wide');await until(()=>root()?.dataset.mode==='theater');check(!backdrop()&&shown(root())&&preserved(),'宽屏保留光效与原画面');setMode('web');
      }
      await until(()=>root()?.dataset.mode==='fullscreen'&&backdrop());
      for(const shape of ['near-top','near-side']){
        await load(shape);await until(()=>!shown(root())&&shield('rgb(0, 0, 0)'));
        const start=frames();await wait(260);check(frames()===start,`${shape} 停止采样`);check(shield('rgb(0, 0, 0)'),`${shape} 保留纯黑不透明底板`);
        check(preserved()&&hit(),`${shape} 完整画面及控件命中不变`);
        const ratio=video.videoWidth/video.videoHeight,view=player.getBoundingClientRect(),gap=shape==='near-top'?(view.height-view.width/ratio)/2/view.height:(view.width-view.height*ratio)/2/view.width;check(gap>.024&&gap<.026,`${shape} 每侧实测留白为约 2.5%`);
      }
      await B.storage.set({roundedCorners:false});await wait(150);check(!shown(root())&&shield('rgb(0, 0, 0)'),'关闭圆角仍执行窄留白停光');await B.storage.set({roundedCorners:true});
      for(const shape of ['wide-top','wide-side','portrait','4:3','cinema']){
        await load(shape);await until(()=>shown(root())&&shield('rgb(16, 20, 29)'));const start=frames();await until(()=>frames()>start+1);
        check(true,`${shape} 大留白恢复动态光效`);check(preserved()&&hit(),`${shape} 画面和控件保持正常`);
      }
      await load('near-top');await until(()=>!shown(root())&&shield('rgb(0, 0, 0)'));
      await B.storage.set({enabled:false});await until(()=>!backdrop());check(!player.hasAttribute('data-biliglow-stage'),'关闭扩展释放全屏底板');
      await B.storage.set({enabled:true});await until(()=>shield('rgb(0, 0, 0)'));check(!shown(root()),'重新开启恢复窄留白停光');
      await leave();await load('16:9');await until(()=>!backdrop()&&shown(root()));check(root().dataset.mode==='normal'&&preserved(),'退出全屏清理底板并恢复普通播放');
    }catch(error){check(false,error.message);}
    finally{await leave();await B.storage.set({enabled:true,roundedCorners:true});running=false;report();}
  }
  $('#run-web-suite').onclick=()=>suite(false);
  $('#run-native-suite').onclick=()=>{if(running)return;const request=player.requestFullscreen();suite(true,request);};
  setTimeout(()=>{if(output.dataset.state==='preparing'){output.dataset.state='ready';output.textContent='准备就绪；选择网页全屏或原生全屏套件。';}},600);
})();
