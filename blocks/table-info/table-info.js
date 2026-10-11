import { getLinkInfo, wrapLooseText } from '../../scripts/ferrer-utils.js';
import { t } from '../../scripts/ferrer-i18n.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/* UE instrumentation: Pendiente (Fase 3) */

const COLUMNS = [
  ['trial-name', 'table-info.vocabulary.column.trial-name'],
  ['details', 'table-info.vocabulary.column.details'],
  ['status', 'table-info.vocabulary.column.status'],
  ['link', 'table-info.vocabulary.column.link'],
];

/**
 * Creates an element.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Moves rich text into a <p class="…"> like `<p class="…">${html}</p>`. The browser
 * closes that <p> before a block child, so a single authored paragraph is unwrapped and
 * multi-block rich text keeps its blocks after the element.
 * @param {Element} source cell (or group element) with the rich text
 * @param {HTMLElement} target the <p>
 * @param {string} [prefix] text written before the rich text (disclaimer '*')
 * @returns {Node[]} nodes to append after the target
 */
function fillParagraph(source, target, prefix = '') {
  if (prefix) target.append(prefix);
  if (!source) return [];
  const blocks = [...source.children].filter((child) => /^(P|UL|OL|H[1-6]|DIV|TABLE)$/.test(child.tagName));
  if (!blocks.length) {
    target.append(...source.childNodes);
    return [];
  }
  const [first, ...rest] = blocks;
  if (first.tagName === 'P') {
    moveInstrumentation(first, target);
    target.append(...first.childNodes);
    first.remove();
    return rest;
  }
  return blocks;
}

/**
 * Reads a cell's plain text.
 * @param {Element} cell
 * @returns {string}
 */
function cellText(cell) {
  return cell ? cell.textContent.trim() : '';
}

/**
 * Builds one row (table-info.html <li>).
 * Cells: trialName | details (categoryBadge + description) | status | link
 * @param {Element} row
 * @returns {HTMLLIElement}
 */
function buildRow(row) {
  const [nameCell, detailsCell, statusCell, linkCell] = [...row.children];
  const trialName = cellText(nameCell);
  const status = cellText(statusCell);

  const li = document.createElement('li');
  moveInstrumentation(row, li);
  const card = el('article', 'cmp-table-info__card');
  card.id = `trial-${trialName.toLowerCase()}`;
  card.setAttribute('aria-label', `${t('table-info.vocabulary.clinical-trial-label')} ${trialName}. ${t('table-info.vocabulary.status-label')} ${status}.`);

  const nameCol = el('div', 'cmp-table-info__col cmp-table-info__col-trial-name');
  const name = el('h3', 'cmp-table-info__trial-name ferrer-body-small', trialName);
  if (nameCell) moveInstrumentation(nameCell.querySelector('p') || nameCell, name);
  nameCol.append(name);

  // details group: first element = categoryBadge (text field), rest = description (rich text)
  const detailsCol = el('div', 'cmp-table-info__col cmp-table-info__col-details');
  const badge = el('span', 'cmp-table-info__badge ferrer-body-xsmall');
  badge.setAttribute('role', 'note');
  const description = el('p', 'cmp-table-info__description ferrer-body-small');
  let after = [];
  if (detailsCell) {
    const parts = [...wrapLooseText(detailsCell).children];
    if (parts.length > 1) {
      const badgeSource = parts.shift();
      moveInstrumentation(badgeSource, badge);
      badge.textContent = badgeSource.textContent.trim();
      badgeSource.remove();
    }
    after = fillParagraph(detailsCell, description);
  }
  detailsCol.append(badge, description, ...after);

  const statusCol = el('div', 'cmp-table-info__col cmp-table-info__col-status');
  const statusEl = el('span', 'cmp-table-info__status ferrer-body-small', status);
  if (statusCell) moveInstrumentation(statusCell.querySelector('p') || statusCell, statusEl);
  statusCol.append(statusEl);

  const linkCol = el('div', 'cmp-table-info__col cmp-table-info__col-link cmp-button--ghost');
  const authored = linkCell ? linkCell.querySelector('a[href]') : null;
  if (authored) {
    const href = authored.getAttribute('href');
    const label = (authored.querySelector('.cmp-button__text') || authored).textContent.trim();
    const hasText = label && label !== href;
    const link = el('a', 'cmp-button');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${t('table-info.vocabulary.link-label')} ${trialName}`);
    moveInstrumentation(authored, link);
    const icon = el('i', `${getLinkInfo(href).icon || ''} cmp-button__icon`);
    icon.setAttribute('aria-hidden', 'true');
    link.append(
      el('span', 'cmp-button__text', hasText ? label : t('table-info.vocabulary.link-label')),
      icon,
    );
    linkCol.append(link);
  }

  card.append(nameCol, detailsCol, statusCol, linkCol);
  li.append(card);
  return li;
}

/**
 * Table info block (clinical trials list). The original table-info.js only marked the
 * component as initialised.
 *
 * DOM de entrada (matriz EDS):
 *   block.table-info
 *     ├── div > div → disclaimer (rich text, opcional)
 *     └── div (item, N) → [trialName] [details: categoryBadge + description] [status]
 *                         [link <a>texto</a>]
 *
 * @param {Element} block
 */
export default function decorate(block) {
  const rows = [...block.children];
  const section = el('section', 'cmp-table-info');
  section.dataset.initialized = 'false';
  const wrapper = el('div', 'cmp-table-info__wrapper');

  const header = el('div', 'cmp-table-info__header-card ferrer-body-small');
  header.setAttribute('aria-hidden', 'true');
  COLUMNS.forEach(([column, key]) => {
    header.append(el('div', `cmp-table-info__col cmp-table-info__col-${column}`, t(key)));
  });

  const list = el('ul', 'cmp-table-info__list');
  list.setAttribute('role', 'list');
  let footer = null;

  rows.forEach((row) => {
    if (row.children.length > 1) {
      list.append(buildRow(row));
      return;
    }
    const cell = row.firstElementChild;
    if (!cell || !cell.textContent.trim()) return;
    footer = el('footer', 'cmp-table-info__footer');
    const disclaimer = el('p', 'cmp-table-info__disclaimer');
    disclaimer.setAttribute('role', 'note');
    moveInstrumentation(cell, footer);
    const after = fillParagraph(cell, disclaimer, '*');
    footer.append(disclaimer, ...after);
  });

  wrapper.append(header, list);
  if (footer) wrapper.append(footer);
  section.append(wrapper);
  block.append(section);
  rows.forEach((row) => row.remove());

  // table-info.js: init() → data-initialized="true"
  section.setAttribute('data-initialized', 'true');
}
