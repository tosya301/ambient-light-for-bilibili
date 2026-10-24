/* Production DOM regression for issue #3. All media and messages are local. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),video=$('video'),area=$('.bpx-player-video-area');
  const root=$('.bpx-player-render-dm-wrap'),row=$('.bpx-player-row-dm-wrap'),adapter=BiliGlowPlayer.createDanmakuBounds();
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  let mode='normal',rounded=true;
  const update=()=>adapter.update(video,{enabled:true,roundedCorners:rounded},'video',mode,BiliGlow.contentRect(video.getBoundingClientRect(),video.videoWidth,video.videoHeight,'contain'));
  function message(type,top,index){
    const node=document.createElement('span');node.className=`bili-danmaku-x-dm bili-danmaku-x-${type} bili-danmaku-x-show`;
    node.style.setProperty(type==='roll'?'--top':'--translateY',`${top}px`);
    node.style.animationDelay=`-${(index%20)*.3}s`;node.textContent=type==='roll'?`滚动 ${index}`:`固定 ${index}`;
    if(type==='center')node.style.left=`${20+(index%5)*15}%`;
    row.append(node);return node;
  }
  const nativeStyle=node=>JSON.stringify([...node.style].filter(name=>name!=='--biliglow-danmaku-track-top').map(name=>[name,node.style.getPropertyValue(name),node.style.getPropertyPriority(name)]));
  function positions(nodes){return nodes.map(node=>node.getBoundingClientRect().top);}
  function maxDrift(nodes,before){return Math.max(0,...positions(nodes).map((top,index)=>Math.abs(top-before[index])));}
  async function run(){
    $('#run').disabled=true;const cases=[],checks=[];let samples=0;
    const check=(passed,label,details)=>checks.push({passed,label,details});
    try{
      await video.play();document.documentElement.setAttribute('data-biliglow-active','');
      for(const config of [{mode:'normal',width:960,height:540,rounded:true},{mode:'theater',width:1200,height:675,rounded:true},
        {mode:'fullscreen',width:1280,height:720,rounded:false},{mode:'normal',width:760,height:428,rounded:false}]){
        mode=config.mode;rounded=config.rounded;area.style.width=`${config.width}px`;area.style.height=`${config.height}px`;
        adapter.clear();row.replaceChildren();update();await frame();
        const height=parseFloat(root.style.getPropertyValue('--biliglow-danmaku-track-height')),gap=rounded?12:2,step=(height-45)/65;
        const retained=['roll','center'].flatMap(type=>Array.from({length:65},(_,i)=>message(type,i*step,i)));
        update();await frame();const before=positions(retained),startLeft=retained[13].getBoundingClientRect().left;
        const atTop=retained.filter(node=>Math.abs(parseFloat(node.style.getPropertyValue('--biliglow-danmaku-track-top'))-gap)<.1).length;
        const nativeAtTop=retained.filter(node=>parseFloat(node.style.getPropertyValue(node.classList.contains('bili-danmaku-x-roll')?'--top':'--translateY'))<=gap).length;
        let drift=0,boundsFailures=0;const pool=[];
        for(let tick=0;tick<120;tick++){
          for(const type of ['roll','center'])pool.push(message(type,((tick*17)%63+.4)*step,tick+100));
          if(pool.length>40)pool.splice(0,2).forEach(node=>node.remove());
          await frame();samples++;drift=Math.max(drift,maxDrift(retained,before));
          for(const node of retained){const r=node.getBoundingClientRect(),base=root.getBoundingClientRect().top;if(r.top<base+gap-.2||r.bottom>base+height-gap+.2)boundsFailures++;}
        }
        pool.forEach(node=>node.remove());await frame();drift=Math.max(drift,maxDrift(retained,before));
        const moved=Math.abs(retained[13].getBoundingClientRect().left-startLeft)>10;
        const label=`${mode} ${config.width}×${config.height} ${rounded?'圆角':'直角'}`;
        check(atTop===nativeAtTop,`${label}：无新增顶部聚集`,{atTop,nativeAtTop});
        check(drift<.1,`${label}：弹幕生灭不移动已有轨道`,{maxVerticalDrift:drift});
        check(boundsFailures===0,`${label}：完整行仍在安全边界内`,{boundsFailures});
        check(moved,`${label}：原生横向动画持续运行`);
        const native=retained.map(nativeStyle);
        adapter.clear();check(retained.every((node,index)=>!node.style.getPropertyValue('--biliglow-danmaku-track-top')&&nativeStyle(node)===native[index]),`${label}：清理恢复原生节点样式`);
        cases.push({config,atTop,nativeAtTop,maxVerticalDrift:drift,boundsFailures,samples:120});
      }
    }catch(error){check(false,error.message);}
    finally{
      const failed=checks.filter(item=>!item.passed).length,report={state:'complete',passed:failed===0,total:checks.length,failed,samples,cases,checks};
      $('#report').textContent=JSON.stringify(report);$('#result').textContent=JSON.stringify(report,null,2);$('#status').textContent=`${checks.length-failed}/${checks.length} 通过，${samples} 帧`;
      $('#run').disabled=false;update();
    }
  }
  $('#run').addEventListener('click',run);video.addEventListener('loadeddata',()=>{$('#status').textContent='就绪';update();});
})();
