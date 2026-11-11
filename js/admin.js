// Staff page: add jobs (photos + area + optional review), manage jobs, read enquiries, approve staff.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { REGIONS, TOWNS, SERVICES } from './regions.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { decodeDesign, encodeDesign, describe, DEFAULT_STONES } from './memorial3d.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: 'mw-staff-auth' } });
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const uid = () => crypto.randomUUID();
const when = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const SERVICE_NAME = Object.fromEntries(SERVICES.map((s) => [s.key, s.name]));
const SETUP_MSG = 'The database isn\'t set up yet: run supabase/001_schema.sql in the Supabase SQL editor.';

// ---------------- Auth ----------------
let signUpMode = false, ME = null;
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show('login');
  const { data, error } = await sb.rpc('mw_is_admin');
  if (error) { $('#l-error').textContent = /does not exist|schema cache/.test(error.message) ? SETUP_MSG : error.message; $('#l-error').hidden = false; showSignout(); return show('login'); }
  if (!data) {
    await sb.rpc('mw_request_access').then(() => {}, () => {}); // puts them on the Staff tab for an admin to approve
    $('#p-email').textContent = session.user.email; showSignout(); return show('pending');
  }
  ME = session.user;
  $('#who').textContent = ME.email;
  showSignout();
  show('app');
  resetForm();
  refresh();
}
function show(v) { ['login', 'pending', 'app'].forEach((x) => ($(`#${x}-view`).hidden = x !== v)); }
function showSignout() { const s = $('#signout'); s.hidden = false; s.onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); location.reload(); }; }
$('#l-toggle').onclick = (e) => {
  e.preventDefault(); signUpMode = !signUpMode;
  $('#l-title').textContent = signUpMode ? 'Create staff account' : 'Staff login';
  $('#l-submit').textContent = signUpMode ? 'Create account' : 'Sign in';
  $('#l-toggle').textContent = signUpMode ? 'Already have an account? Sign in' : 'New staff member? Create an account';
};
$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  const err = $('#l-error'), ok = $('#l-ok'); err.hidden = ok.hidden = true;
  const email = $('#l-email').value.trim(), password = $('#l-pass').value;
  try {
    if (signUpMode) {
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      const d = must(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } }));
      if (!d.session) { ok.textContent = `Account created. Check ${email} for a confirmation link, then an admin will approve you.`; ok.hidden = false; return; }
    } else must(await sb.auth.signInWithPassword({ email, password }));
    boot();
  } catch (ex) { err.textContent = /confirm/i.test(ex.message) ? 'Please click the confirmation link in your email first.' : ex.message; err.hidden = false; }
};

// ---------------- Tabs ----------------
$$('[data-tab]').forEach((b) => (b.onclick = () => {
  $$('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
  $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
}));

// ---------------- Job form ----------------
const regionSel = $('#j-region');
const areaOpts = Object.entries(REGIONS).filter(([k]) => k !== 'scotland').map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
regionSel.innerHTML = areaOpts;
$('#jobs-filter').insertAdjacentHTML('beforeend', areaOpts);
$('#j-service').innerHTML = '<option value="">Choose…</option>' + SERVICES.map((s) => `<option value="${s.key}">${esc(s.name)}</option>`).join('');
function fillTowns() { $('#towns').innerHTML = (TOWNS[regionSel.value] || []).map((t) => `<option>${esc(t)}</option>`).join(''); }
regionSel.onchange = () => { fillTowns(); try { localStorage.setItem('mw-last-region', regionSel.value); } catch {} };

let PHOTOS = []; // [{url} | {file, preview}]
let RATING = 0;
function drawRating() {
  $('#j-rating').innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-r="${n}" class="${n <= RATING ? 'on' : ''}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('');
}
$('#j-rating').onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b) return; RATING = RATING === +b.dataset.r ? 0 : +b.dataset.r; drawRating(); };

function drawPhotos() {
  $('#j-photos').innerHTML = PHOTOS.map((p, i) => `<div class="ph ${i === 0 ? 'cover' : ''}" data-i="${i}">
    <img src="${esc(p.url || p.preview)}" alt=""><button type="button" data-del="${i}" aria-label="Remove photo">×</button></div>`).join('');
}
$('#j-photos').onclick = (e) => {
  const d = e.target.closest('[data-del]');
  if (d) { PHOTOS.splice(+d.dataset.del, 1); return drawPhotos(); }
  const ph = e.target.closest('[data-i]');
  if (ph) { const [p] = PHOTOS.splice(+ph.dataset.i, 1); PHOTOS.unshift(p); drawPhotos(); }
};
function addFiles(files) { for (const f of files) PHOTOS.push({ file: f, preview: URL.createObjectURL(f) }); drawPhotos(); }
$('#j-camera').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
$('#j-library').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };

