/* Primavera Radio — tuner logic. No frameworks, no CDN. */
'use strict';

const TYPE_LABEL = { news: 'NEWS', weather: 'WX', blotter: 'BLOTTER', talk: 'TALK', port: 'PORT' };
const TICK_MS = 6000;

const el = {
  dial: document.getElementById('dial'),
  freq: document.getElementById('freq'),
  call: document.getElementById('call'),
  cityline: document.getElementById('cityline'),
  theme: document.getElementById('theme'),
  host: document.getElementById('host'),
  playBtn: document.getElementById('playBtn'),
  vol: document.getElementById('vol'),
  status: document.getElementById('status'),
  sheetDate: document.getElementById('sheetDate'),
  ticker: document.getElementById('ticker'),
  sheetList: document.getElementById('sheetList'),
  player: document.getElementById('player'),
};

const state = {
  stations: [],
  bulletins: {},
  date: null,
  selected: null,
  playing: false,
  tickerIdx: 0,
  tickerTimer: null,
  audioCtx: null,
  staticNodes: null,
  sfx: null,
};

async function ensureSfx() {
  if (state.sfx) return state.sfx;
  try {
    const m = await import('/sfx/sfx-bank.js');
    state.sfx = m.TableslopSfx;
    await state.sfx.load();
    /* radio FX follow phone mute key if set; default off until gesture */
    if (typeof state.sfx.isEnabled === 'function' && !state.sfx.isEnabled()) {
      /* leave muted; first dial click can enable softly via force */
    }
  } catch {
    state.sfx = null;
  }
  return state.sfx;
}

function sfx(id, opts) {
  ensureSfx().then((bank) => {
    if (!bank) return;
    bank.play(id, opts || { force: true });
  }).catch(() => {});
}

function setStatus(text, mode) {
  el.status.textContent = text;
  el.status.className = 'status' + (mode ? ` is-${mode}` : '');
}

