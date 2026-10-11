/**
 * Card CEO Block — AEM Edge Delivery Services
 *
 * Origen: core-ferrer content/card-ceo (card-ceo.html + CardCeoModel.java)
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3)
 *
 * DOM de entrada (matriz EDS, bloque simple con element grouping):
 *   div.card-ceo[.cmp-modal--overlay-disabled][.cmp-modal--blur-enabled]
 *     div > div (grupo "card")
 *       [p >] picture                 card_image + card_imageAlt
 *       p                             card_name
 *       p                             card_position
 *       p > a[href]                   card_modalPath (fragmento /modals/…)
 *     div > div (grupo "teaser")
 *       [p >] picture                 teaser_backgroundImage + teaser_backgroundImageAlt
 *       p                             teaser_text
 *       p > a[href]{texto}            teaser_link + teaser_linkText
 *       p "_self" | "_blank"          teaser_linkTarget
 *
 * DOM de salida (1:1 con el HTL):
 *   div.cmp-card-ceo
 *     div.cmp-card-ceo__background
 *       picture > img.cmp-card-ceo__background-image
 *       div.cmp-card-ceo__background-overlay
 *       div.cmp-card-ceo__background-content
 *         p.content__text.ferrer-h3-special-1.ferrer--white
 *         div.content__link-wrapper.cmp-button--ghost.cmp-button--dark > a.cmp-button
 *     div.cmp-card-ceo__card-wrapper
 *       div.card-managers.js-open-modal[data-modal-id] … (card_managers, global)
 *     div.cmp-modal#card-ceo-item-N (ferrer-modal.js)
 */
import { buildPicture, getLinkInfo } from '../../scripts/ferrer-utils.js';
import { buildModal, initModals } from '../../scripts/ferrer-modal.js';

/* UE instrumentation: Pendiente (Fase 3) */

const TARGET_VALUE = /^_(self|blank)$/;
let instanceCount = 0;

/**
 * Splits a grouped cell into its picture, link, target and plain paragraphs.
 * @param {Element} cell
 * @returns {{picture: (HTMLPictureElement|null), link: (HTMLAnchorElement|null),
 *   target: string, paragraphs: HTMLParagraphElement[]}}
 */
function readGroup(cell) {
  const result = {
    picture: null, link: null, target: '', paragraphs: [],
  };
  if (!cell) return result;
  result.picture = cell.querySelector('picture');
  result.link = cell.querySelector('a');
  [...cell.querySelectorAll('p')].forEach((p) => {
    if (p.querySelector('picture, a')) return;
    const value = p.textContent.trim();
    if (TARGET_VALUE.test(value)) result.target = value;
    else if (value) result.paragraphs.push(p);
  });
  return result;
}

/**
 * Builds the dark teaser with the background image, text and ghost button.
 * @param {ReturnType<typeof readGroup>} teaser
 * @returns {HTMLDivElement}
 */
function buildBackground(teaser) {
  const background = document.createElement('div');
  background.className = 'cmp-card-ceo__background';

  const picture = buildPicture({
    src: teaser.picture,
    classImg: 'cmp-card-ceo__background-image',
  });
  if (picture) background.append(picture);

  const overlay = document.createElement('div');
  overlay.className = 'cmp-card-ceo__background-overlay';

  const content = document.createElement('div');
  content.className = 'cmp-card-ceo__background-content';

  const [text] = teaser.paragraphs;
  const textEl = text || document.createElement('p');
  textEl.className = 'content__text ferrer-h3-special-1 ferrer--white';
  content.append(textEl);

  const linkWrapper = document.createElement('div');
  linkWrapper.className = 'content__link-wrapper cmp-button--ghost cmp-button--dark';
  const link = teaser.link || document.createElement('a');
  const info = getLinkInfo(link.getAttribute('href'));
  link.className = 'cmp-button';
  link.removeAttribute('title');
  link.target = teaser.target || '_self';
  if (link.target === '_blank') link.rel = 'noopener noreferrer';
  const label = document.createElement('span');
  label.className = 'cmp-button__text';
  label.append(...link.childNodes);
  link.append(label);
  if (info.icon) {
    const icon = document.createElement('i');
    icon.className = `cmp-button__icon ${info.icon}`;
    icon.setAttribute('aria-hidden', 'true');
    link.append(icon);
  }
  linkWrapper.append(link);
  content.append(linkWrapper);

  background.append(overlay, content);
  return background;
}

/**
 * Builds the card-managers trigger that opens the modal.
 * @param {ReturnType<typeof readGroup>} card
 * @param {string} id modal id
 * @returns {HTMLDivElement}
 */
function buildCard(card, id) {
  const wrapper = document.createElement('div');
  wrapper.className = 'cmp-card-ceo__card-wrapper';

  const trigger = document.createElement('div');
  trigger.className = 'card-managers js-open-modal';
  trigger.dataset.modalId = id;
  trigger.tabIndex = 0;
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');

  const content = document.createElement('div');
  content.className = 'card-managers__content';

  const image = document.createElement('div');
  image.className = 'card-managers__image';
  const picture = buildPicture({ src: card.picture });
  if (picture) image.append(picture);

  const body = document.createElement('div');
  body.className = 'card-managers__body';

  const text = document.createElement('div');
  text.className = 'card-managers__text';
  const [name, position] = card.paragraphs;
  const nameEl = name || document.createElement('p');
  nameEl.id = `${id}-title`;
  nameEl.className = 'ferrer-body-large ferrer--bold card-managers__text--name';
  const positionEl = position || document.createElement('p');
  positionEl.className = 'card-managers__text--position';
  text.append(nameEl, positionEl);

  const button = document.createElement('div');
  button.className = 'card-managers__button';
  const plus = document.createElement('i');
  plus.className = 'icon-plus';
  plus.setAttribute('aria-hidden', 'true');
  button.append(plus);

  body.append(text, button);
  content.append(image, body);
  trigger.append(content);
  wrapper.append(trigger);
  return wrapper;
}

/**
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  instanceCount += 1;
  const id = `card-ceo-item-${instanceCount}`;
  const [cardRow, teaserRow] = block.children;
  const card = readGroup(cardRow && cardRow.firstElementChild);
  const teaser = readGroup(teaserRow && teaserRow.firstElementChild);

  const component = document.createElement('div');
  component.className = 'cmp-card-ceo';
  component.append(buildBackground(teaser), buildCard(card, id));

  const modal = buildModal({
    id,
    path: card.link ? card.link.getAttribute('href') : '',
    overlayDisabled: block.classList.contains('cmp-modal--overlay-disabled'),
    blurEnabled: block.classList.contains('cmp-modal--blur-enabled'),
  });
  component.append(modal);

  [cardRow, teaserRow].forEach((row) => row && row.remove());
  block.append(component);
  initModals(block);
}
