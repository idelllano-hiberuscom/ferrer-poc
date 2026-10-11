/**
 * Card List Modal Block — AEM Edge Delivery Services
 *
 * Origen: core-ferrer content/card-list-modal (card-list-modal.html +
 *         CardListModalModel/ItemModel.java)
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3)
 *
 * DOM de entrada (matriz EDS):
 *   div.card-list-modal[.cmp-modal--overlay-disabled][.cmp-modal--blur-enabled]
 *     div (fila = card-list-modal-item)
 *       div > picture          image + imageAlt
 *       div > personName       (no `name`: reserved xwalk property, never rendered)
 *       div > position
 *       div > a[href]          modalPath (fragmento /modals/…)
 *   Rows with fewer than 4 cells (legacy content authored with the old `name` field:
 *   [image, position, modalPath]) are read by content, see readCells().
 *
 * DOM de salida (1:1 con el HTL):
 *   div
 *     ul.cmp-card-list-modal
 *       li.cmp-card-list-modal__item[data-modal-id]
 *         div.card-managers.js-open-modal[data-modal-id] … h3#id-title
 *     div.cmp-modal.cmp-modal--card-list#id (uno por tarjeta, ferrer-modal.js)
 */
import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildPicture } from '../../scripts/ferrer-utils.js';
import { buildModal, initModals } from '../../scripts/ferrer-modal.js';

/* UE instrumentation: Pendiente (Fase 3) */

let instanceCount = 0;

/**
 * Moves the content of a cell into `target`, unwrapping a single <p>.
 * @param {Element} cell
 * @param {Element} target
 */
function moveCellContent(cell, target) {
  if (!cell) return;
  const source = cell.children.length === 1 && cell.firstElementChild.tagName === 'P'
    ? cell.firstElementChild : cell;
  moveInstrumentation(source, target);
  target.append(...source.childNodes);
}

/**
 * Maps the cells of one item row to its fields.
 * 4+ cells: positional [image, personName, position, modalPath]. Fewer cells: by content
 * (picture → image, link → modalPath, remaining text cells → [personName,] position).
 * @param {Element[]} cells
 * @returns {{imageCell: (Element|undefined), nameCell: (Element|undefined),
 *   positionCell: (Element|undefined), linkCell: (Element|undefined)}}
 */
function readCells(cells) {
  if (cells.length >= 4) {
    const [imageCell, nameCell, positionCell, linkCell] = cells;
    return {
      imageCell, nameCell, positionCell, linkCell,
    };
  }
  const imageCell = cells.find((cell) => cell.querySelector('picture, img'));
  const linkCell = cells.find((cell) => cell !== imageCell && cell.querySelector('a[href]'));
  const texts = cells.filter((cell) => cell !== imageCell && cell !== linkCell);
  const [nameCell, positionCell] = texts.length >= 2 ? texts : [undefined, texts[0]];
  return {
    imageCell, nameCell, positionCell, linkCell,
  };
}

/**
 * Builds the card-managers trigger of one item.
 * @param {object} fields readCells() result
 * @param {string} id modal id
 * @returns {HTMLDivElement}
 */
function buildCard({ imageCell, nameCell, positionCell }, id) {
  const card = document.createElement('div');
  card.className = 'card-managers js-open-modal';
  card.dataset.modalId = id;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-haspopup', 'dialog');
  card.setAttribute('aria-expanded', 'false');

  const content = document.createElement('div');
  content.className = 'card-managers__content';

  const image = document.createElement('div');
  image.className = 'card-managers__image';
  const picture = buildPicture({ src: imageCell && imageCell.querySelector('picture') });
  if (picture) image.append(picture);

  const body = document.createElement('div');
  body.className = 'card-managers__body';
  const text = document.createElement('div');
  text.className = 'card-managers__text';

  const name = document.createElement('h3');
  name.id = `${id}-title`;
  name.className = 'ferrer-body-large ferrer--bold card-managers__text--name';
  moveCellContent(nameCell, name);

  const position = document.createElement('p');
  position.className = 'card-managers__text--position';
  moveCellContent(positionCell, position);

  text.append(name, position);

  const button = document.createElement('div');
  button.className = 'card-managers__button';
  const plus = document.createElement('i');
  plus.className = 'icon-plus';
  plus.setAttribute('aria-hidden', 'true');
  button.append(plus);

  body.append(text, button);
  content.append(image, body);
  card.append(content);
  return card;
}

/**
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  instanceCount += 1;
  const prefix = `card-list-modal-${instanceCount}-item`;
  const overlayDisabled = block.classList.contains('cmp-modal--overlay-disabled');
  const blurEnabled = block.classList.contains('cmp-modal--blur-enabled');

  const wrapper = document.createElement('div');
  const list = document.createElement('ul');
  list.className = 'cmp-card-list-modal';
  const modals = [];

  [...block.children].forEach((row, index) => {
    const fields = readCells([...row.children]);
    const id = `${prefix}-${index + 1}`;

    const item = document.createElement('li');
    item.className = 'cmp-card-list-modal__item';
    item.dataset.modalId = id;
    moveInstrumentation(row, item);
    item.append(buildCard(fields, id));
    list.append(item);

    const link = fields.linkCell && fields.linkCell.querySelector('a[href]');
    modals.push(buildModal({
      id,
      path: link ? link.getAttribute('href') : '',
      modalClass: 'cmp-modal--card-list',
      overlayDisabled,
      blurEnabled,
    }));
    row.remove();
  });

  wrapper.append(list, ...modals);
  block.append(wrapper);
  initModals(block);
}
