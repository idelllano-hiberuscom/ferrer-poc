/**
 * Ferrer carousel — vanilla replacement for the Swiper (Navigation + Pagination) instances
 * of core-ferrer (carousel-base, card-list, card-carousel-modal, block-numbers,
 * block-content-links). Native horizontal scroll + CSS scroll-snap; the Swiper class names
 * (swiper, swiper-wrapper, swiper-slide, swiper-pagination-bullet[-active],
 * swiper-button-disabled…) are kept so the original SCSS ports 1:1.
 *
 * Layout CSS lives in styles/styles.css (carousel core); controls in styles/lazy-styles.css.
 */
import { t, formatMessage } from './ferrer-i18n.js';

/**
 * Port of _shared/templates/carousel-control-panel/controls.html.
 *   <nav class="cmp-controls" aria-label="…">
 *     <div class="cmp-controls__pagination js-carousel-pagination" role="tablist"></div>
 *     <button class="cmp-controls__navigation cmp-controls__navigation--prev js-carousel-prev">
 *     <button class="cmp-controls__navigation cmp-controls__navigation--next js-carousel-next">
 *   </nav>
 * @param {string|{componentName?: string}} [name] component name appended to the
 *   "Navegación de" label (HTL behaviour); a string or { componentName }
 * @returns {HTMLElement} the <nav>; pass it to createCarousel({ controls })
 */
