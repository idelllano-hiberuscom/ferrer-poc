/**
 * Links List Block — AEM Edge Delivery Services
 *
 * Origen: core-ferrer content/links-list (links-list.html + LinksListModel/ItemModel.java)
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3)
 *
 * DOM de entrada (matriz EDS):
 *   div.links-list.cmp-links-list--{default|with-card|card-xl|xs}
 *       [.grid-template-columns-{2|3|4}][.links-list--dark]
 *     div (fila = links-list-item)
 *       div > [p >] a[href]{linkText}   link + linkText (texto solo en card-xl)
 *       div > title
 *       div > richtext                   description (texto plano en default/xs)
 *
 * DOM de salida (1:1 con el HTL, por vista):
 *   div.cmp-links-list.cmp-links-list--{view}[ grid-template-columns-N]
 *     ul.cmp-links-list__list > li.cmp-links-list__list-item > (a | div.js-open-modal | div)
 *   div.cmp-modal#links-list-N-modal-I (un modal por enlace a /modals/…)
 */
import { moveInstrumentation } from '../../scripts/scripts.js';
import { getLinkInfo } from '../../scripts/ferrer-utils.js';
import { buildModal, initModals } from '../../scripts/ferrer-modal.js';

/* UE instrumentation: Pendiente (Fase 3) */

const VIEWS = ['default', 'with-card', 'card-xl', 'xs'];
const COLUMN_VIEWS = ['with-card', 'card-xl'];
let instanceCount = 0;

/**
 * Creates an element with classes.
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

/**
 * Moves the inline content of a cell into `target` (unwraps a single <p>).
 * With several block children (rich text) only the text is kept, as the plain
 * `description` textarea of the original.
 * @param {Element} cell
 * @param {Element} target
 */
function moveInline(cell, target) {
  if (!cell) return;
  const blocks = cell.querySelectorAll(':scope > p, :scope > ul, :scope > ol, :scope > div');
  if (blocks.length > 1) {
    target.textContent = cell.textContent.trim();
    return;
  }
  const source = blocks.length === 1 && blocks[0].tagName === 'P' ? blocks[0] : cell;
  moveInstrumentation(source, target);
  target.append(...source.childNodes);
}

/**
 * Moves the rich content (html context) of a cell into `target`.
 * @param {Element} cell
 * @param {Element} target
 */
function moveRich(cell, target) {
  if (cell) target.append(...cell.childNodes);
}

/**
 * Creates the clickable wrapper: <a href> for links, a focusable div.js-open-modal for
 * modal links, or a plain div when there is no link.
 * @param {object} options
 * @param {string} options.className
 * @param {object} options.info getLinkInfo() result
 * @param {string} options.modalId
 * @returns {HTMLElement}
 */
function buildWrapper({ className, info, modalId }) {
  if (info.isModal) {
    const wrapper = el('div', `${className} js-open-modal`);
    wrapper.dataset.modalId = modalId;
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute('aria-haspopup', 'dialog');
    return wrapper;
  }
  const link = el('a', className);
  if (info.href) link.href = info.href;
  return link;
}

/**
 * Builds the ghost arrow button of the card views.
 * @param {string} [text] visible text (card-xl only)
 * @param {boolean} [large] cmp-button--large (with-card)
 * @returns {HTMLDivElement}
 */
function buildArrow(text, large) {
  const wrap = el('div', large ? 'cmp-button--ghost cmp-button--large' : 'cmp-button--ghost');
  const button = el('div', 'cmp-button');
  if (text !== undefined) {
    const label = el('p', 'cmp-button__text');
    label.textContent = text;
    button.append(label);
  }
  const icon = el('i', 'cmp-button__icon icon-arrow-up-right');
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  wrap.append(button);
  return wrap;
}

/**
 * view = default
 * @returns {HTMLElement}
 */
function renderDefault({
  info, modalId, titleCell, descriptionCell,
}) {
  const wrapper = buildWrapper({ className: 'cmp-links-list__link', info, modalId });
  const card = el('div', 'cmp-links-list__card');
  const title = el('p', 'cmp-links-list__title ferrer-body-large ferrer--bold');
  moveInline(titleCell, title);
  const description = el('p', 'cmp-links-list__description');
  moveInline(descriptionCell, description);
  card.append(title, description);
  const icon = el('i', `cmp-links-list__icon ${info.icon || ''}`.trim());
  icon.setAttribute('aria-hidden', 'true');
  wrapper.append(card, icon);
  return wrapper;
}

