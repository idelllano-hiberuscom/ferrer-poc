/**
 * Form Index Block — AEM Edge Delivery Services
 *
 * Origen: core-ferrer content/form-index (form-index.html, form-index-entry.html,
 *         FormIndexModel/FormIndexEntryModel.java). El contenedor de form-index-entry
 *         (cada uno con su multifield de enlaces) se aplana en items hermanos:
 *         un "form-index-entry" (título) abre grupo y los "form-index-link" siguientes
 *         son sus enlaces.
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3)
 *
 * DOM de entrada (matriz EDS):
 *   div.form-index
 *     div > div > picture                  (propiedad: image + imageAlt, opcional)
 *     div > div > title                    (item form-index-entry)
 *     div                                  (item form-index-link)
 *       div > [p >] a[href]{linkText}
 *       div > "_self" | "_blank"
 *
 * DOM de salida (1:1 con el HTL):
 *   div.cmp-form-index
 *     div.cmp-form-index__container
 *       div.cmp-form-index-entry
 *         h5.ferrer-h5
 *         ul.cmp-form-index-entry__list
 *           li.cmp-form-index-entry__item
 *             a.cmp-form-index-entry__link[href][target] {text} [i.icon-link-external]
 *             | button.cmp-form-index-entry__link.js-open-modal[data-modal-id] {text} i.{icon}
 *       div.cmp-modal (uno por enlace a /modals/…)
 *     div.cmp-form-index__image > div.cmp-image > picture
 */
import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildImage, getLinkInfo } from '../../scripts/ferrer-utils.js';
import { buildModal, initModals } from '../../scripts/ferrer-modal.js';

/* UE instrumentation: Pendiente (Fase 3) */

let instanceCount = 0;

/**
 * Creates an empty entry (form-index-entry.html).
 * @param {Element|null} titleRow authored title row
 * @returns {{element: HTMLDivElement, list: HTMLUListElement, modals: HTMLElement[]}}
 */
function createEntry(titleRow) {
  const element = document.createElement('div');
  element.className = 'cmp-form-index-entry';
  const title = document.createElement('h5');
  title.className = 'ferrer-h5';
  if (titleRow) {
    moveInstrumentation(titleRow, element);
    const cell = titleRow.firstElementChild;
    const source = cell && cell.children.length === 1 && cell.firstElementChild.tagName === 'P'
      ? cell.firstElementChild : cell;
    if (source) title.append(...source.childNodes);
  }
  const list = document.createElement('ul');
  list.className = 'cmp-form-index-entry__list';
  element.append(title, list);
  return { element, list, modals: [] };
}

/**
 * Builds one link <li> of an entry.
 * @param {Element} row authored link row
 * @param {string} modalId
 * @returns {{item: HTMLLIElement, modal: (HTMLElement|null)}}
 */
function buildLink(row, modalId) {
  const [linkCell, targetCell] = row.children;
  const authored = linkCell.querySelector('a');
  const href = authored.getAttribute('href');
  const info = getLinkInfo(href);
  const target = (targetCell && targetCell.textContent.trim()) || '_self';

  const item = document.createElement('li');
  item.className = 'cmp-form-index-entry__item';
  moveInstrumentation(row, item);

  let control;
  let modal = null;
  if (info.isModal) {
    control = document.createElement('button');
    control.type = 'button';
    control.className = 'cmp-form-index-entry__link js-open-modal';
    control.dataset.modalId = modalId;
    control.setAttribute('aria-haspopup', 'dialog');
    control.append(...authored.childNodes);
    modal = buildModal({ id: modalId, path: href });
  } else {
    control = authored;
    control.className = 'cmp-form-index-entry__link';
    control.removeAttribute('title');
    control.target = target;
    if (target === '_blank') control.rel = 'noopener noreferrer';
  }

  // the HTL only shows the icon of EXTERNAL links, and always for modals
  if (info.isModal || info.isExternal) {
    const icon = document.createElement('i');
    icon.className = info.icon;
    icon.setAttribute('aria-hidden', 'true');
    control.append(' ', icon);
  }

  item.append(control);
  return { item, modal };
}

/**
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  instanceCount += 1;
  const cmpId = `form-index-${instanceCount}`;

  const component = document.createElement('div');
  component.className = 'cmp-form-index';
  const container = document.createElement('div');
  container.className = 'cmp-form-index__container';

  const entries = [];
  let current = null;
  let imageWrap = null;

  [...block.children].forEach((row) => {
    const picture = row.querySelector('picture');
    const link = row.querySelector('a');
    if (picture && !link) {
      const image = buildImage({ src: picture });
      if (image) {
        imageWrap = document.createElement('div');
        imageWrap.className = 'cmp-form-index__image';
        moveInstrumentation(row, imageWrap);
        imageWrap.append(image);
      }
    } else if (!link) {
      current = createEntry(row);
      entries.push(current);
    } else {
      if (!current) {
        current = createEntry(null);
        entries.push(current);
      }
      const index = current.list.children.length;
      const modalId = `${cmpId}-entry-${entries.length}-modal-${index}`;
      const { item, modal } = buildLink(row, modalId);
      current.list.append(item);
      if (modal) current.modals.push(modal);
    }
    row.remove();
  });

  entries.forEach(({ element, modals }) => container.append(element, ...modals));
  component.append(container);
  if (imageWrap) component.append(imageWrap);
  block.append(component);
  initModals(block);
}
