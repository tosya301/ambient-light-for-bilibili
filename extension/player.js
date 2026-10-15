/* Playback adapters. Live rooms share rendering/settings with 0.5.3. */
(() => {
  'use strict';
  function pageKind({hostname,pathname}) {
    if(hostname==='localhost'||hostname==='127.0.0.1')return pathname==='/demo/live.html'?'live':'video';
    // /blanc/<room> is the plain room layout and uses the same live player.
    if(hostname==='live.bilibili.com')return /^\/(?:blanc\/)?[1-9]\d*\/?$/.test(pathname)?'live':null;
    // The watch-later detail page uses the same player, modes and comments as
    // ordinary VOD. Keep the homepage/PiP launcher and other list routes out.
    return hostname==='www.bilibili.com'&&(/^\/(video\/|bangumi\/play\/)/.test(pathname)||/^\/list\/watchlater\/?$/.test(pathname))?'video':null;
  }
  function selectVideo(scope,kind) {
    // Live pages also contain gift/preview videos outside the main player.
    const candidates=scope.querySelectorAll(kind==='live'?'#live-player video':'video');
    let best=null,area=0;
    for(const candidate of candidates){
      const r=candidate.getBoundingClientRect(),a=r.width*r.height;
      if(a<=area||r.width<160||r.height<90)continue;
      let hidden=false;
      for(let el=candidate;el;el=el.parentElement){
        const s=getComputedStyle(el);
        if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0){hidden=true;break;}
      }
      if(!hidden){best=candidate;area=a;}
    }
    return best;
  }
  function presentation(video,kind,fullscreen,width=innerWidth,height=innerHeight){
    const native=Boolean(fullscreen&&video&&fullscreen.contains(video)&&fullscreen.tagName!=='VIDEO');
    if(native)return {stage:fullscreen,mode:'fullscreen',native};
    if(kind==='live'){
      // Web mode keeps a chat sidebar, so #fullscreen-container can be narrower
      // than the viewport. Still require a fixed, top-left, full-height stage;
      // normal players and floating mini players must not acquire a backdrop.
      for(let el=video?.parentElement;el&&el!==document.body;el=el.parentElement){
        const r=el.getBoundingClientRect();
        const fillsWidth=r.width>=width-2;
        const withChat=el.id==='fullscreen-container'&&r.width>=160&&r.width<=width+2;
        if(getComputedStyle(el).position==='fixed'&&Math.abs(r.left)<=2&&Math.abs(r.top)<=2&&r.height>=height-2&&(fillsWidth||withChat))
          return {stage:el,mode:'fullscreen',native:false};
      }
      return {stage:null,mode:'normal',native:false};
    }
    const container=video?.closest('.bpx-player-container'),screen=container?.getAttribute('data-screen');
    return {stage:screen==='web'?container:null,mode:screen==='web'?'fullscreen':screen==='wide'?'theater':'normal',native:false};
  }
  // Convert viewport rectangles to an element's local border/padding boxes.
  // Computed CSS sizes preserve fractions that offsetWidth/Height round off.
  function localBox(element){
    const box=element.getBoundingClientRect(),style=getComputedStyle(element);
    if(!['left','top','width','height'].every(key=>Number.isFinite(box[key]))||box.width<=0||box.height<=0)return null;
    const number=name=>parseFloat(style[name])||0;
    function size(dimension,sides,fallback){
      const value=parseFloat(style[dimension]);
      return Number.isFinite(value)&&value>0
        ?value+(style.boxSizing==='border-box'?0:sides.reduce((sum,side)=>sum+number(`padding${side}`)+number(`border${side}Width`),0))
        :fallback;
    }
    const width=size('width',['Left','Right'],element.offsetWidth||box.width);
    const height=size('height',['Top','Bottom'],element.offsetHeight||box.height);
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
    const scaleX=box.width/width,scaleY=box.height/height;
    const borderLeft=number('borderLeftWidth'),borderTop=number('borderTopWidth');
    return {box,style,width,height,scaleX,scaleY,
      left:box.left+borderLeft*scaleX,top:box.top+borderTop*scaleY,
      right:box.left+box.width-number('borderRightWidth')*scaleX,
      bottom:box.top+box.height-number('borderBottomWidth')*scaleY};
  }
  const validPicture=rect=>rect&&['left','top','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.width>0&&rect.height>0;
  const liveRadius=(settings,mode,view)=>settings.roundedCorners&&!(view?.native||mode==='fullscreen'&&view?.native!==false)?12:0;
  function localRadius(radius,box){
    const x=radius/box.scaleX,y=radius/box.scaleY;
    return Math.abs(x-y)<1e-8?`${x}px`:`${x}px / ${y}px`;
  }
  // VOD fullscreen stays square. Live webpage mode keeps the chosen frame
  // around the actual media, while native fullscreen still restores squares.
  function createFrame(shadowRoot){
    let frame=null,picture=null,livePicture=null,space=null,extra=0;
    const shadow=document.createElement('div');
    shadow.dataset.biliglowFrameShadow='';shadow.setAttribute('aria-hidden','true');
    shadow.style.cssText='position:absolute;pointer-events:none!important;background:transparent;display:none;';
    shadowRoot.append(shadow);
    function clearSpace(){
      if(space){
        space.removeAttribute('data-biliglow-player-space');
        space.style.removeProperty('--biliglow-player-padding');
        space.style.removeProperty('--biliglow-player-extra');
      }
      space=null;extra=0;
    }
    function reserveSpace(rounded,kind){
      const next=rounded&&kind==='video'?frame.closest('#playerWrap'):null;
      if(next!==space)clearSpace();
      if(!next)return;
      // A floating player uses viewport coordinates while its page wrapper
      // continues scrolling. Comparing their bottoms would grow the page by
      // the scroll distance. Keep the last in-flow footprint until it returns;
      // removing it here would also move the toolbar and comments mid-scroll.
      if(frame.closest('.bpx-player-container')?.getAttribute('data-screen')==='mini')return;
      for(let el=frame;el&&el!==next;el=el.parentElement){
        if(['fixed','sticky'].includes(getComputedStyle(el).position))return;
      }
      // Native Bilibili keeps a definite inner player height. overflow:clip
      // lets a taller in-flow recording exceed it. Reserve that actual excess
      // on the outer wrapper, without resizing the inner player or the video.
      const style=getComputedStyle(next);
      if(style.boxSizing!=='content-box'){clearSpace();return;}
      const primary=frame.closest('.bpx-player-primary-area');
      const sending=primary?.querySelector('.bpx-player-sending-area');
      const bottom=Math.max(frame.getBoundingClientRect().bottom,sending?.getBoundingClientRect().bottom||0);
      const nativeBottom=next.getBoundingClientRect().bottom-extra;
      const needed=bottom-nativeBottom>1?Math.ceil(bottom-nativeBottom):0;
      if(!needed){clearSpace();return;}
      if(!space){
        space=next;
        space.style.setProperty('--biliglow-player-padding',style.paddingBottom);
        space.setAttribute('data-biliglow-player-space','');
      }
      if(needed!==extra){space.style.setProperty('--biliglow-player-extra',`${needed}px`);extra=needed;}
    }
    function clearPicture(){
      picture?.removeAttribute('data-biliglow-picture-rounded');
      picture?.style.removeProperty('--biliglow-picture-clip');
      picture=null;
    }
    function clearLivePicture(){
      livePicture?.removeAttribute('data-biliglow-live-picture-rounded');
      livePicture?.style.removeProperty('--biliglow-live-picture-clip');
      livePicture=null;
    }
    function livePictureRect(video,rounded){
      if(video!==livePicture||!rounded)clearLivePicture();
      if(!video.videoWidth||!video.videoHeight)return null;
      const local=localBox(video);
      if(!local)return null;
      const rect=globalThis.BiliGlow.contentRect(local.box,video.videoWidth,video.videoHeight,local.style.objectFit);
      if(!validPicture(rect))return null;
      if(rounded){
        const b=local.box,insets=[(rect.top-b.top)/local.scaleY,(b.left+b.width-rect.left-rect.width)/local.scaleX,
          (b.top+b.height-rect.top-rect.height)/local.scaleY,(rect.left-b.left)/local.scaleX];
        if(insets.some(value=>!Number.isFinite(value)||value< -1)){clearLivePicture();return null;}
        livePicture=video;
        const clip=`inset(${insets.map(value=>Math.max(0,value)+'px').join(' ')} round ${localRadius(12,local)})`;
        if(video.style.getPropertyValue('--biliglow-live-picture-clip')!==clip)video.style.setProperty('--biliglow-live-picture-clip',clip);
        if(!video.hasAttribute('data-biliglow-live-picture-rounded'))video.setAttribute('data-biliglow-live-picture-rounded','');
      }
      return rect;
    }
    function roundPicture(video,rounded,kind,cropRect){
      const next=rounded&&kind==='video'?video.closest('.bpx-player-video-wrap'):null;
      if(next!==picture)clearPicture();
      // This layer contains the video alone; player controls remain outside.
      // Clipping it composes with the video's independent bar-crop transform.
      if(!next||next===frame||!frame.contains(next)||!video.videoWidth||!video.videoHeight){clearPicture();return null;}
      const rect=cropRect||globalThis.BiliGlow.contentRect(video.getBoundingClientRect(),video.videoWidth,video.videoHeight,getComputedStyle(video).objectFit);
      const wrap=next.getBoundingClientRect();
      const insets=[rect.top-wrap.top,wrap.right-rect.left-rect.width,wrap.bottom-rect.top-rect.height,rect.left-wrap.left];
      if(rect.width<=0||rect.height<=0||wrap.width<=0||wrap.height<=0||insets.some(value=>!Number.isFinite(value)||value< -1)){clearPicture();return null;}
      picture=next;
      picture.style.setProperty('--biliglow-picture-clip',`inset(${insets.map(value=>Math.max(0,value)+'px').join(' ')} round 12px)`);
      picture.setAttribute('data-biliglow-picture-rounded','');
      return rect;
    }
    function clear(){clearPicture();clearLivePicture();clearSpace();frame?.removeAttribute('data-biliglow-rounded');frame?.removeAttribute('data-biliglow-native-size');frame=null;shadow.style.display='none';}
    function update(video,settings,kind,mode,origin,readCrop,view){
      const live=kind==='live',squareFullscreen=mode==='fullscreen'&&(!live||view?.native!==false)||live&&view?.native;
      const enabled=settings.enabled&&!squareFullscreen&&video?.isConnected;
      const next=enabled&&(settings.roundedCorners||settings.frameShadow>0)
        ?video.closest(kind==='live'?'#live-player':'.bpx-player-video-area'):null;
      if(next!==frame){clear();frame=next;}
      if(!frame){readCrop?.();return null;}
      const rounded=settings.roundedCorners;
      // The live stage also contains controls and menus. Only its video gets
      // a picture clip; clipping the stage would cut those native siblings.
      const roundStage=rounded&&!live;
      if(frame.hasAttribute('data-biliglow-rounded')!==roundStage)frame.toggleAttribute('data-biliglow-rounded',roundStage);
      // Square, 4:3 and portrait media retain their native contained size.
      // Slightly taller widescreen recordings keep the existing larger frame.
      const nativeSize=rounded&&kind==='video'&&video.videoWidth>0&&video.videoHeight>0&&video.videoWidth*3<=video.videoHeight*4;
      if(frame.hasAttribute('data-biliglow-native-size')!==nativeSize)frame.toggleAttribute('data-biliglow-native-size',nativeSize);
      reserveSpace(rounded,kind);
      const cropRect=readCrop?.();
      let r;
      if(live){clearPicture();r=livePictureRect(video,rounded);if(!r){clear();return null;}}
      else{clearLivePicture();r=roundPicture(video,rounded,kind,cropRect)||frame.getBoundingClientRect();}
      const style=getComputedStyle(frame);
      const amount=settings.frameShadow/100;
      // The shadow lives above the light canvas, below page content, outside
      // Bilibili's overflow:hidden wrappers. It never intercepts player input.
      shadow.style.display=amount>0?'block':'none';
      shadow.style.left=`${r.left-origin.left}px`;shadow.style.top=`${r.top-origin.top}px`;
      shadow.style.width=`${r.width}px`;shadow.style.height=`${r.height}px`;
      shadow.style.borderRadius=live?(rounded?'12px':'0px'):style.borderRadius;
      shadow.style.boxShadow=amount>0?`0 2px ${4+8*amount}px rgba(0,0,0,${.6*amount}),0 4px ${8+24*amount}px ${2*amount}px rgba(0,0,0,${.5*amount})`:'none';
      return {rect:r,radius:rounded?12:0};
    }
    return {update,clear};
  }
  // Live messages use separate direct siblings of the video. Keep ordinary
  // text full-width; bound decorative roots and bottom controls to the picture.
  // Only the decorative shade is clipped; menus keep their native overflow.
  // Re-query on layout to adopt roots replaced by the site.
  function createLiveBounds(){
    let layers=new Set(),controls=new Set(),shades=new Set(),tracks=new Set(),resizeTargets=new Set();
    const stages=new Map(),trackStates=new Map(),trackProperties=['top','size'];
    const properties=['left','top','width','height','radius','track-gap'];
    const controlProperties=['left','width','bottom'];
    const mutationObserver=typeof MutationObserver==='function'?new MutationObserver(records=>{
      // Horizontal animation and our own custom-property writes do not need
      // another measurement. Native vertical tracks can change on cached nodes.
      const vertical=['--top','--translateY','font-size','line-height','height','display','top','bottom','padding-top','padding-bottom','margin-top','margin-bottom'];
      const changed=record=>{
        if(record.type!=='attributes'||record.attributeName!=='style')return true;
        const old=new Map(String(record.oldValue||'').split(';').map(declaration=>{
          const colon=declaration.indexOf(':');return [declaration.slice(0,colon).trim(),declaration.slice(colon+1).trim()];
        }));
        const keys=record.target.matches('.bili-danmaku-x-roll, .bili-danmaku-x-center')?vertical:[...vertical,'transform'];
        return keys.some(name=>(old.get(name)||'')!==record.target.style.getPropertyValue(name).trim());
      };
      if(!records?.length||records.some(changed))syncTracks();
    }):null;
    const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(syncTracks):null;
    function restoreTrack(node){
      trackStates.delete(node);
      node.removeAttribute('data-biliglow-live-track');
      for(const name of trackProperties)node.style.removeProperty(`--biliglow-live-track-${name}`);
    }
    function syncTracks(){
      const next=new Set(),nextResize=new Set();
      for(const [layer,stage] of stages){
        const entries=[];
        for(const container of layer.children){
          if(!container.matches('.danmaku-item-container'))continue;
          for(const node of container.children){
            if(!node.matches('.bili-danmaku-x-show')||node.matches('.bili-danmaku-x-dm-rotate'))continue;
            const type=node.matches('.bili-danmaku-x-roll')?'roll':node.matches('.bili-danmaku-x-center')?'center':null;
            if(!type)continue;
            const top=parseFloat(node.style.getPropertyValue(type==='roll'?'--top':'--translateY'))||0;
            const box=node.getBoundingClientRect(),style=getComputedStyle(node);
            if(!Number.isFinite(box.height)||box.height<=0)continue;
            let visualTop=box.top,visualBottom=box.bottom;
            const descendants=[...(node.querySelectorAll?.('*')||[])];
            for(const child of descendants){
              const image=child.getBoundingClientRect();nextResize.add(child);
              if(image.height>0){visualTop=Math.min(visualTop,image.top);visualBottom=Math.max(visualBottom,image.bottom);}
            }
            const before=(box.top-visualTop)/stage.scaleY;
            const height=Math.max((visualBottom-visualTop)/stage.scaleY,parseFloat(style.lineHeight)||0);
            nextResize.add(node);
            if(Number.isFinite(height)&&height>0&&height<=stage.height){
              const key=[type,top,height,before,stage.height,stage.gap,stage.scaleY].join(':');
              const cached=trackStates.get(node);
              entries.push({node,type,top,height,before,key,fixed:cached?.key===key?cached.baseline:null});
            }
          }
        }
        // Group by the engine's baseline, not each item's visual top. Emoji
        // above that baseline must not split one native track into two rows.
        const groups=[];
        for(const type of new Set(entries.map(entry=>entry.type))){
          let group=null;
          for(const entry of entries.filter(entry=>entry.type===type).sort((a,b)=>a.top-b.top)){
            if(!group||entry.top-group.native>=1){group={type,native:entry.top,before:0,after:0,members:[]};groups.push(group);}
            group.before=Math.max(group.before,entry.before);group.after=Math.max(group.after,entry.height-entry.before);group.members.push(entry);
          }
        }
        for(const group of groups)group.height=group.before+group.after;
        // Reduce only the safety gap when a tall native image needs the whole
        // picture. Fonts, artwork and horizontal motion are never scaled.
        const gap=Math.min(stage.gap,...groups.map(group=>Math.max(0,(stage.height-group.height)/2)));
        for(const type of new Set(groups.map(group=>group.type))){
          const ordered=groups.filter(group=>group.type===type);
          const fitBaseline=(entry,baseline)=>Math.max(gap+entry.before,Math.min(baseline,stage.height-gap-entry.height+entry.before));
          const anchored=ordered.filter(group=>group.members.some(entry=>entry.fixed!==null));
          const occupied=[];
          function place(group,baseline){
            // A new item can need more headroom than its native lane mates.
            // Fit that item without moving text already crossing the screen.
            for(const entry of group.members)entry.baseline=entry.fixed??fitBaseline(entry,baseline);
            occupied.push({top:Math.min(...group.members.map(entry=>entry.baseline-entry.before)),
              bottom:Math.max(...group.members.map(entry=>entry.baseline-entry.before+entry.height))});
          }
          for(const group of anchored)place(group,group.members.find(entry=>entry.fixed!==null).fixed);
          if(anchored.length){
            // Allocate only newly visible/changed lanes around active ones.
            // Repacking all visible lanes on every birth/death made even an
            // unchanged native --top jump up and down in a busy live room.
            for(const group of ordered.filter(group=>!anchored.includes(group))){
              const desired=Math.max(gap,Math.min(group.native-group.before,stage.height-gap-group.height));
              let start=gap,best=null;
              const consider=end=>{
                if(end-start<group.height)return;
                const top=Math.max(start,Math.min(desired,end-group.height));
                if(best===null||Math.abs(top-desired)<Math.abs(best-desired))best=top;
              };
              for(const slot of occupied.slice().sort((a,b)=>a.top-b.top)){
                consider(slot.top-1);start=Math.max(start,slot.bottom+1);
              }
              consider(stage.height-gap);
              // An overfull native renderer cannot fit every full-size row.
              // Keep the new line inside; never shift an existing line for it.
              place(group,(best??desired)+group.before);
            }
          }else{
            // Initial placement and a real geometry change may fit all rows
            // together. Afterwards, births/deaths must leave them anchored.
            for(let index=0;index<ordered.length;index++){
              const group=ordered[index],previous=ordered[index-1];
              group.top=Math.max(gap,Math.min(group.native-group.before,stage.height-gap-group.height),previous?previous.top+previous.height+1:gap);
            }
            for(let index=ordered.length-1;index>=0;index--){
              const group=ordered[index],nextGroup=ordered[index+1];
              group.top=Math.min(group.top,nextGroup?nextGroup.top-group.height-1:stage.height-gap-group.height);
              place(group,Math.max(gap,Math.min(group.top,stage.height-gap-group.height))+group.before);
            }
          }
          for(const group of ordered){
            for(const entry of group.members){
              trackStates.set(entry.node,{key:entry.key,baseline:entry.baseline});
              const values=[`${entry.baseline}px`,`${entry.height}px`];next.add(entry.node);
              trackProperties.forEach((name,i)=>{
                const property=`--biliglow-live-track-${name}`;
                if(entry.node.style.getPropertyValue(property)!==values[i])entry.node.style.setProperty(property,values[i]);
              });
              if(!entry.node.hasAttribute('data-biliglow-live-track'))entry.node.setAttribute('data-biliglow-live-track','');
            }
          }
        }
      }
      for(const node of tracks)if(!next.has(node))restoreTrack(node);tracks=next;
      for(const node of resizeTargets)if(!nextResize.has(node))resizeObserver?.unobserve(node);
      for(const node of nextResize)if(!resizeTargets.has(node))resizeObserver?.observe(node);
      resizeTargets=nextResize;
    }
    function restore(layer){
      layer.removeAttribute('data-biliglow-live-bounds');
      for(const name of properties)layer.style.removeProperty(`--biliglow-live-${name}`);
    }
    function restoreShade(shade){
      shade.removeAttribute('data-biliglow-live-control-shade');
      shade.style.removeProperty('--biliglow-live-shade-clip');
    }
    function restoreControl(control){
      control.removeAttribute('data-biliglow-live-control-frame');
      for(const name of controlProperties)control.style.removeProperty(`--biliglow-live-control-${name}`);
    }
    function clear(){
      mutationObserver?.disconnect();resizeObserver?.disconnect();stages.clear();resizeTargets.clear();
      for(const node of tracks)restoreTrack(node);tracks.clear();
      for(const layer of layers)restore(layer);layers.clear();
      for(const control of controls)restoreControl(control);controls.clear();
      for(const shade of shades)restoreShade(shade);shades.clear();
    }
    function update(video,settings,mode,rect,view){
      const area=settings.enabled&&video?.isConnected&&video.videoWidth>0&&video.videoHeight>0?video.closest('#live-player'):null;
      if(!area||video.parentElement!==area||!validPicture(rect)){clear();return null;}
      const local=localBox(area);
      if(!local){clear();return null;}
      const left=Math.max(local.left,rect.left),top=Math.max(local.top,rect.top);
      const right=Math.min(local.right,rect.left+rect.width),bottom=Math.min(local.bottom,rect.top+rect.height);
      const width=Math.max(0,right-left),height=Math.max(0,bottom-top);
      const next=new Set([...area.children].filter(layer=>layer.matches('.web-player-danmaku, #animation-mask-wrapper, .web-player-inject-wrap')));
      let changed=next.size!==layers.size;
      for(const layer of layers)if(!next.has(layer)){restore(layer);stages.delete(layer);changed=true;}
      for(const layer of next)if(!layers.has(layer))changed=true;
      layers=next;
      if(changed){
        mutationObserver?.disconnect();
        for(const layer of layers)if(layer.matches('.web-player-danmaku'))mutationObserver?.observe(layer,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style'],attributeOldValue:true});
      }
      const radius=liveRadius(settings,mode,view),gap=Math.max(2,radius)/local.scaleY;
      const values=[`${(left-local.left)/local.scaleX+(area.scrollLeft||0)}px`,`${(top-local.top)/local.scaleY+(area.scrollTop||0)}px`,
        `${width/local.scaleX}px`,`${height/local.scaleY}px`,localRadius(radius,local),`${gap}px`];
      for(const layer of layers){
        const textLayer=layer.matches('.web-player-danmaku');
        if(textLayer)stages.set(layer,{height:height/local.scaleY,gap,scaleY:local.scaleY});
        else stages.delete(layer);
        // A portrait or radio picture must not squeeze rolling text into its
        // narrow image. Keep the native horizontal stage; bound only its Y.
        // Gift/animation surfaces and controls still follow the actual image.
        const layerValues=textLayer?[`${area.scrollLeft||0}px`,values[1],`${width>0&&height>0?(local.right-local.left)/local.scaleX:0}px`,...values.slice(3)]:values;
        properties.forEach((name,index)=>{
          const property=`--biliglow-live-${name}`;
          if(layer.style.getPropertyValue(property)!==layerValues[index])layer.style.setProperty(property,layerValues[index]);
        });
        if(!layer.hasAttribute('data-biliglow-live-bounds'))layer.setAttribute('data-biliglow-live-bounds','');
      }
      syncTracks();
      // Only message bounds apply in native fullscreen. Its picture, light,
      // corners and control layout retain the existing fullscreen behavior.
      const nextControls=new Set(view?.native?[]:[...area.children].filter(layer=>layer.matches('.web-player-controller-bg, #web-player-controller-wrap-el')));
      for(const control of controls)if(!nextControls.has(control))restoreControl(control);
      controls=nextControls;
      const controlValues=[values[0],`${width>0&&height>0?width/local.scaleX:0}px`,`${(local.bottom-bottom)/local.scaleY-(area.scrollTop||0)}px`];
      for(const control of controls){
        controlProperties.forEach((name,index)=>{
          const property=`--biliglow-live-control-${name}`;
          if(control.style.getPropertyValue(property)!==controlValues[index])control.style.setProperty(property,controlValues[index]);
        });
        if(!control.hasAttribute('data-biliglow-live-control-frame'))control.setAttribute('data-biliglow-live-control-frame','');
      }
      const nextShades=new Set([...controls].filter(layer=>layer.matches('.web-player-controller-bg')));
      for(const shade of shades)if(!nextShades.has(shade))restoreShade(shade);
      shades=nextShades;
      // Both bottom roots now share the picture's width and bottom edge, so
      // do not apply the player's letterbox insets a second time to the shade.
      // Its hidden-before-hover height remains native. A negative clip top
      // preserves the full picture's corner geometry for shallow gradients.
      const rx=radius/local.scaleX,ry=radius/local.scaleY;
      const shadeClip=width>0&&height>0
        ?`inset(calc(100% - ${height/local.scaleY}px) 0px 0px 0px round 0px 0px ${rx}px ${rx}px / 0px 0px ${ry}px ${ry}px)`
        :'inset(50%)';
      for(const shade of shades){
        if(shade.style.getPropertyValue('--biliglow-live-shade-clip')!==shadeClip)shade.style.setProperty('--biliglow-live-shade-clip',shadeClip);
        if(!shade.hasAttribute('data-biliglow-live-control-shade'))shade.setAttribute('data-biliglow-live-control-shade','');
      }
      return {left,top,width,height};
    }
    return {update,clear};
  }
  // Fit cached pixel tracks without cropping whole lines or collapsing several
  // bottom tracks into one. Messages on the same native track stay together;
  // rolling/fixed tracks keep their independent native allocation.
  function fitDanmakuTracks(tracks,height,gap){
    const positions=tracks.map(track=>Math.max(gap,Math.min(track.top,height-gap-track.height)));
    for(const type of new Set(tracks.map(track=>track.type))){
      const ordered=tracks.map((track,index)=>({...track,index})).filter(track=>track.type===type).sort((a,b)=>a.top-b.top);
      const groups=[];
      for(const track of ordered){
        let group=groups[groups.length-1];
        if(!group||track.top-group.native>=1){group={native:track.top,height:track.height,members:[]};groups.push(group);}
        group.height=Math.max(group.height,track.height);group.members.push(track.index);
      }
      for(let i=0;i<groups.length;i++){
        const group=groups[i],previous=groups[i-1];
        group.top=Math.max(gap,Math.min(group.native,height-gap-group.height),previous?previous.top+previous.height+1:gap);
      }
      for(let i=groups.length-1;i>=0;i--){
        const group=groups[i],next=groups[i+1];
        group.top=Math.min(group.top,next?next.top-group.height-1:height-gap-group.height);
        // A transient overfull cached stage cannot fit every full-size track.
        // Keep each complete line inside; native allocation resolves on resize.
        for(const index of group.members)positions[index]=Math.max(gap,Math.min(group.top,height-gap-tracks[index].height));
      }
    }
    return positions;
  }
  // The site's render root is a zero-height, static sibling of the video.
  // Its absolutely positioned DOM/canvas layers otherwise fill the player,
  // including transparent letterboxing. Keep the picture's vertical limits,
  // but give portrait media the same horizontal stage as landscape playback.
  function createDanmakuBounds(){
    let layers=new Set(),tracks=new Set();
    const stages=new Map(),trackProperty='--biliglow-danmaku-track-top';
    const observer=typeof MutationObserver==='function'?new MutationObserver(syncTracks):null;
    const properties=['left','top','width','height','radius','track-height'];
    function syncTracks(){
      const next=new Set();
      for(const [layer,stage] of stages){
        const nodes=[...(layer.querySelectorAll?.('.bpx-player-row-dm-wrap > .bili-danmaku-x-show')||[])];
        const entries=[];
        for(const node of nodes){
          const type=node.classList.contains('bili-danmaku-x-roll')?'roll':node.classList.contains('bili-danmaku-x-center')?'center':null;
          if(!type)continue;
          const top=parseFloat(node.style.getPropertyValue(type==='roll'?'--top':'--translateY'));
          const style=getComputedStyle(node),height=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.125;
          if(Number.isFinite(top)&&Number.isFinite(height)&&height>0&&height+stage.gap*2<=stage.height)entries.push({node,type,top,height});
        }
        const positions=fitDanmakuTracks(entries,stage.height,stage.gap);
        entries.forEach((entry,index)=>{
          const value=`${positions[index]}px`;next.add(entry.node);
          if(entry.node.style.getPropertyValue(trackProperty)!==value)entry.node.style.setProperty(trackProperty,value);
        });
      }
      for(const node of tracks)if(!next.has(node))node.style.removeProperty(trackProperty);
      tracks=next;
    }
    function restore(layer){
      layer.removeAttribute('data-biliglow-danmaku-bounds');
      for(const property of properties)layer.style.removeProperty(`--biliglow-danmaku-${property}`);
    }
    function clear(){observer?.disconnect();for(const layer of layers)restore(layer);layers.clear();stages.clear();for(const node of tracks)node.style.removeProperty(trackProperty);tracks.clear();}
    function update(video,settings,kind,mode,rect){
      const area=settings.enabled&&kind==='video'&&video?.isConnected&&video.videoWidth>0&&video.videoHeight>0
        ?video.closest('.bpx-player-video-area'):null;
      if(!area||!rect||!['left','top','width','height'].every(key=>Number.isFinite(rect[key]))||rect.width<=0||rect.height<=0){clear();return null;}
      const next=new Set(area.querySelectorAll('.bpx-player-render-dm-wrap'));
      let changed=next.size!==layers.size;
      for(const layer of layers)if(!next.has(layer)){restore(layer);stages.delete(layer);changed=true;}
      for(const layer of next)if(!layers.has(layer))changed=true;
      layers=next;
      if(changed){observer?.disconnect();for(const layer of layers)observer?.observe(layer,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});}
      if(!layers.size){syncTracks();return null;}
      const box=area.getBoundingClientRect();
      if(box.width<=0||box.height<=0){clear();return null;}
      // offsetHeight rounds fractional CSS pixels: treating that rounding as
      // a transform can expand danmaku beyond the picture by a whole pixel.
      // Use the computed border box to recover real ancestor scale/zoom.
      const style=getComputedStyle(area),number=property=>parseFloat(style[property])||0;
      function localSize(dimension,sides,fallback){
        const size=parseFloat(style[dimension]);
        if(!Number.isFinite(size)||size<=0)return fallback;
        return size+(style.boxSizing==='border-box'?0:sides.reduce((sum,side)=>sum+number(`padding${side}`)+number(`border${side}Width`),0));
      }
      const localWidth=localSize('width',['Left','Right'],area.offsetWidth||box.width);
      const localHeight=localSize('height',['Top','Bottom'],area.offsetHeight||box.height);
      const scaleX=box.width/localWidth,scaleY=box.height/localHeight;
      const originLeft=box.left+(area.clientLeft||0)*scaleX,originTop=box.top+(area.clientTop||0)*scaleY;
      const portrait=video.videoHeight>video.videoWidth;
      const left=portrait?originLeft:Math.max(originLeft,rect.left),top=Math.max(originTop,rect.top);
      const right=portrait?box.right:Math.min(box.right,rect.left+rect.width),bottom=Math.min(box.bottom,rect.top+rect.height);
      const width=Math.max(0,right-left),height=Math.max(0,bottom-top);
      // Reserve the native control strip even while auto-hidden: revealing it
      // must not obscure an otherwise complete bottom comment. The render root
      // and advanced/BAS paths still cover the whole actual picture.
      const control=area.querySelector?.('.bpx-player-control-wrap')?.getBoundingClientRect();
      const trackBottom=control&&control.width>0&&control.height>0&&control.right>left&&control.left<right&&control.top>top+height/2
        ?Math.min(bottom,control.top):bottom;
      // overflow:hidden can retain an internal scroll offset after mode/focus
      // changes. Absolute children use its scroll coordinates, not viewport.
      const values=[(left-originLeft)/scaleX+(area.scrollLeft||0),(top-originTop)/scaleY+(area.scrollTop||0),width/scaleX,height/scaleY,settings.roundedCorners&&mode!=='fullscreen'?12:0,Math.max(0,trackBottom-top)/scaleY];
      for(const layer of layers){
        stages.set(layer,{height:values[5],gap:Math.max(2,values[4])});
        properties.forEach((property,index)=>{
          const name=`--biliglow-danmaku-${property}`,value=`${values[index]}px`;
          if(layer.style.getPropertyValue(name)!==value)layer.style.setProperty(name,value);
        });
        if(!layer.hasAttribute('data-biliglow-danmaku-bounds'))layer.setAttribute('data-biliglow-danmaku-bounds','');
      }
      syncTracks();
      return {left,top,width,height};
    }
    return {update,clear};
  }
  function roundedCutout(rect,frame,origin,viewport){
    if(!frame?.radius||!['left','top','width','height'].every(k=>Math.abs(rect[k]-frame.rect[k])<2))return null;
    const x=rect.left-origin.left,y=rect.top-origin.top,w=rect.width,h=rect.height,r=Math.min(frame.radius,w/2,h/2);
    // A rounded inverse hole lets light reach the newly exposed corner pixels.
    return `path(evenodd, "M0 0H${viewport.width}V${viewport.height}H0Z M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z")`;
  }
  globalThis.BiliGlowPlayer=Object.freeze({pageKind,selectVideo,presentation,createFrame,createLiveBounds,createDanmakuBounds,fitDanmakuTracks,roundedCutout});
})();
