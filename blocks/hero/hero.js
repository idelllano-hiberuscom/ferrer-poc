import { buildBlock, decorateBlock, loadBlock } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  BREAKPOINTS, buildPicture, buildText, buildTitle, decorateAuthoredButton, wrapLooseText,
} from '../../scripts/ferrer-utils.js';
import { t } from '../../scripts/ferrer-i18n.js';

/* UE instrumentation: Pendiente (Fase 3) */

const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d+)/;
const VIMEO_ORIGIN = /player\.vimeo\.com$/;

/**
 * Creates an element with the given classes.
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * First authored <img> of a cell, or null.
 * @param {Element|null} cell
 * @returns {HTMLImageElement|null}
 */
function cellImage(cell) {
  return cell ? cell.querySelector('img') : null;
}

/**
 * Plain-text values of a cell that are not images (video URLs of the media group).
 * @param {Element|null} cell
 * @returns {string[]}
 */
function cellTexts(cell) {
  if (!cell) return [];
  return [...cell.querySelectorAll('p')]
    .filter((p) => !p.querySelector('picture, img'))
    .map((p) => (p.querySelector('a') ? p.querySelector('a').href : p.textContent).trim())
    .filter(Boolean);
}

/**
 * Whether an authored paragraph is a button (link formatted with strong/em, or already
 * decorated as a Ferrer button by the global decoration).
 * @param {Element} node
 * @returns {HTMLAnchorElement|null} the link of the button
 */
function buttonLink(node) {
  const decorated = node.querySelector('a.cmp-button');
  if (decorated) return decorated;
  if (node.tagName !== 'P') return null;
  const link = node.querySelector('a');
  if (!link || !(link.closest('strong') || link.closest('em'))) return null;
  return node.textContent.trim() === link.textContent.trim() ? link : null;
}

/**
 * Wraps a node in the decoration <div> AEM adds around an embedded component.
 * @param {string} className
 * @param {Node} child
 * @returns {HTMLElement}
 */
function wrap(className, child) {
  const node = el('div', className);
  node.append(child);
  return node;
}

/**
 * Port of hero.js#initVideoInteractive + applyVideoBackground for ONE hero: Vimeo iframe
 * driven by postMessage (no SDK), play/pause toggle and video swap at max-width 1024px.
 * @param {HTMLElement} hero .cmp-hero element
 */
function initVideo(hero) {
  const mediaQuery = window.matchMedia(`(width <= ${BREAKPOINTS.desktop}px)`);
  const videoWrapper = hero.querySelector('.cmp-hero__video');
  const cover = hero.querySelector('.cmp-hero__bg-image');
  const button = hero.querySelector('.cmp-hero__content-video-toggle');
  const state = {
    iframe: null, playing: false, ready: false, pending: null,
  };

  const send = (method, value) => {
    if (state.iframe && state.iframe.contentWindow) {
      state.iframe.contentWindow.postMessage(JSON.stringify({ method, value }), '*');
    }
  };

  const updateButton = (playing) => {
    state.playing = playing;
    if (!button) return;
    button.classList.toggle('icon-pause', playing);
    button.classList.toggle('icon-play', !playing);
    button.setAttribute('aria-pressed', String(playing));
  };

  const onMessage = (event) => {
    if (!state.iframe || event.source !== state.iframe.contentWindow) return;
    if (typeof event.data !== 'string') return;
    try {
      if (!VIMEO_ORIGIN.test(new URL(event.origin).hostname)) return;
    } catch {
      return;
    }
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data.event === 'ready') {
      state.ready = true;
      send('addEventListener', 'play');
      send('addEventListener', 'pause');
      if (state.pending) {
        send(state.pending);
        state.pending = null;
      }
    } else if (data.event === 'play') {
      if (cover) cover.classList.add('cmp-hero__bg-image--hidden');
      updateButton(true);
    } else if (data.event === 'pause') {
      updateButton(false);
    }
  };

  const removeVideo = () => {
    if (state.iframe) state.iframe.remove();
    state.iframe = null;
    if (cover) cover.classList.remove('cmp-hero__bg-image--hidden');
  };

  const applyVideo = () => {
    const desktopUrl = hero.dataset.videoUrl;
    const mobileUrl = hero.dataset.videoUrlMobile;
    const videoUrl = mediaQuery.matches && mobileUrl ? mobileUrl : desktopUrl;
    const match = videoUrl ? videoUrl.match(VIMEO_ID) : null;
    if (!match) return;
    const videoId = match[1];
    const autoplay = hero.dataset.videoAutoplay === 'true';

    const params = new URLSearchParams({
      muted: '1',
      loop: '1',
      byline: '0',
      title: '0',
      api: '1',
      playsinline: '1',
      player_id: `player_${videoId}`,
    });
    if (autoplay) {
      params.append('autoplay', '1');
      params.append('background', '1');
    }

    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    iframe.loading = 'lazy';
    iframe.setAttribute('playsinline', '');
    iframe.setAttribute('webkit-playsinline', '');
    videoWrapper.append(iframe);

    state.iframe = iframe;
    state.ready = false;
    state.pending = null;
    updateButton(autoplay);
    hero.dataset.currentLayout = mediaQuery.matches ? 'mobile' : 'desktop';
  };

  window.addEventListener('message', onMessage);
  if (button) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const command = state.playing ? 'pause' : 'play';
      if (!state.ready) {
        // iOS: the tap may arrive before the Vimeo handshake; flushed on 'ready'
        state.pending = command;
        return;
      }
      send(command);
    });
  }
  mediaQuery.addEventListener('change', () => {
    const previous = hero.dataset.currentLayout;
    const current = mediaQuery.matches ? 'mobile' : 'desktop';
    if (previous && previous !== current) {
      removeVideo();
      applyVideo();
    }
  });

  applyVideo();
}

