import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildPicture, getLinkInfo } from '../../scripts/ferrer-utils.js';
import { t } from '../../scripts/ferrer-i18n.js';
import { buildControls, createCarousel } from '../../scripts/ferrer-carousel.js';
import { buildModal, initModals } from '../../scripts/ferrer-modal.js';

/* UE instrumentation: Pendiente (Fase 3) */

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
 * Moves the content of an authored cell into a new element, keeping the UE instrumentation.
 * A single wrapping <p> is unwrapped (its children are moved, not the <p>).
 * @param {Element|undefined} cell authored cell
 * @param {HTMLElement} target new element
 * @returns {HTMLElement}
 */
function moveText(cell, target) {
  if (!cell) return target;
  moveInstrumentation(cell, target);
  const only = cell.children.length === 1 && cell.firstElementChild.tagName === 'P'
    ? cell.firstElementChild : null;
  if (only) moveInstrumentation(only, target);
  target.append(...(only || cell).childNodes);
  return target;
}

/**
 * Builds the button content (text + icon) of the card actions.
 * @param {HTMLElement} control <a> or <button>
 * @param {string} text visible text
 * @param {string} iconClass icomoon class
 */
function fillButton(control, text, iconClass) {
  const label = el('span', 'cmp-button__text');
  label.textContent = text;
  const icon = el('i', `cmp-button__icon ${iconClass}`);
  icon.setAttribute('aria-hidden', 'true');
  control.append(label, icon);
}

/**
 * Builds one card (card-carousel-modal.html) and returns it with its modal path.
 * @param {Element} row item row: [image] [title] [link] [modalPath]
 * @param {string} modalId id of the card modal
 * @returns {{li: HTMLElement, modalPath: string}}
 */
function buildCard(row, modalId) {
  const [imageCell, titleCell, linkCell, modalCell] = [...row.children];
  const li = el('li', 'swiper-slide');
  moveInstrumentation(row, li);

  const card = el('div', 'card-basic');
  const mediaWrapper = el('div', 'card-basic__media');
  const img = imageCell?.querySelector('img');
  const picture = img ? buildPicture({ src: img }) : null;
  if (picture) mediaWrapper.append(picture);

  const container = el('div', 'card-basic__content-container');
  const content = el('div', 'card-basic__content');
  const header = el('div', 'card-basic__header');
  header.append(moveText(titleCell, el('h3', 'card-basic__header-title ferrer-h5')));
  content.append(header);

  const actions = el('div', 'card-basic__actions');
  const ghost = el('div', 'cmp-button--ghost');
  const showMore = el('button', 'cmp-button cmp-button--small js-open-modal');
  showMore.dataset.modalId = modalId;
  const modalAnchor = modalCell?.querySelector('a');
  if (modalAnchor) moveInstrumentation(modalAnchor, showMore);
  fillButton(showMore, t('card-carousel-modal.component.show-more'), 'icon-plus');
  ghost.append(showMore);

  const primary = el('div', 'button cmp-button--primary cmp-button--light cmp-button--small');
  const anchor = linkCell?.querySelector('a');
  const href = anchor?.getAttribute('href');
  if (href) {
    const apply = el('a', 'cmp-button');
    apply.href = getLinkInfo(href).href;
    moveInstrumentation(anchor, apply);
    fillButton(apply, t('card-carousel-modal.component.apply'), 'icon-link-external');
    primary.append(apply);
  }
  actions.append(ghost, primary);

  container.append(content, actions);
  card.append(mediaWrapper, container);
  li.append(card);

  return { li, modalPath: modalAnchor?.getAttribute('href') || modalCell?.textContent.trim() || '' };
}

/**
 * Card carousel modal: cards with a "show more" modal (fragment) and an "apply" link.
 *
 * DOM de entrada (matriz EDS, xwalk):
 *   block.card-carousel-modal[.overlay-disabled][.blur-enabled]
 *     └── div (n items) → [image] [title] [link] [modalPath]
 *
 * @param {Element} block the block element
 */
export default function decorate(block) {
  instances += 1;
  const componentId = `card-carousel-modal-${instances}`;
  const rows = [...block.children];

  const wrapper = el('div', 'cmp-card-carousel-modal');
  wrapper.dataset.componentId = componentId;
  const swiperEl = el('div', 'cmp-card-carousel-modal__carousel swiper');
  const list = el('ul', 'swiper-wrapper');

  const modals = rows.map((row, index) => {
    const modalId = `${componentId}-modal-${index}`;
    const { li, modalPath } = buildCard(row, modalId);
    list.append(li);
    row.remove();
    return buildModal({
      id: modalId,
      path: modalPath,
      overlayDisabled: block.classList.contains('overlay-disabled'),
      blurEnabled: block.classList.contains('blur-enabled'),
    });
  });

  const controls = buildControls();
  swiperEl.append(list, controls);
  wrapper.append(swiperEl);
  block.append(wrapper, ...modals);
  initModals(block);

  const total = list.children.length;
  const mobile = window.matchMedia('(max-width: 767px)');
  const tablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
  const desktop = window.matchMedia('(min-width: 1024px)');
  let carousel = null;

  const getSlidesPerView = () => {
    if (mobile.matches) return 1.1;
    if (tablet.matches) return 3;
    return 4;
  };

  const initOrDestroy = () => {
    const sliderNeeded = total >= getSlidesPerView();
    if (sliderNeeded && !carousel) {
      carousel = createCarousel(swiperEl, {
        wrapper: list,
        spaceBetween: 8,
        slidesPerView: 1.1,
        controls,
        pagination: { clickable: true },
        breakpoints: {
          768: { slidesPerView: 2 },
          1024: { slidesPerView: 3 },
        },
      });
      swiperEl.classList.add('is-slider');
      swiperEl.classList.remove('no-slider');
    } else if (!sliderNeeded) {
      carousel?.destroy();
      carousel = null;
      swiperEl.classList.remove('is-slider');
      swiperEl.classList.add('no-slider');
    }
  };

  initOrDestroy();
  [mobile, tablet, desktop].forEach((query) => query.addEventListener('change', initOrDestroy));
}