/**
 * view = with-card
 * @returns {HTMLElement}
 */
function renderWithCard({
  info, modalId, titleCell, descriptionCell,
}) {
  const hasLink = Boolean(info.href);
  const wrapper = hasLink
    ? buildWrapper({
      className: 'card-basic card--basic card--white cmp-links-list__card', info, modalId,
    })
    : el('div', 'card-basic cmp-links-list__card cmp-links-list__card--no-link');
  const content = el('div', 'card-basic__text card-basic__content');
  const title = el('p', 'ferrer--bold card-basic__header-title ferrer-h5');
  moveInline(titleCell, title);
  content.append(title);
  if (descriptionCell && descriptionCell.textContent.trim()) {
    const description = el('div', 'cmp-links-list__description');
    moveRich(descriptionCell, description);
    content.append(description);
  }
  wrapper.append(content);
  if (hasLink) wrapper.append(buildArrow(undefined, true));
  return wrapper;
}

/**
 * view = card-xl
 * @returns {HTMLElement}
 */
function renderCardXl({
  info, modalId, titleCell, descriptionCell, linkText,
}) {
  const hasLink = Boolean(info.href);
  const wrapper = hasLink
    ? buildWrapper({ className: 'card-basic cmp-links-list__card', info, modalId })
    : el('div', 'card-basic cmp-links-list__card cmp-links-list__card--no-link');
  const content = el('div', 'card-basic__text card-basic__content');
  const title = el('p', 'ferrer--bold card-basic__header-title ferrer-h4');
  moveInline(titleCell, title);
  content.append(title);
  moveRich(descriptionCell, content);
  wrapper.append(content);
  if (hasLink) wrapper.append(buildArrow(linkText));
  return wrapper;
}

/**
 * view = xs
 * @returns {HTMLElement}
 */
function renderXs({
  info, modalId, titleCell,
}) {
  const wrapper = buildWrapper({ className: 'cmp-links-list__link', info, modalId });
  const card = el('div', 'cmp-links-list__card');
  const title = el('p', 'cmp-links-list__title ferrer--bold');
  moveInline(titleCell, title);
  title.append(' ');
  const icon = el('i', info.icon || '');
  icon.setAttribute('aria-hidden', 'true');
  title.append(icon);
  card.append(title);
  wrapper.append(card);
  return wrapper;
}

const RENDERERS = {
  default: renderDefault,
  'with-card': renderWithCard,
  'card-xl': renderCardXl,
  xs: renderXs,
};

/**
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  instanceCount += 1;
  const cmpId = `links-list-${instanceCount}`;

  const view = VIEWS.find((v) => block.classList.contains(`cmp-links-list--${v}`)) || 'default';
  const columnsClass = [...block.classList].find((c) => /^grid-template-columns-\d$/.test(c))
    || 'grid-template-columns-3';
  // the view / columns options live on the inner .cmp-links-list (as in the HTL)
  block.classList.remove(`cmp-links-list--${view}`, columnsClass);

  const component = el('div', `cmp-links-list cmp-links-list--${view}`);
  if (COLUMN_VIEWS.includes(view)) component.classList.add(columnsClass);
  const list = el('ul', 'cmp-links-list__list');
  const modals = [];

  [...block.children].forEach((row, index) => {
    const [linkCell, titleCell, descriptionCell] = row.children;
    const authoredLink = linkCell && linkCell.querySelector('a');
    const href = authoredLink ? authoredLink.getAttribute('href') : '';
    const rawText = authoredLink ? authoredLink.textContent.trim() : '';
    const info = getLinkInfo(href);
    const modalId = `${cmpId}-modal-${index}`;

    const item = el('li', 'cmp-links-list__list-item');
    moveInstrumentation(row, item);
    item.append(RENDERERS[view]({
      info,
      modalId,
      titleCell,
      descriptionCell,
      linkText: rawText === href ? '' : rawText,
    }));
    list.append(item);

    if (info.isModal) modals.push(buildModal({ id: modalId, path: href }));
    row.remove();
  });

  component.append(list);
  block.append(component, ...modals);
  if (modals.length) initModals(block);
}
