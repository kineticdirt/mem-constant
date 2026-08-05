/**
 * tableslop design preview — local viewer (no server APIs).
 * Map source: campaigns/tropic-gooner/map/
 */
const PROFILE_KEY = 'tableslop-design-preview-v1';
const MAP_JSON = '/campaigns/tropic-gooner/map/map.json';
const MAP_IMG = '/campaigns/tropic-gooner/map/output-onlinetools-2k.png';

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 4;
const FOCUS_ZOOM = 1.75;

/** Placeholder lore until up-05 lazy region JSON */
const REGION_LORE = {
  'r08-sierra-dorado': 'Federal mountain capital — government district, universities, and the veneer of legitimacy over the island\'s vice economy.',
  'r01-paradise': 'North central bay resort strip; neon clubs and corporate hospitality share the shoreline.',
  'r11-black-sand-preserve': 'Protected east-coast preserve — ecotourism cover for restricted zones inland.',
};

let activeId = null;
let mapData = null;
let uiLabelsVisible = true;
let uiCitiesVisible = true;
const camera = { x: 0, y: 0, scale: 1 };
let fitScale = 1;
let panDrag = null;

const tooltip = document.getElementById('tooltip');

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { v: 1, visited: [], notes: {} };
    return { v: 1, visited: [], notes: {}, ...JSON.parse(raw) };
  } catch {
    return { v: 1, visited: [], notes: {} };
  }
}

function saveProfile(patch) {
  const cur = loadProfile();
  const next = { ...cur, ...patch, v: 1 };
  if (patch.notes) next.notes = { ...cur.notes, ...patch.notes };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  updatePilotStats(next);
  return next;
}

function updatePilotStats(profile) {
  const el = document.getElementById('pilotStats');
  if (!el) return;
  const n = (profile.visited || []).length;
  el.textContent = n ? `Explored ${n} region${n === 1 ? '' : 's'}` : 'No regions visited yet';
}

function applyCamera(animate) {
  const el = document.getElementById('mapCamera');
  const label = document.getElementById('zoomLabel');
  if (!el) return;
  const t = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
  el.style.transition = animate ? 'transform 0.32s ease-out' : '';
  el.style.transform = t;
  if (label) label.textContent = `${Math.round(camera.scale * 100)}%`;
}

function mapSize() {
  const img = document.getElementById('mapImg');
  if (!img) return null;
  return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
}

function fitToView(animate) {
  const vp = document.getElementById('viewport');
  const size = mapSize();
  if (!vp || !size) return;
  const pad = 20;
  const scale = Math.min((vp.clientWidth - pad * 2) / size.w, (vp.clientHeight - pad * 2) / size.h, 1);
  camera.scale = scale;
  camera.x = (vp.clientWidth - size.w * scale) / 2;
  camera.y = (vp.clientHeight - size.h * scale) / 2;
  fitScale = scale;
  applyCamera(animate);
}

function zoomAt(factor, clientX, clientY) {
  const vp = document.getElementById('viewport');
  if (!vp) return;
  const rect = vp.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  const wx = (mx - camera.x) / camera.scale;
  const wy = (my - camera.y) / camera.scale;
  camera.scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.scale * factor));
  camera.x = mx - wx * camera.scale;
  camera.y = my - wy * camera.scale;
  applyCamera(false);
}

function focusMarker(m, animate) {
  const vp = document.getElementById('viewport');
  const size = mapSize();
  if (!vp || !size || m.x_pct == null) return;
  const px = (m.x_pct / 100) * size.w;
  const py = (m.y_pct / 100) * size.h;
  camera.scale = FOCUS_ZOOM;
  camera.x = vp.clientWidth / 2 - px * camera.scale;
  camera.y = vp.clientHeight / 2 - py * camera.scale;
  applyCamera(animate);
}

