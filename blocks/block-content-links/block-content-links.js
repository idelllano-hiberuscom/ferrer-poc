import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  buildImage, buildText, buildTitle, decorateAuthoredButton, getLinkInfo,
} from '../../scripts/ferrer-utils.js';
import { formatMessage, t } from '../../scripts/ferrer-i18n.js';
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
 * Wraps a component markup in its AEM decoration div (div.title, div.text, div.image…).
 * @param {string} className decoration class
 * @param {HTMLElement|null} component component markup
 * @returns {HTMLElement|null}
 */
function decorationDiv(className, component) {
  if (!component) return null;
  const wrapper = el('div', className);
  wrapper.append(component);
  return wrapper;
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
 * Splits the grouped content cell (content_title + content_titleType + content_text)
 * into the title child (content/title) and the text child (content/text).
 * @param {Element|undefined} row content row
 * @returns {HTMLElement[]} [div.title?, div.text?]
 */
function buildContentChildren(row) {
  const cell = row?.firstElementChild;
  if (!cell?.textContent.trim()) return [];
  const heading = cell.querySelector(':scope > :is(h1, h2, h3, h4, h5, h6)');
  const title = heading ? decorationDiv('title', buildTitle({ element: heading })) : null;
  const rest = [...cell.childNodes].filter((node) => node !== heading
    && (node.nodeType === Node.ELEMENT_NODE || node.textContent.trim()));
  const text = rest.length ? decorationDiv('text', buildText({ nodes: rest })) : null;
  if (text) moveInstrumentation(cell, text.firstElementChild);
  return [title, text].filter(Boolean);
}

/**
 * Builds a card-basic of the items carousel (block-content-links.html).
 * @param {Element} row item row: [title] [text] [link]
 * @returns {HTMLElement}
 */
function buildCard(row) {
  const [titleCell, textCell, linkCell] = [...row.children];
  const anchor = linkCell?.querySelector('a');
  const href = anchor?.getAttribute('href');

  const content = el('div', 'card-basic__content');
  const header = el('div', 'card-basic__header');
  const title = moveText(titleCell, el('h3', 'card-basic__header-title ferrer-h5'));
  header.append(title);
  // rich text: a single paragraph keeps the original <p>; block content needs a <div>
  const blocks = textCell ? [...textCell.children].filter((c) => /^(P|UL|OL|H\d|DIV)$/.test(c.tagName)) : [];
  const description = moveText(textCell, el(blocks.length > 1 ? 'div' : 'p', 'card-basic__content-description'));
  content.append(header, description);

  if (!href) {
    const card = el('div', 'card-basic');
    card.append(content);
    return card;
  }

  const info = getLinkInfo(href);
  const card = el('a', 'card-basic card-basic--has-link');
  card.href = info.href;
  moveInstrumentation(anchor, card);
  card.setAttribute('aria-label', title.textContent.trim());
  const iconWrapper = el('div', 'link-icon');
  const icon = el('i', info.icon);
  icon.setAttribute('aria-hidden', 'true');
  iconWrapper.append(icon);
  card.append(content, iconWrapper);
  return card;
}

/**
 * Block content links: title/text/button + image, followed by a carousel of link cards.
 *
 * DOM de entrada (matriz EDS, xwalk):
 *   block.block-content-links[.reverse-align][.block-content-links--grey][.template-theme--*]
 *     ├── div > div        → content_title (+ content_titleType) + content_text (richtext)
 *     ├── div > div        → cta (+ ctaText + ctaType)
 *     ├── div > div        → image (+ imageAlt)
 *     └── div (n items)    → [title] [text (richtext)] [link]
 *
 * @param {Element} block the block element
 */
export default function decorate(block) {
  const [contentRow, ctaRow, imageRow, ...itemRows] = [...block.children];

  const region = el('div', 'cmp-block-content-links component-spacing');
  if (block.classList.contains('reverse-align')) region.classList.add('reverse-align');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-roledescription', 'carrusel');
  region.setAttribute('aria-label', t('block-content-links.component.name', 'Content block with links'));

  // text block + image
  const content = el('div', 'cmp-block-content-links__content content-container ferrer-row');
  const textColumn = el('div', 'cmp-block-content-links__content-text col-12 col-xl-6');
  textColumn.append(...buildContentChildren(contentRow));
  const button = buildCta(ctaRow, 'button');
  if (button) textColumn.append(button);

  const imageColumn = el('div', 'cmp-block-content-links__content-image col-12 col-xl-6');
  const img = imageRow?.querySelector('img');
  const image = img ? decorationDiv('image', buildImage({ src: img })) : null;
  if (image) imageColumn.append(image);
  content.append(textColumn, imageColumn);

  // items
  const items = el('div', 'cmp-block-content-links__items js-carouselContentLinks');
  const list = el('ul', 'swiper-wrapper cmp-block-content-links__items-list');
  list.setAttribute('aria-live', 'polite');
  itemRows.forEach((row, index) => {
    const li = el('li', 'swiper-slide');
    moveInstrumentation(row, li);
    li.setAttribute('role', 'group');
    li.setAttribute('aria-label', formatMessage(t('common.accessibility.item-progress', '{0} / {1}'), index + 1, itemRows.length));
    li.append(buildCard(row));
    list.append(li);
  });
  const controls = buildControls();
  items.append(list, controls);

  region.append(content, items);
  [contentRow, ctaRow, imageRow, ...itemRows].forEach((row) => row?.remove());
  block.append(region);

  const desktop = window.matchMedia('(min-width: 1024px)');
  let carousel = null;
  const toggle = () => {
    if (desktop.matches && itemRows.length <= 4) {
      carousel?.destroy();
      carousel = null;
      items.classList.add('is-disabled');
      return;
    }
    items.classList.remove('is-disabled');
    if (carousel) return;
    carousel = createCarousel(items, {
      wrapper: list,
      watchOverflow: true,
      controls,
      pagination: { clickable: true },
      breakpoints: {
        0: { slidesPerView: 1.2 },
        1025: { slidesPerView: 4 },
      },
    });
  };
  toggle();
  desktop.addEventListener('change', toggle);
}
