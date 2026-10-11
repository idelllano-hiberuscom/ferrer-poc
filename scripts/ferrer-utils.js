/**
 * Ferrer shared utilities — port of the AEM HTL templates / Sling helpers used by every
 * component of core-ferrer:
 *   - LinkHelperModel.java          -> getLinkInfo()
 *   - images-templates.html         -> buildPicture()
 *   - content/button (button.html)  -> buildButton() / decorateAuthoredButton()
 *   - content/title (TitleModel)    -> buildTitle()
 *   - content/text  (text.html)     -> buildText()
 *   - content/image (image.html)    -> buildImage()
 *
 * Pure DOM helpers, no dependencies. Every builder returns NEW nodes; when an existing
 * authored node is passed in, it is moved (never cloned or re-created) so Universal Editor
 * instrumentation (data-aue-*) travels with it.
 */

/**
 * Original breakpoints of core-ferrer (site/_breakpoints.scss).
 * Use them in JS with matchMedia(MEDIA.desktop) etc.
 * @type {Readonly<{mobile: number, tablet: number, desktop: number, desktopXl: number}>}
 */
export const BREAKPOINTS = Object.freeze({
  mobile: 480,
  tablet: 601,
  desktop: 1024,
  desktopXl: 1441,
});

/**
 * Ready-made media queries (range notation) built from BREAKPOINTS.
 * `onlyMobile` / `onlyTablet` mirror the <source media> of images-templates.html.
 */
export const MEDIA = Object.freeze({
  mobile: `(width >= ${BREAKPOINTS.mobile}px)`,
  tablet: `(width >= ${BREAKPOINTS.tablet}px)`,
  desktop: `(width >= ${BREAKPOINTS.desktop}px)`,
  desktopXl: `(width >= ${BREAKPOINTS.desktopXl}px)`,
  onlyMobile: `(width < ${BREAKPOINTS.tablet}px)`,
  onlyTablet: `(${BREAKPOINTS.tablet}px <= width < ${BREAKPOINTS.desktop}px)`,
});

/** Link types of LinkHelperModel.Type with their icomoon icon class. */
export const LINK_TYPES = Object.freeze({
  internal: { type: 'internal', icon: 'icon-arrow-up-right' },
  external: { type: 'external', icon: 'icon-link-external' },
  download: { type: 'download', icon: 'icon-download' },
  modal: { type: 'modal', icon: 'icon-link-external' },
});

const DOWNLOAD_PATH = /^\/content\/dam\//;
const DOWNLOAD_EXTENSION = /\.(pdf|docx?|xlsx?|pptx?|zip|csv)$/i;
const MODAL_PATH = /(^\/content\/experience-fragments\/)|(\/modals\/)/;

/**
 * Moves UE instrumentation attributes between two elements
 * (local copy of scripts.js#moveInstrumentation to avoid an import cycle).
 * @param {Element} from
 * @param {Element} to
 */
function moveInstrumentation(from, to) {
  if (!from || !to) return;
  [...from.attributes]
    .map(({ nodeName }) => nodeName)
    .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-'))
    .forEach((attr) => {
      to.setAttribute(attr, from.getAttribute(attr));
      from.removeAttribute(attr);
    });
}

/**
 * Splits a space separated string or an array into a clean list of class names.
 * @param {string|string[]} classes
 * @returns {string[]}
 */
function toClassList(classes) {
  if (!classes) return [];
  const list = Array.isArray(classes) ? classes : String(classes).split(/\s+/);
  return list.map((c) => c && c.trim()).filter(Boolean);
}

/**
 * Adds classes only when there are any (avoids an empty class="" attribute).
 * @param {Element} element
 * @param {string|string[]} classes
 */
function addClasses(element, classes) {
  const list = toClassList(classes);
  if (list.length) element.classList.add(...list);
}

/**
 * Classifies a link the same way LinkHelperModel.checkType() does.
 *   - /content/dam/... (or a document extension on the same origin) -> download
 *   - absolute http(s) URL on another origin                         -> external
 *   - experience fragment / `/modals/` path                          -> modal
 *   - anything else (incl. mailto:/tel:, like the original)          -> internal
 * @param {string} href Raw href (relative or absolute)
 * @returns {{href: string, type: (string|null), icon: (string|null), isExternal: boolean,
 *   isDownload: boolean, isModal: boolean, isCurrentPage: boolean, url: (URL|null)}}
 */
