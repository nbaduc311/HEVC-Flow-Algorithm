(() => {
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,n=3)=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:n}):'—';
const name=m=>m===0?'0 · Planar':m===1?'1 · DC':m===10?'10 · Horizontal':m===26?'26 · Vertical':m===36?'36 · DM (theo luma)':`${m} · Angular`;
const note=(t)=>`<div class="notice">${t}</div>`;
const btn=(t,a)=>`<button type="button" class="secondary" data-intra-action="${a}">${t}</button>`;
const key=s=>`${s.x},${s.y},${s.size}`;
const cache=new Map();let host=null,state={run:null,index:null,search:null,data:null,poc:0,pu:0,stage:'fast',row:0,sort:false},token=0;
async function get(path){if(!cache.has(path)){const response=await fetch(path);if(!response.ok)throw Error('Không tải được trace Intra: '+path);cache.set(path,await response.json());}return cache.get(path);}
const root=()=>host.root;
function final(){return host.run.events.find(e=>e.seq===state.search?.seq);}
function list(stage){return (state.data?.events||[]).filter(e=>e.stage===stage);}
function puRows(stage){return list(stage).filter(e=>e.offset===state.pu);}
const steps=[['fast','01 · 35 mode & MPM'],['luma','02 · RD luma & TU'],['chroma','03 · RD chroma'],['final','04 · RD cả CU']];
function rows(){let r=state.stage==='fast'?puRows('FAST'):state.stage==='luma'?puRows('LUMA'):list('CHROMA');if(state.stage==='fast'&&state.sort)r=[...r].sort((a,b)=>a.cost-b.cost);return r;}
function pick(){const r=rows();state.row=Math.max(0,Math.min(state.row,r.length-1));return r[state.row];}
async function choose(summary){
 const t=++token;
 if(!summary){state.search=null;state.data=null;draw();return;}
 state.search=summary;state.poc=summary.poc;state.data=null;state.row=0;state.pu=0;
 draw();
 try{const data=await get(summary.path);if(t!==token)return;state.data=data;state.pu=list('SHORTLIST')[0]?.offset||0;draw();}catch(e){if(t===token)root().innerHTML=note(esc(e.message));}
}
function draw(){
 if(!host)return;
 const index=state.index,ss=index?.searches||[],s=state.search,f=final();
 root().innerHTML=`<div class="ws-heading"><div><h2>Đi sâu vào từng mode Intra.</h2><p>Theo đúng một lần gọi xCheckRDCostIntra: sàng lọc luma → RD luma/TU → RD chroma → mã hóa thử cả CU.</p></div>${btn('Về lượt RD của CU','final')}</div>`;
 if(!index){root().innerHTML+=note(host.run.intraPath?'Đang nạp chỉ mục Intra…':'Lần chạy này chưa có trace từng mode Intra. Chạy lại cùng cấu hình trong vùng “Chạy cấu hình” để thu dữ liệu.');return;}
 const cfg=host.run.summary.config;
 root().innerHTML+=note(`Cấu hình: ${cfg.profile==='I'?'All Intra':'Low Delay '+cfg.profile} · QP cơ sở ${cfg.qp} · offset I ${cfg.intraQpOffset??-1} · MPM ${cfg.fastIntraMpm??1} · strong smoothing ${cfg.strongSmoothing??1} · TU depth ${cfg.tuDepthIntra??3} · TransformSkip ${cfg.transformSkip??1} / Fast ${cfg.transformSkipFast??1} · RDOQ ${cfg.rdoq??1} / TS ${cfg.rdoqTs??1}.`);
 root().innerHTML+=`<div class="flow-controls"><label>Frame <select id="intraPoc">${host.run.frames.map(fr=>`<option value="${fr.poc}" ${state.poc===fr.poc?'selected':''}>POC ${fr.poc} · ${fr.sliceType} · QP ${fr.qp}</option>`).join('')}</select></label><label>Lượt thử Intra của CU <select id="intraSearch">${ss.filter(q=>q.poc===state.poc).map(q=>`<option value="${q.seq}" ${s?.seq===q.seq?'selected':''}>#${q.seq} · (${q.x},${q.y}) ${q.size}×${q.size} · ${q.part}</option>`).join('')}</select></label><span class="tag">CTU (${host.run.summary.config.ctuX}, ${host.run.summary.config.ctuY}) · HM thật</span></div>`;
 if(!s){root().innerHTML+=note('Không có lượt xCheckRDCostIntra được ghi tại POC này trong CTU đã chọn. Encoder có thể bỏ nhánh Intra theo điều kiện tìm kiếm. Chọn POC 0 hoặc một POC khác có lượt thử.');return;}
 if(!state.data){root().innerHTML+=note('Đang nạp các lượt thử mode…');return;}
 const selectedY=list('LUMA_PICK'),selectedC=list('CHROMA_PICK');
 root().innerHTML+=`<div class="intra-overview"><div><span>Ứng viên cuối của xCheckRDCostIntra</span><b>#${s.seq} · ${s.part} · QP ${s.qp}</b></div><div><span>Luma được chọn</span><b>${selectedY.map((e,i)=>`PU${i+1}: ${name(e.mode)}`).join(' / ')}</b></div><div><span>Chroma được chọn</span><b>${selectedC.map(e=>name(e.mode)).join(' / ')}</b></div><div><span>So với best CU trước đó</span><b>${s.accepted?'Nhận best tạm thời':'Giữ best trước'}</b></div></div>
 <div class="intra-stages" role="group" aria-label="Cấp quyết định Intra">${steps.map(([v,t])=>`<button data-intra-stage="${v}" aria-pressed="${v===state.stage}" class="${v===state.stage?'active':''}">${t}</button>`).join('')}</div>`;
 if(state.stage!=='final'&&state.stage!=='chroma')root().innerHTML+=`<div class="flow-controls"><label>PU luma <select id="intraPu">${list('SHORTLIST').map((p,i)=>`<option value="${p.offset}" ${p.offset===state.pu?'selected':''}>PU ${i+1} · (${s.x+p.px}, ${s.y+p.py}) · ${p.width}×${p.height}</option>`).join('')}</select></label><span class="muted">PU được thử trong ứng viên ${s.part}; không nhất thiết nằm trong cây CU cuối.</span></div>`;
 if(state.stage==='fast')drawFast();else if(state.stage==='luma')drawLuma();else if(state.stage==='chroma')drawChroma();else drawFinal(f);
 const replay=host.run.provenance.intraReplay;
 if(replay)root().innerHTML+=`<p class="form-help">Trace Intra bổ sung bằng lần chạy lại <code>${esc(replay.id)}</code>, đã đối chiếu bitstream và các quyết định với lần chạy đang xem. <a href="runs/${encodeURIComponent(replay.id)}/result.json" target="_blank">Command và SHA encoder của lần ghi trace ↗</a></p>`;
 root().innerHTML+=`<div class="source-links" style="margin-top:18px"><a href="/source/TEncCu.cpp" target="_blank">xCheckRDCostIntra ↗</a><a href="/source/TEncSearch.cpp" target="_blank">estIntraPredLumaQT / ChromaQT ↗</a><a href="${s.path}" download>Trace riêng lượt Intra ↓</a></div>`;
 drawPatches();
}
function controls(){return `<div class="button-row" style="margin-bottom:12px">${btn('← Lượt trước','prev')}<span class="number">${state.row+1} / ${rows().length}</span>${btn('Lượt sau →','next')}${state.stage==='fast'?`<label><input id="intraSort" type="checkbox" ${state.sort?'checked':''}> Xếp theo chi phí</label>`:''}</div>`;}
function table(entries,headers,body){return `<div class="trial-list intra-table"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${entries.map((e,i)=>`<tr data-intra-row="${i}" class="${i===state.row?'selected':''}" tabindex="0" aria-label="Mode ${name(e.mode)}">${body(e,i)}</tr>`).join('')}</tbody></table></div>`;}
function drawFast(){
 const e=pick(),short=puRows('SHORTLIST')[0],mpm=puRows('MPM')[0]?.modes||[];
 if(!e){root().innerHTML+=note('Lượt này không thực hiện bước sàng lọc nhanh; xem trực tiếp danh sách RD luma.');return;}
 const sorted=[...puRows('FAST')].sort((a,b)=>a.cost-b.cost),rank=m=>sorted.findIndex(v=>v.mode===m)+1;
 const top=short.modes.slice(0,short.baseCount),extra=short.modes.slice(short.baseCount);
 root().innerHTML+=`<div class="ws-card"><h3>35 mode luma: Planar, DC và 33 hướng Angular</h3>${note(`Bước này chỉ dùng dự đoán: ${e.metric}(Original − Prediction) + √λ × bit báo hiệu mode. Chưa transform/quant residual, chưa tính distortion ảnh tái tạo. HM giữ ${short.baseCount} mode theo chi phí nhanh ${host.run.summary.config.fastIntraMpm===0?'và không bổ sung MPM (FastUDIUseMPMEnabled=0).':'rồi bổ sung MPM nếu chưa có.'} Danh sách MPM bên dưới là các mode vòng lặp numCand xét bổ sung, có thể ít hơn bộ 3 MPM dùng để báo hiệu.`)}
 <div class="intra-shortlist"><div><b>MPM được xét bổ sung:</b> ${mpm.map(name).join(' · ')||'không ghi / không bật'}</div><div><b>Danh sách đưa vào RD (đúng thứ tự):</b> ${short.modes.map((m,i)=>`<span class="badge ${i>=short.baseCount?'warn':''}">${name(m)}${i>=short.baseCount?' · thêm MPM':''}</span>`).join(' ')}</div></div>${controls()}
 ${table(rows(),['Mode','Hạng nhanh',e.metric,'R mode','Chi phí nhanh','Được giữ?'],(r)=>`<td>${name(r.mode)}${mpm.includes(r.mode)?' <span class="badge dim">MPM xét bổ sung</span>':''}</td><td>${rank(r.mode)}</td><td>${fmt(r.distortion,0)}</td><td>${r.bits}</td><td>${fmt(r.cost)}</td><td>${top.includes(r.mode)?'<span class="badge">Top chi phí</span>':extra.includes(r.mode)?'<span class="badge warn">MPM bổ sung</span>':'Không vào RD'}</td>`)}
 <div class="decision-detail"><h3>Mode ${name(e.mode)} · lọc mẫu tham chiếu: ${e.filtered?'có':'không'}</h3><div class="equation">J nhanh = ${e.metric} + √λ × R<sub>mode</sub><br>${fmt(e.cost,6)} = ${fmt(e.distortion,0)} + ${fmt(e.lambda,8)} × ${e.bits}</div>
 <p class="form-help">Biến uiSad trong code dùng ${e.metric} ở lượt này. R ở đây chỉ là ước lượng bit của mode luma, không gồm hệ số residual hay toàn CU.</p><div class="intra-patches"><figure><canvas id="intraOrig" width="160" height="160"></canvas><figcaption>Original 10-bit</figcaption></figure><figure><canvas id="intraPred" width="160" height="160"></canvas><figcaption>Prediction của mode ${e.mode}</figcaption></figure><figure><canvas id="intraResidual" width="160" height="160"></canvas><figcaption>|O − P| · độ lớn ×1</figcaption></figure></div><p class="form-help">Mẫu ${e.patchSize}×${e.patchSize} góc trên trái PU, đọc từ buffer thật của bước nhanh; canvas chỉ chuyển thang 10-bit xuống mức hiển thị. Chi phí phía trên tính trên toàn PU.</p></div></div>`;
}
function rdEquation(e){return `<div class="equation">J = D + λ × R<br>${fmt(e.cost,6)} = ${fmt(e.distortion,0)} + ${fmt(e.lambda,8)} × ${e.bits}</div>${note(e.bestBefore===null?'Đây là ứng viên đầu tiên có chi phí hữu hạn → nhận.':`Best trước = ${fmt(e.bestBefore,6)}. J thử ${e.accepted?'nhỏ hơn':'không nhỏ hơn'} best → ${e.accepted?'cập nhật best':'giữ best'}. Phép so sánh dùng dấu &lt;.`)}`;}
function drawLuma(){
 const e=pick(),winner=puRows('LUMA_PICK')[0];if(!e)return;
 const tu=list('TU').filter(t=>t.attempt===e.attempt);
 root().innerHTML+=`<div class="ws-card"><h3>RD luma sau transform / quant / tái tạo</h3>${note('RDO: thử các mode trong danh sách với cây TU bị hạn chế bởi HHI_RQT_INTRA_SPEEDUP. REFINE: thử lại mode tốt với khả năng chia TU sâu hơn. Đây là RD của PU luma, chưa phải J cả CU Y/Cb/Cr.')}<p><b>Mode luma giữ lại:</b> ${name(winner.mode)} · D<sub>Y</sub> = ${fmt(winner.distortion,0)} · J<sub>Y</sub> = ${fmt(winner.cost,6)}</p>${controls()}
 ${table(rows(),['Lượt','Mode','D luma','R','λ','J','Quyết định'],r=>`<td>${r.pass}</td><td>${name(r.mode)}</td><td>${fmt(r.distortion,0)}</td><td>${r.bits}</td><td>${fmt(r.lambda,4)}</td><td>${fmt(r.cost,4)}</td><td><span class="badge ${r.accepted?'':'dim'}">${r.accepted?'Nhận':'Giữ best'}</span></td>`)}
 <div class="decision-detail"><h3>${e.pass} · Mode ${name(e.mode)} · lượt #${e.step} trong tìm kiếm Intra</h3>${rdEquation(e)}<p class="form-help">R được ghi từ biến uiSingleBits / uiSplitBits của nhánh TU được chọn, không suy ngược từ J. Cả D và J lấy ở đầu ra xRecurIntraCodingLumaQT.</p>
 <details open><summary>Đi xuống cây TU của đúng lượt này · ${tu.length} nút trả kết quả</summary><p class="form-help">Thứ tự bảng là thứ tự hàm đệ quy trả về. TU cha đã bao gồm kết quả các con; không cộng tất cả các dòng. Ô “—” nghĩa phương án không được thử ở nút đó.</p><div class="trial-list intra-table"><table><thead><tr><th>TU (tọa độ tương đối CU)</th><th>J không chia</th><th>J chia</th><th>Chọn</th><th>D giữ lại</th><th>R giữ lại</th></tr></thead><tbody>${tu.map(t=>`<tr><td>depth ${t.tuDepth} · (${t.px},${t.py}) ${t.width}×${t.height}</td><td>${fmt(t.singleCost,3)}</td><td>${fmt(t.splitCost,3)}</td><td>${t.split?'Chia TU':'Không chia'}</td><td>${fmt(t.distortion,0)}</td><td>${t.bits}</td></tr>`).join('')}</tbody></table></div></details></div></div>`;
}
function drawChroma(){
 const e=pick();if(!e){root().innerHTML+=note('Không có lượt chroma được ghi cho tìm kiếm này.');return;}
 const selected=list('CHROMA_PICK');
 root().innerHTML+=`<div class="ws-card"><h3>Chọn mode chroma sau khi đã chốt luma</h3>${note('Với YUV 4:2:0 hiện tại, Intra NxN có thể có 4 PU luma nhưng phần chroma được tìm chung ở cấp CU. D tại bước này là tổng distortion có trọng số của Cb và Cr; R chỉ thuộc phép đánh giá chroma. DM (36) lấy hướng tương ứng từ luma; nếu hướng luma trùng mode cơ bản, danh sách có thể thay mode đó bằng Angular 34.')}<p><b>Chroma giữ lại:</b> ${selected.map(r=>`${name(r.mode)} · D<sub>Cb+Cr</sub> = ${fmt(r.distortion,0)}`).join(' / ')}</p>${controls()}
 ${table(rows(),['Mode chroma','D Cb + Cr','R chroma','λ','J chroma','Quyết định'],r=>`<td>${name(r.mode)}</td><td>${fmt(r.distortion,0)}</td><td>${r.bits}</td><td>${fmt(r.lambda,4)}</td><td>${fmt(r.cost,4)}</td><td><span class="badge ${r.accepted?'':'dim'}">${r.accepted?'Nhận':'Giữ best'}</span></td>`)}
 <div class="decision-detail"><h3>Mode ${name(e.mode)}</h3>${rdEquation(e)}<pre class="code-block">estIntraPredChromaQT
  → khôi phục CABAC context cho lượt thử
  → setIntraDirSubParts(CHROMA, ${e.mode})
  → xRecurIntraChromaCodingQT
      dự đoán / biến đổi / lượng tử / tái tạo Cb và Cr theo TU
  → uiBits = xGetIntraBitsQT(..., luma=false, chroma=true)
  → J = calcRdCost(uiBits, uiDist)
  → ${e.accepted?'giữ mode này làm best chroma':'giữ best chroma trước đó'}</pre></div></div>`;
}
function drawFinal(f){
 const ys=list('LUMA_PICK'),cs=list('CHROMA_PICK'),sumY=ys.reduce((v,e)=>v+e.distortion,0),sumC=cs.reduce((v,e)=>v+e.distortion,0);
 const n=host.run.frames[f.poc].ctus.flatMap(ctu=>ctu.nodes).find(n=>n.x===f.x&&n.y===f.y&&n.width===f.size);
 let finalText=!n?'CU đã thử này không tồn tại riêng trong cây cuối.':n.split?'Cây cuối chọn chia CU này thành các CU con.':`Cây cuối giữ CU ${n.mode} · ${n.part_size}.`;
 root().innerHTML+=`<div class="ws-card"><h3>xCheckRDCostIntra: tính lại RD cho toàn ứng viên CU</h3><pre class="code-block">xCheckRDCostIntra(${f.part})
  → estIntraPredLumaQT: chọn mode của ${ys.length} PU luma
  → estIntraPredChromaQT: chọn mode chroma
  → reset bộ đếm bit; mã hóa thử cú pháp cả CU
  → encodeSkipFlag / encodePredMode / encodePartSize / encodePredInfo
  → encodeCoeff: TU, CBF, hệ số Y/Cb/Cr
  → xCheckDQP → xCheckBestMode</pre>
 <div class="equation">D CU = Σ D<sub>Y,PU</sub> + Σ D<sub>Cb+Cr</sub><br>${fmt(f.distortion,0)} = ${fmt(sumY,0)} + ${fmt(sumC,0)}</div><div class="table-scroll"><table><thead><tr><th>Phần đã chọn</th><th>Mode</th><th>D giữ lại</th><th>R ở phép thử riêng</th></tr></thead><tbody>${ys.map((e,i)=>`<tr><td>Luma PU ${i+1}</td><td>${name(e.mode)}</td><td>${fmt(e.distortion,0)}</td><td>${e.bits}</td></tr>`).join('')}${cs.map(e=>`<tr><td>Chroma Cb + Cr</td><td>${name(e.mode)}</td><td>${fmt(e.distortion,0)}</td><td>${e.bits}</td></tr>`).join('')}</tbody></table></div>
 ${note('D được cộng từ các phần đã chọn. R cuối được đếm lại cho cả CU với cú pháp và trạng thái CABAC tương ứng; không cộng máy móc R của các lượt thử riêng. J luma và J chroma cũng không phải các J hoàn chỉnh để cộng trực tiếp.')}
 <h3>R cuối = ${f.bits} bit</h3><div class="table-scroll"><table><thead><tr><th>Mốc mã hóa thử</th><th>Bit tích lũy</th><th>Tăng</th><th>Chi phí có phần lẻ</th></tr></thead><tbody>${(f.rateSteps||[]).map(r=>`<tr><td>${esc(r.label)}</td><td>${r.after}</td><td>${r.delta}</td><td>${r.fracBits15===undefined?'—':fmt(r.fracBits15/32768,8)}</td></tr>`).join('')}</tbody></table></div><p class="form-help">Chi phí bin được tích lũy theo context ở đơn vị 1/32768 bit. Bit tăng là hiệu hai lần đọc bộ đếm nguyên. Các dòng tăng 0 không tự chứng minh rằng không có bin.</p>
 <h3>J cả CU và phép chọn mode</h3>${rdEquation(f)}${note(`<b>${esc(finalText)}</b> “Nhận” ở xCheckBestMode chỉ là best tại thời điểm đó; các ứng viên hoặc quyết định chia CU sau vẫn có thể thay thế.`)}<div class="button-row">${btn('Mở nguồn D/R/λ và các mẫu 10-bit của CU','final')}</div></div>`;
}
function drawPatches(){if(state.stage!=='fast')return;const e=pick();if(!e)return;for(const [id,data] of [['intraOrig',e.original],['intraPred',e.prediction],['intraResidual',e.original.map((v,i)=>Math.abs(v-e.prediction[i]))]]){const canvas=root().querySelector('#'+id);if(!canvas)return;const ctx=canvas.getContext('2d'),n=e.patchSize,cell=canvas.width/n;for(let i=0;i<data.length;i++){const v=Math.max(0,Math.min(255,Math.round(data[i]*255/1023)));ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect((i%n)*cell,Math.floor(i/n)*cell,cell,cell);}}}
function listen(){
 const el=root();if(el.dataset.intraBound)return;el.dataset.intraBound='true';
 el.addEventListener('change',e=>{const t=e.target;if(t.id==='intraPoc'){state.poc=+t.value;choose(state.index.searches.find(q=>q.poc===state.poc));}if(t.id==='intraSearch')choose(state.index.searches.find(q=>q.seq===+t.value));if(t.id==='intraPu'){state.pu=+t.value;state.row=0;draw();}if(t.id==='intraSort'){state.sort=t.checked;state.row=0;draw();}});
 el.addEventListener('click',e=>{const t=e.target.closest('[data-intra-stage],[data-intra-row],[data-intra-action]');if(!t)return;if(t.dataset.intraStage){state.stage=t.dataset.intraStage;state.row=0;draw();}else if(t.dataset.intraRow!==undefined){state.row=+t.dataset.intraRow;draw();}else{const action=t.dataset.intraAction;if(action==='final'&&final())host.onFinal(final());if(action==='prev'||action==='next'){state.row+=action==='prev'?-1:1;pick();draw();el.querySelector('.intra-table tr.selected')?.scrollIntoView({block:'nearest'});}}});
 el.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-intra-row]')){e.preventDefault();state.row=+e.target.dataset.intraRow;draw();}});
}
window.INTRA_LAB={async render(ctx){
 host=ctx;listen();
 const changed=state.run!==ctx.run.summary.id,preferred=ctx.preferredSeq;
 if(!changed&&state.index){if(preferred&&state.search?.seq!==preferred){const s=state.index.searches.find(s=>s.seq===preferred);if(s){await choose(s);return;}}draw();return;}
 state={...state,run:ctx.run.summary.id,index:null,search:null,data:null,poc:ctx.poc,pu:0,row:0};const t=++token;draw();
 if(!ctx.run.intraPath)return;
 try{const index=await get(ctx.run.intraPath);if(t!==token)return;state.index=index;
 const selected=index.searches.find(s=>s.seq===preferred)||index.searches.find(s=>s.poc===ctx.poc&&key(s)===ctx.cuKey)||index.searches.find(s=>s.poc===ctx.poc)||index.searches[0];
 await choose(selected);
 }catch(e){if(t===token)root().innerHTML=note(esc(e.message));}
}};
})();
