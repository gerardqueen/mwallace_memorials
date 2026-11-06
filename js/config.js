// M. Wallace Memorials landing pages — settings.
// The anon key is meant to be public: the database rules in supabase/*.sql decide what the
// public can read and write. Every table, bucket and function for this site is prefixed mw_ /
// mw-, and staff access is its own list (mw_admins), so it can share a Supabase project with
// other sites without either seeing the other's data. To move it to its own project, change
// these two lines, run the SQL there, and deploy the function.
// Region and service lists live in js/regions.js (generated from data/*.json by tools/build.mjs).
export const SUPABASE_URL = 'https://bzgnlzsdyjwjfpsexquz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6Z25senNkeWp3amZwc2V4cXV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwODk3ODEsImV4cCI6MjEwODY2NTc4MX0.UunT_CdsnPyMeRzuIoom6n1R2mBzNnlY5Bwh9v_0NjA';

export const SETTINGS = {
  // Top a region up with jobs from elsewhere in Scotland when it has fewer than this.
  minJobsPerRegion: 3,
  // Photos a customer can attach to an enquiry.
  maxEnquiryPhotos: 3,
  // Fallbacks if the database can't be reached when someone sends the form.
  email: 'mwallacememorials@gmail.com',
  phone: '07827 665296',
  whatsapp: '447827665296',
};