export function getLinkInfo(href) {
  const empty = {
    href: href || '',
    type: null,
    icon: null,
    isExternal: false,
    isDownload: false,
    isModal: false,
    isCurrentPage: false,
    url: null,
  };
  if (!href || !href.trim()) return empty;

  let url = null;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return { ...empty, ...LINK_TYPES.internal };
  }

  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  const sameOrigin = url.origin === window.location.origin;
  let info = LINK_TYPES.internal;
  if (isHttp && DOWNLOAD_PATH.test(url.pathname)) info = LINK_TYPES.download;
  else if (isHttp && !sameOrigin) info = LINK_TYPES.external;
  else if (isHttp && MODAL_PATH.test(url.pathname)) info = LINK_TYPES.modal;
  else if (isHttp && DOWNLOAD_EXTENSION.test(url.pathname)) info = LINK_TYPES.download;

  return {
    href,
    type: info.type,
    icon: info.icon,
    isExternal: info.type === 'external',
    isDownload: info.type === 'download',
    isModal: info.type === 'modal',
    // in-page anchors (#booth) point to a section, not to the current page
    isCurrentPage: sameOrigin && !url.hash && url.pathname === window.location.pathname,
    url,
  };
}

/**
 * Reads src/alt/size from a string, <img> or <picture>.
 * @param {string|Element} source
 * @returns {{src: string, alt: string, width: (string|null), height: (string|null),
 *   img: (HTMLImageElement|null)}}
 */
function readImageSource(source) {
  if (!source) {
    return {
      src: '', alt: '', width: null, height: null, img: null,
    };
  }
  if (typeof source === 'string') {
    return {
      src: source, alt: '', width: null, height: null, img: null,
    };
  }
  const img = source.tagName === 'IMG' ? source : source.querySelector('img');
  if (!img) {
    return {
      src: '', alt: '', width: null, height: null, img: null,
    };
  }
  return {
    src: img.getAttribute('src') || '',
    alt: img.getAttribute('alt') || '',
    width: img.getAttribute('width'),
    height: img.getAttribute('height'),
    img,
  };
}

/**
 * Builds an Edge Delivery media-bus optimized URL. Non media-bus URLs (Dynamic Media,
 * external hosts, svg/gif) are returned untouched.
 * @param {string} src
 * @param {number} width
 * @param {string} [format] 'webply' | original extension
 * @returns {string}
 */
function optimizedSrc(src, width, format) {
  if (!src) return src;
  let url;
  try {
    url = new URL(src, window.location.href);
  } catch {
    return src;
  }
  if (url.origin !== window.location.origin) return src;
  const ext = url.pathname.substring(url.pathname.lastIndexOf('.') + 1).toLowerCase();
  if (!url.pathname.includes('media_') || ['svg', 'gif'].includes(ext)) return src;
  return `${url.pathname}?width=${width}&format=${format || ext}&optimize=medium`;
}

/**
 * Appends a pair of <source> (webp + original format) for one breakpoint.
 * @param {HTMLPictureElement} picture
 * @param {string} src
 * @param {string} media
 * @param {number} width
 */
function appendSources(picture, src, media, width) {
  const optimized = optimizedSrc(src, width, 'webply');
  if (optimized !== src) {
    const webp = document.createElement('source');
    webp.type = 'image/webp';
    webp.media = media;
    webp.srcset = optimized;
    picture.append(webp);
  }
  const fallback = document.createElement('source');
  fallback.media = media;
  fallback.srcset = optimizedSrc(src, width);
  picture.append(fallback);
}

