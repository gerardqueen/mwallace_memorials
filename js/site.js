// Public landing pages: live jobs + reviews, service pop-ups, and the enquiry form.
// Plain fetch() to Supabase's REST API so the public pages stay light (no client library).
import { SUPABASE_URL, SUPABASE_ANON_KEY, SETTINGS } from './config.js';
import { REGIONS, SERVICES, REVIEWS } from './regions.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REGION = document.body.dataset.region;
const HUB = REGION === 'scotland';
const inRegion = (j) => HUB || j.region === REGION;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');
const SERVICE_NAME = Object.fromEntries(SERVICES.map((s) => [s.key, s.name]));
const tel = SETTINGS.phone.replace(/\s/g, '');

$$('[data-year]').forEach((e) => (e.textContent = new Date().getFullYear()));

// ---------------- Jobs ----------------
let ALL = [];
const serviceOf = (j) => j.service || SERVICES.find((s) => s.keywords.some((k) => `${j.title} ${j.description}`.toLowerCase().includes(k)))?.key || null;
const jobTitle = (j) => j.title || SERVICE_NAME[j.service] || 'Memorial work';

async function loadJobs() {
  try {
    const q = 'select=*&published=is.true&order=featured.desc,job_date.desc.nullslast,created_at.desc&limit=200';
    const r = await fetch(`${SUPABASE_URL}/rest/v1/mw_jobs?${q}`, { headers: H });
    if (!r.ok) throw new Error(r.status);
    ALL = (await r.json()).filter((j) => j.photos?.length).map((j) => ({ ...j, svc: serviceOf(j) }));
  } catch (e) { console.warn('Jobs not loaded', e); return; } // keep whatever was built into the page
  ALL.forEach((j) => (BY_ID[j.id] = j));
  renderWork();
  renderReviews();
  renderServiceJobs();
}

const BY_ID = {};
function card(j) {
  const n = j.photos.length;
  const where = [j.cemetery, j.town, REGIONS[j.region]].filter(Boolean).join(', ');
  return `<article class="job">
    <button class="job-photo" type="button" data-job="${esc(j.id)}" aria-label="View ${n} photo${n > 1 ? 's' : ''}: ${esc(jobTitle(j))}">
      <img src="${esc(j.photos[0])}" alt="${esc(jobTitle(j))}${j.town ? ' in ' + esc(j.town) : ''}" loading="lazy">
      ${n > 1 ? `<span class="count">${n} photos</span>` : ''}
    </button>
    <div class="job-body">
      <div class="job-meta">${esc(where || 'Recent job')}${j.stone ? ' · ' + esc(j.stone) : ''}</div>
      <h3>${esc(jobTitle(j))}</h3>
      ${j.description ? `<p>${esc(j.description)}</p>` : ''}
      ${j.review_text ? `<blockquote class="quote-line">${j.rating ? `<span class="stars" aria-label="${j.rating} out of 5">${stars(j.rating)}</span><br>` : ''}“${esc(j.review_text)}”${j.reviewer_name ? `<cite>${esc(j.reviewer_name)}</cite>` : ''}</blockquote>` : ''}
    </div>
  </article>`;
}

// "Recent work" only appears once there are real jobs, so an area page never claims work it doesn't have.
function renderWork() {
  if (!ALL.length) return;
  const here = HUB ? ALL.slice(0, 9) : ALL.filter(inRegion);
  const more = !HUB && here.length < SETTINGS.minJobsPerRegion ? ALL.filter((j) => !inRegion(j)).slice(0, 6 - here.length) : [];
  const name = REGIONS[REGION].replace(/^The /, 'the ');
  $('[data-work-title]').textContent = HUB ? 'Recent work across Scotland' : here.length ? `Recent work in ${name}` : 'Recent work across Scotland';
  $('[data-work-sub]').textContent = here.length
    ? 'Memorials we\'ve cleaned, restored and lettered nearby, and what the families said.'
    : `No ${name} jobs on here yet, so here's some of our recent work elsewhere.`;
  $('#jobs').innerHTML = (here.length ? here : more).map(card).join('');
  $('#more-head').hidden = !(here.length && more.length);
  $('#jobs-more').innerHTML = here.length && more.length ? more.map(card).join('') : '';
  $('#work').hidden = false;
  $$('[data-work-link]').forEach((a) => (a.hidden = false));
}

