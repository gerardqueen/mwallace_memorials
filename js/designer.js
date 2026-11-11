// Memorial designer (preview feature): pick a design, change it step by step, see it in 3D,
// place it at true size with the phone's AR, and send it in as an enquiry.
import { SUPABASE_URL, SUPABASE_ANON_KEY, SETTINGS } from './config.js';
import {
  SHAPES, SIZES, FONTS, COLOURS, MOTIFS, CHIPS, DEFAULT_STONES, DEFAULT_DESIGN,
  normalise, encodeDesign, decodeDesign, describe, faceCanvas, fontsReady, buildMemorial, exportForAR, shapeSVG,
} from './memorial3d.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const H = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const MODEL_VIEWER = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/dist/model-viewer-module.min.js';
const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

// Built-in starting points. Staff add real catalogue designs (with the brochure code and photo) in admin.
const BUILTIN_PRESETS = [
  { id: 'p1', name: 'Classic ogee', design: { ...DEFAULT_DESIGN } },
  { id: 'p2', name: 'Half round in grey', design: { ...DEFAULT_DESIGN, shape: 'round', stone: 'grey', colour: 'black', motif: 'none', font: 'classic' } },
  { id: 'p3', name: 'Heart in ruby red', design: { ...DEFAULT_DESIGN, shape: 'heart', w: 700, h: 640, stone: 'ruby', colour: 'gold', motif: 'none', font: 'script', base: true, vases: 1 } },
  { id: 'p4', name: 'Open book in Blue Pearl', design: { ...DEFAULT_DESIGN, shape: 'book', w: 760, h: 560, stone: 'bluepearl', colour: 'silver', motif: 'hearts', font: 'classic', vases: 0 } },
  { id: 'p5', name: 'White marble peak', design: { ...DEFAULT_DESIGN, shape: 'peak', stone: 'whitemarble', colour: 'lead', motif: 'celtic', font: 'roman' } },
  { id: 'p6', name: 'Lair with kerbs', design: { ...DEFAULT_DESIGN, shape: 'serpentine', stone: 'black', colour: 'gold', kerbs: true, chips: 'white', vases: 2 } },
];

let STONES = [...DEFAULT_STONES];
let PRESETS = [...BUILTIN_PRESETS];
const params = new URLSearchParams(location.search);
let D = normalise(params.get('d') ? decodeDesign(params.get('d')) : DEFAULT_DESIGN);

// ---------------- catalogue from Supabase (falls back to the built-in list) ----------------
async function loadCatalogue() {
  const get = (t, q) => fetch(`${SUPABASE_URL}/rest/v1/${t}?${q}`, { headers: H }).then((r) => (r.ok ? r.json() : []), () => []);
  const [stones, presets] = await Promise.all([
    get('mw_design_stones', 'select=*&active=is.true&order=sort.asc,name.asc'),
    get('mw_design_presets', 'select=*&active=is.true&order=sort.asc,created_at.desc'),
  ]);
  if (stones.length) STONES = [...stones.map((s) => ({ ...s, flecks: s.flecks || undefined })), ...DEFAULT_STONES.filter((d) => !stones.some((s) => s.name === d.name))];
  if (presets.length) PRESETS = [...presets.map((p) => ({ id: p.id, name: p.name, ref: p.brochure_ref, photo: p.photo_url, design: p.design })), ...BUILTIN_PRESETS];
}

// ---------------- 3D preview ----------------
let THREE, renderer, scene, camera, controls, current = null, building = 0;
async function init3D() {
  const host = $('#d-canvas');
  try {
    THREE = await import('three');
    const [{ OrbitControls }, { RoomEnvironment }] = await Promise.all([
      import('three/addons/controls/OrbitControls.js'), import('three/addons/environments/RoomEnvironment.js'),
    ]);
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(1.5, 3, 2.5); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 });
    scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x445533, 0.5));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0x6f8a5c, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 0.6; controls.maxDistance = 8;
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(host); resize();
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    await rebuild(true);
    $('#d-loading').hidden = true;
  } catch (e) {
    console.error(e);
    $('#d-loading').textContent = 'Sorry, the 3D preview can\'t run on this device, but you can still design and send your memorial.';
  }
}