/**
 * Port of images-templates.html#image: a <picture> with desktop / tablet / mobile crops.
 *   desktop (width >= 1024px) · tablet (601px <= width < 1024px) · mobile (width < 601px)
 * Tablet and mobile fall back to the desktop image (ImageCropsModel behaviour).
 *
 * @param {object} options
 * @param {string|HTMLPictureElement|HTMLImageElement} options.src Desktop image
 * @param {string|HTMLPictureElement|HTMLImageElement} [options.srcTablet] Tablet crop
 * @param {string|HTMLPictureElement|HTMLImageElement} [options.srcMobile] Mobile crop
 * @param {string} [options.alt] Alt text (defaults to the authored alt of `src`)
 * @param {boolean} [options.eager=false] LCP image: loading=eager + fetchpriority=high
 * @param {boolean} [options.lazy] alias: lazy === false is the same as eager === true
 * @param {string|string[]} [options.classImg] Classes for <img>
 * @param {string|string[]} [options.classPicture] Classes for <picture>
 * @param {number|string} [options.width] width attribute (defaults to authored one)
 * @param {number|string} [options.height] height attribute (defaults to authored one)
 * @returns {HTMLPictureElement|null} null when there is no desktop src (data-sly-test)
 */
export function buildPicture({
  src,
  srcTablet,
  srcMobile,
  alt,
  eager = false,
  lazy,
  classImg,
  classPicture,
  width,
  height,
} = {}) {
  const isEager = eager || lazy === false;
  const desktop = readImageSource(src);
  if (!desktop.src) return null;
  const tablet = readImageSource(srcTablet);
  const mobile = readImageSource(srcMobile);

  const picture = document.createElement('picture');
  addClasses(picture, classPicture);
  appendSources(picture, desktop.src, MEDIA.desktop, 2000);
  appendSources(picture, tablet.src || desktop.src, MEDIA.onlyTablet, 1024);
  appendSources(picture, mobile.src || desktop.src, MEDIA.onlyMobile, 750);

  const img = document.createElement('img');
  addClasses(img, classImg);
  img.src = optimizedSrc(desktop.src, 750);
  img.alt = alt ?? desktop.alt;
  const w = width ?? desktop.width;
  const h = height ?? desktop.height;
  if (w) img.setAttribute('width', w);
  if (h) img.setAttribute('height', h);
  if (isEager) {
    img.loading = 'eager';
    img.setAttribute('fetchpriority', 'high');
  } else {
    img.loading = 'lazy';
    img.decoding = 'async';
  }
  moveInstrumentation(desktop.img, img);
  picture.append(img);
  return picture;
}

/**
 * Port of content/button/button.html. Markup:
 *   <div class="cmp-button--{style} cmp-button--{size} [cmp-button--dark] [cmp-button--reverse]">
 *     <a class="cmp-button" href="…">
 *       <span class="cmp-button__text">Text</span>
 *       <span class="cmp-button__icon icon-…" aria-hidden="true"></span>
 *     </a>
 *   </div>
 * Without href a <button type="button"> is rendered (button.buttonLink.valid === false),
 * and without href there is no icon (same as the HTL).
 *
 * @param {object} options
 * @param {string} options.text Visible text (required, like data-sly-test="${button.text}")
 * @param {string} [options.href]
 * @param {'primary'|'secondary'|'ghost'|'navbar'} [options.style='primary']
 * @param {'small'|'large'} [options.size='large']
 * @param {boolean} [options.dark=false] cmp-button--dark (for dark backgrounds)
 * @param {boolean} [options.reverse=false] cmp-button--reverse (icon on the left)
 * @param {string|false} [options.icon] icomoon class; default = link type icon; false = none
 * @param {string} [options.target] e.g. '_blank'
 * @param {string} [options.title]
 * @param {string} [options.ariaLabel]
 * @param {string} [options.modalId] adds js-open-modal + data-modal-id (ferrer-modal.js)
 * @param {string|string[]} [options.classes] extra classes for the <a>/<button>
 * @param {boolean} [options.wrapper=true] false returns only the <a>/<button>
 * @returns {HTMLElement|null} wrapper <div> (or the control when wrapper=false); null w/o text
 */