export function buildControls(name = '') {
  const componentName = (typeof name === 'string' ? name : name?.componentName) || '';
  const nav = document.createElement('nav');
  nav.className = 'cmp-controls';
  nav.setAttribute('aria-label', componentName
    ? `${t('common.accessibility.navigation')} ${componentName}`
    : t('common.accessibility.carousel.navigation'));

  const pagination = document.createElement('div');
  pagination.className = 'cmp-controls__pagination js-carousel-pagination';
  pagination.setAttribute('role', 'tablist');

  const makeButton = (direction, key, icon) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cmp-controls__navigation cmp-controls__navigation--${direction} js-carousel-${direction}`;
    button.setAttribute('aria-label', t(key));
    const i = document.createElement('i');
    i.className = icon;
    i.setAttribute('aria-hidden', 'true');
    button.append(i);
    return button;
  };

  nav.append(
    pagination,
    makeButton('prev', 'common.accessibility.previous', 'icon-arrow-left'),
    makeButton('next', 'common.accessibility.next', 'icon-arrow-right'),
  );
  return nav;
}

/**
 * Resolves an element option that may be an Element or a selector relative to a root.
 * @param {Element|string|null|undefined} value
 * @param {Element} root
 * @returns {Element|null}
 */
function resolveElement(value, root) {
  if (!value) return null;
  if (typeof value === 'string') return root.querySelector(value);
  return value;
}

/**
 * Merges the base params with every Swiper-like breakpoint whose key (min-width, px)
 * is <= window.innerWidth.
 * @param {object} base
 * @param {object} breakpoints
 * @returns {object}
 */
function resolveParams(base, breakpoints) {
  const width = window.innerWidth;
  return Object.keys(breakpoints || {})
    .map(Number)
    .filter((min) => !Number.isNaN(min) && min <= width)
    .sort((a, b) => a - b)
    .reduce((params, min) => ({ ...params, ...breakpoints[min] }), { ...base });
}

const FOCUSABLE = 'a[href], button, input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])';

/**
 * Creates a scroll-snap carousel on `container` (Swiper-compatible subset).
 *
 * Expected DOM (same as Swiper):
 *   container
 *     wrapper (.swiper-wrapper, or options.wrapper, or the first element child)
 *       slides (every element child of the wrapper)
 *     [controls from buildControls()]
 *
 * @param {HTMLElement} container carousel root (gets .swiper .swiper-horizontal …)
 * @param {object} [options]
 * @param {Element|string} [options.wrapper] wrapper element or selector
 * @param {number|'auto'} [options.slidesPerView=1] 'auto' = width from the slide CSS
 * @param {number} [options.spaceBetween=0] gap in px
 * @param {boolean} [options.centeredSlides=false]
 * @param {boolean} [options.freeMode=false] no snapping
 * @param {Object<number, object>} [options.breakpoints] Swiper-like { 601: {...}, 1024: {...} }
 * @param {HTMLElement} [options.controls] <nav> from buildControls(): wires prev/next/pagination
 * @param {{nextEl?: Element|string, prevEl?: Element|string}} [options.navigation]
 * @param {{el?: Element|string, clickable?: boolean}} [options.pagination]
 * @param {boolean|{enabled: boolean}} [options.keyboard=false] arrow keys inside the carousel
 * @param {boolean} [options.watchOverflow=true] hides controls when nothing overflows
 * @param {{init?: Function, slideChange?: Function}} [options.on] callbacks(api)
 * @returns {{destroy: Function, update: Function, slideTo: Function, slideNext: Function,
 *   slidePrev: Function, isBeginning: boolean, isEnd: boolean, isLocked: boolean,
 *   activeIndex: number, slides: HTMLElement[], el: HTMLElement, wrapperEl: HTMLElement}}
 */
export function createCarousel(container, options = {}) {
  const wrapper = resolveElement(options.wrapper, container)
    || container.querySelector('.swiper-wrapper')
    || container.firstElementChild;
  const controls = options.controls || null;
  const nextEl = resolveElement(options.navigation?.nextEl, container)
    || (controls && controls.querySelector('.js-carousel-next'));
  const prevEl = resolveElement(options.navigation?.prevEl, container)
    || (controls && controls.querySelector('.js-carousel-prev'));
  const paginationEl = resolveElement(options.pagination?.el, container)
    || (controls && controls.querySelector('.js-carousel-pagination'));
  const clickable = options.pagination?.clickable !== false;
  const keyboard = options.keyboard === true || options.keyboard?.enabled === true;
  const watchOverflow = options.watchOverflow !== false;
  const on = options.on || {};
  const base = {
    slidesPerView: options.slidesPerView ?? 1,
    spaceBetween: options.spaceBetween ?? 0,
    centeredSlides: !!options.centeredSlides,
    freeMode: !!options.freeMode,
  };

  const added = new Map(); // element -> classes added by us (removed on destroy)
  const addClass = (el, ...classes) => {
    if (!el) return;
    const mine = added.get(el) || new Set();
    classes.forEach((c) => {
      if (!el.classList.contains(c)) {
        el.classList.add(c);
        mine.add(c);
      }
    });
    added.set(el, mine);
  };

  let slides = [];
  let snaps = [0];
  let snapIndex = 0;
  let locked = false;
  let bullets = [];
  let frame = 0;
  let destroyed = false;
  let addedTabindex = false;

  const maxScroll = () => Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
  const isBeginning = () => wrapper.scrollLeft <= 1;
  const isEnd = () => wrapper.scrollLeft >= maxScroll() - 1;

  const slidePosition = (slide, centered) => {
    const offset = slide.offsetLeft - wrapper.firstElementChild.offsetLeft;
    const pos = centered ? offset - (wrapper.clientWidth - slide.offsetWidth) / 2 : offset;
    return Math.round(Math.min(Math.max(pos, 0), maxScroll()));
  };

  const api = {};

  const setDisabled = (button, disabled) => {
    if (!button) return;
    button.classList.toggle('swiper-button-disabled', disabled);
    button.classList.toggle('disabled', disabled);
    if (button.tagName === 'BUTTON') button.disabled = disabled;
  };

  const renderState = () => {
    const current = wrapper.scrollLeft;
    let nearest = 0;
    snaps.forEach((snap, index) => {
      if (Math.abs(snap - current) < Math.abs(snaps[nearest] - current)) nearest = index;
    });
    if (isEnd()) nearest = snaps.length - 1;
    const changed = nearest !== snapIndex;
    snapIndex = nearest;

    slides.forEach((slide, index) => slide.classList.toggle('swiper-slide-active', index === snapIndex));
    bullets.forEach((bullet, index) => {
      const active = index === snapIndex;
      bullet.classList.toggle('swiper-pagination-bullet-active', active);
      bullet.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    setDisabled(prevEl, isBeginning());
    setDisabled(nextEl, isEnd());
    if (changed && typeof on.slideChange === 'function') on.slideChange(api);
  };

  const onScroll = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      renderState();
    });
  };

  const scrollToPosition = (left) => {
    wrapper.scrollTo({ left, behavior: 'smooth' });
  };

  const buildBullets = () => {
    // rebuild only when the page count changes (keeps the focus of a bullet on resize)
    if (!paginationEl) return;
    if (bullets.length === snaps.length && bullets.every((b) => b.isConnected)) return;
    bullets.forEach((bullet) => bullet.remove());
    bullets = snaps.map((snap, index) => {
      const bullet = document.createElement(clickable ? 'button' : 'span');
      bullet.className = 'swiper-pagination-bullet';
      if (clickable) {
        bullet.type = 'button';
        bullet.setAttribute('role', 'tab');
        bullet.setAttribute('aria-label', formatMessage(t('common.accessibility.item-progress', '{0} / {1}'), index + 1, snaps.length));
        bullet.addEventListener('click', () => scrollToPosition(snaps[index]));
      }
      paginationEl.append(bullet);
      return bullet;
    });
  };

  const onPrev = () => scrollToPosition(snaps[Math.max(snapIndex - 1, 0)]);
  const onNext = () => scrollToPosition(snaps[Math.min(snapIndex + 1, snaps.length - 1)]);
  const onKeydown = (event) => {
    if (event.key === 'ArrowRight') onNext();
    else if (event.key === 'ArrowLeft') onPrev();
  };

  const update = () => {
    if (destroyed) return;
    slides = [...wrapper.children];
    const params = resolveParams(base, options.breakpoints);
    const auto = params.slidesPerView === 'auto';

    addClass(container, 'swiper', 'swiper-horizontal', 'swiper-initialized');
    addClass(wrapper, 'swiper-wrapper');
    slides.forEach((slide) => addClass(slide, 'swiper-slide'));
    container.classList.toggle('swiper-auto', auto);
    container.classList.toggle('swiper-centered', !!params.centeredSlides);
    container.classList.toggle('swiper-free-mode', !!params.freeMode);
    container.style.setProperty('--swiper-space-between', `${Number(params.spaceBetween) || 0}px`);
    if (auto) container.style.removeProperty('--swiper-slides-per-view');
    else container.style.setProperty('--swiper-slides-per-view', String(Number(params.slidesPerView) || 1));

    if (slides.length) {
      const positions = slides.map((slide) => slidePosition(slide, !!params.centeredSlides));
      snaps = positions.filter((pos, index) => index === 0 || pos - positions[index - 1] > 1);
      if (maxScroll() - snaps[snaps.length - 1] > 1) snaps.push(maxScroll());
    } else {
      snaps = [0];
    }

    locked = maxScroll() <= 1;
    const hide = watchOverflow && locked;
    [nextEl, prevEl].forEach((el) => el && el.classList.toggle('swiper-button-lock', hide));
    if (paginationEl) {
      addClass(paginationEl, 'swiper-pagination', 'swiper-pagination-bullets', 'swiper-pagination-horizontal');
      if (clickable) addClass(paginationEl, 'swiper-pagination-clickable');
      paginationEl.classList.toggle('swiper-pagination-lock', hide);
    }
    container.classList.toggle('swiper-lock', locked);

    buildBullets();
    if (!wrapper.querySelector(FOCUSABLE) && !wrapper.hasAttribute('tabindex')) {
      wrapper.setAttribute('tabindex', '0');
      addedTabindex = true;
    }
    snapIndex = Math.min(snapIndex, snaps.length - 1);
    renderState();
  };

  const resizeObserver = new ResizeObserver(() => update());

  const slideTo = (index, smooth = true) => {
    const target = slides[Math.min(Math.max(index, 0), slides.length - 1)];
    if (!target) return;
    const left = slidePosition(target, container.classList.contains('swiper-centered'));
    wrapper.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    resizeObserver.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
    wrapper.removeEventListener('scroll', onScroll);
    prevEl?.removeEventListener('click', onPrev);
    nextEl?.removeEventListener('click', onNext);
    container.removeEventListener('keydown', onKeydown);
    bullets.forEach((bullet) => bullet.remove());
    bullets = [];
    added.forEach((classes, el) => el.classList.remove(...classes));
    added.clear();
    container.classList.remove('swiper-auto', 'swiper-centered', 'swiper-free-mode', 'swiper-lock');
    container.style.removeProperty('--swiper-space-between');
    container.style.removeProperty('--swiper-slides-per-view');
    slides.forEach((slide) => slide.classList.remove('swiper-slide-active'));
    [nextEl, prevEl].forEach((el) => {
      if (!el) return;
      el.classList.remove('swiper-button-lock');
      setDisabled(el, false);
    });
    paginationEl?.classList.remove('swiper-pagination-lock');
    if (addedTabindex) wrapper.removeAttribute('tabindex');
    wrapper.scrollLeft = 0;
  };

  Object.defineProperties(api, {
    el: { value: container, enumerable: true },
    wrapperEl: { value: wrapper, enumerable: true },
    slides: { get: () => slides, enumerable: true },
    activeIndex: { get: () => Math.max(snapIndex, 0), enumerable: true },
    isBeginning: { get: isBeginning, enumerable: true },
    isEnd: { get: isEnd, enumerable: true },
    isLocked: { get: () => locked, enumerable: true },
    update: { value: update, enumerable: true },
    destroy: { value: destroy, enumerable: true },
    slideTo: { value: slideTo, enumerable: true },
    slideNext: { value: onNext, enumerable: true },
    slidePrev: { value: onPrev, enumerable: true },
  });

  if (!wrapper) return api;

  wrapper.addEventListener('scroll', onScroll, { passive: true });
  prevEl?.addEventListener('click', onPrev);
  nextEl?.addEventListener('click', onNext);
  if (keyboard) container.addEventListener('keydown', onKeydown);
  update();
  resizeObserver.observe(wrapper);
  if (typeof on.init === 'function') on.init(api);
  return api;
}
