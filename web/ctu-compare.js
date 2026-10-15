(() => {
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const images=new Map();
let host,version=0,selected=null,lastRun=null,zoom=4;
function loadImage(url){if(!images.has(url)){images.set(url,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>{images.delete(url);reject(Error('Không tải được ảnh'));};im.src=url;}));}return images.get(url);}
function initialRuns(ctx){const c=ctx.run.summary.config;return [...new Set([ctx.base,ctx.run.summary.id,...[22,42].map(qp=>ctx.runs.find(r=>r.config.ctuX===c.ctuX&&r.config.ctuY===c.ctuY&&r.config.profile===c.profile&&r.config.qp===qp)?.id)].filter(Boolean))];}
function configText(c){if(c.profile==='I')return `All Intra · QP ${c.qp} / offset ${c.intraQpOffset??0} · MPM ${c.fastIntraMpm??1} · smoothing ${c.strongSmoothing??1} · TU ${c.tuDepthIntra??3} · TS ${c.transformSkip??1} / Fast ${c.transformSkipFast??1} · RDOQ ${c.rdoq??1} / TS ${c.rdoqTs??1}`;return `QP cơ sở ${c.qp} · GOP ${c.profile} · SR ${c.searchRange} · Merge ${c.mergeCandidates} · ESD ${c.esd} / FDM ${c.fdm} / CFM ${c.cfm} / ECU ${c.ecu} / AMP ${c.amp}`;}
function draw(){
 const ctx=host,root=ctx.root,token=++version,c=ctx.run.summary.config,roi=ctx.run.provenance.roi,poc=ctx.poc,suffix=String(poc+1).padStart(2,'0');
 const chosen=selected.map(id=>ctx.runs.find(r=>r.id===id)).filter(Boolean);
 const cards=[{id:'original',label:'Ảnh gốc',url:`orig_${suffix}.webp`},...chosen.map(r=>({id:r.id,label:r.label,url:`runs/${encodeURIComponent(r.id)}/recon_${suffix}.webp`,summary:r}))];
 root.innerHTML=`<div class="ws-heading"><div><h3>Ảnh gốc và nhiều cấu hình · cùng một CTU</h3><p>CTU (${c.ctuX}, ${c.ctuY}) của B · vùng (${roi.x}, ${roi.y}), ${roi.size}×${roi.size} pixel · POC ${poc}</p></div><span class="tag">Cùng vị trí · cùng độ phóng</span></div>
 <div class="flow-controls"><label>Frame <select id="ctuComparePoc">${ctx.run.frames.map(f=>`<option value="${f.poc}" ${poc===f.poc?'selected':''}>POC ${f.poc} · ${f.sliceType}</option>`).join('')}</select></label><label>Phóng to <select id="ctuCompareZoom">${[3,4,6,8].map(z=>`<option value="${z}" ${zoom===z?'selected':''}>${z}× · ${roi.size*z} px</option>`).join('')}</select></label><button type="button" class="secondary" data-ctu-action="defaults">A / B + QP 22 / 42</button><span>${chosen.length} ảnh tái tạo + ảnh gốc</span></div>
 <details class="ctu-config-picker"><summary>Chọn cấu hình hiển thị (${chosen.length}/${ctx.runs.length})</summary><div class="ctu-config-options">${ctx.runs.map(r=>`<label title="${esc(configText(r.config))}"><input type="checkbox" data-ctu-run="${esc(r.id)}" ${selected.includes(r.id)?'checked':''}><span>${esc(r.label)}<small>QP ${r.config.qp} · ${r.config.profile} · CTU trace (${r.config.ctuX},${r.config.ctuY})${r.id===ctx.base?' · A':''}${r.id===ctx.run.summary.id?' · B':''}</small></span></label>`).join('')}</div></details>
 <div class="ctu-image-grid" style="--ctu-image-size:${roi.size*zoom}px">${cards.map((card,i)=>`<figure class="ctu-image-card ${i===0?'original':''}"><figcaption><b>${esc(card.label)}${card.id===ctx.base?' · A':''}${card.id===ctx.run.summary.id?' · B':''}</b><small>${i===0?'Ảnh đầu vào · cùng POC và tọa độ CTU':esc(configText(card.summary.config))}</small></figcaption><canvas width="${roi.size*zoom}" height="${roi.size*zoom}" data-ctu-image="${i}" aria-label="${esc(card.label)}: CTU (${c.ctuX},${c.ctuY}), POC ${poc}"></canvas><p class="ctu-image-status" role="status">Đang tải ảnh…</p></figure>`).join('')}</div>
 <p class="form-help">Tất cả ảnh được cắt tại CTU của B, kể cả khi cấu hình khác ghi trace ở CTU khác. Ảnh tái tạo là kết quả cuối sau lọc. Preview WebP dùng để quan sát màu và chi tiết; số D chính xác nằm trong trace 10-bit. Ở biên ảnh, phần ngoài vùng hiển thị được để sọc, không lấy padding làm ảnh.</p>`;
 cards.forEach(async(card,i)=>{const canvas=root.querySelector(`[data-ctu-image="${i}"]`),status=canvas.nextElementSibling;
  try{const im=await loadImage(card.url);if(token!==version||!root.isConnected)return;
   const w=Math.max(0,Math.min(roi.size,im.naturalWidth-roi.x)),h=Math.max(0,Math.min(roi.size,im.naturalHeight-roi.y));
   if(!w||!h)throw Error('CTU nằm ngoài ảnh hiển thị');
   const g=canvas.getContext('2d');g.imageSmoothingEnabled=false;g.fillStyle='#192a3b';g.fillRect(0,0,canvas.width,canvas.height);g.strokeStyle='#344b5e';
   for(let d=-canvas.height;d<canvas.width;d+=12){g.beginPath();g.moveTo(d,0);g.lineTo(d+canvas.height,canvas.height);g.stroke();}
   g.drawImage(im,roi.x,roi.y,w,h,0,0,w*zoom,h*zoom);
   canvas.dataset.source=card.url;canvas.dataset.crop=[roi.x,roi.y,w,h].join(',');canvas.dataset.loaded='true';
   status.textContent=`POC ${poc} · ${w}×${h} pixel${h<roi.size||w<roi.size?' hiển thị · vùng sọc nằm ngoài ảnh':''}`;
  }catch(e){if(token===version&&root.isConnected)status.textContent=e.message;}
 });
}
window.CTU_COMPARE={render(ctx){host=ctx;if(selected===null)selected=initialRuns(ctx);else if(lastRun!==ctx.run.summary.id&&!selected.includes(ctx.run.summary.id))selected.push(ctx.run.summary.id);lastRun=ctx.run.summary.id;selected=selected.filter(id=>ctx.runs.some(r=>r.id===id));
 if(!ctx.root.dataset.ctuBound){ctx.root.dataset.ctuBound='true';ctx.root.addEventListener('change',e=>{const t=e.target;if(t.dataset.ctuRun){if(t.checked){if(!selected.includes(t.dataset.ctuRun))selected.push(t.dataset.ctuRun);}else selected=selected.filter(id=>id!==t.dataset.ctuRun);const open=host.root.querySelector('details').open;draw();host.root.querySelector('details').open=open;host.root.querySelector(`[data-ctu-run="${CSS.escape(t.dataset.ctuRun)}"]`)?.focus();}if(t.id==='ctuCompareZoom'){zoom=+t.value;draw();}if(t.id==='ctuComparePoc')host.onPoc(+t.value);});ctx.root.addEventListener('click',e=>{if(e.target.closest('[data-ctu-action="defaults"]')){selected=initialRuns(host);draw();}});}
 draw();}};
})();