export function buildButton({
  text,
  href,
  style = 'primary',
  size = 'large',
  dark = false,
  reverse = false,
  icon,
  target,
  title,
  ariaLabel,
  modalId,
  classes,
  wrapper = true,
} = {}) {
  if (!text) return null;
  const link = getLinkInfo(href);
  const control = document.createElement(href ? 'a' : 'button');
  control.classList.add('cmp-button', ...toClassList(classes));
  if (href) {
    control.href = href;
    if (target) control.target = target;
    if (target === '_blank') control.rel = 'noopener noreferrer';
  } else {
    control.type = 'button';
  }
  if (title) control.title = title;
  if (ariaLabel) control.setAttribute('aria-label', ariaLabel);
  if (modalId) {
    control.classList.add('js-open-modal');
    control.dataset.modalId = modalId;
    control.setAttribute('aria-haspopup', 'dialog');
  }

  const label = document.createElement('span');
  label.className = 'cmp-button__text';
  label.textContent = text;
  control.append(label);

  const iconClass = icon === undefined ? link.icon : icon;
  if (href && iconClass) {
    const iconEl = document.createElement('span');
    iconEl.className = `cmp-button__icon ${iconClass}`;
    iconEl.setAttribute('aria-hidden', 'true');
    control.append(iconEl);
  }

  if (!wrapper) return control;
  const wrap = document.createElement('div');
  wrap.classList.add(`cmp-button--${style}`, `cmp-button--${size}`);
  if (dark) wrap.classList.add('cmp-button--dark');
  if (reverse) wrap.classList.add('cmp-button--reverse');
  wrap.append(control);
  return wrap;
}

/**
 * Turns an authored link (default content or a block cell) into a Ferrer button in place.
 * The style comes from the authored formatting unless forced:
 *   <strong><a>  -> primary large · <em><a> -> secondary large · <strong><em><a> -> ghost large
 * The <strong>/<em> wrappers are removed, the <a> keeps its node (and data-aue-*), its
 * content is wrapped in .cmp-button__text and the link-type icon is appended.
 * The closest <p> (or the parent element) becomes the style wrapper.
 *
 * @param {HTMLAnchorElement|Element} a the link, or a container (e.g. its <p>) holding it
 * @param {object} [options]
 * @param {'primary'|'secondary'|'ghost'|'navbar'} [options.style]
 * @param {'small'|'large'} [options.size='large']
 * @param {boolean} [options.dark=false]
 * @param {boolean} [options.reverse=false]
 * @param {string|false} [options.icon] icomoon class; default = link type icon; false = none
 * @param {string|string[]} [options.wrapperClass] extra classes for the wrapper
 * @returns {HTMLElement|null} the wrapper element, or null if no link is found
 */
export function decorateAuthoredButton(linkOrContainer, {
  style,
  size = 'large',
  dark = false,
  reverse = false,
  icon,
  wrapperClass,
} = {}) {
  const a = linkOrContainer?.tagName === 'A' ? linkOrContainer : linkOrContainer?.querySelector('a');
  if (!a) return null;
  const strong = a.closest('strong');
  const em = a.closest('em');
  let resolved = style;
  if (!resolved) {
    if (strong && em) resolved = 'ghost';
    else if (em) resolved = 'secondary';
    else resolved = 'primary';
  }

  // unwrap <strong>/<em>: move the <a> next to the outermost formatting element, drop it
  const formatting = [strong, em].filter(Boolean);
  if (formatting.length) {
    const outer = formatting.find((el) => formatting.every((other) => el.contains(other)));
    outer.before(a);
    outer.remove();
  }

  const wrap = a.closest('p') || a.parentElement;
  // idempotent: an already decorated button keeps its style unless one is forced
  const STYLES = ['primary', 'secondary', 'ghost', 'navbar'];
  const current = STYLES.find((name) => wrap.classList.contains(`cmp-button--${name}`));
  if (current && !style) resolved = current;
  else if (current) wrap.classList.remove(`cmp-button--${current}`);
  if (!['small', 'large'].some((name) => wrap.classList.contains(`cmp-button--${name}`))) {
    wrap.classList.add(`cmp-button--${size}`);
  }
  wrap.classList.add(`cmp-button--${resolved}`, ...toClassList(wrapperClass));
  if (dark) wrap.classList.add('cmp-button--dark');
  if (reverse) wrap.classList.add('cmp-button--reverse');

  a.classList.remove('button', 'primary', 'secondary', 'accent');
  a.classList.add('cmp-button');
  if (!a.title) a.title = a.textContent.trim();

  if (!a.querySelector(':scope > .cmp-button__text')) {
    const label = document.createElement('span');
    label.className = 'cmp-button__text';
    label.append(...a.childNodes);
    a.append(label);
  }

  const iconClass = icon === undefined ? getLinkInfo(a.getAttribute('href')).icon : icon;
  if (iconClass && !a.querySelector(':scope > .cmp-button__icon')) {
    const iconEl = document.createElement('span');
    iconEl.className = `cmp-button__icon ${iconClass}`;
    iconEl.setAttribute('aria-hidden', 'true');
    a.append(iconEl);
  }
  return wrap;
}

