/* ========================================================================
 *  TINKERER — DEPLOYMENT CONFIGURATION
 *  Fill these in once, commit, and every device that opens your GitHub
 *  Pages site connects to your Google Sheet automatically. Each browser can
 *  still override them in Settings (stored only on that device).
 *
 *  NEVER put an admin key, password or service-account key in this file —
 *  it is public on GitHub Pages.
 * ======================================================================== */
window.TINKERER_CONFIG = {
  // 1) Recommended: the Web App URL from Apps Script → Deploy → Manage deployments.
  //    Looks like https://script.google.com/macros/s/AKfycb…/exec
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbw73mrwWzzbLx7-TyGWuQ0rjqVDutvlwjkPR3zNotuGCWL-XiquglfHRVrOHu1iiqUt/exec',

  // 2) Optional fallback without Apps Script: the ID of a Google Sheet shared as
  //    "Anyone with the link — Viewer" (the long ID in the sheet URL).
  //    WARNING: in this mode every tab and column, including "_" ones, is readable.
  PUBLISHED_SHEET_ID: '',

  // Link opened by the "Open Google Sheet" buttons (your normal edit URL).
  GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/1mYZ31a7Dt4sLUQKKEtIg0yEEKkJmHv78F70sJ7y9HnE/edit?gid=0#gid=0',

  // Defaults for new projects / quotations (editable in Settings).
  COMPANY_NAME: 'Tinkerer',
  DEFAULT_GST_PERCENT: 18,
};
