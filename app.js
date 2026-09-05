/* ============================================================
   VietinBank – Trích xuất Hóa đơn OCR (100% offline)
   Design by Hải Đăng
   ============================================================ */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const queueList = document.getElementById('queueList');
const startBtn = document.getElementById('startBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const addRowBtn = document.getElementById('addRowBtn');
const langSelect = document.getElementById('langSelect');
const queueSummary = document.getElementById('queueSummary');
const resultSummary = document.getElementById('resultSummary');
const resultsBody = document.getElementById('resultsBody');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingTitle = document.getElementById('loadingTitle');
const loadingDesc = document.getElementById('loadingDesc');

let queue = [];        // {id, file, status, progress, text, fields}
let results = [];      // extracted rows (editable)
let worker = null;
let workerLang = null;
let rowSeq = 1;
let uid = 1;

/* ---------------- File intake ---------------- */

['dragenter','dragover'].forEach(evt=>{
  dropzone.addEventListener(evt, e=>{ e.preventDefault(); dropzone.classList.add('dragover'); });
});
['dragleave','drop'].forEach(evt=>{
  dropzone.addEventListener(evt, e=>{ e.preventDefault(); dropzone.classList.remove('dragover'); });
});
dropzone.addEventListener('drop', e=>{
  addFiles(e.dataTransfer.files);
});
dropzone.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', e=> { addFiles(e.target.files); fileInput.value=''; });

const cameraBtn = document.getElementById('cameraBtn');
const cameraInput = document.getElementById('cameraInput');
if(cameraBtn && cameraInput){
  cameraBtn.addEventListener('click', ()=> cameraInput.click());
  cameraInput.addEventListener('change', e=> { addFiles(e.target.files); cameraInput.value=''; });
}

function addFiles(fileList){
  const accepted = ['application/pdf','image/png','image/jpeg','image/jpg','image/webp'];
  Array.from(fileList).forEach(file=>{
    const isPdf = file.type==='application/pdf' || /\.pdf$/i.test(file.name);
    const isImg = accepted.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
    if(!isPdf && !isImg) return;
    queue.push({id:uid++, file, status:'pending', progress:0});
  });
  renderQueue();
}

function renderQueue(){
  if(queue.length===0){
    queueList.innerHTML = '';
    startBtn.disabled = true;
    clearBtn.disabled = true;
    queueSummary.textContent = '';
    return;
  }
  clearBtn.disabled = false;
  startBtn.disabled = queue.every(q=>q.status==='done'||q.status==='error');
  const done = queue.filter(q=>q.status==='done').length;
  queueSummary.textContent = `${queue.length} file · ${done} đã xong`;

  queueList.innerHTML = queue.map(q=>`
    <div class="queue-item" data-id="${q.id}">
      <div class="fname">
        <b title="${escapeHtml(q.file.name)}">${escapeHtml(q.file.name)}</b>
        <small>${(q.file.size/1024).toFixed(0)} KB</small>
      </div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${q.progress}%"></div></div>
      <span class="status-pill status-${q.status}">${statusLabel(q.status)}</span>
      <button class="remove-btn" data-remove="${q.id}" title="Xoá khỏi danh sách">✕</button>
    </div>
  `).join('');

  queueList.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = Number(btn.dataset.remove);
      queue = queue.filter(q=>q.id!==id);
      renderQueue();
    });
  });
}

function statusLabel(s){
  return {pending:'Chờ xử lý', processing:'Đang xử lý', done:'Hoàn tất', error:'Lỗi'}[s] || s;
}

clearBtn.addEventListener('click', ()=>{
  if(queue.some(q=>q.status==='processing')) return;
  queue = [];
  renderQueue();
});

/* ---------------- OCR worker ---------------- */

async function ensureWorker(lang){
  if(worker && workerLang===lang) return worker;
  if(worker){ await worker.terminate(); worker=null; }
  showLoading('Đang tải mô hình OCR...', 'Nạp dữ liệu ngôn ngữ từ thư mục tessdata trên máy (chỉ cần internet lần đầu nếu bạn chưa tải sẵn).');
  worker = await Tesseract.createWorker(lang, 1, {
    workerPath: 'libs/worker.min.js',
    corePath: 'libs/tesseract-core-lstm.wasm.js',
    langPath: 'tessdata',
    gzip: true,
    logger: m=>{
      if(m.status==='recognizing text' && currentFileObj){
        currentFileObj.progress = Math.round((m.progress||0)*100);
        renderQueue();
      }
    }
  });
  workerLang = lang;
  hideLoading();
  return worker;
}

function showLoading(title, desc){
  loadingTitle.textContent = title;
  loadingDesc.textContent = desc;
  loadingOverlay.style.display = 'flex';
}
function hideLoading(){ loadingOverlay.style.display = 'none'; }

/* ---------------- Processing pipeline ---------------- */

let currentFileObj = null;