/**
 * Splits the authored rich text into the hero children of hero.html:
 * subheading (before the heading) · title (first heading) · text · button.
 * @param {Element|null} cell
 * @returns {{subheading: Node[], heading: Element|null, text: Node[], buttons: Element[]}}
 */
function splitContent(cell) {
  const result = {
    subheading: [], heading: null, text: [], buttons: [],
  };
  if (!cell) return result;
  const nodes = [...wrapLooseText(cell).children];
  const headingIndex = nodes.findIndex((node) => /^H[1-6]$/.test(node.tagName));
  if (headingIndex >= 0) {
    result.subheading = nodes.slice(0, headingIndex);
    result.heading = nodes[headingIndex];
  }
  nodes.slice(headingIndex + 1).forEach((node) => {
    if (buttonLink(node)) result.buttons.push(node);
    else result.text.push(node);
  });
  return result;
}

/**
 * Hero Block — AEM Edge Delivery Services
 *
 * Source: content/hero (hero.html, hero.js, hero.scss, HeroModel)
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3 - UE & QA Specialist)
 *
 * DOM de entrada (matriz EDS):
 *   div.hero[.view-home][.autoplay][.template-theme--*]
 *     div > div   media: picture (desktop, alt) + [picture (recorte tablet)]
 *                 + [p (URL Vimeo)] + [p (URL Vimeo móvil)]
 *     div > div   picture (recorte móvil, opcional)
 *     div > div   rich text: [p subtítulo] + hN título + [p texto…] + [p > strong|em > a botón]
 *
 * DOM de salida (hero.html):
 *   div.hero > div.cmp-hero.cmp-hero--section|home[data-background-type][data-video-*]
 *     [div.cmp-hero__video]  picture.cmp-hero__bg-image  [div.cmp-hero__breadcrumb > breadcrumb]
 *     div.cmp-hero__content.content-container
 *       div.cmp-hero__content-text
 *         [div.text.ferrer-h5] div.title.cmp-title--left [div.ferrer-body-large]
 *       [div.button]  [button.cmp-hero__content-video-toggle]
 *
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  const rows = [...block.children];
  const cells = rows.map((row) => row.firstElementChild);
  const [mediaCell, mobileCell, textCell] = cells;
  // media group: 1st image = desktop, 2nd image = tablet crop
  const [desktopImg = null, tabletImg = null] = mediaCell ? mediaCell.querySelectorAll('img') : [];

  const isSectionView = !block.classList.contains('view-home');
  const [videoUrl = '', videoUrlMobile = ''] = cellTexts(mediaCell);
  const isImage = isSectionView || !videoUrl;

  const hero = el('div', `cmp-hero ${isSectionView ? 'cmp-hero--section' : 'cmp-hero--home'}`);
  hero.dataset.backgroundType = isImage ? 'image' : 'video';
  hero.dataset.videoUrl = isImage ? '' : videoUrl;
  hero.dataset.videoUrlMobile = isImage ? '' : (videoUrlMobile || videoUrl);
  hero.dataset.videoAutoplay = !isImage && block.classList.contains('autoplay') ? 'true' : 'false';

  // VIDEO
  if (!isImage) hero.append(el('div', 'cmp-hero__video'));

  // IMAGE (LCP)
  const picture = buildPicture({
    src: desktopImg,
    srcTablet: tabletImg,
    srcMobile: cellImage(mobileCell),
    eager: true,
    classPicture: 'cmp-hero__bg-image',
  });
  if (picture) hero.append(picture);

  // BREADCRUMB (embedded breadcrumb block, light style of the hero template)
  if (isSectionView) {
    const breadcrumbHolder = el('div', 'cmp-hero__breadcrumb');
    const breadcrumb = buildBlock('breadcrumb', []);
    breadcrumb.classList.add('breadcrumb--light');
    breadcrumbHolder.append(breadcrumb);
    hero.append(breadcrumbHolder);
  }

  // CONTENT
  const content = el('div', 'cmp-hero__content content-container');
  const contentText = el('div', 'cmp-hero__content-text');
  content.append(contentText);
  const parts = splitContent(textCell);
  if (textCell) moveInstrumentation(textCell, contentText);

  if (isSectionView && parts.subheading.length) {
    const subheading = buildText({ nodes: parts.subheading });
    if (subheading) contentText.append(wrap('text ferrer-h5', subheading));
  }
  if (parts.heading) {
    const title = buildTitle({ element: parts.heading, font: isSectionView ? 'special-1' : 'hero-home' });
    contentText.append(wrap('title cmp-title--left', title));
  }
  if (isSectionView) {
    const textHolder = el('div', 'ferrer-body-large');
    const text = parts.text.length ? buildText({ nodes: parts.text }) : null;
    if (text) textHolder.append(wrap('text', text));
    contentText.append(textHolder);

    parts.buttons.forEach((node) => {
      const link = buttonLink(node);
      const styled = link.classList.contains('cmp-button') && link.closest('[class*="cmp-button--"]');
      const buttonWrapper = styled || decorateAuthoredButton(link);
      if (buttonWrapper) content.append(wrap('button', buttonWrapper));
    });
  }

  if (!isImage) {
    const toggle = el('button', 'cmp-hero__content-video-toggle icon-play');
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', t('hero.accessibility.pause-video', 'Pause background video'));
    content.append(toggle);
  }
  hero.append(content);

  block.append(hero);
  rows.forEach((row) => row.remove());

  const breadcrumb = hero.querySelector('.cmp-hero__breadcrumb > .breadcrumb');
  if (breadcrumb) {
    decorateBlock(breadcrumb);
    loadBlock(breadcrumb);
  }
  if (!isImage) initVideo(hero);
}
