import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildImage, buildText } from '../../scripts/ferrer-utils.js';
import { formatMessage, t } from '../../scripts/ferrer-i18n.js';

/* UE instrumentation: Pendiente (Fase 3) */

const DEFAULT_DELAY = 5000;
let instances = 0;

/**
 * Creates an element with the given classes.
 * @param {string} tag tag name
 * @param {string} [className] space separated classes
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Port of carousel-simple/controls.html (Core Carousel actions).
 * @returns {{actions: HTMLElement, previous: HTMLButtonElement, next: HTMLButtonElement}}
 */
function buildActions() {
  const actions = el('div', 'cmp-carousel__actions cmp-controls');
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', t('Carousel navigation', 'Carousel navigation'));

  const makeButton = (modifier, hook, key, iconClass) => {
    const button = el('button', `cmp-controls__navigation cmp-controls__navigation--${modifier === 'previous' ? 'prev' : 'next'} cmp-carousel__action cmp-carousel__action--${modifier}`);
    button.type = 'button';
    const label = t(key, key);
    button.setAttribute('aria-label', label);
    button.dataset.cmpHookCarousel = hook;
    const icon = el('span', iconClass);
    icon.setAttribute('aria-hidden', 'true');
    const text = el('span', 'cmp-carousel__action-text');
    text.textContent = label;
    button.append(icon, text);
    return button;
  };

  const previous = makeButton('previous', 'previous', 'Previous', 'icon-arrow-left');
  const next = makeButton('next', 'next', 'Next', 'icon-arrow-right');
  actions.append(previous, next);
  return { actions, previous, next };
}

/**
 * Builds the item content (image and/or text component) of an authored row.
 * @param {Element} row item row: [image] [text] [title]
 * @returns {{nodes: HTMLElement[], title: string}}
 */
function readItem(row) {
  const [imageCell, textCell, titleCell] = [...row.children];
  const nodes = [];
  const img = imageCell?.querySelector('img');
  if (img) {
    const image = buildImage({ src: img });
    if (image) {
      const decoration = el('div', 'image');
      decoration.append(image);
      nodes.push(decoration);
    }
  }
  if (textCell?.textContent.trim()) {
    const text = buildText({ nodes: textCell });
    if (text) {
      const decoration = el('div', 'text');
      decoration.append(text);
      nodes.push(decoration);
    }
  }
  return { nodes, title: titleCell?.textContent.trim() || '' };
}

/**
 * Port of the Core Carousel v1 runtime (carousel.js of core.wcm.components.carousel.v1)
 * plus the Ferrer extension (carousel-simple.js): arrows hidden and inert at the ends.
 * @param {HTMLElement} carousel .cmp-carousel element
 * @param {object} options { autoplay, delay, autopauseDisabled }
 */
