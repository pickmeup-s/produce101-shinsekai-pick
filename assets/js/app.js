const CSV_PATH = "data/master.csv";
const STORAGE_KEY = "pyramid_maker_state_v11";

const gridEl = document.getElementById("grid");
const pyramidEl = document.getElementById("pyramid");
const benchEl = document.getElementById("bench");
const benchCountEl = document.getElementById("benchCount");
const pyramidPanelEl = document.getElementById("pyramidPanel");
const benchPanelEl = document.getElementById("benchPanel");
const rankBarEl = document.getElementById("rankBar");

const sortKeyEl = document.getElementById("sortKey");
const sortDirEl = document.getElementById("sortDir");

const clearBtn = document.getElementById("clear");
const frameToggleEl = document.getElementById("frameToggle");
const survivorOnlyEl = document.getElementById("survivorOnly");
const benchToggleBtn = document.getElementById("toggleBench");
const pyramidLockBtn = document.getElementById("togglePyramidLock");
const rankStatsEl = document.getElementById("rankStats");
const rankDateEl = document.getElementById("rankDate");
const rankDatePadEl = document.getElementById("rankDatePad");

const openDisplayModalBtn = document.getElementById("openDisplayModal");
const displayModalEl = document.getElementById("displayModal");
const closeDisplayModalBtn = document.getElementById("closeDisplayModal");
const modalTogglesEl = document.getElementById("modalToggles");
const displayModalClearBtn = document.getElementById("displayModalClear");
const pickedSummaryEl = document.getElementById("pickedSummary");

const ROWS = [1,2,4,5];
const TOTAL = ROWS.reduce((a,b)=>a+b,0);
const BENCH_ADD_ID = "__BENCH_ADD__";

const EXCLUDE_KEYS = new Set([
  "id","ID","Id",
  "img","image","Image","画像","photo","Photo",
  "__idx"
]);

let RAW_CLASS_COL  = "D:シグナルソングA-F ";
let RAW_BIRTH_COL = "S:生年月日 (yyyy.mm.dd)";
let RAW_HEIGHT_COL = "S:身長(cm)";
let RAW_SURVIVOR_COL = "生存者";
let RAW_DISPLAY_NAME_COL = "表示名";

const CLASS_COLOR = {
  "A":"#fd4d87",
  "B":"#fd8b11",
  "C":"#28ccc6",
  "D":"#1e3498",
  "F":"#747474"
};

const state = {
  header: [],
  allPeople: [],
  people: [],
  byId: new Map(),

  slots: Array(TOTAL).fill(null),
  bench: [],

  activeSlotIndex: null,
  activeBenchIndex: null,

  displayKeys: [],
  show: {},

  sortKeys: [],
  lastTappedId: null,

  benchCollapsed: false,
  classFrameOn: false,
  survivorOnly: false,

  pyramidLockFull: true,
  _savedSortKey: null,

  forceBenchAdd: false
};

let cardElsById = new Map();