async function compress(file, maxSide = 1800, q = 0.82) {
  let img = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!img) img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', q));
}
async function upload(file) {
  const blob = await compress(file);
  const path = `${new Date().getFullYear()}/${uid()}.jpg`;
  must(await sb.storage.from('mw-job-photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
  return sb.storage.from('mw-job-photos').getPublicUrl(path).data.publicUrl;
}

function resetForm() {
  $('#job-form').reset(); $('#j-id').value = '';
  PHOTOS = []; RATING = 0; drawPhotos(); drawRating();
  try { const last = localStorage.getItem('mw-last-region'); if (last && REGIONS[last]) regionSel.value = last; } catch {}
  fillTowns();
  $('#j-date').value = new Date().toISOString().slice(0, 10);
  $('#j-published').checked = true;
  $('#jf-title').textContent = 'Add a finished job'; $('#j-save').textContent = 'Save job'; $('#j-cancel').hidden = true;
  $('#j-error').hidden = true;
}
$('#j-cancel').onclick = resetForm;

$('#job-form').onsubmit = async (e) => {
  e.preventDefault();
  const err = $('#j-error'), ok = $('#j-ok'); err.hidden = ok.hidden = true;
  const review = $('#j-review').value.trim();
  try {
    if (!PHOTOS.length) throw new Error('Add at least one photo.');
    if (!$('#j-service').value) throw new Error('Choose the work done, so the job shows under the right service on the website.');
    if (review && !$('#j-consent').checked) throw new Error('Tick the box to confirm the customer is happy for their review to be shown, or clear the review.');
    const btn = $('#j-save'); btn.disabled = true;
    const urls = [];
    for (let i = 0; i < PHOTOS.length; i++) {
      btn.textContent = `Uploading photo ${i + 1} of ${PHOTOS.length}…`;
      urls.push(PHOTOS[i].url || await upload(PHOTOS[i].file));
    }
    btn.textContent = 'Saving…';
    const row = {
      region: regionSel.value, town: $('#j-town').value.trim() || null, cemetery: $('#j-cemetery').value.trim() || null,
      service: $('#j-service').value, stone: $('#j-stone').value || null,
      title: $('#j-title').value.trim() || null,
      description: $('#j-desc').value.trim() || null, photos: urls,
      review_text: review || null, reviewer_name: review ? ($('#j-reviewer').value.trim() || null) : null,
      rating: review && RATING ? RATING : null,
      published: $('#j-published').checked, featured: $('#j-featured').checked,
      job_date: $('#j-date').value || null,
    };
    const id = $('#j-id').value;
    if (id) must(await sb.from('mw_jobs').update(row).eq('id', id));
    else must(await sb.from('mw_jobs').insert(row));
    ok.textContent = id ? 'Job updated.' : `Saved. It's live on the website now. If it's the first job for ${REGIONS[row.region]}, that area's page switches on at the next site refresh (within 2 hours).`;
    ok.hidden = false;
    resetForm(); refresh();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  finally { const b = $('#j-save'); b.disabled = false; b.textContent = $('#j-id').value ? 'Update job' : 'Save job'; }
};

// ---------------- Lists ----------------
let JOBS = [], ENQ = [];
async function refresh() {
  [JOBS, ENQ] = await Promise.all([
    sb.from('mw_jobs').select('*').order('created_at', { ascending: false }).then(must),
    sb.from('mw_enquiries').select('*').order('created_at', { ascending: false }).limit(300).then(must),
  ]).catch((e) => { $('#j-error').textContent = /schema cache|does not exist/.test(e.message) ? SETUP_MSG : 'Could not load: ' + e.message; $('#j-error').hidden = false; return [[], []]; });
  drawJobs(); drawEnq(); drawStaff();
  drawDesigner();
}
$('#jobs-filter').onchange = drawJobs;
const jobTitle = (j) => j.title || SERVICE_NAME[j.service] || 'Memorial work';
function drawJobs() {
  const f = $('#jobs-filter').value;
  const list = JOBS.filter((j) => !f || j.region === f);
  $('#jobs-list').innerHTML = list.length ? list.map((j) => `<div class="row-item ${j.published ? '' : 'off'}">
      <img src="${esc(j.photos?.[0] || '')}" alt="">
      <div><h3>${esc(jobTitle(j))}${j.featured ? ' ★' : ''}</h3>
      <p class="muted">${esc(REGIONS[j.region])}${j.town ? ' · ' + esc(j.town) : ''}${j.cemetery ? ' · ' + esc(j.cemetery) : ''} · ${j.photos?.length || 0} photo(s)${j.review_text ? ' · review' : ''}${j.published ? '' : ' · hidden'}</p></div>
      <div class="actions">
        <button class="btn small ghost" data-edit="${j.id}">Edit</button>
        <button class="btn small ghost" data-pub="${j.id}">${j.published ? 'Hide' : 'Show'}</button>
        <button class="btn small ghost" data-delj="${j.id}">Delete</button>
      </div></div>`).join('') : '<p class="muted">No jobs yet. Add one from the first tab.</p>';
}
$('#jobs-list').onclick = async (e) => {
  const t = e.target;
  if (t.dataset.edit) return editJob(t.dataset.edit);
  if (t.dataset.pub) { const j = JOBS.find((x) => x.id === t.dataset.pub); must(await sb.from('mw_jobs').update({ published: !j.published }).eq('id', j.id)); return refresh(); }
  if (t.dataset.delj) {
    if (t.dataset.sure !== '1') { t.dataset.sure = '1'; t.textContent = 'Tap again to delete'; return; }
    must(await sb.from('mw_jobs').delete().eq('id', t.dataset.delj)); refresh();
  }
};
function editJob(id) {
  const j = JOBS.find((x) => x.id === id); if (!j) return;
  resetForm();
  $('#j-id').value = j.id; regionSel.value = j.region; fillTowns();
  $('#j-town').value = j.town || ''; $('#j-cemetery').value = j.cemetery || '';
  $('#j-service').value = j.service || ''; $('#j-stone').value = j.stone || '';
  $('#j-title').value = j.title || ''; $('#j-desc').value = j.description || ''; $('#j-date').value = j.job_date || '';
  $('#j-review').value = j.review_text || ''; $('#j-reviewer').value = j.reviewer_name || ''; $('#j-consent').checked = !!j.review_text;
  RATING = j.rating || 0; drawRating();
  $('#j-published').checked = j.published; $('#j-featured').checked = j.featured;
  PHOTOS = (j.photos || []).map((url) => ({ url })); drawPhotos();
  $('#jf-title').textContent = 'Edit job'; $('#j-save').textContent = 'Update job'; $('#j-cancel').hidden = false;
  $('[data-tab="add"]').click(); scrollTo({ top: 0, behavior: 'smooth' });
}

// Enquiry photos are private: staff see them through short-lived signed links.
async function signed(paths) {
  if (!paths.length) return {};
  const { data } = await sb.storage.from('mw-enquiry-photos').createSignedUrls(paths, 3600);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}
async function drawEnq() {
  const open = ENQ.filter((x) => !x.handled).length;
  $('#enq-badge').textContent = open || '';
  const urls = await signed(ENQ.flatMap((q) => q.photos || []));
  $('#enq-list').innerHTML = ENQ.length ? ENQ.map((q) => `<div class="row-item enq ${q.handled ? 'done' : ''}">
    <div><h3>${esc(q.name)} · ${esc(SERVICE_NAME[q.service] || q.service || '')}</h3>
      <p><a href="tel:${esc(q.phone)}">${esc(q.phone || '')}</a> · <a href="mailto:${esc(q.email)}">${esc(q.email)}</a></p>
      <p><strong>Where:</strong> ${esc(q.cemetery || '—')}</p>
      ${q.message ? `<p class="muted">${esc(q.message)}</p>` : ''}
      ${(q.photos || []).length ? `<div class="enq-photos">${q.photos.map((p) => urls[p] ? `<a href="${esc(urls[p])}" target="_blank" rel="noopener"><img src="${esc(urls[p])}" alt="Photo from ${esc(q.name)}"></a>` : '').join('')}</div>` : ''}
      <p class="muted" style="font-size:13px">${when(q.created_at)} · ${esc(REGIONS[q.region] || q.region || '')} page</p></div>
    <div class="actions"><button class="btn small ${q.handled ? 'ghost' : ''}" data-h="${q.id}">${q.handled ? 'Reopen' : 'Done'}</button></div></div>`).join('')
    : '<p class="muted">No enquiries yet.</p>';
}
$('#enq-list').onclick = async (e) => {
  const id = e.target.dataset.h; if (!id) return;
  const q = ENQ.find((x) => x.id === id);
  must(await sb.from('mw_enquiries').update({ handled: !q.handled }).eq('id', id)); refresh();
};

async function drawStaff() {
  const [reqs, admins] = await Promise.all([
    sb.from('mw_access_requests').select('*').order('created_at', { ascending: false }).then(must).catch(() => []),
    sb.rpc('mw_list_admins').then(must).catch(() => []),
  ]);
  $('#staff-badge').textContent = reqs.length || '';
  $('#req-list').innerHTML = reqs.length ? reqs.map((r) => `<div class="row-item enq"><div><h3>${esc(r.email)}</h3><p class="muted">Asked ${when(r.created_at)}</p></div>
    <div class="actions"><button class="btn small" data-approve="${r.user_id}">Approve</button><button class="btn small ghost" data-decline="${r.user_id}">Decline</button></div></div>`).join('')
    : '<p class="muted">Nobody waiting.</p>';
  $('#admin-list').innerHTML = admins.map((a) => `<div class="row-item enq"><div><h3>${esc(a.email)}</h3></div>
    <div class="actions">${a.user_id === ME.id ? '<span class="muted">You</span>' : `<button class="btn small ghost" data-remove="${a.user_id}">Remove</button>`}</div></div>`).join('');
}
$('[data-pane="staff"]').onclick = async (e) => {
  const d = e.target.dataset;
  try {
    if (d.approve) must(await sb.rpc('mw_approve_admin', { target: d.approve }));
    else if (d.decline) must(await sb.from('mw_access_requests').delete().eq('user_id', d.decline));
    else if (d.remove) {
      if (d.sure !== '1') { d.sure = '1'; e.target.textContent = 'Tap again to remove'; return; }
      must(await sb.rpc('mw_remove_admin', { target: d.remove }));
    } else return;
    drawStaff();
  } catch (ex) { e.target.textContent = ex.message; }
};

boot();

// ---------------- Designer catalogue (stones + starting designs) ----------------
async function uploadDesignerPhoto(file) {
  const blob = await compress(file, 1600, 0.85);
  const path = `designer/${uid()}.jpg`;
  must(await sb.storage.from('mw-job-photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
  return sb.storage.from('mw-job-photos').getPublicUrl(path).data.publicUrl;
}
let STONES_DB = [], PRESETS_DB = [];
const DZ_SETUP = 'The designer catalogue isn\'t set up yet: run supabase/003_designer.sql in the Supabase SQL editor.';
async function drawDesigner() {
  const load = (t) => sb.from(t).select('*').order('sort').order('created_at', { ascending: false }).then(must);
  try { [STONES_DB, PRESETS_DB] = await Promise.all([load('mw_design_stones'), load('mw_design_presets')]); }
  catch (e) { $('#stone-list').innerHTML = `<p class="muted">${/schema cache|does not exist/.test(e.message) ? DZ_SETUP : esc(e.message)}</p>`; return; }
  $('#stone-list').innerHTML = STONES_DB.length ? STONES_DB.map((x) => `<div class="row-item ${x.active ? '' : 'off'}">
      ${x.photo_url ? `<img src="${esc(x.photo_url)}" alt="">` : `<span class="dz-sw" style="background:${esc(x.colour)}"></span>`}
      <div><h3>${esc(x.name)}</h3><p class="muted">${x.kind === 'marble' ? 'Marble' : 'Granite'}${x.active ? '' : ' · hidden'}</p></div>
      <div class="actions"><button class="btn small ghost" data-st-edit="${x.id}">Edit</button><button class="btn small ghost" data-st-del="${x.id}">Delete</button></div></div>`).join('')
    : `<p class="muted">No stones added yet. The designer shows its ${DEFAULT_STONES.length} built-in stones.</p>`;
  $('#preset-list').innerHTML = PRESETS_DB.length ? PRESETS_DB.map((x) => `<div class="row-item ${x.active ? '' : 'off'}">
      ${x.photo_url ? `<img src="${esc(x.photo_url)}" alt="">` : '<span class="dz-sw"></span>'}
      <div><h3>${esc(x.name)}${x.brochure_ref ? ` <small class="muted">· ${esc(x.brochure_ref)}</small>` : ''}</h3><p class="muted">${esc(describe(x.design, [...STONES_DB, ...DEFAULT_STONES]))}</p></div>
      <div class="actions"><a class="btn small ghost" href="design/?d=${encodeDesign(x.design)}" target="_blank" rel="noopener">Open</a>
      <button class="btn small ghost" data-pr-edit="${x.id}">Edit</button><button class="btn small ghost" data-pr-del="${x.id}">Delete</button></div></div>`).join('')
    : '<p class="muted">No starting designs added yet. The designer shows its six built-in ones.</p>';
}

let stPhoto = null, prPhoto = null;
const previewPick = (input, img, set) => { $(input).onchange = (e) => { const f = e.target.files[0]; if (!f) return; set(f); const i = $(img); i.src = URL.createObjectURL(f); i.hidden = false; }; };
previewPick('#st-photo', '#st-preview', (f) => (stPhoto = f));
previewPick('#pr-photo', '#pr-preview', (f) => (prPhoto = f));
function resetStone() { $('#stone-form').reset(); $('#st-id').value = ''; stPhoto = null; $('#st-preview').hidden = true; $('#st-cancel').hidden = true; $('#st-save').textContent = 'Save stone'; $('#st-error').hidden = true; }
function resetPreset() { $('#preset-form').reset(); $('#pr-id').value = ''; prPhoto = null; $('#pr-preview').hidden = true; $('#pr-cancel').hidden = true; $('#pr-save').textContent = 'Save design'; $('#pr-error').hidden = true; }
$('#st-cancel').onclick = resetStone; $('#pr-cancel').onclick = resetPreset;

$('#stone-form').onsubmit = async (e) => {
  e.preventDefault(); const err = $('#st-error'); err.hidden = true; const btn = $('#st-save'); btn.disabled = true;
  try {
    const id = $('#st-id').value, old = STONES_DB.find((x) => x.id === id);
    const row = { name: $('#st-name').value.trim(), kind: $('#st-kind').value, colour: $('#st-colour').value, sort: +$('#st-sort').value || 10, active: $('#st-active').checked,
      photo_url: stPhoto ? await uploadDesignerPhoto(stPhoto) : old?.photo_url || null };
    if (!row.name) throw new Error('Give the stone a name.');
    if (id) must(await sb.from('mw_design_stones').update(row).eq('id', id)); else must(await sb.from('mw_design_stones').insert(row));
    resetStone(); drawDesigner();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { btn.disabled = false; }
};
$('#preset-form').onsubmit = async (e) => {
  e.preventDefault(); const err = $('#pr-error'); err.hidden = true; const btn = $('#pr-save'); btn.disabled = true;
  try {
    const id = $('#pr-id').value, old = PRESETS_DB.find((x) => x.id === id);
    let code = $('#pr-link').value.trim(); try { code = new URL(code).searchParams.get('d') || code; } catch {}
    const design = decodeDesign(code);
    if (!design) throw new Error('That link doesn\'t contain a design. In the designer, use "Copy link to this design" and paste it here.');
    const row = { name: $('#pr-name').value.trim(), brochure_ref: $('#pr-ref').value.trim() || null, design, sort: +$('#pr-sort').value || 10, active: $('#pr-active').checked,
      photo_url: prPhoto ? await uploadDesignerPhoto(prPhoto) : old?.photo_url || null };
    if (!row.name) throw new Error('Give the design a name.');
    if (id) must(await sb.from('mw_design_presets').update(row).eq('id', id)); else must(await sb.from('mw_design_presets').insert(row));
    resetPreset(); drawDesigner();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { btn.disabled = false; }
};
$('[data-pane="designer"]').addEventListener('click', async (e) => {
  const d = e.target.dataset;
  if (d.stEdit) {
    const x = STONES_DB.find((s) => s.id === d.stEdit); resetStone();
    $('#st-id').value = x.id; $('#st-name').value = x.name; $('#st-kind').value = x.kind; $('#st-colour').value = x.colour || '#333333'; $('#st-sort').value = x.sort; $('#st-active').checked = x.active;
    if (x.photo_url) { $('#st-preview').src = x.photo_url; $('#st-preview').hidden = false; }
    $('#st-cancel').hidden = false; $('#st-save').textContent = 'Update stone'; $('#stone-form').scrollIntoView({ behavior: 'smooth' });
  }
  if (d.prEdit) {
    const x = PRESETS_DB.find((s) => s.id === d.prEdit); resetPreset();
    $('#pr-id').value = x.id; $('#pr-name').value = x.name; $('#pr-ref').value = x.brochure_ref || ''; $('#pr-sort').value = x.sort; $('#pr-active').checked = x.active;
    $('#pr-link').value = `${location.origin}${location.pathname.replace(/admin\.html$/, '')}design/?d=${encodeDesign(x.design)}`;
    if (x.photo_url) { $('#pr-preview').src = x.photo_url; $('#pr-preview').hidden = false; }
    $('#pr-cancel').hidden = false; $('#pr-save').textContent = 'Update design'; $('#preset-form').scrollIntoView({ behavior: 'smooth' });
  }
  for (const [k, t] of [['stDel', 'mw_design_stones'], ['prDel', 'mw_design_presets']]) {
    if (!d[k]) continue;
    if (d.sure !== '1') { d.sure = '1'; e.target.textContent = 'Tap again to delete'; return; }
    must(await sb.from(t).delete().eq('id', d[k])); drawDesigner();
  }
});
