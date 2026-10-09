/* Standalone browser fixture for the production danmaku boundary adapter.
   The old static zero-height root renders against video-area, reproducing
   spill into letterboxing without copying any proposed extension fix. */
(() => {
  'use strict';
  const B=globalThis.BiliGlow,$=selector=>document.querySelector(selector);
  const player=$('#player'),shell=$('#playerWrap'),area=$('.bpx-player-video-area'),wrap=$('.bpx-player-video-wrap');
  const output=$('#danmaku-results'),status=$('#lab-status'),run=$('#danmaku-run');
  const ratios={standard:{name:'16:9',width:1920,height:1080},'four-three':{name:'4:3',width:1440,height:1080},square:{name:'方形 1:1',width:720,height:720},portrait:{name:'竖向 3:4',width:810,height:1080},mac:{name:'Mac 1670:1080',width:1670,height:1080}};
  const owned='data-biliglow-danmaku-bounds',ownedVariables=['left','top','width','height','radius','track-height'].map(key=>`--biliglow-danmaku-${key}`);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.8;
  const sameRect=(a,b)=>['left','top','width','height'].every(key=>close(a[key],b[key]));
  const sameSize=(a,b)=>['width','height'].every(key=>close(a[key],b[key]));
  const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const intersection=(a,b)=>{const left=Math.max(a.left,b.left),top=Math.max(a.top,b.top),right=Math.min(a.left+a.width,b.right),bottom=Math.min(a.top+a.height,b.bottom);return {left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top),right,bottom};};
  let video=$('#test-video'),renderer=null,stream=null,timer=null,sourceCanvas=null,activeRatio=ratios.standard,previousMode='normal',running=false,commandClicks=0;
  async function until(test,label,timeout=6000){const end=performance.now()+timeout;while(performance.now()<end){if(test())return;await wait(50);}throw new Error(label||'浏览器状态未按预期更新');}
  function expandedInset(value){
    const match=value?.match(/^inset\(([^()]*?)(?: round ([^()]+))?\)$/);if(!match)return null;
    const parts=match[1].trim().split(/\s+/);if(parts.length<1||parts.length>4||parts.some(part=>!part.endsWith('px')||!Number.isFinite(parseFloat(part))))return null;
    const n=parts.map(parseFloat);return {values:[n[0],n[1]??n[0],n[2]??n[0],n[3]??n[1]??n[0]],radius:match[2]||'0px'};
  }
  function pictureRect(){
    const r=rect(video),css=getComputedStyle(video),clip=expandedInset(css.clipPath);
    if(video.hasAttribute('data-biliglow-bar-crop')&&clip){
      const m=new DOMMatrixReadOnly(css.transform),width=r.width/m.a,height=r.height/m.d;
      const native={left:r.left-m.e,top:r.top-m.f,width,height};
      const content=B.contentRect({left:0,top:0,width,height},video.videoWidth,video.videoHeight,css.objectFit),i=clip.values;
      const left=Math.max(content.left,i[3]),top=Math.max(content.top,i[0]),right=Math.min(content.left+content.width,width-i[1]),bottom=Math.min(content.top+content.height,height-i[2]);
      return {left:native.left+m.e+left*m.a,top:native.top+m.f+top*m.d,width:Math.max(0,right-left)*m.a,height:Math.max(0,bottom-top)*m.d};
    }
    return B.contentRect(r,video.videoWidth,video.videoHeight,css.objectFit);
  }
  const targetRect=()=>intersection(pictureRect(),rect(area));
  function makeRenderer(){
    const root=document.createElement('div');root.className='bpx-player-render-dm-wrap';root.dataset.fixtureDanmaku='';root.setAttribute('aria-label','本地测试弹幕渲染层');
    root.innerHTML='<div class="bpx-player-dm-svg-mask-wrap"></div><div class="bpx-player-dm-mask-wrap"><div class="bpx-player-dm-mask"><div class="bpx-player-row-dm-wrap"><span class="bili-danmaku-x-dm bili-danmaku-x-roll bili-danmaku-x-show dm-line top" data-native-track="roll-top" style="--top:-10px">顶部滚动弹幕应完整显示</span><span class="bili-danmaku-x-dm bili-danmaku-x-roll bili-danmaku-x-show dm-line middle" style="--top:80px">滚动弹幕跟随当前画面尺寸</span><span class="bili-danmaku-x-dm bili-danmaku-x-roll bili-danmaku-x-show dm-line bottom" data-native-track="roll-bottom" style="--top:710px">底部滚动弹幕第一轨完整</span><span class="bili-danmaku-x-dm bili-danmaku-x-roll bili-danmaku-x-show dm-line bottom second" data-native-track="roll-bottom-2" style="--top:740px">底部滚动弹幕第二轨完整</span><span class="bili-danmaku-x-dm bili-danmaku-x-center bili-danmaku-x-show dm-fixed top" data-native-track="fixed-top" style="--translateY:-10px">顶部固定弹幕完整</span><span class="bili-danmaku-x-dm bili-danmaku-x-center bili-danmaku-x-show dm-fixed bottom" data-native-track="fixed-bottom" style="--translateY:710px">底部固定弹幕第一轨</span><span class="bili-danmaku-x-dm bili-danmaku-x-center bili-danmaku-x-show dm-fixed bottom second" data-native-track="fixed-bottom-2" style="--translateY:740px">底部固定弹幕第二轨</span></div><div class="bpx-player-adv-dm-wrap"><span class="dm-advanced">高级弹幕上下越界测试</span></div></div></div><div class="bpx-player-bas-dm-wrap"><canvas class="dm-grid" width="1024" height="640"></canvas><span class="dm-bas">BAS 弹幕从左侧越界</span></div><div class="bpx-player-cmd-dm-wrap"><button class="dm-command" type="button">互动弹幕</button></div>';
    root.querySelector('.dm-command').addEventListener('click',()=>{commandClicks++;status.textContent=`互动弹幕按钮已命中 ${commandClicks} 次`;});
    const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#facc64';ctx.lineWidth=3;
    for(let x=0;x<=canvas.width;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    for(let y=0;y<=canvas.height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
    ctx.strokeStyle='#ff65bd';ctx.lineWidth=14;ctx.strokeRect(7,7,canvas.width-14,canvas.height-14);
    area.insertBefore(root,area.querySelector('.bpx-player-control-wrap'));renderer=root;updateNativeTracks();return root;
  }
  function updateNativeTracks(){
    if(!renderer)return;
    const nativeStageHeight=rect(area).height,overBottom=`${nativeStageHeight+30}px`,secondBottom=`${nativeStageHeight+60}px`;
    renderer.querySelector('[data-native-track="roll-bottom"]').style.setProperty('--top',overBottom);
    renderer.querySelector('[data-native-track="roll-bottom-2"]').style.setProperty('--top',secondBottom);
    renderer.querySelector('[data-native-track="fixed-bottom"]').style.setProperty('--translateY',overBottom);
    renderer.querySelector('[data-native-track="fixed-bottom-2"]').style.setProperty('--translateY',secondBottom);
    renderer.querySelector('.dm-line.middle').style.setProperty('--top',`${Math.max(30,nativeStageHeight*.4)}px`);
    renderer.dataset.nativeStageHeight=String(nativeStageHeight);
  }
  function setMode(mode){
    if(mode!=='mini')previousMode=mode==='web'?'normal':mode;
    player.dataset.screen=mode;document.body.dataset.labMode=mode;$('#mode-select').value=mode;
    const width=Math.min(mode==='wide'?1080:760,innerWidth-48);shell.style.width=`${width}px`;shell.style.height=`${width*9/16+56}px`;
    window.dispatchEvent(new Event('resize'));
  }
  function paintSource(bars){
    const c=sourceCanvas,ctx=c.getContext('2d'),size=Math.max(15,Math.round(c.width/24));
    for(let y=0;y<c.height;y+=size)for(let x=0;x<c.width;x+=size){ctx.fillStyle=(Math.floor(x/size)+Math.floor(y/size))%2?'#338f91':'#523964';ctx.fillRect(x,y,size,size);}
    ctx.strokeStyle='#8effd8';ctx.lineWidth=8;ctx.strokeRect(8,8,c.width-16,c.height-16);ctx.fillStyle='#effffb';ctx.font=`${Math.max(20,c.width/28)}px system-ui`;ctx.fillText(`${c.width} × ${c.height}`,24,c.height*.48);
    ctx.fillStyle=Math.floor(performance.now()/180)%2?'#fff58b':'#8fe9ff';ctx.fillRect(c.width*.48,c.height*.53,c.width*.045,c.height*.04);
    if(bars){ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height/8);ctx.fillRect(0,c.height*7/8,c.width,c.height/8);}
  }
  async function setSource(ratio,bars=false){
    clearInterval(timer);stream?.getTracks().forEach(track=>track.stop());activeRatio=ratio;sourceCanvas=document.createElement('canvas');sourceCanvas.width=ratio.width;sourceCanvas.height=ratio.height;
    paintSource(bars);stream=sourceCanvas.captureStream(12);video.srcObject=stream;video.muted=true;timer=setInterval(()=>paintSource(bars),100);
    await video.play();await until(()=>video.readyState>=2&&video.videoWidth===ratio.width&&video.videoHeight===ratio.height,'合成媒体元数据没有更新');await wait(180);updateNativeTracks();
  }
  async function settings(patch){await B.storage.set(patch);await wait(180);}
  async function settle(){
    let previous=rect(area),stable=0;
    for(let i=0;i<25;i++){await wait(80);const current=rect(area);stable=sameRect(previous,current)?stable+1:0;if(stable>=2)return;previous=current;}
    throw new Error('播放器尺寸持续变化');
  }
  function snapshot(){
    const root=renderer,css=root?getComputedStyle(root):null;
    return {mode:player.dataset.screen,metadata:{width:video.videoWidth,height:video.videoHeight},picture:pictureRect(),target:targetRect(),area:rect(area),video:rect(video),wrap:rect(wrap),shell:rect(shell),renderer:root?rect(root):null,
      controls:rect(area.querySelector('.bpx-player-control-wrap')),trackHeight:root?.style.getPropertyValue('--biliglow-danmaku-track-height')||'',
      owned:Boolean(root?.hasAttribute(owned)),variables:Object.fromEntries(ownedVariables.map(key=>[key,root?.style.getPropertyValue(key)||''])),rendererPosition:css?.position,rendererOverflow:css?.overflow,rendererClip:css?.clipPath,
      layers:root?[...root.children].map(layer=>({className:layer.className,rect:rect(layer)})):[],nativeSize:area.hasAttribute('data-biliglow-native-size'),rounded:area.hasAttribute('data-biliglow-rounded'),extra:shell.style.getPropertyValue('--biliglow-player-extra'),
      normalLines:root?[...root.querySelectorAll('[data-native-track]')].map(line=>{const css=getComputedStyle(line);return {id:line.dataset.nativeTrack,rect:rect(line),fontSize:css.fontSize,lineHeight:css.lineHeight,transform:css.transform,animationName:css.animationName,nativeTop:line.style.getPropertyValue('--top'),nativeTranslateY:line.style.getPropertyValue('--translateY'),ownedTrackTop:line.style.getPropertyValue('--biliglow-danmaku-track-top')};}):[],
      nativeStageHeight:root?.dataset.nativeStageHeight,areaScrollTop:area.scrollTop,
      crop:video.hasAttribute('data-biliglow-bar-crop'),videoClip:getComputedStyle(video).clipPath,transform:getComputedStyle(video).transform,scrollY,scrollHeight:document.documentElement.scrollHeight};
  }
  function hit(element){const r=rect(element);if(r.width<=0||r.height<=0)return false;const target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return target===element||element.contains(target);}
  async function probeClipping(expectedRadius){
    const target=targetRect(),layer=renderer.querySelector('.bpx-player-row-dm-wrap'),lr=rect(layer),samples=[],probes=[];
    const points={top:{inside:[target.left+target.width/2,target.top+14],outside:[target.left+target.width/2,target.top-8]},right:{inside:[target.right-14,target.top+target.height/2],outside:[target.right+8,target.top+target.height/2]},bottom:{inside:[target.left+target.width/2,target.bottom-14],outside:[target.left+target.width/2,target.bottom+8]},left:{inside:[target.left+14,target.top+target.height/2],outside:[target.left-8,target.top+target.height/2]}};
    document.body.classList.add('testing-probes');
    try{
      for(const [side,pair] of Object.entries(points))for(const [kind,point] of Object.entries(pair)){
        const probe=document.createElement('i');probe.className='dm-probe';probe.dataset.side=side;probe.dataset.position=kind;
        probe.style.left=`${point[0]-lr.left-4}px`;probe.style.top=`${point[1]-lr.top-4}px`;layer.append(probe);probes.push(probe);
        const inViewport=point[0]>=0&&point[0]<innerWidth&&point[1]>=0&&point[1]<innerHeight;
        samples.push({side,kind,point,inViewport,probe,expected:kind==='inside'});
      }
      const corner=document.createElement('i');corner.className='dm-probe';corner.style.cssText=`width:3px;height:3px;left:${target.left-lr.left+1}px;top:${target.top-lr.top+1}px`;layer.append(corner);probes.push(corner);
      await wait(20);
      const observations=samples.map(({probe,...sample})=>({...sample,paintHit:sample.inViewport?document.elementFromPoint(...sample.point)===probe:false}));
      const cornerPoint=[target.left+2.5,target.top+2.5],cornerAvailable=cornerPoint[0]>=0&&cornerPoint[0]<innerWidth&&cornerPoint[1]>=0&&cornerPoint[1]<innerHeight;
      const cornerHit=cornerAvailable&&document.elementFromPoint(...cornerPoint)===corner;
      return {passed:observations.every(sample=>!sample.inViewport&&!sample.expected||sample.paintHit===sample.expected),observations,cornerAvailable,cornerHit,cornerPassed:!cornerAvailable||cornerHit===(expectedRadius===0)};
    }finally{probes.forEach(probe=>probe.remove());document.body.classList.remove('testing-probes');}
  }
  function cleanRoot(root){return !root.hasAttribute(owned)&&ownedVariables.every(key=>root.style.getPropertyValue(key)==='')&&[...root.querySelectorAll('.bili-danmaku-x-dm')].every(line=>line.style.getPropertyValue('--biliglow-danmaku-track-top')==='');}
  function cleanupSnapshot(root){
    const css=getComputedStyle(root);
    return {className:root.className,connected:root.isConnected,owned:root.hasAttribute(owned),variables:Object.fromEntries(ownedVariables.map(key=>[key,root.style.getPropertyValue(key)])),
      position:css.position,overflow:css.overflow,clipPath:css.clipPath,rect:rect(root),clean:cleanRoot(root),
      tracks:[...root.querySelectorAll('.bili-danmaku-x-dm')].map(line=>({id:line.dataset.nativeTrack||'middle',ownedTrackTop:line.style.getPropertyValue('--biliglow-danmaku-track-top'),
        nativeTop:line.style.getPropertyValue('--top'),nativeTranslateY:line.style.getPropertyValue('--translateY')}))};
  }
  async function visible(){if(player.dataset.screen!=='web'&&player.dataset.screen!=='mini')area.scrollIntoView({block:'center',behavior:'instant'});await wait(60);}
  async function inspectBoundary(label,check,cases,rounded=true){
    await settle();await visible();updateNativeTracks();await wait(20);const state=snapshot(),radius=rounded&&state.mode!=='web'?12:0,probe=await probeClipping(radius);
    check(state.owned&&state.rendererPosition==='absolute'&&sameRect(state.renderer,state.target)&&state.layers.every(layer=>sameRect(layer.rect,state.renderer)),`${label}：弹幕根与四层画布准确跟随当前有效画面`);
    check(state.rendererOverflow==='clip'&&state.rendererClip?.startsWith('inset('),`${label}：仅弹幕渲染根裁切，子层保持 100% 布局`);
    check(probe.passed,`${label}：四边内部探针可命中，越界探针实际被裁切`);
    check(probe.cornerPassed,`${label}：${radius?'圆角':'直角'}的实际命中区域正确`);
    check(hit($('#play-control'))&&(state.mode==='mini'||hit($('#sending-input'))),`${label}：播放器控件与发送框仍可命中`);
    const margin=radius||2;
    check(state.normalLines.length===6&&state.normalLines.every(line=>line.rect.top>=state.target.top+margin-.8&&line.rect.bottom<=state.target.bottom-margin+.8&&line.rect.bottom<=state.controls.top-margin+.8&&close(line.rect.height,parseFloat(line.lineHeight))),`${label}：六条普通／固定顶部底部弹幕整行保持在安全画面内，底部避开控制条`);
    const packing=Object.fromEntries(['roll-','fixed-'].map(type=>{
      const tracks=state.normalLines.filter(line=>line.id.startsWith(type)).sort((a,b)=>a.rect.top-b.rect.top);
      return [type,{tracks:tracks.map(line=>({id:line.id,top:line.rect.top,bottom:line.rect.bottom,nativeCoordinate:line.nativeTop||line.nativeTranslateY,ownedTrackTop:line.ownedTrackTop})),
        gaps:tracks.slice(1).map((line,index)=>line.rect.top-tracks[index].rect.bottom)}];
    }));
    check(Object.values(packing).every(group=>group.tracks.length===3&&group.gaps.every(gap=>gap>=.95)),`${label}：同类型顶部与两条底部轨道不重叠，保留至少 1px 间距`);
    check(state.normalLines.every(line=>{
      const m=new DOMMatrixReadOnly(line.transform),roll=line.id.startsWith('roll-');
      return line.fontSize==='25px'&&close(parseFloat(line.lineHeight),28.125)&&close(m.a,1)&&close(m.d,1)&&close(m.b,0)&&close(m.c,0)&&(roll?close(m.f,0)&&line.animationName==='dm-roll':close(m.f,parseFloat(line.nativeTranslateY)));
    }),`${label}：原生 25px 字号、行高及横向／固定平移变换不变`);
    const rolling=renderer.querySelector('[data-native-track="roll-top"]'),beforeMotion=rect(rolling);await wait(120);const afterMotion=rect(rolling);
    check(Math.abs(afterMotion.left-beforeMotion.left)>5&&close(beforeMotion.top,afterMotion.top)&&close(beforeMotion.height,afterMotion.height),`${label}：普通弹幕继续横移，垂直行框不抖动`);
    const advanced=renderer.querySelector('.dm-advanced'),bas=renderer.querySelector('.dm-bas');advanced.getAnimations().forEach(animation=>{animation.currentTime=0;});
    const exceptional={advanced:rect(advanced),advancedAnimation:getComputedStyle(advanced).animationName,bas:rect(bas),renderer:rect(renderer)};
    check(exceptional.advancedAnimation==='dm-vertical'&&exceptional.advanced.top<exceptional.renderer.top&&exceptional.bas.left<exceptional.renderer.left-20,`${label}：高级／BAS 异常轨迹保持原生，仅由渲染根裁切`);
    cases.push({label,state,probe,packing,motion:{before:beforeMotion,after:afterMotion},exceptional});return state;
  }
  async function runChecks(){
    if(running)return;running=true;run.disabled=true;$('#danmaku-preview').disabled=true;output.dataset.state='running';delete output.dataset.passed;
    const saved=await B.storage.get(),results=[],cases=[];window.__danmakuResults={state:'running',results,cases};$('#danmaku-report').textContent=JSON.stringify({state:'running'});
    const check=(passed,label)=>{results.push({passed:Boolean(passed),label});output.textContent=results.map(item=>`${item.passed?'✓':'✗'} ${item.label}`).join('\n');};
    try{
      await settings({...B.defaults,privacyAccepted:true,enabled:true,roundedCorners:true,frameShadow:0,removeHorizontalBars:false,removeVerticalBars:false,fillRemovedBars:false,hideLauncher:true});
      for(const mode of ['normal','wide','web'])for(const ratio of Object.values(ratios)){
        setMode(mode);await settings({roundedCorners:false,removeHorizontalBars:false,fillRemovedBars:false});await setSource(ratio);await settle();const before=snapshot();
        await settings({roundedCorners:true});const label=`${mode} · ${ratio.name}`,after=await inspectBoundary(label,check,cases,true);
        const native=ratio.width*3<=ratio.height*4;
        // inspectBoundary centers the player in the viewport. That scroll may
        // change top/left without changing its layout or media size.
        const nativeExpected=mode==='web'||native||ratio.width===1920;
        cases[cases.length-1].sizeComparison={before,after,nativeExpected,widthDelta:after.area.width-before.area.width,heightDelta:after.area.height-before.area.height,
          beforeAreaInShell:{left:before.area.left-before.shell.left,top:before.area.top-before.shell.top,width:before.area.width,height:before.area.height},
          afterAreaInShell:{left:after.area.left-after.shell.left,top:after.area.top-after.shell.top,width:after.area.width,height:after.area.height}};
        check(nativeExpected?sameSize(before.area,after.area):after.area.height>before.area.height+1,`${label}：.15 视频尺寸规则保持，方形原生与 Mac 放大不变`);
        check(after.metadata.width===ratio.width&&after.metadata.height===ratio.height,`${label}：使用真实合成媒体比例`);
      }
      for(const mode of ['normal','wide','web']){
        setMode(mode);await setSource(ratios.square);await settings({roundedCorners:false});await inspectBoundary(`${mode} · 关闭圆角`,check,cases,false);
      }
      setMode('normal');await setSource(ratios.standard);await settings({roundedCorners:false});await visible();
      const overflowProbe=document.createElement('div');overflowProbe.setAttribute('aria-hidden','true');overflowProbe.style.cssText='position:absolute;top:100%;left:0;width:1px;height:9px;pointer-events:none';area.append(overflowProbe);
      try{
        area.scrollTop=9;window.dispatchEvent(new Event('scroll'));await wait(160);
        check(close(area.scrollTop,9)&&getComputedStyle(area).overflow==='hidden','真实 native hidden 播放器内部产生 9px 滚动');
        await inspectBoundary('播放器内部 scrollTop 9px',check,cases,false);
      }finally{area.scrollTop=0;overflowProbe.remove();window.dispatchEvent(new Event('scroll'));await wait(120);}
      for(const ratio of [ratios.square,ratios.mac]){
        setMode('wide');await settings({roundedCorners:true,removeHorizontalBars:false,fillRemovedBars:false});await setSource(ratio,true);await visible();
        await settings({removeHorizontalBars:true,fillRemovedBars:true});await until(()=>video.hasAttribute('data-biliglow-bar-crop'),'去边未完成连续帧确认',12000);
        const state=await inspectBoundary(`宽屏去边填充 · ${ratio.name}`,check,cases,true);
        check(state.crop&&state.transform!=='none'&&state.videoClip!=='none',`${ratio.name}：弹幕裁切跟随去边后的实际画面`);
        await settings({removeHorizontalBars:false,fillRemovedBars:false});
      }
      setMode('normal');await setSource(ratios.mac);await settings({roundedCorners:true});await settle();const initial=snapshot();
      setMode('mini');await settle();const mini=snapshot();cases.push({label:'mini-initial',normal:initial,mini});check(close(initial.shell.height,mini.shell.height)&&initial.extra===mini.extra,'进入小窗保留播放器原有页面占位');
      for(const target of [200,700,1400]){
        window.scrollTo({top:target,behavior:'instant'});await wait(200);const state=snapshot();
        check(close(scrollY,target)&&state.scrollHeight===mini.scrollHeight&&close(state.shell.height,mini.shell.height)&&state.extra===mini.extra,`小窗滚动到 ${target}px：页面长度和占位保持稳定`);
        check(state.owned&&sameRect(state.renderer,state.target),`小窗滚动到 ${target}px：弹幕保持当前小窗画面边界`);cases.push({label:`mini-scroll-${target}`,requestedScrollY:target,baseline:mini,state,
          deltas:{scrollHeight:state.scrollHeight-mini.scrollHeight,shellHeight:state.shell.height-mini.shell.height,extraChanged:state.extra!==mini.extra}});
      }
      setMode('normal');await setSource(ratios.square);await settings({roundedCorners:true});await settle();await visible();
      const originalWidth=shell.style.width;shell.style.width='620px';shell.style.height=`${620*9/16+56}px`;window.dispatchEvent(new Event('resize'));
      await inspectBoundary('同视频调整播放器尺寸',check,cases,true);setMode('normal');check(shell.style.width===originalWidth,'调整尺寸后恢复原有播放器宽度');
      await setSource(ratios.portrait);await inspectBoundary('同一 video 更换媒体比例',check,cases,true);
      const old=renderer;old.remove();makeRenderer();window.dispatchEvent(new Event('resize'));await wait(1200);
      check(cleanRoot(old),'重建弹幕根后清理旧根的全部自有属性和变量');cases.push({label:'cleanup-replaced-old-root',cleanup:cleanupSnapshot(old)});await inspectBoundary('弹幕根重建',check,cases,true);
      const absent=renderer;absent.remove();renderer=null;window.dispatchEvent(new Event('resize'));await wait(1200);check(cleanRoot(absent),'弹幕根移除时释放旧渲染层状态');cases.push({label:'cleanup-removed-old-root',cleanup:cleanupSnapshot(absent)});
      makeRenderer();await wait(1400);await inspectBoundary('弹幕根延迟插入',check,cases,true);
      const previousVideo=video,next=video.cloneNode(false);previousVideo.replaceWith(next);video=next;next.srcObject=stream;await next.play();window.dispatchEvent(new Event('resize'));await wait(1200);
      await inspectBoundary('播放器 video 元素替换',check,cases,true);
      const liveLine=renderer.querySelector('.dm-line.middle'),beforeMotion=rect(liveLine);await wait(350);const afterMotion=rect(liveLine);
      check(Math.abs(afterMotion.left-beforeMotion.left)>8,'动画弹幕持续横移，裁切未冻结渲染');
      const command=renderer.querySelector('.dm-command');await visible();check(hit(command),'互动弹幕按钮仍可命中，渲染根不遮挡原生控件');
      await settings({enabled:false});check(cleanRoot(renderer)&&getComputedStyle(renderer).position==='static'&&close(rect(renderer).height,0),'关闭氛围光完整恢复原生静态零高度弹幕根');cases.push({label:'cleanup-disabled',cleanup:cleanupSnapshot(renderer)});
      await settings({enabled:true});await inspectBoundary('重新开启恢复边界',check,cases,true);
      await settings({privacyAccepted:false});check(cleanRoot(renderer),'撤回同意清理弹幕边界状态');cases.push({label:'cleanup-consent-revoked',cleanup:cleanupSnapshot(renderer)});await settings({privacyAccepted:true});
      video.remove();window.dispatchEvent(new Event('resize'));await wait(1200);check(cleanRoot(renderer),'播放器移除时清理弹幕渲染状态');cases.push({label:'cleanup-video-removed',cleanup:cleanupSnapshot(renderer)});wrap.append(video);video.srcObject=stream;await video.play();await wait(1200);
      await inspectBoundary('播放器恢复后重新建立边界',check,cases,true);
    }catch(error){check(false,error.message);}
    finally{
      setMode('normal');await B.storage.set(saved);running=false;run.disabled=false;$('#danmaku-preview').disabled=false;
      const failed=results.filter(item=>!item.passed).length;output.dataset.state='complete';output.dataset.passed=String(results.length>0&&failed===0);output.dataset.total=String(results.length);output.dataset.failed=String(failed);
      output.textContent=`${results.length-failed}/${results.length} 通过 · ${failed} 项失败\n`+results.map(item=>`${item.passed?'✓':'✗'} ${item.label}`).join('\n');
      window.__danmakuResults={state:'complete',passed:results.length>0&&failed===0,total:results.length,failed,results,cases};$('#danmaku-report').textContent=JSON.stringify(window.__danmakuResults);status.textContent=`自检完成：${results.length-failed}/${results.length}`;
    }
    return window.__danmakuResults;
  }
  async function preview(){
    if(running)return;const mode=$('#mode-select').value,ratio=ratios[$('#ratio-select').value],bars=$('#bars-select').checked;
    setMode(mode);await settings({privacyAccepted:true,enabled:true,roundedCorners:$('#rounded-select').checked,hideLauncher:true,frameShadow:0,removeHorizontalBars:bars,removeVerticalBars:false,fillRemovedBars:bars});
    await setSource(ratio,bars);await settle();await visible();status.textContent=`${mode} · ${ratio.name} · 动画弹幕预览`;
  }
  run.addEventListener('click',runChecks);$('#danmaku-preview').addEventListener('click',preview);
  $('#mode-select').addEventListener('change',()=>{if(!running){setMode($('#mode-select').value);visible();}});
  for(const selector of ['#ratio-select','#rounded-select','#bars-select'])$(selector).addEventListener('change',preview);
  $('#play-control').addEventListener('click',()=>video.paused?video.play():video.pause());$('#sending-button').addEventListener('click',()=>{status.textContent='本地发送框按钮命中；未发送任何消息';});
  const leaveWeb=()=>{if(player.dataset.screen==='web')setMode(previousMode==='wide'?'wide':'normal');};$('#leave-web').addEventListener('click',leaveWeb);document.addEventListener('keydown',event=>{if(event.key==='Escape')leaveWeb();});
  window.addEventListener('resize',()=>{
    if(running||player.dataset.screen==='web'||player.dataset.screen==='mini')return;
    const width=Math.min(player.dataset.screen==='wide'?1080:760,innerWidth-48);
    shell.style.width=`${width}px`;shell.style.height=`${width*9/16+56}px`;
  });
  window.danmakuFixture={runChecks,preview,snapshot,pictureRect,setMode,setSource,makeRenderer,ratios};
  makeRenderer();setMode('normal');
  B.storage.set({...B.defaults,privacyAccepted:true,enabled:true,roundedCorners:true,frameShadow:0,hideLauncher:true}).then(()=>setSource(ratios.standard)).then(()=>{output.dataset.state='ready';status.textContent='本地测试已就绪';}).catch(error=>{output.dataset.state='error';output.textContent=error.message;});
})();