function showLoadError(message){
  const msg = escapeHtml(message || "データの読み込みに失敗しました");
  gridEl.innerHTML = `<p class="loadError">${msg}</p>`;
  pyramidEl.innerHTML = "";
  benchEl.innerHTML = "";
  rankStatsEl.textContent = "平均年齢：--　平均身長：--";
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function stripPrefixLabel(key){
  const s = String(key ?? "").trim();
  return s.replace(/^[DS]:\s*/i, "");
}

function splitCsvLine(line){
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i=0;i<line.length;i++){
    const c = line[i];
    if (c === '"'){
      if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ){
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCsvWithHeader(text){
  const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(l => l.trim() !== "");
  if (!lines.length) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i=1;i<lines.length;i++){
    const cols = splitCsvLine(lines[i]);
    const obj = {};
    for (let j=0;j<header.length;j++){
      obj[header[j]] = (cols[j] ?? "").trim();
    }
    rows.push(obj);
  }
  return { header, rows };
}

function pickField(obj, keys){
  for (const k of keys){
    if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
  }
  return "";
}

function normalizePeople(rows){
  return rows.map((r, idx) => {
    const id = pickField(r, ["id","ID","Id"]) || String(idx+1);
    const img  = pickField(r, ["img","image","Image","画像","photo","Photo"]);
    return { id, img, raw: r, __idx: idx };
  });
}

function isInSlots(id){ return state.slots.includes(id); }
function isInBench(id){ return state.bench.includes(id); }
function isSelected(id){ return isInSlots(id) || isInBench(id); }

function removeIdEverywhere(id){
  const si = state.slots.indexOf(id);
  if (si >= 0) state.slots[si] = null;
  const bi = state.bench.indexOf(id);
  if (bi >= 0) state.bench.splice(bi, 1);
}

function firstEmptySlot(){ return state.slots.findIndex(x => !x); }

function swapSlots(a, b){
  const tmp = state.slots[a];
  state.slots[a] = state.slots[b];
  state.slots[b] = tmp;
}

function swapBench(a, b){
  const tmp = state.bench[a];
  state.bench[a] = state.bench[b];
  state.bench[b] = tmp;
}

function swapSlotWithBench(slotIndex, benchIndex){
  const slotId = state.slots[slotIndex] || null;
  const benchId = state.bench[benchIndex] || null;
  if (!benchId) return;

  state.slots[slotIndex] = benchId;

  if (slotId){
    state.bench[benchIndex] = slotId;
  } else {
    state.bench.splice(benchIndex, 1);
  }
}

function normalizeKey(s){
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[（）]/g, (m)=> m==="（" ? "(" : ")")
    .replace(/[：]/g, ":");
}

function isDKey(h){
  const n = normalizeKey(h);
  return n.startsWith("D:");
}
function isSKey(h){
  const n = normalizeKey(h);
  return n.startsWith("S:");
}

function isDNameKey(h){
  const n = normalizeKey(h);
  return isDKey(h) && n.includes("名前");
}

function resolveHeaderKey(header, preferredExact, fallbackMatchers = []){
  const exact = header.find(h => String(h).trim() === preferredExact);
  if (exact) return exact;

  const prefN = normalizeKey(preferredExact);
  const norm = header.find(h => normalizeKey(h) === prefN);
  if (norm) return norm;

  for (const fn of fallbackMatchers){
    const hit = header.find(h => fn(String(h)));
    if (hit) return hit;
  }
  return preferredExact;
}

function getClassColor(person){
  if (!person) return "";
  const cls = (person.raw?.[RAW_CLASS_COL] || "").trim();
  return CLASS_COLOR[cls] || "";
}

function getCssNumber(varName){
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName);
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function formatTodayYMD(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}/${m}/${da}`;
}

function setRankDateVisible(visible){
  rankDateEl.style.display = visible ? "" : "none";
  rankDatePadEl.style.display = visible ? "" : "none";
}

function applyPyramidScrollSizing(){
  if (state.pyramidLockFull){
    pyramidPanelEl.style.maxHeight = "";
    pyramidPanelEl.style.overflow = "hidden";
    setRankDateVisible(true);
    return;
  }

  setRankDateVisible(false);

  const slotSize = getCssNumber("--slotSize");
  const barH = rankBarEl ? rankBarEl.offsetHeight : 44;

  const infoH = 44;
  const extra = 14;
  const minH = Math.round(barH + 6 + slotSize + infoH + extra);

  pyramidPanelEl.style.maxHeight = `${minH}px`;
  pyramidPanelEl.style.overflow = "auto";
}

function updateSlotSize(){
  const inner = Math.max(0, pyramidPanelEl.clientWidth);

  const root = getComputedStyle(document.documentElement);
  const gap = parseFloat(root.getPropertyValue("--gap")) || 6;
  const slotMax = parseFloat(root.getPropertyValue("--slotMax")) || 96;

  const size = Math.min(slotMax, Math.floor((inner - (16) - (4 * gap)) / 5));
  document.documentElement.style.setProperty("--slotSize", Math.max(64, size) + "px");
  document.documentElement.style.setProperty("--benchSize", Math.max(64, size) + "px");
}

function selectedToggleCount(showObj = state.show){
  let c = 0;
  for (const k of state.displayKeys){
    if (showObj[k]) c++;
  }
  return c;
}

function buildInfoLines(person, useDisplayNameForDName = true){
  if (!person) return [];
  const r = person.raw || {};
  const lines = [];
  for (const key of state.displayKeys){
    if (!state.show[key]) continue;

    const useDisplayName = useDisplayNameForDName
      && isDNameKey(key)
      && RAW_DISPLAY_NAME_COL
      && String(r[RAW_DISPLAY_NAME_COL] ?? "").trim() !== "";

    const sourceKey = useDisplayName ? RAW_DISPLAY_NAME_COL : key;
    const v = String(r[sourceKey] ?? "").trim();
    if (!v) continue;

    lines.push(v);
    if (lines.length >= 3) break;
  }
  return lines;
}

function toSortableValue(v){
  const s = String(v ?? "").trim();
  const n = Number(s);
  if (s !== "" && Number.isFinite(n)) return { type:"num", v:n };
  return { type:"str", v:s };
}

function getSortedPeople(){
  const arr = [...state.people];
  const key = sortKeyEl.value;
  const dir = sortDirEl.value;

  arr.sort((a,b) => {
    const av = toSortableValue(a.raw[key]);
    const bv = toSortableValue(b.raw[key]);

    let cmp = 0;
    if (av.type === "num" && bv.type === "num") cmp = av.v - bv.v;
    else cmp = String(av.v).localeCompare(String(bv.v), "ja", { numeric:true, sensitivity:"base" });

    return dir === "desc" ? -cmp : cmp;
  });

  return arr;
}

function renderPyramid(){
  let cursor = 0;

  pyramidEl.innerHTML = ROWS.map(n => {
    const items = [];
    for (let i=0;i<n;i++){
      const idx = cursor++;
      const id = state.slots[idx];
      const p = id ? state.byId.get(id) : null;
      const imgSrc = p?.img ? escapeHtml(p.img) : "";
      const lines = buildInfoLines(p);

      const frameColor = (state.classFrameOn ? getClassColor(p) : "");
      const style = frameColor ? `style="border-color:${escapeHtml(frameColor)}; border-width:2px"` : "";

      const slotCls = [
        "slot",
        (state.activeSlotIndex === idx) ? "activeRing" : "",
        id ? "" : "empty",
      ].filter(Boolean).join(" ");

      items.push(`
        <div class="slotWrap">
          <div class="${slotCls}" ${style} data-slot="${idx}" role="button" tabindex="0">
            ${id && imgSrc ? `<img src="${imgSrc}" alt="" loading="lazy" />` : ``}
          </div>
          ${lines.length ? `
            <div class="slotInfo">
              ${lines.map(t => `<div class="line">${escapeHtml(t)}</div>`).join("")}
            </div>
          ` : ``}
        </div>
      `);
    }
    return `<div class="row">${items.join("")}</div>`;
  }).join("");

  updateRankStats();
  applyPyramidScrollSizing();
}

function getBenchViewIds(){
  const ids = [...state.bench];
  ids.push(BENCH_ADD_ID);
  return ids;
}

function renderBench(){
  benchPanelEl.classList.toggle("benchCollapsed", state.benchCollapsed);
  benchToggleBtn.textContent = state.benchCollapsed ? "▴" : "▾";
  benchCountEl.textContent = state.bench.length ? `（${state.bench.length}）` : "";

  if (state.benchCollapsed){
    benchEl.innerHTML = "";
    return;
  }

  const viewIds = getBenchViewIds();

  benchEl.innerHTML = viewIds.map((id, i) => {
    if (id === BENCH_ADD_ID){
      const cls = [
        "benchItem",
        "benchAdd",
        (state.forceBenchAdd) ? "activeRing" : ""
      ].filter(Boolean).join(" ");

      return `
        <div class="benchItemWrap">
          <div class="${cls}" data-index="${i}" data-id="${escapeHtml(id)}" role="button" tabindex="0" aria-label="ベンチに追加">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
        </div>
      `;
    }

    const p = state.byId.get(id);
    const imgSrc = p?.img ? escapeHtml(p.img) : "";
    const lines = buildInfoLines(p);

    const frameColor = (state.classFrameOn ? getClassColor(p) : "");
    const style = frameColor ? `style="border-color:${escapeHtml(frameColor)}; border-width:2px"` : "";

    const realIndex = state.bench.indexOf(id);
    const cls = [
      "benchItem",
      (state.activeBenchIndex === realIndex) ? "activeRing" : ""
    ].filter(Boolean).join(" ");

    return `
      <div class="benchItemWrap">
        <div class="${cls}" ${style} data-index="${realIndex}" data-id="${escapeHtml(id)}" role="button" tabindex="0">
          ${imgSrc ? `<img src="${imgSrc}" alt="" loading="lazy" />` : ``}
        </div>
        ${lines.length ? `
          <div class="benchInfo">
            ${lines.slice(0,3).map(t => `<div class="line">${escapeHtml(t)}</div>`).join("")}
          </div>
        ` : ``}
      </div>
    `;
  }).join("");

  updateRankStats();
}

function getCardTitleAndSub(person){
  const lines = buildInfoLines(person, false);

  const fallbackNameKey = state.header.includes("Name") ? "Name"
    : state.header.includes("名前") ? "名前"
    : null;

  const title = lines[0] || (fallbackNameKey ? (person.raw[fallbackNameKey] || "") : "");
  const sub = lines.slice(1,3).join(" / ");

  return { title, sub };
}

function renderGrid(){
  const arr = getSortedPeople();

  gridEl.innerHTML = arr.map((p, i) => {
    const imgSrc = p.img ? escapeHtml(p.img) : "";
    const { title, sub } = getCardTitleAndSub(p);
    const idx = i + 1;

    const frameColor = (state.classFrameOn ? getClassColor(p) : "");
    const borderStyle = frameColor ? `style="border-color:${escapeHtml(frameColor)}; border-width:2px"` : "";

    return `
      <div class="card" ${borderStyle} data-id="${escapeHtml(p.id)}" role="button" tabindex="0">
        <span class="idx">${idx}</span>
        ${
          imgSrc
            ? `<img class="thumb" src="${imgSrc}" alt="${escapeHtml(title)}" loading="lazy"
                 onerror="this.style.display='none'; this.insertAdjacentHTML('afterend','<div style=&quot;aspect-ratio:1/1;background:#f4f9ff;display:block&quot;></div>')" />`
            : `<div style="aspect-ratio:1/1;background:#f4f9ff;display:block"></div>`
        }
        <div class="meta">
          <p class="name">${escapeHtml(title)}</p>
          <p class="sub">${escapeHtml(sub)}</p>
        </div>
      </div>
    `;
  }).join("");

  cardElsById = new Map();
  gridEl.querySelectorAll(".card").forEach(el => {
    cardElsById.set(el.dataset.id, el);
  });

  applyGridClassFrames();
  updateGridSelectionRings();
}

function applyGridClassFrames(){
  cardElsById.forEach((el, id) => {
    if (!state.classFrameOn){
      el.style.borderColor = "";
      el.style.borderWidth = "";
      return;
    }
    const p = state.byId.get(id);
    const c = getClassColor(p);
    if (c){
      el.style.borderColor = c;
      el.style.borderWidth = "2px";
    } else {
      el.style.borderColor = "";
      el.style.borderWidth = "";
    }
  });
}

function updateGridSelectionRings(){
  let activeId = null;
  if (state.activeSlotIndex != null){
    activeId = state.slots[state.activeSlotIndex] || null;
  } else if (state.activeBenchIndex != null){
    activeId = state.bench[state.activeBenchIndex] || null;
  }

  cardElsById.forEach((el, id) => {
    const selected = isSelected(id);
    const active = (activeId === id);

    el.classList.toggle("selected", selected);
    el.classList.toggle("activeRing", active);
  });
}

function parseBirthDate(v){
  const s = String(v ?? "").trim();
  if (!s) return null;

  const m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;

  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function calcAgeFromBirth(birth){
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function parseHeightCm(v){
  const s0 = String(v ?? "").trim();
  if (!s0) return null;
  const s = s0.replace(",", ".");
  const m = s.match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function updateRankStats(){
  const ids = state.slots.filter(Boolean);

  let ageSum = 0, ageCnt = 0;
  let hSum = 0, hCnt = 0;

  for (const id of ids){
    const p = state.byId.get(id);
    if (!p) continue;

    const birth = parseBirthDate(p.raw?.[RAW_BIRTH_COL]);
    if (birth){
      const age = calcAgeFromBirth(birth);
      if (Number.isFinite(age)){
        ageSum += age;
        ageCnt++;
      }
    }

    const h = parseHeightCm(p.raw?.[RAW_HEIGHT_COL]);
    if (h != null){
      hSum += h;
      hCnt++;
    }
  }

  const ageAvg = ageCnt ? Math.round((ageSum / ageCnt) * 10) / 10 : null;
  const hAvg   = hCnt ? Math.round((hSum / hCnt) * 10) / 10 : null;

  const ageText = (ageAvg == null) ? "--" : `${ageAvg}歳`;
  const hText   = (hAvg   == null) ? "--" : `${hAvg}cm`;

  rankStatsEl.textContent = `平均年齢：${ageText}　平均身長：${hText}`;
}

function onSlotClick(slotIndex){
  const slotId = state.slots[slotIndex] || null;

  if (state.activeBenchIndex != null){
    swapSlotWithBench(slotIndex, state.activeBenchIndex);

    state.activeBenchIndex = null;
    state.activeSlotIndex = null;
    state.lastTappedId = null;
    state.forceBenchAdd = false;

    renderPyramid();
    renderBench();
    updateGridSelectionRings();
    persistSoon();
    return;
  }

  if (state.activeSlotIndex === slotIndex){
    if (slotId) state.slots[slotIndex] = null;

    state.activeSlotIndex = null;
    state.lastTappedId = null;
    state.forceBenchAdd = false;

    renderPyramid();
    updateGridSelectionRings();
    persistSoon();
    return;
  }

  if (state.activeSlotIndex != null && state.activeSlotIndex !== slotIndex){
    swapSlots(state.activeSlotIndex, slotIndex);

    state.activeSlotIndex = null;
    state.lastTappedId = null;
    state.forceBenchAdd = false;

    renderPyramid();
    updateGridSelectionRings();
    persistSoon();
    return;
  }

  state.activeSlotIndex = slotIndex;
  state.activeBenchIndex = null;
  state.lastTappedId = slotId;
  state.forceBenchAdd = false;

  renderPyramid();
  renderBench();
  updateGridSelectionRings();
}

function onPickId(id, fromBench=false, benchIndex=null){
  if (id === BENCH_ADD_ID){
    if (state.activeSlotIndex != null){
      const slotId = state.slots[state.activeSlotIndex] || null;
      if (slotId){
        state.slots[state.activeSlotIndex] = null;
        state.bench.push(slotId);

        state.activeSlotIndex = null;
        state.activeBenchIndex = null;
        state.lastTappedId = null;
        state.forceBenchAdd = false;

        renderPyramid();
        renderBench();
        updateGridSelectionRings();
        persistSoon();
        return;
      }
    }

    state.forceBenchAdd = !state.forceBenchAdd;
    state.activeBenchIndex = null;
    state.activeSlotIndex = null;
    state.lastTappedId = null;
    renderBench();
    updateGridSelectionRings();
    persistSoon();
    return;
  }

  if (state.lastTappedId === id && isSelected(id)){
    removeIdEverywhere(id);

    state.lastTappedId = null;
    state.activeBenchIndex = null;
    state.activeSlotIndex = null;
    state.forceBenchAdd = false;

    renderPyramid();
    renderBench();
    updateGridSelectionRings();
    persistSoon();
    return;
  }

  if (state.activeSlotIndex != null){
    if (fromBench && benchIndex != null){
      swapSlotWithBench(state.activeSlotIndex, benchIndex);
    } else {
      const bi = state.bench.indexOf(id);
      if (bi >= 0){
        swapSlotWithBench(state.activeSlotIndex, bi);
      } else {
        const occupant = state.slots[state.activeSlotIndex] || null;
        state.slots[state.activeSlotIndex] = id;
        if (occupant) state.bench.push(occupant);
      }
    }

    state.activeSlotIndex = null;
    state.activeBenchIndex = null;
    state.lastTappedId = null;
    state.forceBenchAdd = false;

    renderPyramid();
    renderBench();
    updateGridSelectionRings();
    persistSoon();
    return;
  }

  state.lastTappedId = id;

  if (!isSelected(id)){
    if (state.forceBenchAdd){
      state.bench.push(id);
      state.lastTappedId = null;
      state.activeBenchIndex = null;
      state.forceBenchAdd = false;

      renderPyramid();
      renderBench();
      updateGridSelectionRings();
      persistSoon();
      return;
    }

    const empty = firstEmptySlot();
    if (empty >= 0) state.slots[empty] = id;
    else state.bench.push(id);

    state.lastTappedId = null;
    state.activeBenchIndex = null;

    renderPyramid();
    renderBench();
    updateGridSelectionRings();
    persistSoon();
    return;
  }

  if (fromBench && benchIndex != null){
    if (state.activeBenchIndex != null && state.activeBenchIndex !== benchIndex){
      swapBench(state.activeBenchIndex, benchIndex);

      state.activeBenchIndex = null;
      state.lastTappedId = null;

      renderBench();
      updateGridSelectionRings();
      persistSoon();
      return;
    }

    state.activeBenchIndex = benchIndex;
    state.activeSlotIndex = null;
    state.forceBenchAdd = false;

    renderBench();
    renderPyramid();
    updateGridSelectionRings();
    return;
  }

  const bi = state.bench.indexOf(id);
  state.activeBenchIndex = (bi >= 0) ? bi : null;
  state.activeSlotIndex = null;
  state.forceBenchAdd = false;

  renderBench();
  renderPyramid();
  updateGridSelectionRings();
}

function clearActiveSelection(){
  if (state.activeSlotIndex == null && state.activeBenchIndex == null && state.lastTappedId == null && !state.forceBenchAdd) return;

  state.activeSlotIndex = null;
  state.activeBenchIndex = null;
  state.lastTappedId = null;
  state.forceBenchAdd = false;

  renderPyramid();
  renderBench();
  updateGridSelectionRings();
}

let persistTimer = null;
function persistSoon(){
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 120);
}

function persistNow(){
  const payload = {
    slots: state.slots,
    bench: state.bench,
    show: state.show,
    sortKey: sortKeyEl.value,
    sortDir: sortDirEl.value,
    benchCollapsed: state.benchCollapsed,
    classFrameOn: state.classFrameOn,
    pyramidLockFull: state.pyramidLockFull,
    survivorOnly: state.survivorOnly
  };
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }catch(_){}
}

function restoreFromStorage(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);

    if (Array.isArray(p.slots)){
      state.slots = p.slots.slice(0, TOTAL).concat(Array(Math.max(0, TOTAL - p.slots.length)).fill(null)).slice(0, TOTAL);
    }
    if (Array.isArray(p.bench)) state.bench = p.bench.slice();

    if (p && typeof p.show === "object" && p.show){
      state.show = { ...p.show };
    }

    if (typeof p.benchCollapsed === "boolean") state.benchCollapsed = p.benchCollapsed;
    if (typeof p.classFrameOn === "boolean") state.classFrameOn = p.classFrameOn;
    if (typeof p.pyramidLockFull === "boolean") state.pyramidLockFull = p.pyramidLockFull;
    if (typeof p.survivorOnly === "boolean") state.survivorOnly = p.survivorOnly;

    if (typeof p.sortDir === "string") sortDirEl.value = p.sortDir;
    state._savedSortKey = (typeof p.sortKey === "string") ? p.sortKey : null;

  }catch(_){}
}

function updatePickedSummary(){
  const picked = [];
  for (const k of state.displayKeys){
    if (state.show[k]) picked.push(k);
  }
  pickedSummaryEl.textContent = picked.length ? picked.map(stripPrefixLabel).join(" / ") : "未選択";
}

function renderModalToggles(){
  const picked = selectedToggleCount(state.show);
  const max = 3;
  const disableNew = picked >= max;

  modalTogglesEl.innerHTML = state.displayKeys.map(key => {
    const checked = state.show[key] ? "checked" : "";
    const disabled = (!state.show[key] && disableNew) ? "disabled" : "";
    return `
      <label class="chipToggle">
        <input type="checkbox" data-key="${escapeHtml(key)}" ${checked} ${disabled}>
        ${escapeHtml(stripPrefixLabel(key))}
      </label>
    `;
  }).join("");
}

function openDisplayModal(){
  renderModalToggles();
  displayModalEl.classList.add("isOpen");
  displayModalEl.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}

function closeDisplayModal(){
  displayModalEl.classList.remove("isOpen");
  displayModalEl.setAttribute("aria-hidden","true");
  document.body.style.overflow = "";
}

modalTogglesEl.addEventListener("change", (e) => {
  const cb = e.target.closest("input[type=checkbox]");
  if (!cb) return;
  const key = cb.dataset.key;

  const currentlyOn = selectedToggleCount(state.show);
  if (!state.show[key] && cb.checked && currentlyOn >= 3){
    cb.checked = false;
    return;
  }

  state.show[key] = cb.checked;

  renderModalToggles();     // 3つ制限のdisabled更新
  updatePickedSummary();    // ボタン表示も即更新
  renderPyramid();          // 即反映
  renderBench();            // 即反映
  renderGrid();             // 即反映
  persistSoon();
});

openDisplayModalBtn.addEventListener("click", openDisplayModal);
closeDisplayModalBtn.addEventListener("click", closeDisplayModal);

displayModalClearBtn.addEventListener("click", () => {
  for (const k of state.displayKeys) state.show[k] = false;

  renderModalToggles();
  updatePickedSummary();
  renderPyramid();
  renderBench();
  renderGrid();
  persistSoon();
});

displayModalEl.addEventListener("click", (e) => {
  if (e.target === displayModalEl) closeDisplayModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && displayModalEl.classList.contains("isOpen")) closeDisplayModal();
});

frameToggleEl.addEventListener("change", () => {
  state.classFrameOn = frameToggleEl.checked;
  renderPyramid();
  renderBench();
  renderGrid();
  persistSoon();
});

survivorOnlyEl.addEventListener("change", () => {
  state.survivorOnly = survivorOnlyEl.checked;
  applySurvivorFilterAndRebuild();
  persistSoon();
});

sortKeyEl.addEventListener("change", () => {
  renderGrid();
  persistSoon();
});
sortDirEl.addEventListener("change", () => {
  renderGrid();
  persistSoon();
});

clearBtn.addEventListener("click", () => {
  const ok = confirm("選択を全て解除しますか？");
  if (!ok) return;

  state.slots = Array(TOTAL).fill(null);
  state.bench = [];
  state.activeSlotIndex = null;
  state.activeBenchIndex = null;
  state.lastTappedId = null;
  state.forceBenchAdd = false;

  renderPyramid();
  renderBench();
  updateGridSelectionRings();
  persistSoon();
});

benchToggleBtn.addEventListener("click", () => {
  state.benchCollapsed = !state.benchCollapsed;
  renderBench();
  persistSoon();
});

pyramidLockBtn.addEventListener("click", () => {
  state.pyramidLockFull = !state.pyramidLockFull;
  pyramidLockBtn.textContent = state.pyramidLockFull ? "▾" : "▴";
  applyPyramidScrollSizing();
  persistSoon();
});

pyramidEl.addEventListener("click", (e) => {
  const slot = e.target.closest(".slot");
  if (!slot) return;
  onSlotClick(Number(slot.dataset.slot));
});

benchEl.addEventListener("click", (e) => {
  const item = e.target.closest(".benchItem");
  if (!item) return;
  const id = item.dataset.id;
  if (id === BENCH_ADD_ID){
    onPickId(BENCH_ADD_ID, true, null);
    return;
  }
  onPickId(id, true, Number(item.dataset.index));
});

gridEl.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  onPickId(card.dataset.id, false, null);
});

document.addEventListener("pointerdown", (e) => {
  if (displayModalEl.classList.contains("isOpen")) return;

  if (e.target.closest(
    ".slot,.benchItem,.card," +
    "button,select,input,label," +
    ".optionsPanel,.belowBenchControls," +
    ".rankBar,.bar," +
    ".modal,.modalOverlay"
  )) return;

  clearActiveSelection();
}, { passive: true });

window.addEventListener("resize", () => {
  updateSlotSize();
  renderPyramid();
  renderBench();
});

function normalizeSurvivorValue(v){
  const s = String(v ?? "").trim();
  if (!s) return false;
  if (s === "〇" || s === "○") return true;
  if (/^(yes|y|true|1)$/i.test(s)) return true;
  return false;
}

function applySurvivorFilterAndRebuild(){
  const nextPeople = state.survivorOnly
    ? state.allPeople.filter(p => normalizeSurvivorValue(p.raw?.[RAW_SURVIVOR_COL]))
    : [...state.allPeople];

  state.people = nextPeople;
  state.byId = new Map(state.people.map(p => [p.id, p]));

  state.slots = state.slots.map(id => (id && state.byId.has(id)) ? id : null);
  state.bench = state.bench.filter(id => state.byId.has(id));

  state.activeSlotIndex = null;
  state.activeBenchIndex = null;
  state.lastTappedId = null;
  state.forceBenchAdd = false;

  renderPyramid();
  renderBench();
  renderGrid();
  updatePickedSummary();
}

async function loadData(){
  try {
    restoreFromStorage();
    rankDateEl.textContent = formatTodayYMD();

    const res = await fetch(CSV_PATH, { cache: "no-store" });
    if (!res.ok){
      throw new Error(`CSV fetch failed: ${res.status}`);
    }

    const text = await res.text();
    const { header, rows } = parseCsvWithHeader(text);

    state.header = header;

    RAW_CLASS_COL = resolveHeaderKey(header, "D:シグナルソングA-F ", [
      (h)=> normalizeKey(h).includes(normalizeKey("D:シグナルソングA-F ")),
      (h)=> normalizeKey(h).includes("シグナルソングA-F"),
    ]);

    RAW_BIRTH_COL = resolveHeaderKey(header, "S:生年月日 (yyyy.mm.dd)");

    RAW_HEIGHT_COL = resolveHeaderKey(header, "S:身長(cm)", [
      (h)=> normalizeKey(h).startsWith(normalizeKey("S:身長")),
      (h)=> normalizeKey(h).includes("身長"),
      (h)=> normalizeKey(h).includes("height"),
    ]);

    RAW_SURVIVOR_COL = resolveHeaderKey(header, "生存者", [
      (h)=> normalizeKey(h).includes("生存者"),
      (h)=> normalizeKey(h).includes("survivor"),
    ]);

    RAW_DISPLAY_NAME_COL = resolveHeaderKey(header, "表示名", [
      (h)=> normalizeKey(h).includes("表示名"),
      (h)=> normalizeKey(h).includes("displayname"),
      (h)=> normalizeKey(h).includes("display_name"),
    ]);

    state.displayKeys = header
      .filter(h => h && !EXCLUDE_KEYS.has(h))
      .filter(h => isDKey(h));

    const nextShow = {};
    for (const k of state.displayKeys){
      nextShow[k] = Boolean(state.show?.[k]);
    }
    state.show = nextShow;

  // 並び替え：S系＋名前系だけ / 生存者は除外
    const sortKeys = header
      .filter(h => h && !EXCLUDE_KEYS.has(h))
      .filter(h => isSKey(h) || h === "Name" || h === "名前")
      .filter(h => normalizeKey(h) !== normalizeKey(RAW_SURVIVOR_COL));

    state.sortKeys = sortKeys;

    sortKeyEl.innerHTML = state.sortKeys.map(k =>
      `<option value="${escapeHtml(k)}">${escapeHtml(stripPrefixLabel(k))}</option>`
    ).join("");

    if (state.sortKeys.includes("Name")) sortKeyEl.value = "Name";
    else if (state.sortKeys.includes("名前")) sortKeyEl.value = "名前";
    else sortKeyEl.value = state.sortKeys[0] || "";

    if (state._savedSortKey && state.sortKeys.includes(state._savedSortKey)){
      sortKeyEl.value = state._savedSortKey;
    }
    state._savedSortKey = null;

    state.allPeople = normalizePeople(rows);

    frameToggleEl.checked = state.classFrameOn;
    survivorOnlyEl.checked = state.survivorOnly;
    pyramidLockBtn.textContent = state.pyramidLockFull ? "▾" : "▴";

    applySurvivorFilterAndRebuild();

    updateSlotSize();
    applyPyramidScrollSizing();
    persistSoon();
  } catch (err){
    console.error("Failed to load data", err);
    showLoadError("データが読み込めません。HTTPサーバー経由で開いてください。 (data/master.csv)");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const linkToggle = document.getElementById("linkToggle");
  const linkMenu = document.getElementById("linkMenu");

  if (!linkToggle || !linkMenu) return;

  const syncExpanded = () => {
    const isOpen = !linkMenu.classList.contains("hidden");
    linkToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  linkToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    linkMenu.classList.toggle("hidden");
    syncExpanded();
  });

  document.addEventListener("click", (e) => {
    if (!linkMenu.contains(e.target) && !linkToggle.contains(e.target)) {
      linkMenu.classList.add("hidden");
      syncExpanded();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      linkMenu.classList.add("hidden");
      syncExpanded();
    }
  });

  syncExpanded();
});


loadData();
