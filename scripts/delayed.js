/**
 * Delayed phase (3s after load): martech of structure/page (head.analytics.html) and the
 * analytics listeners of site/pdf-download-analytics.js and embed/embed-analytics.js.
 *
 * Page metadata (former inherited page properties ferrer:*):
 *   cmp-id     -> Usercentrics settings id   (ferrer:cmpID)
 *   cmp-draft  -> 'true' loads the draft CMP (ferrer:cmpDraft)
 *   gtm-id     -> Google Tag Manager id      (ferrer:gtmID; the free gtmScript snippet is
 *                 replaced by the standard GTM loader)
 */
// eslint-disable-next-line import/no-cycle
import { getMetadata, loadScript } from './aem.js';

/** Pushes an analytics event the way both original trackers did. */
function pushDataLayer(event, eventInfo) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ eventInfo: null });
  window.dataLayer.push({ event, eventInfo });
}

/** Usercentrics CMP (head.analytics.html). */
function loadUsercentrics() {
  const settingsId = getMetadata('cmp-id');
  if (!settingsId) return;
  const attrs = { id: 'usercentrics-cmp', 'data-settings-id': settingsId, async: '' };
  if (getMetadata('cmp-draft').toLowerCase() === 'true') attrs['data-draft'] = 'true';
  loadScript('https://web.cmp.usercentrics.eu/ui/loader.js', attrs);
}

/** Google Tag Manager (head.analytics.html + page.html noscript is not applicable). */
function loadGtm() {
  const gtmId = getMetadata('gtm-id');
  if (!gtmId || !/^GTM-[A-Z0-9]+$/i.test(gtmId)) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`, { async: '' });
}

/* ===== PDF downloads (site/pdf-download-analytics.js) ===== */
const PDF_LINK_SELECTOR = 'a.cmp-button, a.cmp-document';
const trackedLinks = new WeakSet();

function isPdfLink(link) {
  const href = link.getAttribute('href');
  return !!href && /\.pdf(?:[?#]|$)/i.test(href);
}

function getFileName(link) {
  try {
    const url = new URL(link.href, window.location.origin);
    const fileName = url.pathname.split('/').pop() || '';
    return decodeURIComponent(fileName.replace(/\.pdf$/i, ''));
  } catch (e) {
    return link.href;
  }
}

function getFileLocation(link) {
  const section = link.closest('[data-analytics-section]');
  return section ? section.getAttribute('data-analytics-section') : window.location.pathname;
}

function trackPdfLink(link) {
  if (trackedLinks.has(link) || !isPdfLink(link)) return;
  trackedLinks.add(link);
  link.addEventListener('click', () => {
    pushDataLayer('file_download', {
      file_name: getFileName(link),
      file_extension: 'pdf',
      file_location: getFileLocation(link),
    });
  });
}

/* ===== Vimeo embeds (embed/embed-analytics.js) ===== */
const VIMEO_SELECTOR = ':is(.embed, .cmp-embed) iframe[src*="vimeo.com"]';
const PROGRESS_THRESHOLDS = [10, 25, 50, 75, 90];
const trackedIframes = new WeakSet();
let vimeoSdk = null;

function loadVimeoSdk() {
  if (!vimeoSdk) {
    vimeoSdk = window.Vimeo?.Player
      ? Promise.resolve()
      : loadScript('https://player.vimeo.com/api/player.js', { async: '' });
  }
  return vimeoSdk;
}

function trackVimeoIframe(iframe) {
  const player = new window.Vimeo.Player(iframe);
  const state = {
    started: false,
    duration: 0,
    reachedThresholds: [],
    url: iframe.src ? iframe.src.split('?')[0] : '',
    title: iframe.getAttribute('title') || iframe.closest('.embed, .cmp-embed')?.getAttribute('data-video-title') || '',
  };

  player.getDuration().then((duration) => { state.duration = Math.round(duration); });
  player.getVideoTitle().then((title) => { if (title) state.title = title; });
  player.getVideoUrl().then((url) => { if (url) state.url = url; }).catch(() => {});

  player.on('play', () => {
    if (state.started) return;
    state.started = true;
    pushDataLayer('video_start', { url: state.url, title: state.title, length: state.duration || 0 });
  });

  player.on('timeupdate', (data) => {
    if (!data) return;
    const percent = data.percent * 100;
    if (data.duration && !state.duration) state.duration = Math.round(data.duration);
    PROGRESS_THRESHOLDS.forEach((threshold) => {
      if (percent >= threshold && !state.reachedThresholds.includes(threshold)) {
        state.reachedThresholds.push(threshold);
        pushDataLayer('video_progress', {
          url: state.url, title: state.title, length: state.duration, percent: threshold,
        });
      }
    });
  });

  player.on('ended', () => {
    pushDataLayer('video_complete', { url: state.url, title: state.title, length: state.duration });
    state.started = false;
    state.reachedThresholds = [];
  });
}

function trackVimeoIframes(iframes) {
  const pending = iframes.filter((iframe) => !trackedIframes.has(iframe));
  if (!pending.length) return;
  pending.forEach((iframe) => trackedIframes.add(iframe));
  loadVimeoSdk()
    .then(() => pending.forEach(trackVimeoIframe))
    // eslint-disable-next-line no-console
    .catch((error) => console.error('Vimeo analytics', error));
}

/** Collects the matching elements of a node (itself + descendants). */
function matchesIn(node, selector) {
  if (node.nodeType !== 1) return [];
  const own = node.matches(selector) ? [node] : [];
  return [...own, ...node.querySelectorAll(selector)];
}

function initAnalytics() {
  document.querySelectorAll(PDF_LINK_SELECTOR).forEach(trackPdfLink);
  trackVimeoIframes([...document.querySelectorAll(VIMEO_SELECTOR)]);

  // embeds and modal fragments are added later (lazy embed, modals): observe the DOM
  new MutationObserver((mutations) => {
    const iframes = [];
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      matchesIn(node, PDF_LINK_SELECTOR).forEach(trackPdfLink);
      iframes.push(...matchesIn(node, 'iframe[src*="vimeo.com"]').filter((iframe) => iframe.matches(VIMEO_SELECTOR)));
    }));
    trackVimeoIframes(iframes);
  }).observe(document.body, { childList: true, subtree: true });
}

loadUsercentrics();
loadGtm();
initAnalytics();