/** Elements that are not wrapped by wrapLooseText() (block level, media). */
const NON_INLINE = /^(ADDRESS|BLOCKQUOTE|DIV|DL|FIGURE|H[1-6]|HR|IMG|OL|P|PICTURE|PRE|TABLE|UL)$/;
/** Elements that can never live inside a <p>. */
const BLOCK_LEVEL = /^(ADDRESS|BLOCKQUOTE|DIV|DL|FIGURE|H[1-6]|HR|OL|P|PRE|TABLE|UL)$/;

/**
 * Rich text of a single paragraph is delivered without its <p> (`<div>text</div>`, or
 * `<div>text<p class="button-container">…</p></div>` when grouped with a link). Wraps each
 * run of loose inline content (text nodes, <strong>, <a>, <br>…) holding text in a new <p>,
 * so block code reading `cell.children` does not drop it. Block children are untouched.
 * Also repairs the <p>-inside-<p> that aem.js wrapTextNodes() builds for such cells.
 * @param {Element} cell
 * @returns {Element} the cell
 */
export function wrapLooseText(cell) {
  if (!cell) return cell;
  // aem.js wrapTextNodes() wraps the WHOLE cell in a <p> when its first element is inline
  // (`text<strong>…</strong><p>…</p>` -> <p> holding a <p>): undo it, attributes included
  const only = cell.children.length === 1 ? cell.firstElementChild : null;
  if (only && only.tagName === 'P'
    && [...only.children].some((child) => BLOCK_LEVEL.test(child.tagName))) {
    [...only.attributes].forEach(({ nodeName, nodeValue }) => {
      if (nodeName === 'class' || nodeName.startsWith('data-aue') || nodeName.startsWith('data-richtext')) {
        cell.setAttribute(nodeName, nodeValue);
      }
    });
    only.before(...only.childNodes);
    only.remove();
  }
  let run = [];
  const flush = () => {
    if (run.some((node) => node.textContent.trim())) {
      const p = document.createElement('p');
      run[0].before(p);
      p.append(...run);
    }
    run = [];
  };
  [...cell.childNodes].forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && NON_INLINE.test(node.tagName)) flush();
    else if ([Node.TEXT_NODE, Node.ELEMENT_NODE].includes(node.nodeType)) run.push(node);
  });
  flush();
  return cell;
}

/** Graffiti styles of the title RTE (styles-pulldown of content/title). */
export const GRAFFITI_VARIANTS = Object.freeze(['gradient', 'blue', 'white']);

/** `[[text]]` / `[[blue:text]]` authoring marker (plain-text title fields). */
const GRAFFITI_MARKER = /\[\[(?:(gradient|blue|white):)?([^\]]+?)\]\]/g;

/**
 * Whether the page is rendered inside Universal Editor (author instrumentation present).
 * @returns {boolean}
 */
function isEditorContext() {
  return !!document.querySelector('[data-aue-resource]');
}

/**
 * Creates a hidden authoring marker, kept only in Universal Editor so the inline text
 * editor reads back the original `[[…]]` value (textContent) instead of losing it.
 * @param {string} text
 * @returns {HTMLSpanElement}
 */
function graffitiMarker(text) {
  const marker = document.createElement('span');
  marker.className = 'graffiti-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = text;
  return marker;
}

/**
 * Replaces the `[[…]]` markers of one text node with span.graffiti-{variant}.
 * @param {Text} node
 * @param {boolean} keepMarkers
 */
