/**
 * Links Image Block — AEM Edge Delivery Services
 *
 * Origen: core-ferrer content/links-image (links-image.html, links-image.js,
 *         LinksImageModel/CardModel.java)
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3)
 *
 * DOM de entrada (matriz EDS):
 *   div.links-image
 *     div (propiedad del bloque: botón opcional, button + buttonText + buttonType colapsados)
 *       div > [p >] [strong|em >] a[href]{buttonText}
 *     div (fila = links-image-card, hasta 3)
 *       div > [p >] a[href]{linkText}      (link + linkText colapsados)
 *       div > description
 *       div > picture                       (image + imageAlt colapsados)
 *
 * DOM de salida (1:1 con el HTL):
 *   div.cmp-links-image
 *     div.cmp-links-image__content
 *       ul.cmp-links-image__list
 *         li.cmp-links-image__list-item
 *           a.cmp-links-image__link[href][aria-label]
 *             picture > img.cmp-links-image__image-background[data-role=hover-image]
 *             div.cmp-links-image__text
 *               p.cmp-links-image__link-text.ferrer-h5  {text} i.{icon}
 *               p.cmp-links-image__description
 *       div.cmp-links-image__image-right > picture (imagen de la primera tarjeta)
 *     div.cmp-links-image__button > p.cmp-button--{style} > a.cmp-button
 */
import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildPicture, decorateAuthoredButton, getLinkInfo } from '../../scripts/ferrer-utils.js';

/* UE instrumentation: Pendiente (Fase 3) */

/**
 * Builds one card <li> from an authored row.
 * @param {Element} row
 * @returns {HTMLLIElement}
 */
function buildCard(row) {
  const [linkCell, descriptionCell, imageCell] = row.children;
  const authoredLink = linkCell && linkCell.querySelector('a');
  const href = authoredLink ? authoredLink.getAttribute('href') : '';
  const text = authoredLink ? authoredLink.textContent.trim() : '';
  const info = getLinkInfo(href);

  const li = document.createElement('li');
  li.className = 'cmp-links-image__list-item';
  moveInstrumentation(row, li);

  const link = authoredLink || document.createElement('a');
  link.className = 'cmp-links-image__link';
  link.removeAttribute('title');
  if (text) link.setAttribute('aria-label', text);
  link.textContent = '';

  const authoredPicture = imageCell && imageCell.querySelector('picture');
  const picture = buildPicture({
    src: authoredPicture,
    classImg: 'cmp-links-image__image-background',
  });
  if (picture) {
    picture.querySelector('img').dataset.role = 'hover-image';
    link.append(picture);
  }

  const textWrap = document.createElement('div');
  textWrap.className = 'cmp-links-image__text';

  const linkText = document.createElement('p');
  linkText.className = 'cmp-links-image__link-text ferrer-h5';
  linkText.append(`${text} `);
  if (info.icon) {
    const icon = document.createElement('i');
    icon.className = info.icon;
    icon.setAttribute('aria-hidden', 'true');
    linkText.append(icon);
  }

  const description = document.createElement('p');
  description.className = 'cmp-links-image__description';
  if (descriptionCell) {
    const source = descriptionCell.querySelector('p') || descriptionCell;
    moveInstrumentation(source, description);
    description.append(...source.childNodes);
  }

  textWrap.append(linkText, description);
  link.append(textWrap);
  li.append(link);
  return li;
}

/**
 * Copies the sources of a hover picture into the right-hand picture
 * (port of applyImage() of links-image.js, adapted to <picture> with <source>).
 * @param {HTMLPictureElement} from
 * @param {HTMLPictureElement} to
 */
function copyPicture(from, to) {
  const fromSources = from.querySelectorAll('source');
  to.querySelectorAll('source').forEach((source, index) => {
    if (fromSources[index]) source.srcset = fromSources[index].srcset;
  });
  const fromImg = from.querySelector('img');
  const toImg = to.querySelector('img');
  toImg.src = fromImg.getAttribute('src');
  toImg.alt = fromImg.alt;
}

/**
 * Hover behaviour of links-image.js: the right image follows the hovered card and goes
 * back to the first one when no card is hovered. Keyboard focus mirrors the hover.
 * @param {Element} list ul.cmp-links-image__list
 * @param {HTMLPictureElement} rightPicture
 */
function bindHover(list, rightPicture) {
  const items = [...list.querySelectorAll('.cmp-links-image__list-item')];
  const firstItem = items[0];
  if (!firstItem || !rightPicture) return;

  const applyImage = (item) => {
    const picture = item.querySelector('picture');
    if (picture) copyPicture(picture, rightPicture);
    items.forEach((i) => i.classList.remove('is-hovered'));
    item.classList.add('is-hovered');
  };

  applyImage(firstItem);

  items.forEach((item) => {
    if (!item.querySelector('[data-role="hover-image"]')) return;
    item.addEventListener('mouseenter', () => applyImage(item));
    item.addEventListener('focusin', () => applyImage(item));
    item.addEventListener('mouseleave', () => {
      if (!items.some((i) => i.matches(':hover'))) applyImage(firstItem);
    });
    item.addEventListener('focusout', (event) => {
      if (!list.contains(event.relatedTarget)) applyImage(firstItem);
    });
  });
}

/**
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  const component = document.createElement('div');
  component.className = 'cmp-links-image';

  const content = document.createElement('div');
  content.className = 'cmp-links-image__content';

  const list = document.createElement('ul');
  list.className = 'cmp-links-image__list';

  let buttonWrap = null;
  let firstImage = null;

  [...block.children].forEach((row) => {
    const isCard = row.children.length > 1 || row.querySelector('picture');
    if (isCard) {
      const card = buildCard(row);
      if (!firstImage) firstImage = card.querySelector('img');
      list.append(card);
    } else {
      const link = row.querySelector('a');
      if (link) {
        buttonWrap = document.createElement('div');
        buttonWrap.className = 'cmp-links-image__button';
        moveInstrumentation(row, buttonWrap);
        const wrap = decorateAuthoredButton(link);
        buttonWrap.append(wrap);
      }
    }
    row.remove();
  });

  const imageRight = document.createElement('div');
  imageRight.className = 'cmp-links-image__image-right';
  const rightPicture = firstImage
    ? buildPicture({ src: firstImage.getAttribute('src'), alt: firstImage.alt })
    : null;
  if (rightPicture) imageRight.append(rightPicture);

  content.append(list, imageRight);
  component.append(content);
  if (buttonWrap) component.append(buttonWrap);
  block.append(component);

  bindHover(list, rightPicture);
}
