/**
 * Info List Block — AEM Edge Delivery Services
 *
 * Origen: core-ferrer content/info-list (info-list.html + InfoListModel/ItemModel.java)
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3)
 *
 * DOM de entrada (matriz EDS):
 *   div.info-list
 *     div (fila = info-list-item)
 *       div > title
 *       div > text
 *       div > phone
 *
 * DOM de salida (1:1 con el HTL):
 *   section.cmp-info-list.ferrer-row
 *     section.cmp-info-list__item.col-12.col-xl-4[aria-labelledby]
 *       h3#id.cmp-info-list__item-title.ferrer-body-large > strong
 *       div.cmp-info-list__item-text
 *         p (text)
 *         a[href="tel:<sin espacios>"] (phone)   — ItemModel.getTrimmedPhone()
 */
import { moveInstrumentation } from '../../scripts/scripts.js';

/* UE instrumentation: Pendiente (Fase 3) */

let instanceCount = 0;

/**
 * Port of ItemModel.getTrimmedPhone(): StringUtils.deleteWhitespace(phone).
 * @param {string} phone
 * @returns {string}
 */
export function trimPhone(phone) {
  return (phone || '').replace(/\s+/g, '');
}

/**
 * Moves the content of an authored cell into a target element, unwrapping a single <p>.
 * @param {Element} cell
 * @param {Element} target
 */
function moveCellContent(cell, target) {
  if (!cell) return;
  const only = cell.children.length === 1 && cell.firstElementChild.tagName === 'P'
    ? cell.firstElementChild : cell;
  moveInstrumentation(only, target);
  target.append(...only.childNodes);
}

/**
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  instanceCount += 1;
  const prefix = `info-list-${instanceCount}`;

  const list = document.createElement('section');
  list.className = 'cmp-info-list ferrer-row';

  [...block.children].forEach((row, index) => {
    const [titleCell, textCell, phoneCell] = row.children;
    const id = `${prefix}-item-${index + 1}`;

    const item = document.createElement('section');
    item.className = 'cmp-info-list__item col-12 col-xl-4';
    item.setAttribute('aria-labelledby', id);
    moveInstrumentation(row, item);

    const title = document.createElement('h3');
    title.id = id;
    title.className = 'cmp-info-list__item-title ferrer-body-large';
    const strong = document.createElement('strong');
    moveCellContent(titleCell, strong);
    title.append(strong);

    const body = document.createElement('div');
    body.className = 'cmp-info-list__item-text';
    const text = document.createElement('p');
    moveCellContent(textCell, text);
    body.append(text);

    const phone = phoneCell ? phoneCell.textContent.trim() : '';
    if (phone) {
      const tel = document.createElement('a');
      tel.href = `tel:${trimPhone(phone)}`;
      moveCellContent(phoneCell, tel);
      body.append(tel);
    }

    item.append(title, body);
    list.append(item);
    row.remove();
  });

  block.append(list);
}
