// Builds the Scotland hub page (/) and one page per region from data/*.json.
//   node tools/build.mjs
// Runs automatically on GitHub (see .github/workflows/build-pages.yml): whenever the data files
// change, and every couple of hours to pick up newly added jobs.
//
// A region page only goes "live" (indexable, in the Areas menu and sitemap) once it has at least
// site.activateAt published jobs. Until then it still exists (handy for ads or links) but is
// noindex and not linked, so Google never sees thin, near-identical "doorway" pages. Live pages
// get their jobs and reviews written into the HTML, so search engines see real local content.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const { site, hub: HUB, regions, redirects = {} } = read('data/regions.json');
const SERVICES = read('data/services.json');
const { reviews: REVIEWS = [] } = read('data/reviews.json');
export const C = {
  phone: '07827 665296', tel: '+447827665296', whatsapp: '447827665296', email: 'mwallacememorials@gmail.com',
  base: 'Kinross-shire', postcode: 'KY13',
  facebook: 'https://www.facebook.com/p/M-Wallace-Memorials-61556696211749/',
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const H1NAME = { central: 'Stirling &amp; Falkirk', highlands: 'the Highlands', glasgow: 'Glasgow', edinburgh: 'Edinburgh &amp; the Lothians', borders: 'the Scottish Borders' };
const SERVICE_NAME = Object.fromEntries(SERVICES.map((s) => [s.key, s.name]));

// ---------- Published jobs from Supabase ----------
const cfg = readFileSync(join(root, 'js/config.js'), 'utf8');
const SB_URL = cfg.match(/SUPABASE_URL = '([^']+)'/)[1];
const SB_KEY = cfg.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
let JOBS = [];
if (process.env.MOCK_JOBS) JOBS = JSON.parse(readFileSync(process.env.MOCK_JOBS, 'utf8')); // local preview only
else try {
  const r = await fetch(`${SB_URL}/rest/v1/mw_jobs?select=*&published=is.true&order=featured.desc,job_date.desc.nullslast,created_at.desc&limit=500`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  JOBS = (await r.json()).filter((j) => j.photos?.length);
} catch (e) {
  // On GitHub a failed fetch must stop the build, or every region would be switched off.
  if (process.env.CI) { console.error('Could not load jobs:', e.message); process.exit(1); }
  console.warn('Jobs not loaded (offline, or tables not set up yet) — building as if there are none:', e.message);
}
const COUNTS = Object.fromEntries(regions.map((r) => [r.slug, JOBS.filter((j) => j.region === r.slug).length]));
const activateAt = site.activateAt ?? 1;
const isLive = (r) => r.slug === 'scotland' || COUNTS[r.slug] >= activateAt;
const LIVE = regions.filter(isLive);
const REGION_NAME = Object.fromEntries(regions.map((r) => [r.slug, cap(r.name)]));

const jobTitle = (j) => j.title || SERVICE_NAME[j.service] || 'Memorial work';
function workFor(slug) {
  if (!JOBS.length) return { main: [], more: [], title: 'Recent work', sub: '' };
  if (slug === 'scotland') return { main: JOBS.slice(0, 9), more: [], title: 'Recent work across Scotland', sub: 'Memorials we\'ve cleaned, restored and lettered, and what the families said.' };
  const here = JOBS.filter((j) => j.region === slug);
  const others = JOBS.filter((j) => j.region !== slug);
  const name = REGION_NAME[slug].replace(/^The /, 'the ');
  if (!here.length) return { main: others.slice(0, 6), more: [], title: 'Recent work across Scotland', sub: `No ${name} jobs on here yet, so here's some of our recent work elsewhere.` };
  return { main: here, more: here.length < 3 ? others.slice(0, 6 - here.length) : [], title: `Recent work in ${name}`, sub: 'Memorials we\'ve cleaned, restored and lettered nearby, and what the families said.' };
}
const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');
function jobCard(j) {
  const n = j.photos.length;
  const where = [j.cemetery, j.town, REGION_NAME[j.region]].filter(Boolean).join(', ');
  return `<article class="job">
    <button class="job-photo" type="button" data-job="${esc(j.id)}" aria-label="View ${n} photo${n > 1 ? 's' : ''}: ${esc(jobTitle(j))}">
      <img src="${esc(j.photos[0])}" alt="${esc(jobTitle(j))}${j.town ? ' in ' + esc(j.town) : ''}" loading="lazy">
      ${n > 1 ? `<span class="count">${n} photos</span>` : ''}
    </button>
    <div class="job-body">
      <div class="job-meta">${esc(where)}${j.stone ? ' · ' + esc(j.stone) : ''}</div>
      <h3>${esc(jobTitle(j))}</h3>
      ${j.description ? `<p>${esc(j.description)}</p>` : ''}
      ${j.review_text ? `<blockquote class="quote-line">${j.rating ? `<span class="stars" aria-label="${j.rating} out of 5">${stars(j.rating)}</span><br>` : ''}“${esc(j.review_text)}”${j.reviewer_name ? `<cite>${esc(j.reviewer_name)}</cite>` : ''}</blockquote>` : ''}
    </div>
  </article>`;
}
// Reviews: this area's job reviews, this area's Facebook reviews, then everything else. Max 6.
function reviewsFor(slug) {
  const hub = slug === 'scotland';
  const fromJobs = JOBS.filter((j) => j.review_text).map((j) => ({ text: j.review_text, name: j.reviewer_name || 'Customer', rating: j.rating, region: j.region, where: [jobTitle(j), j.town].filter(Boolean).join(', ') }));
  const fb = REVIEWS.map((r) => ({ ...r, where: 'Facebook recommendation', rating: null }));
  const local = hub ? [] : [...fromJobs, ...fb].filter((r) => r.region === slug);
  const rest = [...fromJobs, ...fb].filter((r) => !local.includes(r));
  return [...local, ...rest].slice(0, 6);
}
const reviewCard = (r) => `<blockquote class="review">
            ${r.rating ? `<div class="stars" aria-label="${r.rating} out of 5">${stars(r.rating)}</div>` : '<div class="recommends">✓ Recommends M. Wallace Memorials</div>'}
            <p>“${esc(r.text)}”</p>
            <cite>${esc(r.name)}<span class="where">${esc(r.where)}</span></cite>
          </blockquote>`;

const ICON = {
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L20 7H4zm0 2.3L4 9.3V17h16V9.3z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z"/></svg>',
  fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4a22 22 0 0 0-2.5-.1c-2.4 0-4.1 1.5-4.1 4.2v2.3H7.5V14h2.7v8z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.5A2.5 2.5 0 1 0 12 11.5 2.5 2.5 0 0 0 12 6.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  cam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
};
const WA = (txt) => `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(txt)}`;

function serviceCard(s, up) {
  return `<button class="mat-card" type="button" data-open-mat="${s.key}" aria-haspopup="dialog">
            <img src="${up}${s.card}" alt="" loading="lazy" width="489" height="652">
            <span class="mat-body">
              <span class="mat-kind">${esc(s.kind)}</span>
              <span class="mat-name">${esc(s.name)}</span>
              <span class="mat-line">${esc(s.line)}</span>
              <span class="mat-more">How it's done &amp; examples →</span>
            </span>
          </button>`;
}

function serviceDialog(s, up) {
  return `<dialog class="mat-dialog" id="mat-${s.key}" aria-labelledby="mat-${s.key}-title">
    <div class="md-inner">
      <button class="md-close" type="button" data-close aria-label="Close">×</button>
      <div class="md-head" style="background-image:url('${up}${s.head}')">
        <p class="eyebrow">${esc(s.kind)}</p>
        <h2 id="mat-${s.key}-title">${esc(s.name)}</h2>
      </div>
      <div class="md-body">
        <p>${esc(s.desc)}</p>
        <ul class="md-facts">${s.facts.map((f) => `<li>${ICON.check}${esc(f)}</li>`).join('')}</ul>
        <h3>How it's done</h3>
        <ol class="md-steps">${s.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
        <h3>Examples</h3>
        <div class="md-jobs" data-mat-jobs="${s.key}"></div>
        <div class="md-inspo" data-mat-inspo="${s.key}">
          <p class="muted small">Photos of our finished ${esc(s.name.toLowerCase())} jobs appear here as they're added.</p>
        </div>
        <a class="btn" href="#quote" data-quote-mat="${s.key}">Ask about ${esc(s.name.toLowerCase())}</a>
      </div>
    </div>
  </dialog>`;
}

function page(r) {
  const up = r.path ? '../'.repeat(r.path.split('/').filter(Boolean).length) : '';
  const url = site.url + r.path;
  const hub = r.slug === 'scotland';
  const areaName = esc(H1NAME[r.slug] || r.name);
  const h1 = r.h1 || `Headstone restoration &amp; inscriptions in ${areaName}`;
  const lede = r.lede ? esc(r.lede) : `Memorial cleaning, additional inscriptions and traditional lead lettering in cemeteries and kirkyards across ${r.towns.slice(0, 3).map(esc).join(', ')} and the rest of ${esc(r.name)}.`;
  const work = workFor(r.slug);
  const revs = reviewsFor(r.slug);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: site.name, url,
    description: 'Monumental sculptor: memorial cleaning and restoration, additional inscriptions and traditional lead lettering.',
    image: site.url + r.hero, logo: site.url + 'img/logo-full.png',
    telephone: C.tel, email: C.email,
    address: { '@type': 'PostalAddress', postalCode: C.postcode, addressRegion: 'Perth and Kinross', addressCountry: 'GB' },
    areaServed: hub ? { '@type': 'AdministrativeArea', name: 'Scotland' } : r.towns.map((t) => ({ '@type': 'City', name: t })),
    sameAs: [C.facebook],
  };
  const waText = hub ? 'Hi, I\'d like a quote for some memorial work.' : `Hi, I'd like a quote for some memorial work in ${r.name}.`;

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(r.title)}</title>
  <meta name="description" content="${esc(r.description)}">
  ${site.noindex || !isLive(r) ? '<meta name="robots" content="noindex">' : ''}
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(r.title)}">
  <meta property="og:description" content="${esc(r.description)}">
  <meta property="og:image" content="${site.url}${r.hero}">
  <meta property="og:url" content="${url}">
  <meta name="theme-color" content="#292929">
  <link rel="icon" href="${up}img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Source+Sans+3:wght@300;400;600&display=swap">
  <link rel="preload" as="image" href="${up}${r.hero}">
  <link rel="stylesheet" href="${up}css/style.css">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body data-region="${r.slug}" data-root="${up}">
  <a class="skip" href="#quote">Skip to the enquiry form</a>
  <header class="top">
    <div class="wrap">
      <a class="brand" href="${up || './'}" aria-label="M. Wallace Memorials home">
        <img src="${up}img/monogram.png" alt="" width="97" height="40">
        <span><strong>M. Wallace Memorials</strong><small>Monumental sculptor</small></span>
      </a>
      <nav class="top-nav" aria-label="Page">
        <a href="#services">Services</a>
        <a href="#work" data-work-link${work.main.length ? '' : ' hidden'}>Our work</a>
        <a href="#craft">The craft</a>
        <a href="#reviews">Reviews</a>
        <details class="nav-areas">
          <summary>Areas</summary>
          <ul>
            <li><a href="${up || './'}"${hub ? ' aria-current="page"' : ''}>All of Scotland</a></li>
            ${LIVE.map((o) => `<li><a href="${up}${o.path}"${o.slug === r.slug ? ' aria-current="page"' : ''}>${esc(cap(o.name))}</a></li>`).join('\n            ')}
          </ul>
        </details>
      </nav>
      <div class="top-cta">
        <a class="top-phone" href="tel:${C.tel}">${ICON.phone}<span>${C.phone}</span></a>
        <a class="btn small" href="#quote">Free quote</a>
      </div>
    </div>
  </header>

  <main>
    <section class="hero" style="background-image:url('${up}${r.hero}')">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">Monumental sculptor · Based in ${C.base}</p>
          <h1>${h1}</h1>
          <p class="lede">${lede}</p>
          <ul class="ticks">
            <li>${ICON.check}Cleaning and restoration of granite, marble and sandstone</li>
            <li>${ICON.check}New names added to existing stones, lettering matched</li>
            <li>${ICON.check}Traditional raised and flush lead lettering, by hand</li>
          </ul>
          <div class="hero-actions">
            <a class="btn light" href="tel:${C.tel}">${ICON.phone}Call ${C.phone}</a>
            <a class="btn ghost-light" href="${WA(waText)}" target="_blank" rel="noopener">${ICON.wa}WhatsApp a photo</a>
          </div>
        </div>

        <form class="quote card" id="quote" novalidate>
          <h2>Ask for a free quote</h2>
          <p class="muted">Tell us about the stone and what you'd like done. A photo helps us price it.</p>
          <div class="field"><label for="q-name">Your name</label><input id="q-name" name="name" autocomplete="name" required></div>
          <div class="row2">
            <div class="field"><label for="q-phone">Phone</label><input id="q-phone" name="phone" type="tel" autocomplete="tel" required></div>
            <div class="field"><label for="q-email">Email</label><input id="q-email" name="email" type="email" autocomplete="email" required></div>
          </div>
          <div class="field"><label for="q-type">What would you like done?</label>
            <select id="q-type" name="service">
              ${SERVICES.map((s) => `<option value="${s.key}">${esc(s.name)}</option>`).join('')}
              <option value="not-sure">Not sure yet</option>
            </select>
          </div>
          <div class="field"><label for="q-cemetery">Cemetery or churchyard, and town</label><input id="q-cemetery" name="cemetery" required placeholder="${hub ? 'e.g. Kinross West Cemetery' : `e.g. ${esc(r.towns[0])} Cemetery`}"></div>
          <div class="field"><label for="q-msg">Anything else? <span class="opt">(optional)</span></label><textarea id="q-msg" name="message" rows="3" placeholder="Wording for a new inscription, the type of stone, when you'd like it done…"></textarea></div>
          <div class="field"><span class="label">Photos of the stone <span class="opt">(optional, up to 3)</span></span>
            <label class="photo-btn"><input type="file" id="q-photos" accept="image/*" multiple>${ICON.cam}<span>Add photos</span></label>
            <div class="q-thumbs" id="q-thumbs"></div>
          </div>
          <div class="hp" aria-hidden="true"><label>Leave blank <input name="company" tabindex="-1" autocomplete="off"></label></div>
          <button class="btn block" type="submit">Send my enquiry</button>
          <p class="fine">We'll only use your details to reply about this enquiry. <a href="${up}privacy.html">Privacy</a></p>
          <div class="form-msg" role="status" aria-live="polite"></div>
        </form>
      </div>
    </section>

    <section class="strip" aria-label="About M. Wallace Memorials">
      <div class="wrap strip-grid">
        <div><strong>Done by hand</strong><span>Traditional lead lettering &amp; letter cutting</span></div>
        <div><strong>On site</strong><span>Work carried out in the cemetery</span></div>
        <div><strong>Any stone</strong><span>Granite, marble &amp; sandstone</span></div>
        <div><strong>100% recommended</strong><span>by customers on Facebook</span></div>
      </div>
    </section>

    <section id="work"${work.main.length ? '' : ' hidden'}>
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">Recent work</p>
          <h2 data-work-title>${esc(work.title)}</h2>
          <p data-work-sub>${esc(work.sub)}</p>
        </div>
        <div class="jobs" id="jobs" aria-live="polite">${work.main.map(jobCard).join('')}</div>
        <div class="more-head" id="more-head"${work.more.length ? '' : ' hidden'}><h3>Elsewhere in Scotland</h3></div>
        <div class="jobs" id="jobs-more">${work.more.map(jobCard).join('')}</div>
      </div>
    </section>

    <section id="services" class="alt">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">What we do</p>
          <h2>Caring for family memorials</h2>
          <p>Tap a service to see how it's done and examples of finished work.</p>
        </div>
        <div class="mat-grid">
          ${SERVICES.map((s) => serviceCard(s, up)).join('\n          ')}
          <a class="mat-card cta-card" href="#quote">
            <span class="mat-body">
              <span class="mat-kind">Not sure?</span>
              <span class="mat-name">Send us a photo</span>
              <span class="mat-line">Tell us which cemetery the stone is in and what you'd like, and we'll tell you what's involved.</span>
              <span class="mat-more">Ask a question →</span>
            </span>
          </a>
        </div>
      </div>
    </section>

    <section id="craft" class="dark">
      <div class="wrap craft-grid">
        <div class="craft-copy">
          <p class="eyebrow">The craft</p>
          <h2>How raised lead lettering is done</h2>
          <ol class="craft-steps">
            <li><strong>Drawn by hand.</strong> The inscription is drawn straight onto the stone, matched as closely as possible to the letters already there.</li>
            <li><strong>Anchored.</strong> Three to five small holes are drilled into each letter, angled up and down so the lead grips like a fish tail.</li>
            <li><strong>Beaten in.</strong> Lead is hammered into each letter and flattened to the right thickness, then the inscription is drawn back on.</li>
            <li><strong>Cut round.</strong> Every letter is trimmed with hand-made chisels of different sizes, with the curves shaped by eye.</li>
          </ol>
          <a class="btn light" href="#quote">Ask about lead lettering</a>
        </div>
        <div class="craft-photos">
          <img src="${up}img/hand-lettering.jpg" alt="Mark lettering a headstone by hand in a churchyard" loading="lazy" width="489" height="652">
          <img src="${up}img/old-lettering-2.jpg" alt="Old hand-cut lettering on a weathered sandstone headstone" loading="lazy" width="489" height="652">
        </div>
      </div>
    </section>

    <section class="alt" id="how">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">How it works</p><h2>From enquiry to finished stone</h2></div>
        <ol class="steps">
          <li><span>1</span><h3>Get in touch</h3><p>Use the form, call ${C.phone} or WhatsApp us. Tell us which cemetery the stone is in, and add a photo if you can.</p></li>
          <li><span>2</span><h3>Your price</h3><p>We look at the stone and the lettering, talk you through what's involved and give you a price.</p></li>
          <li><span>3</span><h3>Work on site</h3><p>The work is carried out in the cemetery, come rain or shine, so the stone stays where it is.</p></li>
          <li><span>4</span><h3>Finished</h3><p>A clean, readable memorial, with new lettering that looks as if it was always there.</p></li>
        </ol>
        <div class="factory">
          <img src="${up}img/van-frost.jpg" alt="The M. Wallace Memorials van in a cemetery on a frosty morning" loading="lazy" width="870" height="652">
          <img src="${up}img/van-cemetery.jpg" alt="The M. Wallace Memorials van at a cemetery" loading="lazy" width="870" height="652">
        </div>
      </div>
    </section>

    <section id="reviews">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">Reviews</p><h2>What families say</h2></div>
        <div class="reviews" id="review-list">
          ${revs.map(reviewCard).join('\n          ')}
        </div>
        <p class="center"><a class="btn ghost" href="${C.facebook}" target="_blank" rel="noopener">${ICON.fb}See us on Facebook</a></p>
      </div>
    </section>

    <section class="alt" id="areas">
      <div class="wrap">
        <div class="areas">
          <div>
            <p class="eyebrow">Areas we cover</p>
            <h2>${esc(cap(r.name))}</h2>
            <p>${esc(r.local)}</p>
            ${hub ? '' : `<ul class="towns">${r.towns.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`}
          </div>
          ${hub ? `<div class="card all-areas">
            <h3>Across Scotland</h3>
            <ul>${regions.map((o) => isLive(o)
              ? `<li><a href="${o.path}">${esc(cap(o.name))}</a> <small>${COUNTS[o.slug]} job${COUNTS[o.slug] === 1 ? '' : 's'}</small></li>`
              : `<li><span>${esc(cap(o.name))}</span></li>`).join('')}</ul>
          </div>` : `<div class="card all-areas">
            <h3>Elsewhere</h3>
            <ul><li><a href="${up}">All of Scotland</a></li>${LIVE.filter((o) => o.slug !== r.slug).map((o) => `<li><a href="${up}${o.path}">${esc(cap(o.name))}</a></li>`).join('')}</ul>
          </div>`}
        </div>
      </div>
    </section>

    <section class="cta-band" style="background-image:url('${up}img/van-field.jpg')">
      <div class="wrap">
        <h2>Ready to talk about a stone?</h2>
        <p>A photo and the name of the cemetery are all we need to get started.</p>
        <div class="hero-actions center">
          <a class="btn light" href="#quote">Ask for a free quote</a>
          <a class="btn ghost-light" href="tel:${C.tel}">${ICON.phone}${C.phone}</a>
        </div>
      </div>
    </section>
  </main>

  <footer class="foot">
    <div class="wrap foot-grid">
      <div>
        <img class="foot-logo" src="${up}img/logo-full.png" alt="M. Wallace Memorials, monumental sculptor" width="239" height="151">
        <p>Memorial restoration, additional inscriptions and lead lettering.<br>Based in ${C.base} (${C.postcode}), working across Scotland.</p>
      </div>
      <div>
        <p><a href="tel:${C.tel}">${ICON.phone}${C.phone}</a><br><a href="mailto:${C.email}">${ICON.mail}${C.email}</a><br><a href="${WA('Hi, I\'d like a quote for some memorial work.')}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a></p>
        <p class="social"><a href="${C.facebook}" aria-label="Facebook" rel="noopener" target="_blank">${ICON.fb}</a></p>
      </div>
    </div>
    <div class="wrap foot-base"><span>© <span data-year></span> M. Wallace Memorials</span><a href="${up}privacy.html">Privacy</a><a href="${up}admin.html" rel="nofollow">Staff</a></div>
  </footer>

  <div class="mobile-bar">
    <a href="tel:${C.tel}">${ICON.phone}Call</a>
    <a href="${WA(waText)}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a>
    <a href="#quote" class="primary">Free quote</a>
  </div>

  ${SERVICES.map((s) => serviceDialog(s, up)).join('\n  ')}

  <dialog class="lightbox" id="lightbox">
    <button class="lb-close" type="button" aria-label="Close">×</button>
    <button class="lb-prev" type="button" aria-label="Previous photo">‹</button>
    <img alt="">
    <button class="lb-next" type="button" aria-label="Next photo">›</button>
    <p class="lb-cap"></p>
  </dialog>

  <script type="module" src="${up}js/site.js"></script>