startBtn.addEventListener('click', async ()=>{
  startBtn.disabled = true;
  langSelect.disabled = true;
  const lang = langSelect.value;
  try{
    await ensureWorker(lang);
  }catch(err){
    hideLoading();
    alert('Không thể nạp mô hình OCR. Kiểm tra thư mục /tessdata và /libs có đầy đủ file không.\n\n'+err.message);
    startBtn.disabled = false;
    langSelect.disabled = false;
    return;
  }

  for(const item of queue){
    if(item.status==='done') continue;
    currentFileObj = item;
    item.status = 'processing';
    item.progress = 0;
    renderQueue();
    try{
      const text = await ocrFile(item);
      item.text = text;
      const fields = extractFields(text, item.file.name);
      results.push(fields);
      item.status = 'done';
      item.progress = 100;
    }catch(err){
      console.error(err);
      item.status = 'error';
    }
    renderQueue();
    renderResults();
  }
  currentFileObj = null;
  langSelect.disabled = false;
  renderQueue();
});

async function ocrFile(item){
  const file = item.file;
  const isPdf = file.type==='application/pdf' || /\.pdf$/i.test(file.name);
  let fullText = '';

  if(isPdf){
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data:buf}).promise;
    for(let p=1;p<=pdf.numPages;p++){
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({scale:2.3});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      await page.render({canvasContext:ctx, viewport}).promise;
      const {data} = await worker.recognize(canvas);
      fullText += data.text + '\n';
    }
  } else {
    const {data} = await worker.recognize(file);
    fullText += data.text;
  }
  return fullText;
}

/* ---------------- Field extraction (heuristic, Vietnamese e-invoice) ---------------- */

function firstMatch(re, text){
  const m = text.match(re);
  return m ? m[1].trim().replace(/\s+/g,' ') : '';
}
function allMatches(re, text){
  const out = [];
  let m;
  const g = new RegExp(re.source, re.flags.includes('g')?re.flags:re.flags+'g');
  while((m = g.exec(text)) !== null){ out.push(m[1].trim().replace(/\s+/g,' ')); }
  return out;
}

function extractFields(text, fileName){
  const t = text.replace(/\r/g,'');

  let loaiHD = '';
  if(/GI[AÁ]\s*TR[IỊ]\s*GIA\s*T[AĂ]NG/i.test(t)) loaiHD = 'Hóa đơn GTGT';
  else if(/H[OÓ]A\s*ĐƠN\s*B[AÁ]N\s*H[AÀ]NG/i.test(t)) loaiHD = 'Hóa đơn bán hàng';
  else if(/H[OÓ]A\s*ĐƠN/i.test(t)) loaiHD = 'Hóa đơn điện tử';

  const soHoaDon = firstMatch(/(?<!tiền\s)Số\s*[:.]?\s*(\d{1,10})\b/i, t);
  const kyHieu = firstMatch(/K[yý]\s*hi[eệ]u\s*[:.]?\s*([A-Za-z0-9\/\-]{4,15})/i, t);
  const ngayRaw = t.match(/Ng[aà]y\s*[:.]?\s*(\d{1,2})\s*(?:th[aá]ng|\/|-)\s*(\d{1,2})\s*(?:n[aă]m|\/|-)\s*(\d{2,4})/i);
  const ngayLap = ngayRaw ? `${ngayRaw[1].padStart(2,'0')}/${ngayRaw[2].padStart(2,'0')}/${ngayRaw[3]}` : '';

  const tenDonViBan = firstMatch(/(?:Đơn vị bán hàng|Tên đơn vị bán hàng|Người bán hàng)\s*[:.]?\s*(.+)/i, t);
  const mstAll = allMatches(/M[aã]\s*s[oố]\s*thu[eế]\s*[:.]?\s*([0-9][0-9\-\s]{7,14}[0-9])/i, t);
  const diaChiAll = allMatches(/Đ[iị]a\s*ch[iỉ]\s*[:.]?\s*(.+)/i, t);
  const hoTenNguoiMua = firstMatch(/H[oọ]\s*t[eê]n\s*người\s*mua\s*h[aà]ng\s*[:.]?\s*(.+)/i, t);
  const tenDonViMuaAll = allMatches(/T[eê]n\s*đơn\s*v[iị]\s*[:.]?\s*(.+)/i, t);
  const hinhThucTT = firstMatch(/H[iì]nh\s*th[uứ]c\s*(?:thanh\s*to[aá]n|TT)\s*[:.]?\s*(.+)/i, t);
  const congTienHang = firstMatch(/C[oộ]ng\s*ti[eề]n\s*h[aà]ng\s*[:.]?\s*([\d.,]+)/i, t);
  const thueSuat = firstMatch(/Thu[eế]\s*su[aấ]t(?:\s*GTGT)?\s*[:.]?\s*([\d]{1,2}\s*%|kh[oô]ng\s*ch[iị]u\s*thu[eế]|KCT)/i, t);
  const tienThue = firstMatch(/Ti[eề]n\s*thu[eế](?:\s*GTGT)?\s*[:.]?\s*([\d.,]+)/i, t);
  const tongTT = firstMatch(/T[oổ]ng\s*(?:c[oộ]ng\s*)?ti[eề]n\s*thanh\s*to[aá]n\s*[:.]?\s*([\d.,]+)/i, t);
  const bangChu = firstMatch(/(?:S[oố]\s*ti[eề]n\s*vi[eế]t\s*b[aằ]ng\s*ch[uữ]|B[aằ]ng\s*ch[uữ])\s*[:.]?\s*(.+)/i, t);

  // Heuristic ordering: seller block appears before buyer block in the document
  const mstBan = mstAll[0] || '';
  const mstMua = mstAll[1] || '';
  const diaChiBan = diaChiAll[0] || '';
  const diaChiMua = diaChiAll[1] || '';
  const tenDonViMua = tenDonViMuaAll.length ? tenDonViMuaAll[tenDonViMuaAll.length-1] : '';

  return {
    id: rowSeq++,
    fileName,
    loaiHD, soHoaDon, kyHieu, ngayLap,
    tenDonViBan, mstBan, diaChiBan,
    nguoiMua: hoTenNguoiMua || tenDonViMua,
    mstMua, diaChiMua,
    hinhThucTT, congTienHang, thueSuat, tienThue, tongTT, bangChu
  };
}