function graffitiFromMarkers(node, keepMarkers) {
  const value = node.nodeValue;
  const matches = [...value.matchAll(GRAFFITI_MARKER)];
  if (!matches.length) return;
  const parts = [];
  let last = 0;
  matches.forEach((match) => {
    const [token, variant = 'gradient', text] = match;
    if (match.index > last) parts.push(document.createTextNode(value.slice(last, match.index)));
    const span = document.createElement('span');
    span.className = `graffiti-${variant}`;
    span.textContent = text;
    if (keepMarkers) {
      parts.push(graffitiMarker(token.slice(0, token.length - text.length - 2)), span, graffitiMarker(']]'));
    } else {
      parts.push(span);
    }
    last = match.index + token.length;
  });
  if (last < value.length) parts.push(document.createTextNode(value.slice(last)));
  node.before(...parts);
  node.remove();
}

/**
 * Graffiti of the title component (TitleModel RTE styles graffiti-gradient|blue|white),
 * authored in EDS with two conventions:
 *   - plain-text fields: `FERRER BOOTH [[M.01]]` · `[[blue:M.01]]` · `[[white:M.01]]`
 *   - rich-text headings: italic (<em>/<i>) = graffiti-gradient
 * Output: <span class="graffiti-{variant}">…</span>, like the original markup.
 * In Universal Editor the authored nodes are kept round-trippable: markers stay in hidden
 * span.graffiti-marker and <em> keeps its node with the graffiti class.
 * Idempotent: already decorated graffiti is left untouched.
 * @param {Element} heading
 * @returns {Element} the heading
 */
export function decorateGraffiti(heading) {
  if (!heading) return heading;
  const inEditor = isEditorContext();

  heading.querySelectorAll('em, i').forEach((em) => {
    if (GRAFFITI_VARIANTS.some((v) => em.classList.contains(`graffiti-${v}`))) return;
    if (inEditor) {
      em.classList.add('graffiti-gradient');
      return;
    }
    const span = document.createElement('span');
    span.className = 'graffiti-gradient';
    em.before(span);
    span.append(...em.childNodes);
    em.remove();
  });

  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue.includes('[[')) textNodes.push(walker.currentNode);
  }
  textNodes.forEach((node) => graffitiFromMarkers(node, inEditor));
  return heading;
}

/**
 * Resolves the typography class of a title (TitleModel.getFont()).
 *   'special-1' (default, Boldine) -> ferrer-h2-special-1
 *   'primary'   (DM Sans)          -> ferrer-h2
 *   'special-2' (Atomic marker)    -> ferrer-h2-special-2
 *   'hero-home'                    -> ferrer-title-special-1
 *   any value starting with 'ferrer-' is used as-is
 * @param {number} level 1-6
 * @param {string} [font='special-1']
 * @returns {string}
 */
export function getTitleFontClass(level, font = 'special-1') {
  if (font && font.startsWith('ferrer-')) return font;
  if (font === 'hero-home') return 'ferrer-title-special-1';
  if (font === 'primary') return `ferrer-h${level}`;
  if (font === 'special-2') return `ferrer-h${level}-special-2`;
  return `ferrer-h${level}-special-1`;
}

/**
 * Port of content/title/title.html:
 *   <div class="cmp-title"><h2 class="ferrer-h2-special-1">…</h2></div>
 * Pass `element` to decorate an existing heading in place (it is moved into the wrapper),
 * or `text`/`html` to create a new one.
 *
 * @param {object} options
 * @param {Element} [options.element] existing heading (or any element whose children are moved)
 * @param {string} [options.text] plain text content
 * @param {string} [options.html] rich content (TitleModel allows inline markup / graffiti spans)
 *   Graffiti markers (`[[…]]`, <em>) are converted with decorateGraffiti().
 * @param {number} [options.level=2] heading level for new headings (h1-h6)
 * @param {string} [options.font='special-1'] see getTitleFontClass()
 * @param {string} [options.link] wraps the content in <a class="cmp-title__link">
 * @param {string} [options.id] id of the heading (e.g. for aria-labelledby)
 * @param {string|string[]} [options.classes] extra classes for the heading
 * @param {boolean} [options.wrapper=true] false returns the heading without .cmp-title
 * @returns {HTMLElement|null}
 */