function showDetail(id) {
  const m = mapData.markers.find((x) => x.id === id);
  if (!m) return;
  document.getElementById('journalBrowse').classList.add('is-hidden');
  const detail = document.getElementById('journalDetail');
  detail.classList.remove('is-hidden');
  detail.setAttribute('aria-hidden', 'false');

  document.getElementById('detailNum').textContent = m.region != null ? `R${m.region}` : 'R?';
  document.getElementById('detailTitle').textContent = m.label || m.name || m.id;
  const coord = m.x_pct != null ? `${m.x_pct.toFixed(1)}%, ${m.y_pct.toFixed(1)}%` : 'unmapped';
  document.getElementById('detailMeta').textContent = `${m.type || 'site'} · ${coord}`;
  const lane = document.getElementById('detailLane');
  lane.textContent = m.workflow_status || 'planning';
  lane.className = `lane lane--${m.workflow_status || 'planning'}`;

  const lore = REGION_LORE[m.id] || m.note || 'Lore excerpt will load from places/ or /api/region/:id (up-05). This is design-preview placeholder copy.';
  document.getElementById('detailLore').innerHTML = `<p>${lore}</p>`;

  const noteEl = document.getElementById('regionNote');
  const p = loadProfile();
  noteEl.value = (p.notes && p.notes[id]) || '';
  noteEl.oninput = () => saveProfile({ notes: { [id]: noteEl.value } });
}

function hideDetail() {
  document.getElementById('journalBrowse').classList.remove('is-hidden');
  const detail = document.getElementById('journalDetail');
  detail.classList.add('is-hidden');
  detail.setAttribute('aria-hidden', 'true');
}

function selectMarker(id, opts = {}) {
  activeId = id;
  const p = loadProfile();
  if (!p.visited.includes(id)) p.visited.push(id);
  saveProfile({ visited: p.visited, lastRegionId: id });

  document.querySelectorAll('.pin, .region-card, .legend-chip').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.id === id);
  });
  document.querySelectorAll('.map-label').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.id === id);
    el.classList.toggle('is-dim', activeId && el.dataset.id !== id);
  });

  showDetail(id);
  if (opts.focus !== false) {
    const m = mapData.markers.find((x) => x.id === id);
    if (m) focusMarker(m, true);
  }
}

function placePins(layer, markers) {
  layer.innerHTML = '';
  layer.classList.toggle('is-hidden', !uiCitiesVisible);
  markers.forEach((m) => {
    if (m.x_pct == null) return;
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = `pin pin--${m.type || 'default'}`;
    pin.dataset.id = m.id;
    pin.style.left = `${m.x_pct}%`;
    pin.style.top = `${m.y_pct}%`;
    pin.textContent = m.region != null ? String(m.region) : '';
    pin.setAttribute('aria-label', m.label || m.name);
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      selectMarker(m.id);
    });
    pin.addEventListener('mouseenter', (e) => showTooltip(m.label || m.name, e.clientX, e.clientY));
    pin.addEventListener('mousemove', (e) => showTooltip(m.label || m.name, e.clientX, e.clientY));
    pin.addEventListener('mouseleave', hideTooltip);
    layer.appendChild(pin);
  });
}

function placeLabels(layer, markers) {
  layer.innerHTML = '';
  layer.classList.toggle('is-hidden', !uiLabelsVisible);
  markers.forEach((m) => {
    if (m.show_on_map === false || m.x_pct == null) return;
    const el = document.createElement('div');
    el.className = `map-label map-label--${m.type || 'default'}`;
    el.dataset.id = m.id;
    // SoT: same x_pct/y_pct as pin (CSS translate sits name above).
    el.style.left = `${m.x_pct}%`;
    el.style.top = `${m.y_pct}%`;
    el.textContent = m.label || m.name;
    if (activeId && m.id !== activeId) el.classList.add('is-dim');
    if (m.id === activeId) el.classList.add('is-active');
    layer.appendChild(el);
  });
}

function showTooltip(text, x, y) {
  tooltip.textContent = text;
  tooltip.hidden = false;
  tooltip.classList.add('visible');
  tooltip.style.left = `${x + 12}px`;
  tooltip.style.top = `${y + 12}px`;
}
function hideTooltip() {
  tooltip.classList.remove('visible');
  tooltip.hidden = true;
}

function buildLegend(markers) {
  const grid = document.getElementById('legendGrid');
  grid.innerHTML = '';
  markers
    .slice()
    .sort((a, b) => (a.region || 0) - (b.region || 0))
    .forEach((m) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'legend-chip';
      chip.dataset.id = m.id;
      chip.textContent = m.region != null ? String(m.region) : '?';
      chip.addEventListener('click', () => selectMarker(m.id));
      grid.appendChild(chip);
    });
}