/* ---------------- Results table (editable) ---------------- */

const COLS = ['fileName','loaiHD','soHoaDon','kyHieu','ngayLap','tenDonViBan','mstBan','diaChiBan','nguoiMua','mstMua','diaChiMua','hinhThucTT','congTienHang','thueSuat','tienThue','tongTT','bangChu'];
const COL_LABELS = {
  fileName:'Tên file', loaiHD:'Loại hóa đơn', soHoaDon:'Số hóa đơn', kyHieu:'Ký hiệu', ngayLap:'Ngày lập',
  tenDonViBan:'Đơn vị bán hàng', mstBan:'MST người bán', diaChiBan:'Địa chỉ người bán',
  nguoiMua:'Người mua/Đơn vị mua', mstMua:'MST người mua', diaChiMua:'Địa chỉ người mua',
  hinhThucTT:'Hình thức TT', congTienHang:'Cộng tiền hàng', thueSuat:'Thuế suất GTGT',
  tienThue:'Tiền thuế GTGT', tongTT:'Tổng tiền thanh toán', bangChu:'Số tiền bằng chữ'
};

function renderResults(){
  if(results.length===0){
    resultsBody.innerHTML = '<tr><td colspan="19" class="empty-state">Chưa có dữ liệu. Hãy nhập file và bấm "Bắt đầu nhận diện".</td></tr>';
    exportBtn.disabled = true;
    addRowBtn.disabled = true;
    resultSummary.textContent = '';
    return;
  }
  exportBtn.disabled = false;
  addRowBtn.disabled = false;
  resultSummary.textContent = `${results.length} hóa đơn đã trích xuất`;

  resultsBody.innerHTML = results.map((row, idx)=>`
    <tr data-idx="${idx}">
      <td class="narrow" data-label="STT">${idx+1}</td>
      ${COLS.map(c=>`<td contenteditable="true" data-field="${c}" data-label="${COL_LABELS[c]}">${escapeHtml(row[c]||'')}</td>`).join('')}
      <td class="narrow"><button class="del-row" data-del="${idx}" title="Xoá dòng">✕</button></td>
    </tr>
  `).join('');

  resultsBody.querySelectorAll('td[contenteditable]').forEach(td=>{
    td.addEventListener('blur', ()=>{
      const idx = Number(td.closest('tr').dataset.idx);
      const field = td.dataset.field;
      results[idx][field] = td.textContent.trim();
    });
  });
  resultsBody.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      results.splice(Number(btn.dataset.del),1);
      renderResults();
    });
  });
}

addRowBtn.addEventListener('click', ()=>{
  const blank = {id: rowSeq++, fileName:'(nhập tay)'};
  COLS.forEach(c=>{ if(!(c in blank)) blank[c]=''; });
  results.push(blank);
  renderResults();
});

/* ---------------- Excel export ---------------- */

const HEADERS = ['STT','Tên file','Loại hóa đơn','Số hóa đơn','Ký hiệu','Ngày lập','Đơn vị bán hàng','MST người bán','Địa chỉ người bán','Người mua / Đơn vị mua','MST người mua','Địa chỉ người mua','Hình thức TT','Cộng tiền hàng','Thuế suất GTGT','Tiền thuế GTGT','Tổng tiền thanh toán','Số tiền bằng chữ'];

exportBtn.addEventListener('click', ()=>{
  const data = [HEADERS, ...results.map((r,idx)=>[
    idx+1, r.fileName, r.loaiHD, r.soHoaDon, r.kyHieu, r.ngayLap, r.tenDonViBan, r.mstBan,
    r.diaChiBan, r.nguoiMua, r.mstMua, r.diaChiMua, r.hinhThucTT, r.congTienHang, r.thueSuat,
    r.tienThue, r.tongTT, r.bangChu
  ])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = HEADERS.map((h,i)=> i===0 ? {wch:5} : i===8||i===11 ? {wch:28} : {wch:18});
  ws['!freeze'] = {xSplit:0, ySplit:1};
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hoa don');
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  XLSX.writeFile(wb, `Trich_xuat_hoa_don_${stamp}.xlsx`);
});

/* ---------------- Utils ---------------- */

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
