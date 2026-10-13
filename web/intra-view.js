(() => {
  'use strict';

  // A visual approximation on decoded WebP pixels. The HM trace supplies the mode,
  // but its pre-filter 10-bit reference samples are not available in this bundle.
  const angles = [32,26,21,17,13,9,5,2,0,-2,-5,-9,-13,-17,-21,-26,-32,
    -26,-21,-17,-13,-9,-5,-2,0,2,5,9,13,17,21,26,32];
  const inverseAngles = {2:4096,5:1638,9:910,13:630,17:482,21:390,26:315,32:256};
  const cache = new WeakMap();
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const modeName = mode => mode===0?'Planar':mode===1?'DC':mode===10?'Horizontal':
    mode===26?'Vertical':Number.isInteger(mode)&&mode>=2&&mode<=34?`Angular ${mode}`:'Không rõ';

  function pixels(img) {
    if (!img || !img.complete || !img.naturalWidth) return null;
    if (cache.has(img)) return cache.get(img);
    const canvas=document.createElement('canvas');
    canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0);
    const result={width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data};
    cache.set(img,result);return result;
  }

  function drawPrediction(canvas,img,part,mode) {
    const source=pixels(img),ctx=canvas.getContext('2d');
    ctx.fillStyle='#122236';ctx.fillRect(0,0,canvas.width,canvas.height);
    if (!source || !Number.isInteger(mode) || mode<0 || mode>34) return false;
    const size=part.width;
    const sample=(x,y,c)=>source.data[4*(clamp(y,0,source.height-1)*source.width+clamp(x,0,source.width-1))+c];
    const tiny=document.createElement('canvas');tiny.width=size;tiny.height=part.height;
    const out=tiny.getContext('2d').createImageData(size,part.height);
    for(let c=0;c<3;c++) {
      const top=new Array(2*size+1),left=new Array(2*size+1);
      for(let i=0;i<=2*size;i++) {
        top[i]=part.y>0?sample(part.x+i-1,part.y-1,c):null;
        left[i]=part.x>0?sample(part.x-1,part.y+i-1,c):null;
      }
      if(part.y===0)top.fill(part.x>0?left[1]:128);
      if(part.x===0)left.fill(part.y>0?top[1]:128);
      const dc=(top.slice(1,size+1).reduce((a,b)=>a+b,0)+left.slice(1,size+1).reduce((a,b)=>a+b,0))/(2*size);
      const at=(refs,pos)=>{
        const base=Math.floor(pos),frac=pos-base;
        return refs[clamp(base,0,2*size)]*(1-frac)+refs[clamp(base+1,0,2*size)]*frac;
      };
      for(let y=0;y<part.height;y++)for(let x=0;x<size;x++) {
        let value;
        if(mode===0) value=((size-1-x)*left[y+1]+(x+1)*top[size]+(size-1-y)*top[x+1]+(y+1)*left[size])/(2*size);
        else if(mode===1) {
          value=dc;
          if(size<=16 && x===0 && y===0)value=(left[1]+2*dc+top[1])/4;
          else if(size<=16 && y===0)value=(top[x+1]+3*dc)/4;
          else if(size<=16 && x===0)value=(left[y+1]+3*dc)/4;
        }
        else {
          const angle=angles[mode-2];
          const pos=mode<=17?y+1+(x+1)*angle/32:x+1+(y+1)*angle/32;
          const main=mode<=17?left:top,side=mode<=17?top:left;
          value=pos>=0?at(main,pos):side[clamp(Math.round(-Math.floor(pos)*(inverseAngles[-angle]||0)/256),0,2*size)];
        }
        out.data[4*(y*size+x)+c]=clamp(Math.round(value),0,255);
      }
    }
    for(let i=3;i<out.data.length;i+=4)out.data[i]=255;
    tiny.getContext('2d').putImageData(out,0,0);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(tiny,0,0,canvas.width,canvas.height);
    return true;
  }

  window.INTRA_VIEW={modeName,drawPrediction};
})();
