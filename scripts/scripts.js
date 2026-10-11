import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  getMetadata,
  buildBlock,
  toClassName,
} from './aem.js';
import {
  BREAKPOINTS,
  decorateAuthoredButton,
  decorateGraffiti,
  getTitleFontClass,
} from './ferrer-utils.js';
import { getLanguage } from './ferrer-i18n.js';

/** Themes defined in styles.css (_theme.scss only defines default). */
const KNOWN_THEMES = ['default'];

/**
 * Moves all the attributes from a given elmenet to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      to?.setAttribute(attr, value);
      from.removeAttribute(attr);
    }
  });
}

/**
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Applies the page theme as `template-theme--{name}` on <body> (AEM page cssClassNames).
 * Unknown themes fall back to default so the --color-template-* tokens always exist.
 */
function decorateFerrerTheme() {
  const theme = (getMetadata('theme') || 'default').trim().toLowerCase();
  if (!KNOWN_THEMES.includes(theme)) {
    // eslint-disable-next-line no-console
    console.warn(`Unknown Ferrer theme "${theme}", using default`);
  }
  document.body.classList.add(`template-theme--${KNOWN_THEMES.includes(theme) ? theme : 'default'}`);
}

/**
 * Auto block for the sanitary-professional modal (structure/modal-sanitary in AEM, driven
 * by page properties). Page metadata:
 *   show-modal-sanitary = true · modal-sanitary = /fragments/… (modal content fragment)
 *   modal-sanitary-redirect · modal-sanitary-overlay-disabled · modal-sanitary-blur-enabled
 * Builds, in a new last section, a key/value block readable with readBlockConfig():
 *   fragment | redirect | overlay-disabled | blur-enabled
 * @param {Element} main
 */
