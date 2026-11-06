// M. Wallace Memorials — email alert for new enquiries from the landing pages.
// Supabase Edge Function "mw-enquiry-alert" (Verify JWT on; the public anon key is enough).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  – already set if another site in this project uses Resend
//   MW_ALERT_TO     – where M. Wallace enquiries go, e.g. mwallacememorials@gmail.com (required)
//   MW_ALERT_FROM   – optional, e.g. "M. Wallace Memorials <enquiries@yourdomain>" once a domain is verified
//   MW_SITE_URL     – optional, for the link to the staff page
// It deliberately never falls back to another site's ALERT_TO, so these can't go to the wrong business.
//
// It ignores what it is sent and only emails enquiries that haven't been emailed yet, so
// calling it can never send anything other than a real, unsent enquiry.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const SERVICE: Record<string, string> = {
  restoration: 'Cleaning & restoration', inscriptions: 'Additional inscription', lead: 'Lead lettering',
  gilding: 'Gold leaf & painting', bespoke: 'Plaque / bespoke stone', 'not-sure': 'Not sure yet',
};
const REGION: Record<string, string> = {
  scotland: 'All of Scotland', perth: 'Perth & Kinross', fife: 'Fife', edinburgh: 'Edinburgh & the Lothians',
  dundee: 'Dundee & Angus', central: 'Stirling, Falkirk & Clackmannanshire', glasgow: 'Glasgow & Dunbartonshire',
  lanarkshire: 'Lanarkshire', renfrewshire: 'Renfrewshire & Inverclyde', ayrshire: 'Ayrshire & Arran',
  dumfries: 'Dumfries & Galloway', borders: 'Scottish Borders', aberdeen: 'Aberdeen & Aberdeenshire',
  highlands: 'Highlands & Moray', argyll: 'Argyll & Bute',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const key = Deno.env.get('RESEND_API_KEY') ?? Deno.env.get('Resend_API_Key') ?? Deno.env.get('RESEND_API_key');
  const to = (Deno.env.get('MW_ALERT_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key || !to.length) return json({ ok: false, reason: 'RESEND_API_KEY or MW_ALERT_TO not set yet' });

  const from = Deno.env.get('MW_ALERT_FROM') ?? 'M. Wallace Memorials website <onboarding@resend.dev>';
  const site = Deno.env.get('MW_SITE_URL') ?? 'https://gerardqueen.github.io/mwallace_memorials/';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))!);

  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data: rows, error } = await db.from('mw_enquiries').select('*')
    .is('notified_at', null).gte('created_at', since).order('created_at').limit(20);
  if (error) return json({ ok: false, error: error.message }, 500);

  const sent: string[] = [], failed: string[] = [];
  for (const e of rows ?? []) {
    const { data: claimed } = await db.from('mw_enquiries').update({ notified_at: new Date().toISOString() })
      .eq('id', e.id).is('notified_at', null).select('id');
    if (!claimed?.length) continue;

    // Photos are private; send week-long links so they can be opened from the email.
    let links: string[] = [];
    if (e.photos?.length) {
      const { data } = await db.storage.from('mw-enquiry-photos').createSignedUrls(e.photos, 7 * 86400);
      links = (data ?? []).map((d) => d.signedUrl).filter(Boolean) as string[];
    }
    const what = SERVICE[e.service] ?? e.service ?? 'memorial work';
    const subject = `Enquiry: ${what} – ${e.name}${e.cemetery ? ` (${e.cemetery})` : ''}`;
    const rowsHtml = [
      ['Name', esc(e.name)],
      ['Phone', e.phone ? `<a href="tel:${esc(e.phone)}">${esc(e.phone)}</a>` : '—'],
      ['Email', `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>`],
      ['Wants', esc(what)],
      ['Where', esc(e.cemetery ?? '—')],
      ['Page', esc(REGION[e.region] ?? e.region ?? '')],
      ['Message', e.message ? esc(e.message).replace(/\n/g, '<br>') : '—'],
    ].map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 0">${v}</td></tr>`).join('');
    const photosHtml = links.length
      ? `<p style="margin:16px 0 6px;color:#666">Photos (links work for 7 days):</p><p>${links.map((u, i) => `<a href="${esc(u)}"><img src="${esc(u)}" alt="Photo ${i + 1}" width="160" style="border-radius:4px;margin:0 6px 6px 0"></a>`).join('')}</p>`
      : '';
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px">
      <h2 style="color:#292929;margin:0 0 12px">New enquiry from the website</h2>
      <table style="border-collapse:collapse">${rowsHtml}</table>${photosHtml}
      <p style="margin-top:18px">Reply to this email to answer the customer directly, or
      <a href="${esc(site)}admin.html">open the staff page</a> to mark it done.</p></div>`;
    const text = `New enquiry from the website\n\nName: ${e.name}\nPhone: ${e.phone ?? '-'}\nEmail: ${e.email}\n` +
      `Wants: ${what}\nWhere: ${e.cemetery ?? '-'}\nPage: ${REGION[e.region] ?? e.region ?? ''}\nMessage: ${e.message ?? '-'}\n` +
      (links.length ? `\nPhotos (7 days):\n${links.join('\n')}\n` : '') + `\nStaff page: ${site}admin.html`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, reply_to: e.email, subject, html, text }),
    });
    if (res.ok) sent.push(e.id);
    else {
      failed.push(`${e.id}: ${res.status} ${await res.text()}`);
      await db.from('mw_enquiries').update({ notified_at: null }).eq('id', e.id);
    }
  }
  return json({ ok: failed.length === 0, sent: sent.length, failed });
});
