import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  buildPicture, buildText, decorateAuthoredButton, getLinkInfo,
} from '../../scripts/ferrer-utils.js';
import { formatMessage, t } from '../../scripts/ferrer-i18n.js';
import { buildControls, createCarousel } from '../../scripts/ferrer-carousel.js';

/* UE instrumentation: Pendiente (Fase 3) */

const DESIGNS = ['transparent-cards', 'with-images', 'black-and-white-cards'];

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
 * Moves the content of an authored node into a new element, keeping the UE instrumentation.
 * A single wrapping <p> is unwrapped (its children are moved, not the <p>).
 * @param {Element|null} source authored node (cell or paragraph)
 * @param {HTMLElement} target new element
 * @returns {HTMLElement}
 */
function moveText(source, target) {
  if (!source) return target;
  moveInstrumentation(source, target);
  const only = source.children.length === 1 && source.firstElementChild.tagName === 'P'
    ? source.firstElementChild : null;
  if (only) moveInstrumentation(only, target);
  target.append(...(only || source).childNodes);
  return target;
}

/**
 * Builds the Ferrer <picture> (images-templates.html) from the authored image of a cell.
 * @param {Element|undefined} cell cell with the authored <picture>
 * @returns {HTMLPictureElement|null}
 */
function pictureFrom(cell) {
  const img = cell?.querySelector('img');
  return img ? buildPicture({ src: img }) : null;
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
 * Reads the authored cells of a card row.
 * Cells: image | heading (title + subtitle) | text | link (+ linkText).
 * @param {Element} row item row
 * @returns {object}
 */
function readCard(row) {
  const [imageCell, headingCell, textCell, linkCell] = [...row.children];
  const headingParts = headingCell
    ? [...headingCell.children].filter((p) => p.textContent.trim()) : [];
  const anchor = linkCell?.querySelector('a');
  const href = anchor?.getAttribute('href');
  return {
    imageCell,
    titleNode: headingParts[0] || (headingCell?.textContent.trim() ? headingCell : null),
    subtitleNode: headingParts[1] || null,
    textNode: textCell?.textContent.trim() ? textCell : null,
    link: href ? getLinkInfo(href) : null,
    linkText: anchor && anchor.textContent.trim() !== href ? anchor.textContent.trim() : '',
    anchor,
  };
}

/**
 * Creates the card link keeping the authored anchor instrumentation.
 * @param {object} card card data
 * @param {string} className classes of the link
 * @returns {HTMLAnchorElement}
 */
function cardLink(card, className) {
  const link = el('a', className);
  if (card.link) link.href = card.link.href;
  if (card.anchor) moveInstrumentation(card.anchor, link);
  return link;
}

/**
 * transparent template (card-templates.html).
 * @param {object} card card data
 * @returns {Node[]}
 */
function transparentTemplate(card) {
  const content = el('div', 'cmp-carousel-base__card-content');
  const title = moveText(card.titleNode, el('p', 'ferrer-h2-special-2'));
  content.append(title, moveText(card.textNode, el('p', 'ferrer-h4')));

  const buttonWrapper = el('div', 'cmp-button--ghost cmp-button--small');
  const link = cardLink(card, 'cmp-button');
  const text = el('span', 'cmp-button__text');
  text.setAttribute('aria-label', title.textContent.trim());
  text.textContent = ` ${card.linkText}`;
  link.append(text);
  buttonWrapper.append(link);
  return [content, buttonWrapper];
}

/**
 * withImage template (card-templates.html).
 * @param {object} card card data
 * @returns {Node[]}
 */
function withImageTemplate(card) {
  const media = el('div', 'cmp-carousel-base__media');
  const picture = pictureFrom(card.imageCell);
  if (picture) media.append(picture);

  const text = el('div', 'cmp-carousel-base__card-text');
  text.append(
    moveText(card.titleNode, el('h3', 'cmp-carousel-base__card-title ferrer-h3-special-2 ferrer--center')),
    moveText(card.subtitleNode, el('p', 'cmp-carousel-base__card-subtitle ferrer-h5 ferrer--bold')),
    moveText(card.textNode, el('p')),
  );
  return [media, text];
}

/**
 * blackAndWhite template (card-templates.html).
 * @param {object} card card data
 * @returns {Node[]}
 */
function blackAndWhiteTemplate(card) {
  const media = el('div', 'cmp-carousel-base__media');
  const picture = pictureFrom(card.imageCell);
  if (picture) media.append(picture);

  const heading = el('h3', 'cmp-carousel-base__title');
  const link = cardLink(card, 'cmp-carousel-base__title-link ferrer-h4-special-1');
  moveText(card.titleNode, link);
  link.setAttribute('aria-label', link.textContent.trim());
  const icon = el('i', `${card.link?.icon || ''} cmp-carousel-base__card-icon`.trim());
  icon.setAttribute('aria-hidden', 'true');
  link.append(' ', icon);
  heading.append(link);
  return [media, heading];
}

/**
 * Carousel base: cards carousel with three designs (transparent, with images, black & white).
 *
 * DOM de entrada (matriz EDS, xwalk):
 *   block.carousel-base[.transparent-cards|.with-images|.black-and-white-cards]
 *     ├── div > div        → title (richtext, solo diseño black-and-white)
 *     ├── div > div        → cta (+ ctaText + ctaType): botón inferior
 *     └── div (n items)    → [image] [heading_title + heading_subtitle] [text] [link + linkText]
 *
 * DOM de salida (carousel-base.html + card-templates.html):
 *   [div.text > div.cmp-text] · div.cmp-carousel-base[role=region] > div.js-carousel-base
 *   > ul.cmp-carousel-base__list.swiper-wrapper > li.swiper-slide … + nav.cmp-controls
 *   · [div.button.cmp-button--… > a.cmp-button]
 *
 * @param {Element} block the block element
 */
export default function decorate(block) {
  const design = DESIGNS.find((d) => block.classList.contains(d)) || '';
  const [titleRow, ctaRow, ...cardRows] = [...block.children];

  const isThreeItems = design === 'transparent-cards';
  const isImageCards = design === 'with-images';
  const isBlackWhite = design === 'black-and-white-cards';

  // title: content/text child, only rendered in the black & white design
  if (isBlackWhite && titleRow?.textContent.trim()) {
    const text = buildText({ nodes: titleRow.firstElementChild });
    if (text) {
      const decoration = el('div', 'text');
      decoration.append(text);
      titleRow.before(decoration);
    }
  }

  const region = el('div', 'cmp-carousel-base');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-roledescription', 'carrusel');
  region.setAttribute('aria-label', t('carousel-base.accessibility.title'));

  const jsClasses = ['js-carousel-base'];
  if (isThreeItems) jsClasses.push('js-carousel--3-items');
  if (isImageCards || isBlackWhite) jsClasses.push('js-carousel--images');
  if (!design) jsClasses.push('js-carousel--4-items');
  const carousel = el('div', jsClasses.join(' '));

  const list = el('ul', 'cmp-carousel-base__list swiper-wrapper');
  list.setAttribute('aria-live', 'polite');

  const templates = {
    'transparent-cards': ['cmp-carousel-base__card--transparent', transparentTemplate],
    'with-images': ['cmp-carousel-base__card--images', withImageTemplate],
    'black-and-white-cards': ['cmp-carousel-base__card--black-white', blackAndWhiteTemplate],
  };

  cardRows.forEach((row, index) => {
    const li = el('li', 'cmp-carousel-base__list-item swiper-slide');
    moveInstrumentation(row, li);
    li.setAttribute('role', 'group');
    li.setAttribute('aria-label', formatMessage(t('common.accessibility.item-progress', '{0} / {1}'), index + 1, cardRows.length));

    if (templates[design]) {
      const [modifier, template] = templates[design];
      const wrapper = el('div', `cmp-carousel-base__card ${modifier}`);
      // HTL itemList.odd is true when the one-based count is odd
      if (isImageCards && index % 2 === 0) wrapper.classList.add('cmp-carousel-base__card--odd');
      wrapper.append(...template(readCard(row)));
      li.append(wrapper);
    }
    list.append(li);
    row.remove();
  });

  const controls = buildControls();
  carousel.append(list, controls);
  region.append(carousel);
  block.append(region);

  const button = buildCta(ctaRow, 'button');
  if (button) block.append(button);
  ctaRow?.remove();
  titleRow?.remove();

  const perView = design ? 'auto' : null;
  createCarousel(carousel, {
    wrapper: list,
    spaceBetween: 16,
    slidesPerView: perView || 2,
    breakpoints: {
      601: { slidesPerView: perView || 2 },
      1024: { slidesPerView: perView || 4 },
    },
    controls,
    pagination: { clickable: true },
    keyboard: { enabled: true },
  });
}