export function buildTitle({
  element,
  text,
  html,
  level = 2,
  font = 'special-1',
  link,
  id,
  classes,
  wrapper = true,
} = {}) {
  let heading;
  if (element && /^H[1-6]$/.test(element.tagName)) {
    heading = element;
  } else {
    if (!element && !text && !html) return null;
    heading = document.createElement(`h${Math.min(Math.max(Number(level) || 2, 1), 6)}`);
    if (element) {
      moveInstrumentation(element, heading);
      heading.append(...element.childNodes);
    } else if (html) heading.innerHTML = html;
    else heading.textContent = text;
  }
  decorateGraffiti(heading);
  const headingLevel = Number(heading.tagName.substring(1));
  heading.classList.add(getTitleFontClass(headingLevel, font), ...toClassList(classes));
  if (id) heading.id = id;

  if (link) {
    const a = document.createElement('a');
    a.className = 'cmp-title__link';
    a.href = link;
    a.append(...heading.childNodes);
    heading.append(a);
  }

  if (!wrapper) return heading;
  const wrap = document.createElement('div');
  wrap.className = 'cmp-title';
  if (heading.parentElement) heading.before(wrap);
  wrap.append(heading);
  return wrap;
}

/**
 * Port of content/text/text.html: <div class="cmp-text">rich text</div>.
 * @param {object} options
 * @param {Element|Node[]|NodeList} [options.nodes] existing nodes to move into the wrapper
 *   (an Element moves its child nodes; a list moves the nodes themselves)
 * @param {string} [options.html] rich text markup
 * @param {string} [options.text] plain text, rendered as <p class="cmp-text__paragraph">
 * @param {string|string[]} [options.classes] extra classes (e.g. 'ferrer-body-small')
 * @returns {HTMLDivElement|null}
 */
export function buildText({
  nodes,
  html,
  text,
  classes,
} = {}) {
  const wrap = document.createElement('div');
  wrap.classList.add('cmp-text', ...toClassList(classes));
  if (nodes) {
    if (nodes instanceof Element) {
      moveInstrumentation(nodes, wrap);
      wrap.append(...nodes.childNodes);
    } else wrap.append(...nodes);
  } else if (html) {
    wrap.innerHTML = html;
  } else if (text) {
    const p = document.createElement('p');
    p.className = 'cmp-text__paragraph';
    p.textContent = text;
    wrap.append(p);
  }
  if (!wrap.childNodes.length || !wrap.textContent.trim()) {
    if (!wrap.querySelector('img, picture, iframe')) return null;
  }
  return wrap;
}

/**
 * Port of content/image/image.html:
 *   <div class="cmp-image [cmp-image--hide-in-mobile]">
 *     [<a class="cmp-image__link">] <picture/> [</a>]
 *     [<span class="cmp-image__title">caption</span>]
 *   </div>
 * Accepts the same image options as buildPicture().
 *
 * @param {object} options buildPicture() options plus:
 * @param {string} [options.link] wraps the picture in a.cmp-image__link
 * @param {string} [options.caption] visible caption (.cmp-image__title)
 * @param {boolean} [options.hideInMobile=false] cmp-image--hide-in-mobile
 * @param {string|string[]} [options.classes] extra classes for the wrapper
 * @returns {HTMLDivElement|null} null when there is no image
 */
export function buildImage({
  link,
  caption,
  hideInMobile = false,
  classes,
  ...pictureOptions
} = {}) {
  const picture = buildPicture(pictureOptions);
  if (!picture) return null;
  const wrap = document.createElement('div');
  wrap.classList.add('cmp-image', ...toClassList(classes));
  if (hideInMobile) wrap.classList.add('cmp-image--hide-in-mobile');
  if (link) {
    const a = document.createElement('a');
    a.className = 'cmp-image__link';
    a.href = link;
    a.append(picture);
    wrap.append(a);
  } else {
    wrap.append(picture);
  }
  if (caption) {
    const title = document.createElement('span');
    title.className = 'cmp-image__title';
    title.textContent = caption;
    wrap.append(title);
  }
  return wrap;
}