function buildList(markers) {
  const list = document.getElementById('list');
  list.innerHTML = '';
  markers.forEach((m) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'region-card';
    btn.dataset.id = m.id;
    const label = m.label || m.name;
    const lane = m.workflow_status || 'planning';
    const coord = m.x_pct != null ? `${m.x_pct.toFixed(1)}%, ${m.y_pct.toFixed(1)}%` : 'unmapped';
    btn.innerHTML = `<span class="region-num">R${m.region}</span><strong>${label}</strong><span class="meta">${m.type} · ${coord}</span><span class="lane lane--${lane}">${lane}</span>`;
    btn.addEventListener('click', () => selectMarker(m.id));
    list.appendChild(btn);
  });
}

function initCamera() {
  const vp = document.getElementById('viewport');
  if (vp.dataset.bound) return;
  vp.dataset.bound = '1';

  document.getElementById('zoomIn').onclick = () => {
    const r = vp.getBoundingClientRect();
    zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2);
  };
  document.getElementById('zoomOut').onclick = () => {
    const r = vp.getBoundingClientRect();
    zoomAt(1 / 1.25, r.left + r.width / 2, r.top + r.height / 2);
  };
  document.getElementById('zoomFit').onclick = () => fitToView(true);

  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  }, { passive: false });

  vp.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pin, .map-controls, button')) return;
    panDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, camX: camera.x, camY: camera.y };
    vp.classList.add('is-dragging');
    vp.setPointerCapture(e.pointerId);
  });
  vp.addEventListener('pointermove', (e) => {
    if (!panDrag || panDrag.id !== e.pointerId) return;
    camera.x = panDrag.camX + (e.clientX - panDrag.x);
    camera.y = panDrag.camY + (e.clientY - panDrag.y);
    applyCamera(false);
  });
  vp.addEventListener('pointerup', (e) => {
    if (!panDrag || panDrag.id !== e.pointerId) return;
    vp.classList.remove('is-dragging');
    panDrag = null;
  });
}

function initToggles() {
  document.getElementById('labelToggle').onclick = () => {
    uiLabelsVisible = !uiLabelsVisible;
    document.getElementById('labelToggle').textContent = uiLabelsVisible ? 'Labels ON' : 'Labels OFF';
    placeLabels(document.getElementById('labelLayer'), mapData.markers);
  };
  document.getElementById('citiesToggle').onclick = () => {
    uiCitiesVisible = !uiCitiesVisible;
    document.getElementById('citiesToggle').textContent = uiCitiesVisible ? 'Cities ON' : 'Cities OFF';
    placePins(document.getElementById('pinLayer'), mapData.markers);
  };
}

async function load() {
  updatePilotStats(loadProfile());
  const raw = await fetch(MAP_JSON).then((r) => {
    if (!r.ok) throw new Error(`map.json ${r.status}`);
    return r.json();
  });
  mapData = { ...raw, base_image_url: MAP_IMG, label_layer: 'ui' };

  document.getElementById('mapTitle').textContent = mapData.title || 'Isla Primavera';
  const stage = document.getElementById('mapStage');
  const img = document.createElement('img');
  img.id = 'mapImg';
  img.src = MAP_IMG;
  img.alt = mapData.title;
  img.draggable = false;
  img.onload = () => {
    const pinLayer = document.createElement('div');
    pinLayer.id = 'pinLayer';
    pinLayer.className = 'pin-layer';
    pinLayer.style.cssText = 'position:absolute;inset:0';
    const labelLayer = document.createElement('div');
    labelLayer.id = 'labelLayer';
    labelLayer.className = 'map-label-layer';
    stage.appendChild(img);
    stage.appendChild(pinLayer);
    stage.appendChild(labelLayer);
    placePins(pinLayer, mapData.markers);
    placeLabels(labelLayer, mapData.markers);
    initCamera();
    fitToView(false);
  };
  stage.appendChild(img);

  buildLegend(mapData.markers);
  buildList(mapData.markers);
  initToggles();

  document.getElementById('detailBack').onclick = hideDetail;
  document.getElementById('focusMapBtn').onclick = () => {
    if (activeId) {
      const m = mapData.markers.find((x) => x.id === activeId);
      if (m) focusMarker(m, true);
    }
  };

  const p = loadProfile();
  if (p.lastRegionId && mapData.markers.some((m) => m.id === p.lastRegionId)) {
    selectMarker(p.lastRegionId, { focus: false });
  }
}

load().catch((err) => {
  document.getElementById('mapStage').innerHTML = `<p style="color:#ff71ce;padding:24px">Load failed: ${err.message}. Run from serve-design-preview.sh so map paths resolve.</p>`;
});