// Reviews: this area's first (from jobs, then Facebook), then the rest. At most 6.
function renderReviews() {
  const fromJobs = ALL.filter((j) => j.review_text).map((j) => ({ text: j.review_text, name: j.reviewer_name || 'Customer', rating: j.rating, region: j.region, where: [jobTitle(j), j.town].filter(Boolean).join(', ') }));
  if (!fromJobs.length) return;
  const fb = REVIEWS.map((r) => ({ ...r, where: 'Facebook recommendation', rating: null }));
  const local = HUB ? [] : [...fromJobs, ...fb].filter((r) => r.region === REGION);
  const list = [...local, ...[...fromJobs, ...fb].filter((r) => !local.includes(r))].slice(0, 6);
  $('#review-list').innerHTML = list.map((r) => `<blockquote class="review">
    ${r.rating ? `<div class="stars" aria-label="${r.rating} out of 5">${stars(r.rating)}</div>` : '<div class="recommends">✓ Recommends M. Wallace Memorials</div>'}
    <p>“${esc(r.text)}”</p>
    <cite>${esc(r.name)}<span class="where">${esc(r.where)}</span></cite>
  </blockquote>`).join('');
}

// ---------------- Service pop-ups ----------------
function renderServiceJobs() {
  for (const box of $$('[data-mat-jobs]')) {
    const key = box.dataset.matJobs;
    const jobs = [...ALL.filter((j) => j.svc === key && inRegion(j)), ...ALL.filter((j) => j.svc === key && !inRegion(j))].slice(0, 12);
    if (!jobs.length) continue;
    box.innerHTML = jobs.map((j) => `<button class="md-job" type="button" data-job="${esc(j.id)}"><img src="${esc(j.photos[0])}" alt="${esc(jobTitle(j))}" loading="lazy"><span>${esc([j.cemetery || j.town, REGIONS[j.region]].filter(Boolean).join(' · '))}</span></button>`).join('');
    const inspo = $(`[data-mat-inspo="${key}"]`); if (inspo) inspo.hidden = true;
  }
}
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open-mat]');
  if (open) { const d = $(`#mat-${open.dataset.openMat}`); d.showModal(); d.querySelector('.md-inner').scrollTop = 0; return; }
  const close = e.target.closest('.mat-dialog [data-close]');
  if (close) { close.closest('dialog').close(); return; }
  const quote = e.target.closest('[data-quote-mat]');
  if (quote) { $('#q-type').value = quote.dataset.quoteMat; quote.closest('dialog').close(); }
});
$$('.mat-dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

// ---------------- Lightbox ----------------
const lb = $('#lightbox');
let cur = { job: null, i: 0 };
function show() {
  const j = cur.job; const n = j.photos.length;
  $('img', lb).src = j.photos[cur.i];
  $('img', lb).alt = jobTitle(j);
  $('.lb-cap', lb).textContent = `${jobTitle(j)}${j.town ? ' · ' + j.town : ''}${n > 1 ? ` · ${cur.i + 1}/${n}` : ''}`;
  $('.lb-prev', lb).hidden = $('.lb-next', lb).hidden = n < 2;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-job]');
  if (!b) return;
  const job = BY_ID[b.dataset.job]; if (!job) return;
  cur = { job, i: 0 }; show(); lb.showModal();
});
$('.lb-close', lb).onclick = () => lb.close();
$('.lb-prev', lb).onclick = () => { cur.i = (cur.i - 1 + cur.job.photos.length) % cur.job.photos.length; show(); };
$('.lb-next', lb).onclick = () => { cur.i = (cur.i + 1) % cur.job.photos.length; show(); };
lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
lb.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') $('.lb-prev', lb).click();
  if (e.key === 'ArrowRight') $('.lb-next', lb).click();
});
let tx = 0;
lb.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
lb.addEventListener('touchend', (e) => { const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) (d > 0 ? $('.lb-prev', lb) : $('.lb-next', lb)).click(); });

