import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildPicture, getLinkInfo } from '../../scripts/ferrer-utils.js';
import { t } from '../../scripts/ferrer-i18n.js';
import { buildControls, createCarousel } from '../../scripts/ferrer-carousel.js';

/* UE instrumentation: Pendiente (Fase 3) */

const VIEWS = ['view-1', 'view-2', 'view-3', 'view-4'];

/**
 * Swiper configuration per view (card-list.js#getSwiperConfig).
 * @param {string} view view-1…view-4
 * @returns {object}
 */
function getCarouselConfig(view) {
  const base = { spaceBetween: 16, watchOverflow: true };
  switch (view) {
    case 'view-1':
      return { ...base, slidesPerView: 1.1, breakpoints: { 1024: { slidesPerView: 3 } } };
    case 'view-2':
      return {
        ...base,
        slidesPerView: 1,
        breakpoints: { 601: { slidesPerView: 2 }, 1024: { slidesPerView: 3 } },
      };
    case 'view-3':
      return {
        ...base,
        slidesPerView: 1,
        breakpoints: { 601: { slidesPerView: 2 }, 1024: { slidesPerView: 4 } },
      };
    case 'view-4':
      return { ...base, slidesPerView: 1.1, breakpoints: { 1024: { slidesPerView: 2 } } };
    default:
      return { ...base, slidesPerView: 1 };
  }
}

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
 * Creates an icon element.
 * @param {string} className icon classes
 * @returns {HTMLElement}
 */
function icon(className) {
  const i = el('i', className);
  i.setAttribute('aria-hidden', 'true');
  return i;
}

/**
 * Reads the authored cells of a card row: [image] [title] [description] [link + linkText].
 * @param {Element} row item row
 * @returns {object}
 */
function readCard(row) {
  const [imageCell, titleCell, descriptionCell, linkCell] = [...row.children];
  const anchor = linkCell?.querySelector('a');
  const href = anchor?.getAttribute('href');
  const img = imageCell?.querySelector('img');
  return {
    picture: img ? buildPicture({ src: img }) : null,
    titleCell,
    descriptionCell,
    anchor,
    href: href ? getLinkInfo(href).href : '',
    linkText: anchor && anchor.textContent.trim() !== href ? anchor.textContent.trim() : '',
  };
}

/**
 * Creates the card link with the authored anchor instrumentation.
 * @param {object} card card data
 * @param {string} className link classes
 * @returns {HTMLAnchorElement}
 */
function cardLink(card, className) {
  const link = el('a', className);
  if (card.href) link.href = card.href;
  if (card.anchor) moveInstrumentation(card.anchor, link);
  return link;
}

/**
 * Builds the media wrapper of a card.
 * @param {string} className wrapper class
 * @param {HTMLPictureElement|null} picture picture
 * @returns {HTMLElement}
 */
function media(className, picture) {
  const wrapper = el('div', className);
  if (picture) wrapper.append(picture);
  return wrapper;
}

/**
 * card-templates.html#view1
 * @param {object} card card data
 * @returns {HTMLElement}
 */
function view1(card) {
  const root = el('div', 'card-basic card-basic--dark card-basic--transparent');
  const content = el('div', 'card-basic__content');
  const info = el('div', 'card-basic__content-info');
  const header = el('div', 'card-basic__header');
  header.append(moveText(card.titleCell, el('h3', 'card-basic__header-title ferrer-h5')));
  info.append(header, moveText(card.descriptionCell, el('p')));
  content.append(info);
  root.append(media('card-basic__media', card.picture), content);
  return root;
}

/**
 * card-templates.html#view2
 * @param {object} card card data
 * @returns {HTMLElement}
 */
function view2(card) {
  const root = cardLink(card, 'card-basic card-basic--transparent');
  const content = el('div', 'card-basic__content');
  const info = el('div', 'card-basic__content-info');
  const header = el('div', 'card-basic__header');
  const title = moveText(card.titleCell, el('h3', 'card-basic__header-title ferrer-h5'));
  header.append(title, icon('card-basic__header-icon icon-arrow-up-right'));
  info.append(header);
  content.append(info);
  root.setAttribute('aria-label', title.textContent.trim());
  root.append(media('card-basic__media', card.picture), content);
  return root;
}

/**
 * card-templates.html#view3
 * @param {object} card card data
 * @returns {HTMLElement}
 */
function view3(card) {
  const root = el('div', 'card-stories');
  const content = el('div', 'card-stories__content');
  const text = el('div', 'card-stories__content-text');
  const title = moveText(card.titleCell, el('h3', 'card-stories__title ferrer--bold'));
  text.append(title, moveText(card.descriptionCell, el('p', 'card-stories__description ferrer-body-xsmall')));

  const actions = el('div', 'card-stories__content-actions');
  const button = el('div', 'cmp-button--ghost cmp-button--small');
  const link = cardLink(card, 'cmp-button cmp-button--small');
  link.setAttribute('aria-label', title.textContent.trim());
  const label = el('span', 'cmp-button__text');
  label.textContent = card.linkText || t('card-list.component.view-history');
  link.append(label, icon('cmp-button__icon icon-arrow-up-right'));
  button.append(link);
  actions.append(button);

  content.append(text, actions);
  root.append(media('card-stories__media', card.picture), content);
  return root;
}

/**
 * card-templates.html#view4
 * @param {object} card card data
 * @returns {HTMLElement}
 */
function view4(card) {
  const root = cardLink(card, 'card-actions-large');
  const title = moveText(card.titleCell, el('h2', 'ferrer-h3-special-1 ferrer--white ferrer--bold card-actions-large__title'));
  root.setAttribute('aria-label', title.textContent.trim());
  if (card.picture) root.append(card.picture);
  root.append(title, icon('card-actions-large__icon icon-arrow-up-right ferrer--white'));
  return root;
}

const TEMPLATES = {
  'view-1': view1, 'view-2': view2, 'view-3': view3, 'view-4': view4,
};

/**
 * Card list: carousel of cards in four views.
 *
 * DOM de entrada (matriz EDS, xwalk):
 *   block.card-list.view-N[.column][.card-list--white]
 *     └── div (n items) → [image] [title] [description] [link + linkText]
 *
 * @param {Element} block the block element
 */
export default function decorate(block) {
  const view = VIEWS.find((v) => block.classList.contains(v)) || '';
  const isColumn = block.classList.contains('column');
  const rows = [...block.children];

  const container = el('div', `cmp-card-list cmp-card-list--${view} cmp-card-list__swiper`);
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', t('card-list.component.name', 'Card list'));

  const list = el('ul', 'cmp-card-list__cards swiper-wrapper');
  list.setAttribute('aria-live', 'polite');
  rows.forEach((row) => {
    const li = el('li', 'cmp-card-list__item swiper-slide');
    moveInstrumentation(row, li);
    const template = TEMPLATES[view];
    if (template) li.append(template(readCard(row)));
    list.append(li);
    row.remove();
  });

  const controls = buildControls();
  container.append(list, controls);
  block.append(container);

  const desktop = window.matchMedia('(min-width: 1024px)');
  let carousel = null;
  const toggle = () => {
    if (!desktop.matches && isColumn) {
      carousel?.destroy();
      carousel = null;
      container.classList.add('no-swiper');
      return;
    }
    container.classList.remove('no-swiper');
    // restart to apply the new screen changes (original behaviour)
    carousel?.destroy();
    carousel = createCarousel(container, {
      wrapper: list,
      controls,
      pagination: { clickable: true },
      ...getCarouselConfig(view),
    });
  };
  toggle();
  desktop.addEventListener('change', toggle);
}