function initCarousel(carousel, { autoplay, delay, autopauseDisabled }) {
  const content = carousel.querySelector('.cmp-carousel__content');
  const items = [...carousel.querySelectorAll('[data-cmp-hook-carousel="item"]')];
  const indicators = [...carousel.querySelectorAll('[data-cmp-hook-carousel="indicator"]')];
  const previous = carousel.querySelector('[data-cmp-hook-carousel="previous"]');
  const next = carousel.querySelector('[data-cmp-hook-carousel="next"]');
  if (!items.length) return;

  let active = Math.max(items.findIndex((item) => item.classList.contains('cmp-carousel__item--active')), 0);
  let interval = null;
  let paused = false;
  const lastIndex = items.length - 1;

  // Ferrer: hide the arrows at the ends (CSS .cmp-controls .is-disabled)
  const updateArrows = () => {
    previous?.classList.toggle('is-disabled', active === 0);
    next?.classList.toggle('is-disabled', active === lastIndex);
  };

  const refreshActive = () => {
    items.forEach((item, index) => {
      const isActive = index === active;
      item.classList.toggle('cmp-carousel__item--active', isActive);
      if (isActive) item.removeAttribute('aria-hidden');
      else item.setAttribute('aria-hidden', 'true');
    });
    indicators.forEach((indicator, index) => {
      const isActive = index === active;
      indicator.classList.toggle('cmp-carousel__indicator--active', isActive);
      indicator.setAttribute('aria-selected', isActive ? 'true' : 'false');
      indicator.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    updateArrows();
  };

  const navigate = (index) => {
    if (index < 0 || index > lastIndex) return;
    active = index;
    refreshActive();
  };

  const stopAutoplay = () => {
    window.clearInterval(interval);
    interval = null;
  };

  const startAutoplay = () => {
    if (!autoplay || paused) return;
    stopAutoplay();
    content.setAttribute('aria-live', 'off');
    interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      navigate(active === lastIndex ? 0 : active + 1);
    }, delay);
  };

  const pause = () => {
    paused = true;
    stopAutoplay();
    content.setAttribute('aria-live', 'polite');
  };

  const resume = () => {
    paused = false;
    startAutoplay();
  };

  const navigateAndFocusIndicator = (index) => {
    navigate(index);
    indicators[index]?.focus();
  };

  // Ferrer: the arrows do not wrap around at the ends
  previous?.addEventListener('click', () => {
    if (active === 0) return;
    navigate(active - 1);
    if (autoplay) startAutoplay();
  });
  next?.addEventListener('click', () => {
    if (active === lastIndex) return;
    navigate(active + 1);
    if (autoplay) startAutoplay();
  });

  indicators.forEach((indicator, index) => {
    indicator.addEventListener('click', () => navigateAndFocusIndicator(index));
  });

  carousel.querySelector('[data-cmp-hook-carousel="indicators"]')?.addEventListener('keydown', (event) => {
    const keys = {
      ArrowLeft: active === 0 ? lastIndex : active - 1,
      ArrowUp: active === 0 ? lastIndex : active - 1,
      ArrowRight: active === lastIndex ? 0 : active + 1,
      ArrowDown: active === lastIndex ? 0 : active + 1,
      Home: 0,
      End: lastIndex,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    navigateAndFocusIndicator(keys[event.key]);
  });

  if (autoplay && !autopauseDisabled) {
    carousel.addEventListener('mouseenter', pause);
    carousel.addEventListener('mouseleave', resume);
    carousel.addEventListener('focusin', pause);
    carousel.addEventListener('focusout', resume);
  }

  refreshActive();
  startAutoplay();
}

/**
 * Carousel simple: port of Core Carousel (ferrer-catalog-ds/components/content/carousel-simple).
 *
 * DOM de entrada (matriz EDS, xwalk):
 *   block.carousel-simple[.autoplay][.autopause-disabled]
 *     ├── div > div        → delay (ms, default 5000)
 *     ├── div > div        → accessibilityLabel
 *     └── div (n items)    → [image] [text (richtext)] [title (indicator / slide label)]
 *
 * @param {Element} block the block element
 */
export default function decorate(block) {
  instances += 1;
  const id = `carousel-simple-${instances}`;
  const [delayRow, labelRow, ...itemRows] = [...block.children];
  const delay = Number.parseInt(delayRow?.textContent.trim(), 10) || DEFAULT_DELAY;
  const label = labelRow?.textContent.trim() || '';
  const inEditor = document.documentElement.classList.contains('adobe-ue-edit');
  const autoplay = block.classList.contains('autoplay') && !inEditor;
  const autopauseDisabled = block.classList.contains('autopause-disabled');

  const carousel = el('div', 'cmp-carousel content-container');
  carousel.id = id;
  carousel.setAttribute('role', 'region');
  if (label) carousel.setAttribute('aria-label', label);
  carousel.setAttribute('aria-roledescription', 'carousel');
  carousel.dataset.cmpIs = 'carousel';
  if (autoplay) carousel.dataset.cmpAutoplay = 'true';
  carousel.dataset.cmpDelay = String(delay);
  if (autopauseDisabled) carousel.dataset.cmpAutopauseDisabled = 'true';

  const content = el('div', 'cmp-carousel__content');
  content.setAttribute('aria-atomic', 'false');
  content.setAttribute('aria-live', autoplay ? 'off' : 'polite');

  const indicators = el('ol', 'cmp-carousel__indicators cmp-controls__pagination');
  indicators.setAttribute('role', 'tablist');
  indicators.setAttribute('aria-label', t('Choose a slide to display', 'Choose a slide to display'));
  indicators.dataset.cmpHookCarousel = 'indicators';

  const total = itemRows.length;
  itemRows.forEach((row, index) => {
    const itemId = `${id}-item-${index + 1}`;
    const { nodes, title } = readItem(row);

    const item = el('div', `cmp-carousel__item${index === 0 ? ' cmp-carousel__item--active' : ''}`);
    moveInstrumentation(row, item);
    item.id = `${itemId}-tabpanel`;
    item.setAttribute('role', 'tabpanel');
    item.setAttribute('aria-labelledby', `${itemId}-tab`);
    item.setAttribute('aria-roledescription', 'slide');
    item.setAttribute('aria-label', formatMessage(t('Slide {0} of {1}', 'Slide {0} of {1}'), index + 1, total));
    item.dataset.cmpHookCarousel = 'item';
    item.append(...nodes);
    content.append(item);

    const indicator = el('li', `swiper-pagination-bullet cmp-carousel__indicator${index === 0 ? ' cmp-carousel__indicator--active' : ''}`);
    indicator.id = `${itemId}-tab`;
    indicator.setAttribute('role', 'tab');
    indicator.setAttribute('aria-controls', `${itemId}-tabpanel`);
    indicator.setAttribute('aria-label', formatMessage(t('Slide {0}', 'Slide {0}'), index + 1));
    indicator.dataset.cmpHookCarousel = 'indicator';
    indicator.textContent = title;
    indicators.append(indicator);
    row.remove();
  });

  if (total > 0) {
    // controlsPrepended = false (Core default): actions after the items, inside the content
    content.append(buildActions().actions, indicators);
    carousel.append(content);
  }
  [delayRow, labelRow].forEach((row) => row?.remove());
  block.append(carousel);

  initCarousel(carousel, { autoplay, delay, autopauseDisabled });
}