/* Static between stations: WebAudio noise, started only from a user gesture. */
function ensureAudioCtx() {
  if (!state.audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    state.audioCtx = new AC();
  }
  if (state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
  return state.audioCtx;
}

function startStatic() {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  stopStatic();
  const len = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1600;
  filter.Q.value = 0.6;
  const gain = ctx.createGain();
  gain.gain.value = (el.vol.value / 100) * 0.14;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
  state.staticNodes = { src, gain };
}

function stopStatic() {
  if (state.staticNodes) {
    try { state.staticNodes.src.stop(); } catch (e) { /* already stopped */ }
    state.staticNodes = null;
  }
}

function stopAllAudio() {
  stopStatic();
  el.player.pause();
  el.player.removeAttribute('src');
  el.player.load();
  state.playing = false;
  el.playBtn.textContent = 'PLAY';
  el.playBtn.classList.remove('is-on');
}

function playSelected() {
  const s = state.selected;
  if (!s) return;
  stopStatic();
  el.player.pause();
  state.playing = true;
  el.playBtn.textContent = 'PAUSE';
  el.playBtn.classList.add('is-on');
  if (s.stream_url) {
    if (el.player.getAttribute('src') !== s.stream_url) {
      el.player.src = s.stream_url;
    }
    el.player.volume = el.vol.value / 100;
    el.player.play().then(() => {
      setStatus('signal acquired — streaming off-island relay', 'live');
    }).catch(() => {
      setStatus('signal lost — static between stations', 'static');
      startStatic();
    });
  } else {
    setStatus('no off-island relay — static between stations', 'static');
    startStatic();
  }
}

function pauseAll() {
  stopAllAudio();
  setStatus('receiver idle', null);
}

function chip(type) {
  const span = document.createElement('span');
  span.className = `b-chip b-chip--${type}`;
  span.textContent = TYPE_LABEL[type] || type.toUpperCase();
  return span;
}

function wireTag(b) {
  return b.source === 'isla-sim' ? '<span class="b-wire">&middot;WIRE</span>' : '';
}

function currentSheet() {
  return (state.selected && state.bulletins[state.selected.id]) || [];
}

function renderTicker() {
  const sheet = currentSheet();
  if (!sheet.length) {
    el.ticker.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'sheet-empty';
    div.textContent = 'no bulletins tonight — the sheet is quiet';
    el.ticker.appendChild(div);
    return;
  }
  const b = sheet[state.tickerIdx % sheet.length];
  const time = document.createElement('span');
  time.className = 't-time';
  time.innerHTML = `${b.time}${wireTag(b)}`;
  const text = document.createElement('span');
  text.className = 't-text';
  text.textContent = b.text;
  el.ticker.innerHTML = '';
  el.ticker.appendChild(chip(b.type));
  el.ticker.appendChild(time);
  el.ticker.appendChild(text);
}

function advanceTicker() {
  el.ticker.classList.add('is-fading');
  setTimeout(() => {
    state.tickerIdx += 1;
    renderTicker();
    el.ticker.classList.remove('is-fading');
  }, 360);
}

function restartTicker() {
  if (state.tickerTimer) clearInterval(state.tickerTimer);
  state.tickerTimer = setInterval(advanceTicker, TICK_MS);
}

function renderSheetList() {
  const sheet = currentSheet();
  el.sheetList.innerHTML = '';
  for (const b of sheet) {
    const li = document.createElement('li');
    const c = chip(b.type);
    const time = document.createElement('span');
    time.className = 't-time';
    time.innerHTML = `${b.time}${wireTag(b)}`;
    const text = document.createElement('span');
    text.className = 't-text';
    text.textContent = b.text;
    li.appendChild(c);
    li.appendChild(time);
    li.appendChild(text);
    el.sheetList.appendChild(li);
  }
}

function selectStation(id, autoplay) {
  const s = state.stations.find((x) => x.id === id);
  if (!s) return;
  sfx('ui.knob');
  state.selected = s;
  state.tickerIdx = 0;
  for (const btn of el.dial.querySelectorAll('.station')) {
    btn.classList.toggle('is-active', btn.dataset.id === id);
  }
  el.freq.textContent = s.frequency;
  el.call.textContent = `${s.callsign} — ${s.name}`;
  el.cityline.textContent = s.region_ref ? `${s.city} · ${s.region_ref}` : s.city;
  el.theme.textContent = s.theme;
  el.host.innerHTML = `tonight: <b>${s.host}</b> — ${s.flavor}`;

  stopAllAudio();
  el.playBtn.disabled = false;
  if (s.stream_url) {
    el.player.src = s.stream_url;
    setStatus(`tuned ${s.frequency} ${s.band} — press PLAY`, null);
  } else {
    setStatus('this band is static off-island — press PLAY to hear it', 'static');
  }
  renderTicker();
  renderSheetList();
  restartTicker();
  if (autoplay) playSelected();
}

function buildDial() {
  el.dial.innerHTML = '';
  for (const s of state.stations) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'station';
    btn.dataset.id = s.id;
    const freq = document.createElement('span');
    freq.className = 's-freq';
    freq.textContent = s.frequency;
    const mid = document.createElement('span');
    const name = document.createElement('span');
    name.className = 's-name';
    name.textContent = `${s.callsign} “${s.name}”`;
    const city = document.createElement('span');
    city.className = 's-city';
    city.textContent = s.city;
    mid.appendChild(name);
    mid.appendChild(city);
    const status = document.createElement('span');
    status.className = 'chip ' + (s.stream_url ? 'chip--on' : 'chip--static');
    status.textContent = s.stream_url ? 'ON AIR' : 'STATIC';
    btn.appendChild(freq);
    btn.appendChild(mid);
    btn.appendChild(status);
    btn.addEventListener('click', () => selectStation(s.id, state.playing));
    el.dial.appendChild(btn);
  }
}

el.playBtn.addEventListener('click', () => {
  if (!state.selected) return;
  sfx('ui.click');
  if (state.playing) pauseAll();
  else playSelected();
});

el.vol.addEventListener('input', () => {
  el.player.volume = el.vol.value / 100;
  if (state.staticNodes) state.staticNodes.gain.gain.value = (el.vol.value / 100) * 0.14;
});

el.player.addEventListener('error', () => {
  if (!state.playing || !el.player.getAttribute('src')) return;
  setStatus('signal lost — static between stations', 'static');
  startStatic();
});

async function boot() {
  el.playBtn.disabled = true;
  let stationsDoc = null;
  let bulletinsDoc = null;
  try {
    const [sr, br] = await Promise.all([
      fetch('./stations.json'),
      fetch('./bulletins.json'),
    ]);
    if (sr.ok) stationsDoc = await sr.json();
    if (br.ok) bulletinsDoc = await br.json();
  } catch (e) {
    /* file:// or offline — fall through to the error render */
  }
  if (!stationsDoc || !Array.isArray(stationsDoc.stations)) {
    el.ticker.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'sheet-empty';
    div.textContent = 'stations.json not found — serve this directory over http';
    el.ticker.appendChild(div);
    setStatus('no station data', 'static');
    return;
  }
  state.stations = stationsDoc.stations;
  state.bulletins = (bulletinsDoc && bulletinsDoc.stations) || {};
  state.date = (bulletinsDoc && bulletinsDoc.date) || null;
  el.sheetDate.textContent = state.date ? `· ${state.date}` : '· (no bulletins.json)';
  buildDial();
  if (state.stations.length) selectStation(state.stations[0].id, false);
}

boot();
if (new URLSearchParams(location.search).get('embed') === '1') {
  document.body.classList.add('embed');
}