function frame(group) {
  const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const wide = innerWidth > 900 ? 1.25 : 1;
  const dist = Math.max(size.y * 2.4, size.x * 2.1, size.z * 1.3, 1.6) * wide;
  controls.target.set(0, Math.min(c.y, 0.6), c.z * 0.4);
  camera.position.set(dist * 0.35, Math.max(size.y * 0.75, 0.7), c.z + dist);
  controls.update();
}

let timer = null;
function schedule() { clearTimeout(timer); timer = setTimeout(() => rebuild(false), 120); }
async function rebuild(reframe) {
  if (!THREE) return;
  const ticket = ++building;
  const { group, textures } = await buildMemorial(THREE, D, STONES, { maxTex: matchMedia('(max-width: 700px)').matches ? 1024 : 2048 });
  if (ticket !== building) { textures.forEach((t) => t.dispose()); return; } // a newer change won
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  if (current) { scene.remove(current.group); current.textures.forEach((t) => t.dispose()); current.group.traverse((o) => o.geometry?.dispose()); }
  current = { group, textures }; scene.add(group);
  const kerbs = !!D.kerbs;
  if (reframe || kerbs !== frame.kerbs) frame(group); frame.kerbs = kerbs;
}

// ---------------- UI ----------------
function chips(host, items, value, onPick, label = (i) => esc(i.name)) {
  host.innerHTML = items.map((i) => `<button type="button" class="chip${String(i.key) === String(value) ? ' on' : ''}" data-k="${esc(i.key)}" aria-pressed="${String(i.key) === String(value)}">${label(i)}</button>`).join('');
  host.onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) onPick(b.dataset.k); };
}

async function thumb(design, px = 260) {
  const d = normalise(design);
  await fontsReady(d);
  const { canvas } = await faceCanvas(d, STONES, px);
  return canvas.toDataURL('image/png');
}

async function renderPresets() {
  const host = $('#d-presets');
  host.innerHTML = PRESETS.map((p, i) => `<button type="button" class="d-preset" data-i="${i}">
      <span class="d-preset-img">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : '<img alt="" data-thumb>'}</span>
      <span class="d-preset-name">${esc(p.name)}</span>${p.ref ? `<span class="d-preset-ref">Brochure: ${esc(p.ref)}</span>` : ''}
    </button>`).join('');
  host.onclick = (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const p = PRESETS[+b.dataset.i];
    const keepText = { ...D.text };
    D = normalise({ ...p.design, text: D.text.name !== DEFAULT_DESIGN.text.name ? keepText : p.design.text });
    refresh(true);
    $$('.d-preset', host).forEach((x) => x.classList.toggle('on', x === b));
    $('[data-step="shape"]').open = true;
  };
  for (const [i, p] of PRESETS.entries()) if (!p.photo) { const img = host.querySelector(`[data-i="${i}"] [data-thumb]`); thumb(p.design, 220).then((u) => (img.src = u)); }
}

function renderShapes() {
  const host = $('#d-shapes');
  host.innerHTML = SHAPES.map((s) => `<button type="button" class="d-shape${s.key === D.shape ? ' on' : ''}" data-k="${s.key}" aria-pressed="${s.key === D.shape}">${shapeSVG(s.key)}<span>${esc(s.name)}</span></button>`).join('');
  host.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; D.shape = b.dataset.k; refresh(); };
  const size = SIZES.find((s) => s.w === D.w && s.h === D.h && s.t === D.t);
  chips($('#d-sizes'), [...SIZES.map((s) => ({ ...s, name: `${s.name} · ${s.w}×${s.h}` })), { key: 'custom', name: 'Custom' }], size?.key || 'custom', (k) => {
    const s = SIZES.find((x) => x.key === k); if (s) Object.assign(D, { w: s.w, h: s.h, t: s.t }); refresh();
  });
  for (const k of ['w', 'h', 't']) { $(`#d-${k}`).value = D[k]; $(`#o-${k}`).textContent = `${D[k]}mm`; }
}

