/* Tinkerer — UI kit: icons, toasts, modals, loader, delegated actions. */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const U = TK.util;

  const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    drone: '<circle cx="5.5" cy="5.5" r="2.5"/><circle cx="18.5" cy="5.5" r="2.5"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/><path d="M7.5 7.5l3 3M16.5 7.5l-3 3M7.5 16.5l3-3M16.5 16.5l-3-3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    report: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8M7 21v-7h10v7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    ext: '<path d="M14 3h7v7M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
    scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0z"/>',
    cloud: '<path d="M17.5 19H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 11a4 4 0 0 1-1.5 8z"/>',
    rupee: '<path d="M6 3h12M6 8h12M14 21L6 13h3a5 5 0 0 0 0-10"/>',
    gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  };
  function icon(name, size) {
    const s = size || 16;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`;
  }

  function toast(msg, kind, ms) {
    const host = document.getElementById('toastHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.innerHTML = icon(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'info', 17) + `<div>${U.esc(msg)}</div>`;
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 260);
    }, ms || (kind === 'error' ? 6500 : 3200));
  }

  let modalStack = [];
  /** modal({title, body (html), foot (html), size, onMount(el), onClose}) → {el, close} */
  function modal(opts) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${opts.size || ''}" role="dialog" aria-modal="true" aria-label="${U.esc(opts.title || '')}">
      <div class="mh"><h3>${U.esc(opts.title || '')}</h3><button class="btn icon ghost" data-close aria-label="Close">${icon('x', 18)}</button></div>
      <div class="mb">${opts.body || ''}</div>${opts.foot ? `<div class="mf">${opts.foot}</div>` : ''}</div>`;
    document.getElementById('modalRoot').appendChild(bg);
    const m = { el: bg.querySelector('.modal'), bg, close };
    function close(v) {
      bg.remove();
      modalStack = modalStack.filter((x) => x !== m);
      if (opts.onClose) opts.onClose(v);
    }
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    bg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close()));
    modalStack.push(m);
    if (opts.onMount) opts.onMount(m.el, m);
    setTimeout(() => {
      const f = m.el.querySelector('[autofocus], input, select, textarea, .btn.primary');
      if (f) f.focus();
    }, 30);
    return m;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close();
  });

  function confirmDialog(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      let done = false;
      const m = modal({
        title, size: 'narrow', body: `<p style="margin:0;color:var(--text-2)">${U.esc(text)}</p>`,
        foot: `<button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${U.esc(okLabel || 'OK')}</button>`,
        onClose: () => { if (!done) resolve(false); },
      });
      m.el.querySelector('[data-ok]').addEventListener('click', () => {
        done = true;
        m.close();
        resolve(true);
      });
    });
  }

  let loaderEl = null;
  function loading(on, text) {
    if (on) {
      if (!loaderEl) {
        loaderEl = document.createElement('div');
        loaderEl.className = 'loader';
        document.body.appendChild(loaderEl);
      }
      loaderEl.innerHTML = `<div class="lb"><div class="ring"></div><div>${U.esc(text || 'Working…')}</div></div>`;
    } else if (loaderEl) {
      loaderEl.remove();
      loaderEl = null;
    }
  }

  // Delegated actions: <button data-act="name" data-x="…">
  const actions = {};
  function registerActions(map) {
    Object.assign(actions, map);
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = e.target.closest('a[href]');
    if (a && a !== el && el.contains(a)) return; // real links inside clickable rows keep working
    const fn = actions[el.dataset.act];
    if (fn) {
      e.preventDefault();
      Promise.resolve(fn(el, e)).catch((err) => {
        console.error(err);
        loading(false);
        toast(err.message || String(err), 'error');
      });
    }
  });

  const statusLabel = (st) => (TK.matcher ? TK.matcher.ST_LABEL[st] : st) || st;
  const badge = (st, text) => `<span class="badge ${U.esc(st)}">${U.esc(text || statusLabel(st))}</span>`;
  const feasBadge = (f) => badge(f, { feasible: 'Feasible', conditional: 'Feasible with conditions', infeasible: 'Not feasible' }[f] || f);
  function timeAgo(iso) {
    if (!iso) return '—';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function link(url, text) {
    const u = U.safeUrl(url);
    return u ? `<a href="${U.esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${U.esc(text || 'Open')} ${icon('ext', 12)}</a>` : '';
  }

  TK.ui = { icon, toast, modal, confirm: confirmDialog, loading, registerActions, badge, feasBadge, statusLabel, timeAgo, link };
})(typeof window !== 'undefined' ? window : globalThis);
