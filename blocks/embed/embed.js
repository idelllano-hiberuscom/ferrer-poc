import { moveInstrumentation } from '../../scripts/scripts.js';

/* UE instrumentation: Pendiente (Fase 3) */

/**
 * Resolves the iframe src of a Vimeo / YouTube URL, the providers Core Embed v1 resolved
 * through oEmbed in the original site.
 * @param {string} href
 * @returns {string|null}
 */
function getEmbedSrc(href) {
  let url;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'player.vimeo.com' || (host.endsWith('youtube.com') && url.pathname.startsWith('/embed/'))) {
    return url.href;
  }
  if (host.endsWith('vimeo.com')) {
    // vimeo.com/123, vimeo.com/123/abcdef (unlisted hash), vimeo.com/channels/x/123
    const match = url.pathname.match(/\/(\d+)(?:\/([\da-f]+))?\/?$/i);
    if (!match) return null;
    const params = new URLSearchParams({ dnt: '1' });
    if (match[2]) params.set('h', match[2]);
    return `https://player.vimeo.com/video/${match[1]}?${params.toString()}`;
  }
  if (host.endsWith('youtube.com') || host === 'youtu.be') {
    const id = host === 'youtu.be' ? url.pathname.substring(1) : url.searchParams.get('v');
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
  }
  return null;
}

/**
 * Embed Block — AEM Edge Delivery Services
 *
 * Source: content/embed (proxy of Core Embed v1, URL type with oEmbed) + embed.scss.
 * The Vimeo analytics (embed-analytics.js) live in scripts/delayed.js (lot L0) and
 * look for `.cmp-embed iframe[src*="vimeo.com"]`.
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3 - UE & QA Specialist)
 *
 * DOM de entrada (matriz EDS):
 *   div.embed
 *     div > div > p > a[href=URL Vimeo|YouTube]  (texto del enlace = título del vídeo)
 *
 * DOM de salida:
 *   div.embed > div.cmp-embed > iframe[src][title][allow][loading=lazy]
 *
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  const rows = [...block.children];
  const link = block.querySelector('a[href]');
  const href = link ? link.getAttribute('href') : block.textContent.trim();
  const src = getEmbedSrc(href);
  if (!src) return; // unsupported provider: the authored link stays visible

  const embed = document.createElement('div');
  embed.className = 'cmp-embed';
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.width = '640';
  iframe.height = '360';
  iframe.title = (link && link.textContent.trim() !== href ? link.textContent.trim() : '') || 'Video';
  iframe.allow = 'autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media';
  iframe.loading = 'lazy';
  iframe.setAttribute('frameborder', '0');
  if (link) moveInstrumentation(link, iframe);
  embed.append(iframe);

  block.append(embed);
  rows.forEach((row) => row.remove());
}
