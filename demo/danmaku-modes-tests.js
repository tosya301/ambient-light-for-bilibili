/* Full content-script integration: screen transitions, cinema preset, and
   user-gesture native fullscreen. Local synthetic video only. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),B=BiliGlow,F=danmakuFixture,player=$('#player');
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let running=false;
  async function until(test,label){for(let i=0;i<100;i++){if(test())return;await wait(50);}throw new Error(label);}
  async function run(nativeRequest){
    if(running)return;running=true;const saved=await B.storage.get(),checks=[],cases=[],native=Boolean(nativeRequest),nodes=[];
    const check=(passed,label,details)=>checks.push({passed,label,details});
    const buttons=['mode-matrix','mode-native','danmaku-run','danmaku-preview'].map(id=>$('#'+id));buttons.forEach(button=>button.disabled=true);
    $('#mode-report').textContent=JSON.stringify({state:'running',native});$('#mode-results').textContent='模式动态测试中';
    function make(type,top,id){
      const node=document.createElement('span');node.className=`bili-danmaku-x-dm bili-danmaku-x-${type} bili-danmaku-x-show`;
      node.textContent=`模式测试 ${id}`;node.style.setProperty(type==='roll'?'--top':'--translateY',`${top}px`);
      node.style.animationDelay=`-${id%7}s`;if(type==='center')node.style.left=`${20+(id%5)*15}%`;
      $('.bpx-player-row-dm-wrap').append(node);nodes.push(node);return node;
    }
    try{
      if(native){await nativeRequest;await until(()=>document.fullscreenElement===player,'没有进入原生全屏');}
      for(const screen of native?['normal']:['normal','wide','web'])for(const preset of ['soft','cinema']){
        F.setMode(screen);await B.storage.set({...B.defaults,...B.presets[preset],privacyAccepted:true,enabled:true,roundedCorners:true,hideLauncher:true});
        await F.setSource(F.ratios.standard);
        const mode=native||screen==='web'?'fullscreen':screen==='wide'?'theater':'normal';
        await until(()=>$('[data-biliglow-root]')?.dataset.mode===mode,'生产脚本未切换到正确模式');
        for(let i=0;i<12;i++)await frame();
        const root=$('.bpx-player-render-dm-wrap'),height=parseFloat(root.style.getPropertyValue('--biliglow-danmaku-track-height')),gap=mode==='fullscreen'?2:12,step=(height-45)/65;
        const retained=['roll','center'].flatMap(type=>Array.from({length:65},(_,i)=>make(type,i*step,i)));
        await frame();await frame();const before=retained.map(node=>node.getBoundingClientRect().top),pool=[];
        const topCount=retained.filter(node=>Math.abs(parseFloat(node.style.getPropertyValue('--biliglow-danmaku-track-top'))-gap)<.1).length;
        const expectedTop=retained.filter(node=>parseFloat(node.style.getPropertyValue(node.classList.contains('bili-danmaku-x-roll')?'--top':'--translateY'))<=gap).length;
        let drift=0,boundsFailures=0;
        for(let tick=0;tick<100;tick++){
          for(const type of ['roll','center'])pool.push(make(type,((tick*17)%63+.4)*step,tick+100));
          if(pool.length>40)pool.splice(0,2).forEach(node=>node.remove());
          await frame();retained.forEach((node,index)=>{
            const r=node.getBoundingClientRect(),base=root.getBoundingClientRect().top;drift=Math.max(drift,Math.abs(r.top-before[index]));
            if(r.top<base+gap-.2||r.bottom>base+height-gap+.2)boundsFailures++;
          });
        }
        pool.forEach(node=>node.remove());await frame();retained.forEach((node,index)=>drift=Math.max(drift,Math.abs(node.getBoundingClientRect().top-before[index])));
        const label=`${native?'native-fullscreen':screen}/${preset}`,view=BiliGlowPlayer.presentation($('video'),'video',document.fullscreenElement),current=await B.storage.get();
        check(view.mode===mode&&view.native===native,label+' production mode detection',{mode:view.mode,native:view.native});
        check(Object.entries(B.presets[preset]).every(([key,value])=>current[key]===value),label+' preset applied');
        check(topCount===expectedTop,label+' no extra top pile',{topCount,expectedTop});
        check(drift<.1,label+' active rows remain stable',{maxVerticalDrift:drift});
        check(boundsFailures===0,label+' complete rows remain inside bounds',{boundsFailures});
        cases.push({label,mode,native:view.native,preset,frames:100,topCount,expectedTop,maxVerticalDrift:drift,boundsFailures,width:root.getBoundingClientRect().width,height:root.getBoundingClientRect().height});
        nodes.splice(0).forEach(node=>node.remove());await frame();
      }
    }catch(error){check(false,error.message);}
    finally{
      nodes.forEach(node=>node.remove());if(native&&document.fullscreenElement)await document.exitFullscreen();F.setMode('normal');await B.storage.set(saved);await wait(200);
      check(!document.fullscreenElement&&$('[data-biliglow-root]')?.dataset.mode==='normal','exit restores normal mode');
      const failed=checks.filter(item=>!item.passed).length,report={state:'complete',native,passed:failed===0,total:checks.length,failed,cases,checks};
      $('#mode-report').textContent=JSON.stringify(report);$('#mode-results').textContent=`${report.total-failed}/${report.total} 模式检查通过 · ${native?'原生全屏':'普通／宽屏／网页全屏 × 柔和／影院'}`;
      buttons.forEach(button=>button.disabled=false);running=false;
    }
  }
  $('#mode-matrix').addEventListener('click',()=>run(null));
  $('#mode-native').addEventListener('click',()=>{if(!running)run(player.requestFullscreen());});
})();
