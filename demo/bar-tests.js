'use strict';
const testBarsButton=document.createElement('button');testBarsButton.id='bar-tests';testBarsButton.textContent='自动去边自检';
const barResults=document.createElement('output');barResults.id='bar-results';
document.querySelector('.fixture-actions').append(testBarsButton,barResults);
testBarsButton.addEventListener('click',async()=>{
  const original=await BiliGlow.storage.get(),oldMode=player.dataset.screen,fixture=document.querySelector('#bar-fixture'),oldFixture=fixture.value;
  if(!original.privacyAccepted){barResults.textContent='请先在氛围光设置中阅读说明并同意开启，再运行自检。';barResults.dataset.passed='false';return;}
  const results=[],check=(ok,label)=>{results.push(`${ok?'✓':'✗'} ${label}`);barResults.textContent=results.join('\n');};
  const v=()=>document.querySelector('video'),cropped=()=>getComputedStyle(v()).clipPath.startsWith('inset(');
  const settle=()=>wait(2300);
  const sourceBars=value=>{fixture.value=value;};
  testBarsButton.disabled=true;
  try{
    sourceBars('vertical');await BiliGlow.storage.set({...BiliGlow.defaults,privacyAccepted:original.privacyAccepted,removeVerticalBars:true});theater(false);window.scrollTo({top:0,behavior:'instant'});await settle();
    check(!cropped(),'普通模式不裁视频');
    theater(true);window.scrollTo({top:0,behavior:'instant'});await settle();
    check(cropped(),'宽屏自动识别视频内嵌左右黑边');
    const glow=document.querySelector('[data-biliglow-root]').shadowRoot.querySelector('canvas');
    check(glow.height>=190&&glow.height<=194,'光效只采样去边后的内容（4:3）');
    const firstClip=getComputedStyle(v()).clipPath;v().pause();await wait(1000);
    check(getComputedStyle(v()).clipPath===firstClip,'暂停时保留稳定裁切');await v().play();
    await BiliGlow.storage.set({removeHorizontalBars:true});sourceBars('window');await settle();
    await BiliGlow.storage.set({fillRemovedBars:true});await wait(150);
    check(cropped()&&Number(v().style.getPropertyValue('--biliglow-video-transform').match(/scale\(([^)]+)/)?.[1])>1.2,'四周内嵌边框可等比例放大填充');
    await BiliGlow.storage.set({enabled:false});await wait(100);
    check(!cropped()&&v().style.transform==='','关闭氛围光立即还原画面');
    await BiliGlow.storage.set({enabled:true,removeHorizontalBars:false,fillRemovedBars:false});sourceBars('colored');await settle();
    check(!cropped(),'未开启彩边识别时保留彩色边框');
    await BiliGlow.storage.set({detectColoredBars:true});await settle();
    check(cropped(),'开启后可识别两侧不同颜色的纯色边框');
    theater(false);await wait(150);
    check(!cropped()&&v().style.transform==='','退出宽屏恢复原始画面');
    sourceBars('black');theater(true);await settle();
    check(!cropped(),'整段全黑画面不产生误裁');
    sourceBars('horizontal');await BiliGlow.storage.set({removeHorizontalBars:true,removeVerticalBars:false});await settle();
    check(cropped()&&getComputedStyle(v()).clipPath.split(' ')[0]!=='inset(0px','上下黑边可独立识别');
    source.width=1280;source.height=720;await wait(700);
    check(!cropped(),'同一视频分辨率变化后重置旧边距');source.width=960;source.height=540;
    sourceBars('none');replace();await settle();
    check(!cropped(),'更换视频后清除旧裁切');
    const hostStyle=document.createElement('style');hostStyle.textContent='#demo-video { transform:scale(.98) }';document.head.append(hostStyle);
    sourceBars('horizontal');await settle();
    check(!cropped()&&getComputedStyle(v()).transform.startsWith('matrix(0.98'),'尊重播放器已有的 CSS 画面变换');hostStyle.remove();
    const video=v();video.srcObject=null;video.removeAttribute('crossorigin');video.src=new URL('/demo/test-colors.mp4',location.href.replace(location.hostname,location.hostname==='localhost'?'127.0.0.1':'localhost')).href;video.loop=true;await video.play();await settle();
    const before=count();await wait(500);
    check(!cropped()&&count()>before,'禁止像素读取时保留原画，氛围光仍继续绘制');
  }catch(error){check(false,error.message);}
  finally{fixture.value=oldFixture;replace();theater(oldMode==='wide');await BiliGlow.storage.set(original);testBarsButton.disabled=false;barResults.dataset.passed=String(results.every(s=>s.startsWith('✓')));}
});
