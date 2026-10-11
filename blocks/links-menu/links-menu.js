/**
 * Links Menu Block — AEM Edge Delivery Services
 *
 * Origen: core-ferrer content/links-menu (links-menu.html + LinksMenuModel.java)
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3)
 *
 * DOM de entrada (matriz EDS):
 *   div.links-menu[.links-menu--dark]
 *     div (fila = links-menu-item, una por enlace)
 *       div > [p >] a[href]{linkText}   (link + linkText colapsados)
 *       div > "_self" | "_blank"         (target)
 *
 * DOM de salida (1:1 con el HTL):
 *   nav.cmp-links-menu[aria-label]
 *     ul.cmp-links-menu__list
 *       li.cmp-links-menu__list-item.cmp-button--ghost
 *         a.ferrer--underline.ferrer--bold.cmp-button[target][rel][aria-current]
 *           span.cmp-button__text
 */
import { moveInstrumentation } from '../../scripts/scripts.js';
import { getLinkInfo } from '../../scripts/ferrer-utils.js';
import { t } from '../../scripts/ferrer-i18n.js';

/* UE instrumentation: Pendiente (Fase 3) */

/**
 * Converts one authored row into the menu <li>.
 * @param {Element} row authored item row
 * @returns {HTMLLIElement|null}
 */
function buildItem(row) {
  const [linkCell, targetCell] = row.children;
  const link = linkCell && linkCell.querySelector('a');
  if (!link) return null;

  const li = document.createElement('li');
  li.className = 'cmp-links-menu__list-item cmp-button--ghost';
  moveInstrumentation(row, li);

  const href = link.getAttribute('href');
  const info = getLinkInfo(href);
  const target = (targetCell && targetCell.textContent.trim()) || '_self';

  link.className = 'ferrer--underline ferrer--bold cmp-button';
  link.target = target;
  if (target === '_blank') link.rel = 'noopener noreferrer';
  if (info.isCurrentPage) link.setAttribute('aria-current', 'page');

  const text = document.createElement('span');
  text.className = 'cmp-button__text';
  text.append(...link.childNodes);
  link.append(text);

  li.append(link);
  return li;
}

/**
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  const nav = document.createElement('nav');
  nav.className = 'cmp-links-menu';
  nav.setAttribute('aria-label', t('common.accessibility.categories-menu'));

  const list = document.createElement('ul');
  list.className = 'cmp-links-menu__list';

  [...block.children].forEach((row) => {
    const item = buildItem(row);
    if (item) list.append(item);
    row.remove();
  });

  nav.append(list);
  block.append(nav);
}