async function renderStones() {
  const host = $('#d-stones');
  host.innerHTML = STONES.map((s) => `<button type="button" class="d-stone${s.id === D.stone ? ' on' : ''}" data-k="${esc(s.id)}" aria-pressed="${s.id === D.stone}">
    <span class="sw">${s.photo_url ? `<img src="${esc(s.photo_url)}" alt="" loading="lazy">` : '<canvas width="120" height="120"></canvas>'}</span><span>${esc(s.name)}</span></button>`).join('');
  host.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; D.stone = b.dataset.k; refresh(); };
  const { stoneCanvas } = await import('./memorial3d.js');
  for (const s of STONES) {
    if (s.photo_url) continue;
    const cv = host.querySelector(`[data-k="${CSS.escape(s.id)}"] canvas`); if (!cv) continue;
    const src = await stoneCanvas(s, 120, 120, 0.6); cv.getContext('2d').drawImage(src, 0, 0);
  }
}

function renderBase() {
  $('#d-base').checked = D.base; $('#d-base-opts').hidden = !D.base;
  $('#d-bh').value = D.baseH; $('#o-bh').textContent = `${D.baseH}mm`;
  chips($('#d-vases'), [{ key: 0, name: 'No vase' }, { key: 1, name: 'One vase' }, { key: 2, name: 'Two vases' }], D.vases, (k) => { D.vases = +k; refresh(); });
  $('#d-kerbs').checked = D.kerbs; $('#d-kerb-opts').hidden = !D.kerbs;
  chips($('#d-chipsel'), CHIPS, D.chips, (k) => { D.chips = k; refresh(); });
}

function renderLetters() {
  $$('[data-text]').forEach((el) => { if (document.activeElement !== el) el.value = D.text[el.dataset.text] || ''; });
  chips($('#d-fonts'), FONTS, D.font, (k) => { D.font = k; refresh(); }, (f) => `<span style="font-family:'${f.family}';font-size:${f.key === 'script' ? 22 : 16}px">${esc(f.name)}</span>`);
  chips($('#d-colours'), COLOURS, D.colour, (k) => { D.colour = k; refresh(); }, (c) => `<i class="dot dot-${c.key}"></i>${esc(c.name)}`);
  chips($('#d-motifs'), MOTIFS, D.motif, (k) => { D.motif = k; refresh(); });
}

function shareUrl(extra = '') { return `${location.origin}${location.pathname}?d=${encodeDesign(D)}${extra}`; }
function refresh(reframe = false) {
  D = normalise(D);
  renderShapes(); renderStones(); renderBase(); renderLetters();
  $('#d-summary').textContent = describe(D, STONES) + '.';
  history.replaceState(null, '', `?d=${encodeDesign(D)}`);
  if (reframe) rebuild(true); else schedule();
}

// inputs that don't re-render their own control
for (const k of ['w', 'h', 't']) $(`#d-${k}`).addEventListener('input', (e) => { D[k] = +e.target.value; $(`#o-${k}`).textContent = `${D[k]}mm`; $('#d-summary').textContent = describe(D, STONES) + '.'; schedule(); });
$('#d-bh').addEventListener('input', (e) => { D.baseH = +e.target.value; $('#o-bh').textContent = `${D.baseH}mm`; schedule(); });
$('#d-base').addEventListener('change', (e) => { D.base = e.target.checked; refresh(); });
$('#d-kerbs').addEventListener('change', (e) => { D.kerbs = e.target.checked; refresh(); });
$$('[data-text]').forEach((el) => el.addEventListener('input', () => { D.text[el.dataset.text] = el.value; history.replaceState(null, '', `?d=${encodeDesign(D)}`); schedule(); }));
$$('.d-step').forEach((s) => s.addEventListener('toggle', () => { if (s.open) $$('.d-step').forEach((o) => { if (o !== s) o.open = false; }); }));

