import { moveInstrumentation } from '../../scripts/scripts.js';
import { decorateAuthoredButton } from '../../scripts/ferrer-utils.js';
import { buildControls, createCarousel } from '../../scripts/ferrer-carousel.js';

/* UE instrumentation: Pendiente (Fase 3) */

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
 * Builds the decoration div of the AEM button child from the authored cta row.
 * @param {Element|undefined} row cta row (cta + ctaText + ctaType)
 * @param {string} wrapperClass classes of the AEM decoration div
 * @returns {HTMLElement|null}
 */
function buildCta(row, wrapperClass) {
  const anchor = row?.querySelector('a');
  if (!anchor) return null;
  const styled = decorateAuthoredButton(anchor);
  const wrapper = el('div', wrapperClass);
  if (styled) wrapper.classList.add(...[...styled.classList].filter((c) => c.startsWith('cmp-button--')));
  moveInstrumentation(row, wrapper);
  wrapper.append(anchor);
  return wrapper;
}

/**
 * Block numbers: highlighted figures; carousel unless there are exactly two items.
 *
 * DOM de entrada (matriz EDS, xwalk):
 *   block.block-numbers[.column][.text-white|.text-black|.text-special][.block-numbers--dark]
 *     ├── div > div        → cta (+ ctaText + ctaType): botón inferior
 *     └── div (n items)    → [title] [text]
 *
 * @param {Element} block the block element
 */
export default function decorate(block) {
  const [ctaRow, ...itemRows] = [...block.children];
  const size = itemRows.length;
  const isSwiper = size !== 2;
  const isColumn = block.classList.contains('column');

  const wrapper = el('div');
  wrapper.classList.add('block-numbers__wrapper');
  if (isSwiper) wrapper.classList.add('swiper');
  if (isColumn) wrapper.classList.add('block-numbers__wrapper--column');
  if (size === 3) wrapper.classList.add('block-numbers__wrapper--three-items');
  if (size === 2) wrapper.classList.add('block-numbers__wrapper--two-items');

  const list = el('ul');
  list.classList.add('block-numbers__list');
  if (isSwiper) list.classList.add('swiper-wrapper');
  itemRows.forEach((row) => {
    const [titleCell, textCell] = [...row.children];
    const li = el('li');
    li.classList.add('block-numbers__item');
    if (isSwiper) li.classList.add('swiper-slide');
    moveInstrumentation(row, li);
    const content = el('div');
    content.classList.add('block-numbers__content');
    const title = el('p');
    title.classList.add('block-numbers__title', 'ferrer-h1-special-2');
    const text = el('p');
    text.classList.add('block-numbers__text', 'ferrer-body-large', 'ferrer--bold');
    content.append(moveText(titleCell, title), moveText(textCell, text));
    li.append(content);
    list.append(li);
    row.remove();
  });
  wrapper.append(list);

  const controls = isSwiper ? buildControls() : null;
  if (controls) wrapper.append(controls);
  block.append(wrapper);

  const button = buildCta(ctaRow, 'button');
  if (button) {
    button.classList.add('block-numbers__button-container');
    block.append(button);
  }
  ctaRow?.remove();

  if (!isSwiper) return;

  const mobile = window.matchMedia('(max-width: 600px)');
  let carousel = null;
  const toggle = () => {
    if (isColumn && mobile.matches) {
      carousel?.destroy();
      carousel = null;
      return;
    }
    if (carousel) return;
    carousel = createCarousel(wrapper, {
      wrapper: list,
      slidesPerView: 'auto',
      freeMode: true,
      spaceBetween: 14,
      watchOverflow: true,
      centeredSlides: true,
      centeredSlidesBounds: true,
      breakpoints: {
        601: { centeredSlides: false, centeredSlidesBounds: false },
      },
      controls,
      pagination: { clickable: true },
    });
  };
  toggle();
  mobile.addEventListener('change', toggle);
}
