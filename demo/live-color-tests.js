/* Reads rendered canvas pixels to detect a frozen color, not just a frame counter. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),B=window.BiliGlow;
  const button=document.createElement('button');button.id='live-color-tests';button.textContent='直播颜色跟随自检';
  const output=document.createElement('output');output.id='live-color-results';output.style.cssText='display:block;white-space:pre-line;font-size:11px;line-height:1.8';
  $('.lab-controls').append(button,output);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const color=()=>{const c=$('[data-biliglow-root]').shadowRoot.querySelector('canvas'),data=c.getContext('2d').getImageData(0,0,c.width,c.height).data,rgb=[0,0,0];for(let i=0;i<data.length;i+=4)for(let k=0;k<3;k++)rgb[k]+=data[i+k];return rgb.map(x=>Math.round(x/(data.length/4)));};
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  const scene=async name=>{$(`[data-scene=${name}]`).click();await wait(1500);return color();};
  button.addEventListener('click',async()=>{
    const original=await B.storage.get();if(!B.isActive(original)){output.textContent='请先同意并开启氛围光';return;}
    const oldScene=$('[data-scene][aria-pressed=true]').dataset.scene,results=[];button.disabled=true;output.dataset.state='running';
    const check=(passed,label,detail)=>{results.push({passed,label,detail});output.textContent=results.map(r=>`${r.passed?'✓':'✗'} ${r.label} · ${r.detail}`).join('\n');};
    try{
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
      $('#live-player').scrollIntoView({block:'center',behavior:'instant'});
      for(const preset of ['soft','cinema','vivid']){
        await B.storage.set(B.presets[preset]);const pink=await scene('pink'),blue=await scene('blue');
        check(distance(pink,blue)>35,`${preset} 预设下采样颜色跟随直播改变`,`粉紫 RGB ${pink.join('/')} → 深蓝 RGB ${blue.join('/')}`);
      }
      const oldVideo=$('#live-player video');$('#replace-video').click();await wait(1400);
      const changed=await scene('pink');check($('#live-player video')!==oldVideo&&distance(changed,await scene('blue'))>35,'播放器替换后采样仍跟随颜色','换片并切换两种色彩');
      $('#stop-stream').click();await wait(1200);check($('[data-biliglow-root]').style.display==='none','停播不保留伪装成实时的旧光色','光层已隐藏');
      $('#reconnect-stream').click();await wait(1400);check(distance(await scene('pink'),await scene('blue'))>35,'重连后恢复采样新颜色','粉紫与深蓝结果明显不同');
    }catch(e){check(false,'检查中断',e.message);}finally{
      $(`[data-scene=${oldScene}]`).click();await B.storage.set(original);button.disabled=false;output.dataset.state='complete';output.dataset.passed=String(results.every(r=>r.passed));output.dataset.results=JSON.stringify(results);
    }
  });
})();