// ---------------- See it in place (AR) ----------------
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    document.head.appendChild(Object.assign(document.createElement('script'), { src, onload: res, onerror: rej }));
  });
}
let arUrls = [];
async function openAR() {
  const dlg = $('#ar-dialog'), stage = $('#ar-stage'), foot = $('#ar-foot');
  stage.innerHTML = '<div class="ar-loading">Building your memorial in 3D…</div>'; foot.innerHTML = '';
  dlg.showModal();
  try {
    const T = THREE || await import('three');
    const [{ GLTFExporter }, { USDZExporter }] = await Promise.all([
      import('three/addons/exporters/GLTFExporter.js'), import('three/addons/exporters/USDZExporter.js'), import(MODEL_VIEWER),
    ]);
    const urls = await exportForAR(T, GLTFExporter, USDZExporter, D, STONES);
    arUrls.forEach(URL.revokeObjectURL); arUrls = [urls.glbUrl, urls.usdzUrl];
    stage.innerHTML = `<model-viewer src="${urls.glbUrl}" ios-src="${urls.usdzUrl}" alt="${esc(describe(D, STONES))}"
      ar ar-modes="webxr quick-look" ar-placement="floor" ar-scale="fixed" camera-controls touch-action="pan-y"
      shadow-intensity="1" shadow-softness="0.8" exposure="1" environment-image="neutral" camera-orbit="20deg 78deg auto" interaction-prompt="none">
      <button slot="ar-button" class="btn ar-btn">Place it on the ground</button></model-viewer>`;
    const mv = $('model-viewer', stage);
    const phone = () => (foot.innerHTML = `<ol class="ar-steps">
        <li>Tap <strong>Place it on the ground</strong> and allow the camera.</li>
        <li>Point your phone at the ground where the memorial would go and move it slowly until it appears.</li>
        <li>Drag to move it and twist with two fingers to turn it. Walk around it to see it from every side.</li></ol>
      <p class="muted small">Shown at true size. It's a guide: colours on screen vary, and we'll confirm every detail with you.</p>`);
    const desktop = async () => {
      foot.innerHTML = `<div class="ar-qr"><div class="qr" aria-label="QR code to open this design on your phone"></div><div>
        <strong>See it in place on your phone</strong>
        <p class="muted">Scan this with your phone camera to open your design, then tap <em>See it in place</em>. Works on recent iPhones and most Android phones.</p>
        <p class="muted">Here you can drag to turn it and scroll to zoom.</p></div></div>`;
      try { await loadScript(QR_LIB); const q = window.qrcode(0, 'L'); q.addData(shareUrl('&ar=1')); q.make(); $('.qr', foot).innerHTML = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); }
      catch { $('.qr', foot).remove(); }
    };
    // Phones that can't start AR here are almost always inside an app's built-in browser
    // (Claude, WhatsApp, Facebook, Messenger…). AR Quick Look only runs in Safari, so send them there.
    const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const ANDROID = /Android/i.test(navigator.userAgent);
    const inApp = () => {
      const url = shareUrl('&ar=1');
      const open = IOS ? `x-safari-${url}` : `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
      foot.innerHTML = `<div class="ar-inapp">
        <strong>To place it on the ground, open this page in ${IOS ? 'Safari' : 'Chrome'}</strong>
        <p class="muted">You're viewing this inside another app's browser, which can't use the camera for AR.</p>
        <div class="d-actions"><a class="btn" href="${esc(open)}">Open in ${IOS ? 'Safari' : 'Chrome'}</a>
        <button class="btn ghost" type="button" id="ar-copy">Copy link</button></div>
        <p class="muted small" id="ar-copied">If the button doesn't work, copy the link and paste it into ${IOS ? 'Safari' : 'Chrome'}. Your design comes with it.</p>
        ${IOS ? `<p class="muted small"><a rel="ar" href="${urls.usdzUrl}"><img alt="" width="1" height="1" style="opacity:0">Or try opening it in AR directly</a></p>` : ''}
      </div>`;
      $('#ar-copy', foot).onclick = async () => {
        try { await navigator.clipboard.writeText(url); $('#ar-copied', foot).textContent = 'Link copied. Paste it into ' + (IOS ? 'Safari' : 'Chrome') + '.'; }
        catch { $('#ar-copied', foot).textContent = url; }
      };
    };
    mv.addEventListener('load', () => (mv.canActivateAR ? phone() : (IOS || ANDROID) ? inApp() : desktop()), { once: true });
    mv.addEventListener('ar-status', (e) => { if (e.detail.status === 'failed') foot.insertAdjacentHTML('afterbegin', '<p class="error">Your phone couldn\'t start AR here. Try Safari on iPhone or Chrome on Android.</p>'); });
  } catch (e) {
    console.error(e);
    stage.innerHTML = '<div class="ar-loading">Sorry, this device can\'t show the 3D view. You can still send your design for a quote.</div>';
  }
}

// ---------------- Send for a quote ----------------
let snapBlob = null;
async function snapshot() {
  if (!renderer) return null;
  renderer.render(scene, camera);
  return new Promise((res) => renderer.domElement.toBlob(res, 'image/jpeg', 0.85));
}
async function openSend() {
  snapBlob = await snapshot();
  const img = $('#send-snap'); img.hidden = !snapBlob; if (snapBlob) img.src = URL.createObjectURL(snapBlob);
  $('#send-dialog').showModal();
}
$('#send-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target, msg = $('.form-msg', form), f = Object.fromEntries(new FormData(form));
  if (f.company) return;
  let bad = null;
  for (const k of ['name', 'phone', 'email', 'cemetery']) {
    const el = form.elements[k], v = el.value.trim();
    const ok = v && (k !== 'email' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v));
    el.setAttribute('aria-invalid', ok ? 'false' : 'true'); if (!ok && !bad) bad = el;
  }
  if (bad) { msg.className = 'form-msg err'; msg.textContent = 'Please fill in your name, phone, a valid email and where the memorial will go.'; bad.focus(); return; }
  const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Sending…';
  const link = shareUrl();
  const row = {
    name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), service: 'memorials', cemetery: f.cemetery.trim(),
    region: f.area || 'scotland', page: '/design/', photos: [],
    message: [`ONLINE DESIGN: ${describe(D, STONES)}.`, `Lettering: ${['top', 'name', 'dates', 'more', 'epitaph'].map((k) => D.text[k]).filter(Boolean).join(' / ')}`, `Open the design: ${link}`, f.message?.trim()].filter(Boolean).join('\n\n'),
  };
  try {
    if (snapBlob) {
      const path = `enq/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.jpg`;
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/mw-enquiry-photos/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: snapBlob });
      if (up.ok) row.photos.push(path);
    }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/mw_enquiries`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    fetch(`${SUPABASE_URL}/functions/v1/mw-enquiry-alert`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    form.classList.add('sent');
    msg.className = 'form-msg ok';
    msg.innerHTML = `<strong>Thank you ${esc(row.name.split(' ')[0])}, your design is with us.</strong><br>We'll be in touch soon. If you'd rather talk, call <a href="tel:${SETTINGS.phone.replace(/\s/g, '')}">${SETTINGS.phone}</a>.`;
  } catch (err) {
    console.error(err);
    msg.className = 'form-msg err';
    msg.innerHTML = `Sorry, that didn't send. Please call <a href="tel:${SETTINGS.phone.replace(/\s/g, '')}">${SETTINGS.phone}</a> or <a href="https://wa.me/${SETTINGS.whatsapp}?text=${encodeURIComponent('Hi, here is my memorial design: ' + link)}" target="_blank" rel="noopener">send it on WhatsApp</a>.`;
  } finally { btn.disabled = false; btn.textContent = 'Send my design'; }
});

// ---------------- wiring ----------------
const act = { ar: openAR, send: openSend, copy: async () => {
  try { await navigator.clipboard.writeText(shareUrl()); $('#d-copied').textContent = 'Link copied. Anyone with it can open this design.'; }
  catch { $('#d-copied').textContent = shareUrl(); }
} };
$('#d-ar').onclick = openAR; $('#d-send').onclick = openSend;
$$('[data-act]').forEach((b) => (b.onclick = act[b.dataset.act]));
$$('.d-dialog').forEach((dlg) => {
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
});

(async () => {
  await loadCatalogue();
  if (!STONES.some((s) => s.id === D.stone)) D.stone = STONES[0].id;
  refresh();
  renderPresets();
  await init3D();
  if (params.get('ar') === '1') openAR();
})();