// ---------------- Enquiry photos ----------------
let PHOTOS = []; // File[]
function drawThumbs() {
  $('#q-thumbs').innerHTML = PHOTOS.map((f, i) => `<span class="q-thumb"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-rm="${i}" aria-label="Remove photo">×</button></span>`).join('');
  $('.photo-btn span').textContent = PHOTOS.length ? 'Add another' : 'Add photos';
  $('.photo-btn').hidden = PHOTOS.length >= SETTINGS.maxEnquiryPhotos;
}
$('#q-photos').addEventListener('change', (e) => {
  for (const f of e.target.files) if (f.type.startsWith('image/') && PHOTOS.length < SETTINGS.maxEnquiryPhotos) PHOTOS.push(f);
  e.target.value = ''; drawThumbs();
});
$('#q-thumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { PHOTOS.splice(+b.dataset.rm, 1); drawThumbs(); } });

async function compress(file, maxSide = 1600, q = 0.8) {
  let img = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!img) img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', q));
}
async function uploadPhoto(file) {
  const path = `enq/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.jpg`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/mw-enquiry-photos/${path}`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: await compress(file),
  });
  if (!r.ok) throw new Error(`photo ${r.status}`);
  return path;
}

// ---------------- Enquiry form ----------------
const form = $('#quote');
const msg = $('.form-msg', form);
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'form-msg'; msg.textContent = '';
  const f = Object.fromEntries(new FormData(form));
  if (f.company) return; // bot filled the hidden field
  let bad = null;
  for (const k of ['name', 'phone', 'email', 'cemetery']) {
    const el = form.elements[k];
    const ok = el.value.trim() && (k !== 'email' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value.trim()));
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    if (!ok && !bad) bad = el;
  }
  if (bad) { msg.className = 'form-msg err'; msg.textContent = 'Please fill in your name, phone, a valid email and where the stone is.'; bad.focus(); return; }

  const btn = $('button[type=submit]', form); btn.disabled = true;
  const row = {
    name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), service: f.service,
    cemetery: f.cemetery.trim(), message: f.message?.trim() || null, region: REGION, page: location.pathname, photos: [],
  };
  try {
    for (let i = 0; i < PHOTOS.length; i++) {
      btn.textContent = `Uploading photo ${i + 1} of ${PHOTOS.length}…`;
      try { row.photos.push(await uploadPhoto(PHOTOS[i])); } catch (err) { console.warn(err); }
    }
    if (PHOTOS.length && row.photos.length < PHOTOS.length) row.message = [row.message, `(${PHOTOS.length - row.photos.length} photo(s) didn't upload; ask the customer to WhatsApp them.)`].filter(Boolean).join('\n\n');
    btn.textContent = 'Sending…';
    const r = await fetch(`${SUPABASE_URL}/rest/v1/mw_enquiries`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    // Email alert. Never blocks the customer; a daily job retries anything unsent.
    fetch(`${SUPABASE_URL}/functions/v1/mw-enquiry-alert`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    form.classList.add('sent');
    msg.className = 'form-msg ok';
    msg.innerHTML = `<strong>Thank you ${esc(row.name.split(' ')[0])}, that's with us.</strong><br>We'll be in touch soon. If you'd rather talk, call <a href="tel:${tel}">${SETTINGS.phone}</a>.`;
    $('h2', form).textContent = 'Enquiry sent';
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    console.error(err);
    const body = encodeURIComponent(`Name: ${row.name}\nPhone: ${row.phone}\nWhat: ${SERVICE_NAME[row.service] || row.service}\nWhere: ${row.cemetery}\n\n${row.message || ''}`);
    msg.className = 'form-msg err';
    msg.innerHTML = `Sorry, that didn't send. Please call <a href="tel:${tel}">${SETTINGS.phone}</a>, <a href="https://wa.me/${SETTINGS.whatsapp}" target="_blank" rel="noopener">WhatsApp us</a> or <a href="mailto:${SETTINGS.email}?subject=${encodeURIComponent('Memorial enquiry')}&body=${body}">email your details</a>.`;
  } finally {
    btn.disabled = false; btn.textContent = 'Send my enquiry';
  }
});

loadJobs();

document.addEventListener('click', (e) => {
  $$('details.nav-areas[open]').forEach((d) => { if (!d.contains(e.target) || e.target.closest('a')) d.open = false; });
});
