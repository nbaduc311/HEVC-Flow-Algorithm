(() => {
  'use strict';
  const D = window.INTER_LAB_DATA;
  if (!D) throw new Error('Thiếu lab-data.js; hãy chạy python3 build_data.py.');
  const $ = id => document.getElementById(id);
  const stages = [
    ['Nguồn và thứ tự', 'Năm mẫu nguồn được HM mã hóa lại như một chuỗi mới. Loại picture trong bitstream nguồn không quyết định loại slice HM.', 'PTS nguồn → YUV 10-bit → POC HM'],
    ['Chọn CU / PU', 'Một CU Inter có thể chứa nhiều PU. Viền sáng bao CU đang chọn; vùng phóng to và danh sách đánh số từng PU theo ranh giới thật trong trace.', 'CTU → quadtree → CU → PU 1, PU 2…'],
    ['Ảnh tham chiếu', 'Với Inter, refIdx chỉ tới một ảnh đã tái tạo trong danh sách L0. POC của ảnh này được ghi trực tiếp từ HM.', 'RPS / DPB → L0[refIdx]'],
    ['Vector chuyển động', 'MV đo bằng đơn vị 1/4 pixel luma. Merge dùng thông tin chuyển động kế thừa; đường AMVP mã hóa chênh lệch MVD với predictor.', 'Merge hoặc AMVP → MV → vị trí lấy mẫu'],
    ['Prediction và residual', 'Vị trí lấy mẫu là MV thật. Ô Prediction và Residual ở đây dùng nội suy của trình duyệt trên WebP 8-bit, để giải thích chuyển động; HM dùng nội suy và số học 10-bit riêng.', 'Reference + MV → Prediction → Original − Prediction'],
    ['Kết quả HM', 'Ô Reconstruction là frame tái tạo HM xuất ra sau lọc. Trace ghi mode và motion field đã chọn; mở vùng Luồng thử CU để xem ứng viên và chi phí RD trong CTU được ghi trace.', 'Quyết định PU → residual / quant → tái tạo']
  ];
  const intraStages = [
    ['Nguồn và thứ tự', 'Frame I và cả P-frame đều có thể chứa CU Intra. Nhãn slice HM của frame và mode của CU là hai mức khác nhau.', 'PTS nguồn → YUV 10-bit → POC HM'],
    ['Chọn CU / PU', 'Cây CTU/CU và phân hoạch Intra 2Nx2N hoặc NxN lấy từ trace HM. Chọn từng PU nếu CU có bốn PU Intra.', 'CTU → quadtree → CU → PU Intra'],
    ['Mẫu lân cận', 'Intra dự đoán từ các mẫu đã tái tạo ở phía trên và bên trái trong cùng frame. Viền trên trang lấy từ ảnh WebP tái tạo sau lọc nên chỉ minh họa.', 'Cùng frame → mẫu trên / trái'],
    ['Mode Intra', 'Số mode luma 0–34 của PU lấy trực tiếp từ trace HM: Planar, DC hoặc một trong 33 hướng góc.', 'Mode HM → hướng dự đoán không gian'],
    ['Prediction và residual', 'Prediction minh họa được tính từ pixel WebP 8-bit theo mode HM. Residual hiển thị là hiệu ảnh 8-bit, không phải tín hiệu 10-bit hoặc nội suy tham chiếu thực của HM.', 'Mẫu lân cận + mode → Prediction → Residual'],
    ['Kết quả HM', 'Reconstruction là ảnh tái tạo HM. Trace hiện không chứa toàn bộ mẫu tham chiếu trước lọc, hệ số transform hay chi phí RD của từng ứng viên Intra.', 'Dự đoán + residual đã lượng tử → tái tạo']
  ];
  const state = {frame:1, stage:0, selected:null, showRecon:false, overlay:true};
  const original = [], recon = [];
  for (let i=0;i<5;i++) {
    for (const [array,prefix] of [[original,'orig'],[recon,'recon']]) {
      const img = new Image(); img.src = `${prefix}_${String(i+1).padStart(2,'0')}.webp`;
      img.onload = () => render(); array.push(img);
    }
  }
  const hasImage = img => img && img.complete && img.naturalWidth > 0;
  const leaves = D.frames.map(f => f.ctus.flatMap(ctu => ctu.nodes.filter(n => !n.split)));
  const PU_COLORS = ['#ffc978','#a99bff','#78e6dc','#ff91a1'];
  const puColor = index => PU_COLORS[index] || `hsl(${Math.round((index*137.5)%360)} 90% 72%)`;
  const puFill = (index,selected) => index<PU_COLORS.length?PU_COLORS[index]+(selected?'70':'35'):`hsl(${Math.round((index*137.5)%360)} 90% 72% / ${selected ? 0.44 : 0.22})`;
  const format = n => Number.isFinite(n) ? Number(n.toFixed(2)).toString() : '—';
  const current = () => state.selected;
  const isIntra = () => current()?.node.mode==='INTRA';
  const activeStages = () => isIntra()?intraStages:stages;
  const intraMode = () => current()?.pu?.intra_dir ?? current()?.node?.intra_dir;
  const currentRef = () => {
    const pu=current()?.pu;
    const ref=pu?.l0;
    return ref?.ref_idx >= 0 && Number.isInteger(ref.ref_poc) ? ref : null;
  };
  function selectPu(node,index=0) {
    const pu=node.pus?.[index] ||
      {x:node.x,y:node.y,width:node.width,height:node.height,inter_dir:0,merge:false,skip:false,l0:{ref_idx:-1},l1:{ref_idx:-1}};
    state.selected={node,pu,puIndex:index};render();
    window.dispatchEvent(new CustomEvent('lab-selection',{detail:{poc:state.frame,node,pu}}));
  }
  function chooseAt(x,y) {
    const node=leaves[state.frame].find(n=>x>=n.x && x<n.x+n.width && y>=n.y && y<n.y+n.height);
    if (!node) return;
    const index=node.pus?.findIndex(p=>x>=p.x && x<p.x+p.width && y>=p.y && y<p.y+p.height) ?? -1;
    selectPu(node,Math.max(0,index));
  }
  function defaultSelection() {
    const multi=leaves[state.frame].filter(node=>node.pus?.length>1 && (state.frame===0?node.mode==='INTRA':node.mode!=='INTRA'));
    multi.sort((a,b)=>multiScore(b)-multiScore(a));
    if(multi.length)return selectPu(multi[0]);
    if(state.frame===0) {
      const intra=leaves[state.frame].filter(node=>node.mode==='INTRA');
      intra.sort((a,b)=>multiScore(b)-multiScore(a));
      if(intra.length)return selectPu(intra[0]);
    }
    const options=leaves[state.frame].flatMap(node => (node.pus||[]).map(pu=>({node,pu})))
      .filter(v=>v.pu.l0?.ref_idx>=0 && Math.abs(v.pu.l0.mv_x_qpel||0)+Math.abs(v.pu.l0.mv_y_qpel||0)>0 && v.pu.width>=16);
    options.sort((a,b)=>score(b)-score(a));
    if (options.length) return selectPu(options[0].node,options[0].node.pus.indexOf(options[0].pu));
    else chooseAt(300,140);
  }
  function multiScore(node) {
    return Math.min(node.width*node.height,1024)/24-
      Math.abs(node.x+node.width/2-D.width/2)*.14-
      Math.abs(node.y+node.height/2-D.height/2)*.14;
  }
  function score(v) {
    const p=v.pu,r=p.l0;
    const mag=Math.abs(r.mv_x_qpel||0)+Math.abs(r.mv_y_qpel||0);
    return Math.min(mag,100)+Math.min(p.width*p.height/16,75)-Math.abs(p.x-288)*.16-Math.abs(p.y-162)*.12;
  }
  function init() {
    $('timeline').innerHTML=D.frames.map((frame,i)=>`<button type="button" class="frame-choice" data-frame="${i}" aria-label="Chọn mẫu ${i+1}, POC HM ${i}"><img src="orig_${String(i+1).padStart(2,'0')}.webp" alt="Mẫu hình ${i+1}"><div class="frame-choice-top"><strong>POC ${i} · HM ${frame.sliceType}</strong><span class="type-pill ${D.sourceType[i].toLowerCase()}">H.264 ${D.sourceType[i]}</span></div><div class="frame-choice-bottom"><span>PTS ${D.sourcePTS[i].toFixed(3)} s</span><span>+${D.sourceOffsets[i]} frame</span></div></button>`).join('');
    $('timeline').addEventListener('click',e=>{const b=e.target.closest('[data-frame]');if(!b)return;state.frame=Number(b.dataset.frame);state.selected=null;defaultSelection();render()});
    $('stages').addEventListener('click',e=>{const b=e.target.closest('[data-stage]');if(!b)return;state.stage=Number(b.dataset.stage);render()});
    $('frameCanvas').addEventListener('click',e=>{const rect=e.currentTarget.getBoundingClientRect();chooseAt((e.clientX-rect.left)*D.width/rect.width,(e.clientY-rect.top)*D.height/rect.height)});
    $('cuCanvas').addEventListener('click',e=>{const node=current()?.node;if(!node?.pus?.length)return;const rect=e.currentTarget.getBoundingClientRect();const x=node.x+(e.clientX-rect.left)*node.width/rect.width;const y=node.y+(e.clientY-rect.top)*node.height/rect.height;const index=node.pus.findIndex(p=>x>=p.x&&x<p.x+p.width&&y>=p.y&&y<p.y+p.height);if(index>=0)selectPu(node,index)});
    $('puList').addEventListener('click',e=>{const b=e.target.closest('[data-pu-index]');if(b)selectPu(current().node,Number(b.dataset.puIndex))});
    $('toggleImage').addEventListener('click',()=>{state.showRecon=!state.showRecon;render()});
    $('toggleOverlay').addEventListener('click',()=>{state.overlay=!state.overlay;render()});
    window.addEventListener('keydown',e=>{if($('workspace-atlas')?.hidden)return;if(e.key==='ArrowRight'){state.stage=Math.min(activeStages().length-1,state.stage+1);render()}if(e.key==='ArrowLeft'){state.stage=Math.max(0,state.stage-1);render()}});
    defaultSelection(); render();
  }
  function drawFrame() {
    const canvas=$('frameCanvas'),ctx=canvas.getContext('2d'),img=(state.showRecon?recon:original)[state.frame];
    ctx.fillStyle='#020507';ctx.fillRect(0,0,D.width,D.height);
    if(hasImage(img))ctx.drawImage(img,0,0,D.width,D.height);
    if(state.overlay) {
      for(const node of leaves[state.frame]) {
        ctx.fillStyle=node.mode==='INTRA'?'#b892e827':node.mode==='SKIP'?'#4ee1bf21':'#6aaaff25';
        ctx.fillRect(node.x,node.y,node.width,node.height);
        ctx.strokeStyle=node.mode==='INTRA'?'#c8aeecaa':node.mode==='SKIP'?'#5de5c5aa':'#8dbbffbb';ctx.lineWidth=1;
        ctx.strokeRect(node.x+.5,node.y+.5,node.width,node.height);
      }
    }
    const selected=current();
    if(selected) {
      const {node,pu,puIndex}=selected;
      ctx.strokeStyle='#fff1c5';ctx.lineWidth=1.5;
      ctx.strokeRect(node.x+1.5,node.y+1.5,node.width-3,node.height-3);
      for(const [index,part] of (node.pus||[]).entries()) {
        const color=puColor(index);
        ctx.fillStyle=puFill(index,index===puIndex);ctx.fillRect(part.x,part.y,part.width,part.height);
        ctx.strokeStyle=index===puIndex?'#fff7dd':color;ctx.lineWidth=index===puIndex?1.25:.75;
        ctx.strokeRect(part.x+.75,part.y+.75,part.width-1.5,part.height-1.5);
        if(part.width>=31&&part.height>=18){ctx.fillStyle='#07131bdd';ctx.fillRect(part.x+2,part.y+2,32,15);ctx.fillStyle='#fff';ctx.font='bold 10px ui-monospace,monospace';ctx.fillText(`PU${index+1}`,part.x+5,part.y+13)}
      }
      if(!(node.pus?.length)){ctx.fillStyle='#ffd58635';ctx.fillRect(pu.x,pu.y,pu.width,pu.height)}
    }
    $('frameBadge').textContent=`POC ${state.frame} · HM ${D.frames[state.frame].sliceType} · H.264 ${D.sourceType[state.frame]} +${D.sourceOffsets[state.frame]}F`;
    $('frameTitle').textContent=`POC ${state.frame} · ${D.frames[state.frame].sliceType}-slice · ${D.width} × ${D.height}`;
    $('toggleImage').textContent=state.showRecon?'Ảnh tái tạo':'Ảnh gốc';
    $('toggleOverlay').textContent=state.overlay?'Ẩn lưới':'Hiện lưới';
  }
  function drawCuDetail() {
    const {node,puIndex}=current(),parts=node.pus||[];
    const canvas=$('cuCanvas'),ctx=canvas.getContext('2d'),size=canvas.width;
    const img=(state.showRecon?recon:original)[state.frame];
    ctx.fillStyle='#07131c';ctx.fillRect(0,0,size,size);
    if(hasImage(img))ctx.drawImage(img,node.x,node.y,node.width,node.height,0,0,size,size);
    ctx.strokeStyle='#fff1c5';ctx.lineWidth=2;ctx.strokeRect(2,2,size-4,size-4);
    for(const [index,part] of parts.entries()) {
      const x=(part.x-node.x)*size/node.width,y=(part.y-node.y)*size/node.height;
      const w=part.width*size/node.width,h=part.height*size/node.height;
      const color=puColor(index);
      ctx.fillStyle=puFill(index,index===puIndex);ctx.fillRect(x,y,w,h);
      ctx.strokeStyle=index===puIndex?'#fffbea':color;ctx.lineWidth=index===puIndex?2.5:1.5;
      ctx.strokeRect(x+2,y+2,w-4,h-4);
      const labelWidth=Math.min(w-10,53);
      if(labelWidth>=38&&h>=27){ctx.fillStyle=color;ctx.fillRect(x+5,y+5,labelWidth,22);ctx.fillStyle='#0a1620';ctx.font='bold 12px ui-monospace,monospace';ctx.fillText(`PU ${index+1}`,x+9,y+21)}
    }
    $('cuTitle').textContent=`CU (${node.x}, ${node.y}) · ${node.width}×${node.height} · ${parts.length} PU`;
    $('cuHint').textContent=parts.length?`Kết quả cuối HM · ${state.showRecon?'Ảnh tái tạo sau lọc':'Ảnh gốc'} · POC ${state.frame}. Phân hoạch ${node.part_size}. Nhấn một vùng trên ảnh phóng to hoặc chọn PU trong danh sách để so sánh riêng.`:'Trace chưa có tọa độ PU của CU này.';
    $('puList').innerHTML=parts.length?parts.map((part,index)=>{
      const detail=node.mode==='INTRA'?`Mode ${part.intra_dir} · ${window.INTRA_VIEW.modeName(part.intra_dir)} · mẫu trên/trái`:
        part.l0?.ref_idx>=0?`L0 → POC ${part.l0.ref_poc}; MV (${format(part.l0.mv_x_qpel/4)}, ${format(part.l0.mv_y_qpel/4)}) px`:'Không dùng L0';
      return `<button type="button" class="pu-choice${index===puIndex?' active':''}" data-pu-index="${index}" aria-pressed="${index===puIndex}" style="--pu-color:${puColor(index)}"><span class="pu-number">${index+1}</span><span><strong>PU ${index+1}/${parts.length} · (${part.x}, ${part.y}) · ${part.width}×${part.height}</strong><small>${detail}</small></span></button>`
    }).join(''):'<div class="pu-empty">Không có PU trong trace của CU này.</div>';
  }
  function drawReference() {
    const canvas=$('referenceCanvas'),ctx=canvas.getContext('2d'),p=current()?.pu,ref=currentRef();
    ctx.fillStyle='#07101b';ctx.fillRect(0,0,D.width,D.height);
    if(isIntra()) {
      $('referenceEmpty').hidden=true;
      $('referenceLabel').textContent='MẪU LÂN CẬN TRONG CÙNG FRAME';
      $('referenceTitle').textContent=`Trên + trái · Mode ${intraMode()} ${window.INTRA_VIEW.modeName(intraMode())}`;
      $('referenceTag').textContent='INTRA · KHÔNG DÙNG DPB';
      $('referenceNote').textContent='Vạch vàng chỉ vị trí mẫu trên và trái của PU. Ảnh WebP tái tạo sau lọc chỉ minh họa; HM dự đoán từ mẫu tái tạo 10-bit trước lọc.';
      const img=recon[state.frame];if(hasImage(img))ctx.drawImage(img,0,0,D.width,D.height);
      ctx.fillStyle='#c7afff33';ctx.fillRect(p.x,p.y,p.width,p.height);
      ctx.strokeStyle='#d7c7ff';ctx.lineWidth=1;ctx.strokeRect(p.x+1,p.y+1,p.width-2,p.height-2);
      ctx.strokeStyle='#ffd38c';ctx.lineWidth=4;
      if(p.y>0){ctx.beginPath();ctx.moveTo(p.x,p.y-1);ctx.lineTo(Math.min(D.width,p.x+2*p.width),p.y-1);ctx.stroke()}
      if(p.x>0){ctx.beginPath();ctx.moveTo(p.x-1,p.y);ctx.lineTo(p.x-1,Math.min(D.height,p.y+2*p.height));ctx.stroke()}
      return;
    }
    $('referenceLabel').textContent='ẢNH THAM CHIẾU TRONG DPB';
    $('referenceNote').textContent='Khung viền là tọa độ lấy mẫu từ MV thật. Ảnh tham chiếu hiển thị là frame tái tạo do HM ghi ra.';
    const img=ref?recon[ref.ref_poc]:null;
    $('referenceEmpty').hidden=!!ref;
    if(!ref) { $('referenceTitle').textContent='Không có tham chiếu L0';$('referenceTag').textContent='INTRA';return; }
    $('referenceTitle').textContent=`L0[${ref.ref_idx}] → POC ${ref.ref_poc}`;
    $('referenceTag').textContent=`MV (${format(ref.mv_x_qpel/4)}, ${format(ref.mv_y_qpel/4)}) px`;
    if(hasImage(img))ctx.drawImage(img,0,0,D.width,D.height);
    const sx=p.x+ref.mv_x_qpel/4,sy=p.y+ref.mv_y_qpel/4;
    ctx.setLineDash([5,4]);ctx.strokeStyle='#ffffffb8';ctx.lineWidth=.75;ctx.strokeRect(p.x+.75,p.y+.75,p.width,p.height);ctx.setLineDash([]);
    ctx.fillStyle='#ffce7955';ctx.fillRect(sx,sy,p.width,p.height);
    ctx.strokeStyle='#ffdc91';ctx.lineWidth=1.5;ctx.strokeRect(sx+1.5,sy+1.5,p.width-3,p.height-3);
    ctx.beginPath();ctx.moveTo(p.x+p.width/2,p.y+p.height/2);ctx.lineTo(sx+p.width/2,sy+p.height/2);ctx.strokeStyle='#ffd384';ctx.lineWidth=2;ctx.stroke();
  }
  function patch(canvas,img,x,y,w,h) {
    const ctx=canvas.getContext('2d');ctx.fillStyle='#122236';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(hasImage(img))ctx.drawImage(img,x,y,w,h,0,0,canvas.width,canvas.height);
  }
  function drawComparison() {
    const p=current()?.pu,ref=currentRef();if(!p)return;
    patch($('originalPatch'),original[state.frame],p.x,p.y,p.width,p.height);
    patch($('reconPatch'),recon[state.frame],p.x,p.y,p.width,p.height);
    const refImg=ref?recon[ref.ref_poc]:null;
    const intra=isIntra();
    const predictionReady=intra?window.INTRA_VIEW.drawPrediction($('predictionPatch'),recon[state.frame],p,intraMode()):hasImage(refImg);
    if(!intra)patch($('predictionPatch'),refImg,p.x+(ref?.mv_x_qpel||0)/4,p.y+(ref?.mv_y_qpel||0)/4,p.width,p.height);
    $('predictionCaption').textContent=intra?`Mode ${intraMode()} · mẫu WebP trên/trái`:(p.inter_dir===3?'Chỉ minh họa L0 · không phải bi-pred':'Lấy mẫu WebP theo MV');
    const residual=$('residualPatch'),ctx=residual.getContext('2d');ctx.fillStyle='#122236';ctx.fillRect(0,0,residual.width,residual.height);
    if(predictionReady && hasImage(original[state.frame])) {
      const a=$('originalPatch').getContext('2d').getImageData(0,0,residual.width,residual.height).data;
      const b=$('predictionPatch').getContext('2d').getImageData(0,0,residual.width,residual.height).data;
      const out=ctx.createImageData(residual.width,residual.height);let sum=0;
      for(let i=0;i<a.length;i+=4){const d=((a[i]-b[i])+(a[i+1]-b[i+1])+(a[i+2]-b[i+2]))/3;sum+=Math.abs(d);const v=Math.min(255,Math.abs(d));out.data[i]=d>=0?v:27;out.data[i+1]=d>=0?Math.round(v*.53):Math.round(v*.58);out.data[i+2]=d>=0?35:v;out.data[i+3]=255}
      ctx.putImageData(out,0,0);
      $('compareNote').textContent=`${intra?'Mode Intra lấy từ trace HM; Prediction dựng gần đúng bằng mẫu WebP cùng frame.':(p.inter_dir===3?'PU bi-pred: ô này chỉ minh họa nhánh L0, không phải predictor kết hợp L0/L1.':'MV lấy từ trace HM; Prediction lấy mẫu WebP theo MV.')} MAE minh họa 8-bit: ${format(sum/(residual.width*residual.height))}. Đây không phải residual hoặc distortion RD 10-bit của HM.`;
    } else $('compareNote').textContent='Đang nạp ảnh để dựng prediction và residual minh họa.';
  }
  function metric(label,value,wide=false){return `<div class="metric${wide?' wide':''}"><span>${label}</span><b>${value}</b></div>`}
  function drawInspector() {
    const {node,pu,puIndex}=current(),ref=currentRef(),mode=node.mode,partCount=node.pus?.length||0;
    const intra=isIntra(),flow=activeStages();
    $('inspectTitle').textContent=`${mode} · ${node.part_size||'CU'}${partCount?` · PU ${puIndex+1}/${partCount}`:''}`;
    $('inspectSummary').textContent=partCount?`CU (${node.x}, ${node.y}) ${node.width}×${node.height}; PU ${puIndex+1}/${partCount} ở (${pu.x}, ${pu.y}) ${pu.width}×${pu.height}. ${intra?'Hướng Intra và ranh giới PU':'Ranh giới và motion của PU'} lấy từ trace HM.`:`CU (${node.x}, ${node.y}) ${node.width}×${node.height}.`;
    const mv=ref?`(${ref.mv_x_qpel}, ${ref.mv_y_qpel}) /4 pel`:'—';
    const mvd=ref?`(${ref.mvd_x_qpel}, ${ref.mvd_y_qpel}) /4 pel`:'—';
    $('metrics').innerHTML=intra?[
      metric('POC / slice',`${state.frame} / ${D.frames[state.frame].sliceType}`),
      metric('PU trong CU',partCount?`${puIndex+1} / ${partCount}`:'—'),
      metric('Mode luma HM',`${intraMode()} · ${window.INTRA_VIEW.modeName(intraMode())}`,true),
      metric('Phân hoạch CU',node.part_size||'—'),
      metric('Kích thước PU',`${pu.width} × ${pu.height}`),
      metric('Nguồn dự đoán','Trên / trái · cùng frame',true),
      metric('QP CU',node.qp ?? '—')
    ].join(''):[
      metric('POC / slice',`${state.frame} / ${D.frames[state.frame].sliceType}`),
      metric('PU trong CU',partCount?`${puIndex+1} / ${partCount}`:'chưa ghi'),
      metric('Hướng dự đoán',pu.inter_dir===1?'L0':pu.inter_dir===2?'L1':pu.inter_dir===3?'L0 + L1':'Intra'),
      metric('Tham chiếu L0',ref?`idx ${ref.ref_idx} → POC ${ref.ref_poc}`:'—',true),
      metric('Motion vector',mv,true),
      metric('MVD',mvd,true),
      metric('Mode motion',ref?(pu.merge?`Merge #${pu.merge_idx}`:`AMVP #${ref.mvp_idx}`):'Intra'),
      ...(pu.l1?.ref_idx>=0?[metric('L1 / MV qpel',`POC ${pu.l1.ref_poc} / (${pu.l1.mv_x_qpel}, ${pu.l1.mv_y_qpel})`,true)]:[]),
      metric('QP CU',node.qp ?? '—')
    ].join('');
    $('stepCount').textContent=`BƯỚC ${String(state.stage+1).padStart(2,'0')} / ${String(flow.length).padStart(2,'0')}`;
    $('stepTitle').textContent=flow[state.stage][0];$('stepDescription').textContent=flow[state.stage][1];
    $('stepFlow').textContent=state.stage===1&&partCount?`CU ${node.width}×${node.height} (${node.part_size}) → PU ${puIndex+1}/${partCount} (${pu.width}×${pu.height})`:intra&&state.stage===3?`Mode ${intraMode()} · ${window.INTRA_VIEW.modeName(intraMode())}`:state.stage===2&&ref?`L0[${ref.ref_idx}] = POC ${ref.ref_poc}`:state.stage===3&&ref?`${pu.merge?'Merge #'+pu.merge_idx:'AMVP #'+ref.mvp_idx} → MV (${format(ref.mv_x_qpel/4)}, ${format(ref.mv_y_qpel/4)}) px`:flow[state.stage][2];
  }
  function render() {
    if(!current())return;
    const flow=activeStages();
    $('stages').innerHTML=flow.map((s,i)=>`<button type="button" class="stage-choice" data-stage="${i}"><span>${String(i+1).padStart(2,'0')}</span>${s[0]}</button>`).join('');
    $('railTip').textContent=isIntra()?'Chọn các PU Intra trong CU để so sánh mode. Chọn CU màu xanh hoặc xanh ngọc để trở lại phân tích Inter.':'Chọn các PU trong CU để so sánh MV. Chọn CU màu tím để xem phân tích Intra.';
    document.querySelectorAll('.frame-choice').forEach((el,i)=>{el.classList.toggle('active',i===state.frame);el.setAttribute('aria-pressed',i===state.frame?'true':'false')});
    document.querySelectorAll('.stage-choice').forEach((el,i)=>{el.classList.toggle('active',i===state.stage);el.setAttribute('aria-current',i===state.stage?'step':'false')});
    drawFrame();drawCuDetail();drawReference();drawComparison();drawInspector();
  }
  window.INTER_ATLAS={
    loadRun(run){
      D.frames=run.frames;
      leaves.splice(0,leaves.length,...D.frames.map(f=>f.ctus.flatMap(c=>c.nodes.filter(n=>!n.split))));
      for(let i=0;i<5;i++)recon[i].src=`runs/${run.summary.id}/recon_${String(i+1).padStart(2,'0')}.webp`;
      document.querySelectorAll('.frame-choice-top strong').forEach((el,i)=>el.textContent=`POC ${i} · HM ${D.frames[i].sliceType}`);
      document.querySelector('#workspace-atlas .section-title p').textContent=`Nguồn H.264: I/B/B/P/P; lần chạy HM: ${D.frames.map(f=>f.sliceType).join('/')}.`;
      defaultSelection();
    },
    getImageSource(){return state.showRecon?'recon':'orig';},
    setImageSource(source){state.showRecon=source==='recon';render();},
    selectBlock(poc,x,y){state.frame=poc;chooseAt(x+.5,y+.5);return current()?.node;}

  };
  init();
})();
