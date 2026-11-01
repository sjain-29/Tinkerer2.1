/* Tinkerer — shared utilities (browser + Node). */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});

  const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function esc(v) {
    return (v === null || v === undefined ? '' : String(v)).replace(/[&<>"'`]/g, (c) => HTML_ESC[c]);
  }

  /** Only allow http(s) links; anything else (javascript:, data:, …) becomes ''. */
  function safeUrl(v) {
    if (!v) return '';
    const s = String(v).trim();
    if (!/^https?:\/\//i.test(s)) {
      // tolerate bare domains like "robu.in/product/x"
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s)) return 'https://' + s;
      return '';
    }
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
    } catch (e) {
      return '';
    }
  }

  function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const s = String(v).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '').replace(/^inr/i, '');
    const m = s.match(/-?\d+(\.\d+)?(e-?\d+)?/i);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return isFinite(n) ? n : null;
  }

  function toBool(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    if (['y', 'yes', 'true', '1', 'included', 'available'].includes(s)) return true;
    if (['n', 'no', 'false', '0', 'none', 'not included'].includes(s)) return false;
    return null;
  }

  function toList(v) {
    if (v === null || v === undefined || v === '') return [];
    if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
    return String(v).split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
  }

  function norm(s) {
    return (s === null || s === undefined ? '' : String(s)).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
  }

  function slug(s) {
    return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  }

  const inrFmt = typeof Intl !== 'undefined' ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) : null;
  const inrFmt2 = typeof Intl !== 'undefined' ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  const numFmtIN = typeof Intl !== 'undefined' ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

  function inr(n, decimals) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (decimals ? inrFmt2 : inrFmt).format(n);
  }
  /** INR for PDF fonts that lack the ₹ glyph. */
  function inrPlain(n) {
    if (n === null || n === undefined || !isFinite(n)) return '-';
    return 'Rs. ' + numFmtIN.format(n);
  }

  function fmt(n, d) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const dd = d === undefined ? (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2) : d;
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: dd, maximumFractionDigits: dd });
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /** Neutralise spreadsheet formula injection in exported text cells. */
  function safeCell(v) {
    if (typeof v !== 'string') return v;
    return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  }

  function deepClone(o) {
    return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /** Parse "4-6S", "6S", "3S–12S", "12" into {min,max}. */
  function parseCellRange(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return { min: v, max: v };
    const nums = String(v).match(/\d+(\.\d+)?/g);
    if (!nums) return null;
    const ns = nums.map(Number);
    return { min: Math.min.apply(null, ns), max: Math.max.apply(null, ns) };
  }

  /** "640x512" / "640 × 512" → pixel count */
  function parsePixels(v) {
    if (!v) return null;
    const m = String(v).match(/(\d+)\s*[x×*]\s*(\d+)/i);
    return m ? Number(m[1]) * Number(m[2]) : null;
  }

  const VIDEO_RANK = { '480p': 0.5, '720p': 1, '1080p': 2, '2k': 3, '1440p': 3, '2.7k': 3.5, '4k': 4, '2160p': 4, '5.4k': 5, '5k': 5, '6k': 5.5, '8k': 6 };
  function videoRank(v) {
    if (!v) return null;
    const s = String(v).toLowerCase().replace(/\s/g, '');
    let best = null;
    Object.keys(VIDEO_RANK).forEach((k) => {
      if (s.indexOf(k) !== -1 && (best === null || VIDEO_RANK[k] > best)) best = VIDEO_RANK[k];
    });
    return best;
  }

  function containsToken(haystack, needle) {
    if (!needle) return true;
    const h = norm(Array.isArray(haystack) ? haystack.join(' ') : haystack);
    return toList(needle).some((n) => h.indexOf(norm(n)) !== -1);
  }

  TK.util = { esc, safeUrl, toNum, toBool, toList, norm, slug, inr, inrPlain, fmt, clamp, uid, safeCell, deepClone, debounce, parseCellRange, parsePixels, videoRank, containsToken };
})(typeof window !== 'undefined' ? window : globalThis);