</body>
</html>
`;
}

const all = [HUB, ...regions];
for (const r of all) {
  const out = join(root, r.path, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page(r));
}
console.log(`wrote hub + ${regions.length} region pages; live: ${LIVE.map((r) => `${r.slug} (${COUNTS[r.slug]})`).join(', ') || 'none yet'}`);

for (const [from, to] of Object.entries(redirects)) {
  const out = join(root, from, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  const rel = '../'.repeat(from.split('/').filter(Boolean).length) + to;
  writeFileSync(out, `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="${site.url}${to}"><meta http-equiv="refresh" content="0; url=${rel}"><title>Moved</title><a href="${rel}">This page has moved</a>\n`);
}

// Region + service lists for the staff page and site (single source of truth)
writeFileSync(join(root, 'js/regions.js'), `// Generated by tools/build.mjs from data/*.json. Don't edit by hand.
export const REGIONS = ${JSON.stringify(Object.fromEntries([['scotland', 'Scotland'], ...regions.map((r) => [r.slug, cap(r.name)]), ['elsewhere', 'Elsewhere in the UK']]), null, 2)};
export const TOWNS = ${JSON.stringify(Object.fromEntries(regions.map((r) => [r.slug, r.towns])))};
export const SERVICES = ${JSON.stringify(SERVICES.map(({ key, name, keywords }) => ({ key, name, keywords })))};
export const REVIEWS = ${JSON.stringify(REVIEWS)};
`);

const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[HUB, ...LIVE].map((r) => `  <url><loc>${site.url}${r.path}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(root, 'robots.txt'), site.noindex
  ? 'User-agent: *\nDisallow: /admin.html\n'
  : `User-agent: *\nDisallow: /admin.html\nSitemap: ${site.url}sitemap.xml\n`);
console.log('wrote js/regions.js, sitemap.xml, robots.txt');
