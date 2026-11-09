# M. Wallace Memorials: regional landing pages

An enquiry-focused site for M. Wallace Memorials (monumental sculptor), built on the same pattern as the Granite Systems landing pages. The business is split into two teams, so the site is too:

| Page | Path | Base | Enquiry email |
|---|---|---|---|
| Home (both teams) | `/` | Cumbernauld & Kinross | customer picks a side, or "not sure" goes to both |
| West Scotland | `/west/` | Cumbernauld | mwallacememorials@live.co.uk |
| East Scotland | `/east/` | Kinross | mwallacememorials@gmail.com |

The old area addresses (`/fife/`, `/glasgow/`, …) redirect to the right team's page.

Every page has: a hero with the enquiry form (customers can attach up to 3 photos), Call and WhatsApp buttons, before/after restorations, recent work (once real jobs exist, that team's first), six clickable **services** including **New bespoke memorials** (which links to the design brochure with a short "how to choose" guide and adds a "designs you like" box to the form), a lead-lettering section, how it works, reviews, and both teams' contact details.

Plain HTML/CSS/JS, no build server. GitHub Pages hosts it; Supabase stores jobs, photos and enquiries.

## Where the content came from

Everything is from the M. Wallace Memorials Facebook page (4 Nov 2026): services from the bio and posts, contact details (07827 665296, mwallacememorials@gmail.com, KY13), the five Facebook recommendations, the logo, and photos. **Before going live, ask Mark to check the wording**, especially the area paragraphs in `data/regions.json` and the service text in `data/services.json`.

The photos in `img/` were captured from Facebook at screen resolution, so they're fine for a preview but soft on big screens. Ask Mark for the original before/after photos and add them as jobs (below), and swap the originals into `img/` with the same file names.

## Reviews by area

No Google Business Profile turned up for the business, and none of the five Facebook recommendations says where the job was. They're in `data/reviews.json` with `"region": null`, so they show on every page. Once Mark says where each job was, set its `region` to `"west"` or `"east"` on GitHub and it moves to the top of that area's page. Reviews added with a job in the staff page are tied to that job's area automatically.

## Adding a job (staff, about 1 minute, on a phone)

1. Open **`/admin.html`** and sign in. Tip: *Add to Home Screen* makes it feel like an app.
2. **Take photo** or **Choose photos** (before and after works best). Tap a photo to make it the cover.
3. Pick the **Area** (West or East) and **Work done** (town, cemetery and stone type are optional but help). The job shows on that area's page and in that service's pop-up on every page.
4. Optionally add the family's review and star rating, only if they're happy for it to go online (the tick box is required).
5. **Save job**.

Enquiries appear under **Enquiries** (with the customer's photos) and are emailed (see below).

## One-off setup

1. **Database**: Supabase → SQL Editor → run `supabase/001_schema.sql`, then `supabase/002_west_east.sql`. Everything is prefixed `mw_`, with its own staff list (`mw_admins`), so it's safe in the same project as Second Cut Stone / Granite Systems: staff of one site can't see the other's jobs or enquiries. (To give it a project of its own instead, run the SQL there and change the two lines in `js/config.js`.)
2. **First admin**: open `/admin.html`, create an account and confirm the email, then run the commented `insert into public.mw_admins …` line at the bottom of the SQL with that email. Approve anyone else from the Staff tab.
3. **Email alerts**: Supabase → Edge Functions → Deploy new function → name it `mw-enquiry-alert` → paste `supabase/functions/mw-enquiry-alert/index.ts`. Add the secret **`MW_ALERT_TO`** (e.g. `mwallacememorials@gmail.com`). It reuses `RESEND_API_KEY` but never falls back to the Granite `ALERT_TO`, so enquiries can't go to the wrong business. Resend's test sender (`onboarding@resend.dev`) only delivers to the Resend account owner's address, so until a domain is verified in Resend, set `MW_ALERT_TO` to that address, or verify a domain and set `MW_ALERT_FROM`.
4. **GitHub Pages**: Settings → Pages → Deploy from branch → `main` / root.

## Rebuilding

Both team pages are always live. The **Build region pages** action rebuilds every 2 hours so new jobs are written into the pages for Google; to do it straight away: Actions → Build region pages → Run workflow.

## Email routing

`mw-enquiry-alert` sends West enquiries to `MW_ALERT_TO_WEST`, East to `MW_ALERT_TO_EAST`, and "not sure" to both. Until those secrets are set, everything goes to `MW_ALERT_TO` with `[West]`/`[East]` in the subject. Resend's test sender only delivers to the Resend account owner, so verify a domain in Resend, set `MW_ALERT_FROM`, then add the two team addresses.

## Going live on a domain

1. In `data/regions.json` set `site.url` to the domain and `"noindex": false`, then run `node tools/build.mjs` (or let the action do it).
2. Add a `CNAME` file containing the domain and point DNS at GitHub Pages (A records `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`, plus a `www` CNAME to `gerardqueen.github.io`).
3. Settings → Pages → Custom domain → Enforce HTTPS.
4. Submit `sitemap.xml` in Google Search Console. Setting up a Google Business Profile (service-area business, KY13) is the single biggest win for local search and gives Mark somewhere to collect Google reviews.

## Files

| Path | What |
|---|---|
| `tools/build.mjs` | Page template; generates every area page, `js/regions.js` and the sitemap |
| `data/regions.json` | The two teams: base, email, copy, towns, hero image; old-page redirects |
| `data/services.json` | The six services: text, facts, how it's done |
| `data/reviews.json` | Facebook recommendations (set `region` per review) |
| `js/site.js` | Live jobs and reviews; enquiry form with photo upload |
| `js/admin.js`, `admin.html` | Staff page: add/edit jobs, enquiries, staff approvals |
| `js/config.js` | Supabase keys, contact fallbacks |
| `css/style.css` | All styles |
| `supabase/` | SQL and the email alert function |