function buildModalSanitary(main) {
  const show = getMetadata('show-modal-sanitary').toLowerCase() === 'true';
  const path = getMetadata('modal-sanitary');
  if (!show || !path || main.querySelector('.modal-sanitary')) return;

  const link = (href) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = href;
    return a;
  };
  const rows = [['fragment', link(path)]];
  const redirect = getMetadata('modal-sanitary-redirect');
  if (redirect) rows.push(['redirect', link(redirect)]);
  rows.push(['overlay-disabled', getMetadata('modal-sanitary-overlay-disabled') || 'false']);
  rows.push(['blur-enabled', getMetadata('modal-sanitary-blur-enabled') || 'false']);

  const section = document.createElement('div');
  section.append(buildBlock('modal-sanitary', rows));
  main.append(section);
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    if (main === document.querySelector('main')) buildModalSanitary(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates authored links of default content as Ferrer buttons (content/button).
 *   <strong><a> -> primary large · <em><a> -> secondary large · <strong><em><a> -> ghost large
 * Links inside blocks are left to each block (decorateAuthoredButton in ferrer-utils.js).
 * @param {HTMLElement} main The main container element
 */
export function decorateButtons(main) {
  main.querySelectorAll('.default-content-wrapper p a[href]').forEach((a) => {
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    if (!a.closest('strong') && !a.closest('em')) return;
    decorateAuthoredButton(a);
  });
}

/**
 * Default content as the AEM title/image components:
 *   - headings get the Ferrer typography class (Boldine by default; DM Sans when the section
 *     has the `title-dm-sans` style, like the graffitiDisabled policy of TitleModel)
 *   - headings get their graffiti spans (`[[…]]` markers / italics, see decorateGraffiti)
 *   - paragraphs holding only an image get .cmp-image
 * Accepts main, a section or a default-content-wrapper (Universal Editor partial updates).
 * @param {Element} container
 */
export function decorateDefaultContent(container) {
  const wrappers = [...container.querySelectorAll('.default-content-wrapper')];
  if (container.matches('.default-content-wrapper')) wrappers.push(container);
  wrappers.forEach((wrapper) => {
    const font = wrapper.closest('.section')?.classList.contains('title-dm-sans') ? 'primary' : 'special-1';
    wrapper.querySelectorAll(':scope > :is(h1, h2, h3, h4, h5, h6)').forEach((heading) => {
      decorateGraffiti(heading);
      if ([...heading.classList].some((c) => c.startsWith('ferrer-'))) return;
      heading.classList.add(getTitleFontClass(Number(heading.tagName.substring(1)), font));
    });
    wrapper.querySelectorAll(':scope > p > picture').forEach((picture) => {
      const p = picture.parentElement;
      if (p.textContent.trim() === '') p.classList.add('cmp-image');
    });
  });
}

/**
 * Section anchors (id of the AEM container, e.g. #booth): the section field `anchor`
 * arrives as data-anchor and becomes the section id, sanitised with toClassName()
 * ("#Booth M.01" -> "booth-m-01"). Duplicated ids are skipped (first one wins).
 * @param {Element} main
 */
export function decorateSectionAnchors(main) {
  main.querySelectorAll('.section[data-anchor]').forEach((section) => {
    const id = toClassName(section.dataset.anchor);
    if (!id || section.id === id) return;
    const existing = document.getElementById(id);
    if (existing && existing !== section) {
      // eslint-disable-next-line no-console
      console.warn(`Section anchor "${id}" already in use, skipped`, section);
      return;
    }
    section.id = id;
  });
}

/**
 * Builds a media-bus optimized background URL (keeps external URLs untouched).
 * @param {string} src
 * @param {number} width
 * @returns {string}
 */
function backgroundUrl(src, width) {
  try {
    const url = new URL(src, window.location.href);
    if (url.origin === window.location.origin && url.pathname.includes('media_')) {
      return `url("${url.pathname}?width=${width}&format=webply&optimize=medium")`;
    }
    return `url("${url.href}")`;
  } catch {
    return `url("${src}")`;
  }
}

/**
 * Port of container.js: section metadata background-desktop / background-mobile become
 * CSS custom properties; the swap at 768px is done in CSS. Mobile falls back to desktop
 * (ContainerModel#getMobileBackground).
 * @param {Element} main
 */
function decorateSectionBackgrounds(main) {
  main.querySelectorAll('.section[data-background-desktop], .section[data-background-mobile]').forEach((section) => {
    const { backgroundDesktop, backgroundMobile } = section.dataset;
    if (!backgroundDesktop && !backgroundMobile) return;
    section.classList.add('has-cover-bg');
    section.style.setProperty('--section-bg-desktop', backgroundUrl(backgroundDesktop || backgroundMobile, 2000));
    section.style.setProperty('--section-bg-mobile', backgroundUrl(backgroundMobile || backgroundDesktop, 750));
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
/**
 * The AEM style-system modifiers authored in a block `classes` field keep their BEM form
 * in author (`links-menu--dark`), but the aem.page/aem.live pipeline normalises block
 * classes with toClassName() and collapses `--` into `-` (`links-menu-dark`). Restores the
 * original modifier next to the collapsed one, so block CSS and JS match in both cases.
 * @param {Element} main
 */
export function restoreBemModifiers(main) {
  main.querySelectorAll('div.block[data-block-name]').forEach((block) => {
    const name = block.dataset.blockName;
    const prefixes = [name, `cmp-${name}`, 'cmp-modal', 'template-theme'];
    [...block.classList].forEach((cls) => {
      if (cls === name || cls.includes('--')) return;
      const prefix = prefixes.find((p) => cls.startsWith(`${p}-`) && cls.length > p.length + 1);
      if (prefix) block.classList.add(`${prefix}--${cls.slice(prefix.length + 1)}`);
    });
  });
}

export function decorateMain(main) {
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateSectionAnchors(main);
  decorateBlocks(main);
  restoreBemModifiers(main);
  decorateButtons(main);
  decorateDefaultContent(main);
  decorateSectionBackgrounds(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = getLanguage();
  decorateTemplateAndTheme();
  decorateFerrerTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= BREAKPOINTS.desktop || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('body > header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('body > footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
