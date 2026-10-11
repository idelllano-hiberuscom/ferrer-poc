import { t, formatMessage } from '../../scripts/ferrer-i18n.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/* UE instrumentation: Pendiente (Fase 3) */

const PHASES = ['phase-0', 'phase-1', 'phase-2', 'phase-3', 'phase-4', 'phase-5'];
const SPONSOR = 'https://www.ferrer.com/#organization';

let programCount = 0;

/** Characters Gson escapes by default (htmlSafe). */
const GSON_HTML_SAFE = /[<>&=']/g;

/**
 * SeoUtils#generateSemanticId.
 * @param {string} title
 * @returns {string}
 */
export function generateSemanticId(title) {
  return (title || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[-|–]+/g, '-');
}

/**
 * ItemModel#getPhaseForDisplay: StringUtils.replaceChars(phase, "phase-", "") removes
 * every one of those characters ("phase-3" -> "3").
 * @param {string} phase
 * @returns {string|null}
 */
export function phaseForDisplay(phase) {
  return phase ? phase.replace(/[phase-]/g, '') : null;
}

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
 * Inner HTML of a rich text cell, as the Java model reads the stored property.
 * @param {Element} cell
 * @returns {string}
 */
function richTextValue(cell) {
  return cell ? cell.innerHTML.trim() : '';
}

/**
 * Builds one program row (table-progress.html <li>).
 * @param {Element} row
 * @returns {{item: HTMLLIElement, data: object}}
 */
function buildProgram(row) {
  const [tagCell, titleCell, phaseCell] = [...row.children];
  const tag = tagCell ? tagCell.textContent.trim() : '';
  const title = richTextValue(titleCell);
  const phaseValue = phaseCell ? phaseCell.textContent.trim() : '';
  const phase = PHASES.includes(phaseValue) ? phaseValue : '';
  const currentPhase = phase ? t(`table-progress.dialog.${phase}`) : '';

  const item = el('li', 'cmp-table-progress__item');
  moveInstrumentation(row, item);

  const article = el('article', 'cmp-table-progress__program');
  article.id = generateSemanticId(title);
  article.setAttribute('aria-label', formatMessage(t('table-progress.component.program-aria-label'), title, currentPhase));
  article.setAttribute('itemscope', '');
  article.setAttribute('itemtype', 'https://schema.org/MedicalStudy');

  [['name', title], ['studySubject', tag], ['sponsor', SPONSOR]].forEach(([prop, content]) => {
    const meta = document.createElement('meta');
    meta.setAttribute('itemprop', prop);
    meta.setAttribute('content', content);
    article.append(meta);
  });

  const info = el('div', 'cmp-table-progress__program-info');
  if (tag) {
    const tagEl = el('span', 'cmp-table-progress__tag ferrer-body-xsmall', tag);
    tagEl.setAttribute('itemprop', 'healthCondition');
    const tagSource = tagCell.querySelector('p') || tagCell;
    moveInstrumentation(tagSource, tagEl);
    info.append(tagEl);
  }
  const name = el('h3', 'cmp-table-progress__name ferrer-body-small');
  programCount += 1;
  name.id = `table-progress-name-${programCount}`;
  if (titleCell) {
    moveInstrumentation(titleCell, name);
    name.append(...titleCell.childNodes);
  }
  info.append(name);

  const progress = el('div', 'cmp-table-progress__progress');
  const bar = el('div', 'cmp-table-progress__bar');
  bar.setAttribute('role', 'progressbar');
  // a11y (not in the HTL): accessible name of the progressbar = program name
  bar.setAttribute('aria-labelledby', name.id);
  const now = phaseForDisplay(phase);
  if (now) bar.setAttribute('aria-valuenow', now);
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '5');
  bar.setAttribute('aria-valuetext', formatMessage(t('table-progress.component.current-state'), currentPhase));
  bar.setAttribute('itemprop', 'status');
  bar.setAttribute('content', currentPhase);
  const fill = el('div', `cmp-table-progress__bar-fill${phase ? ` ${phase}` : ''}`);
  fill.setAttribute('aria-hidden', 'true');
  if (phaseCell) moveInstrumentation(phaseCell, fill);
  bar.append(fill, el('span', 'cmp-table-progress__phase-label ferrer-body-small', currentPhase));
  progress.append(bar);

  article.append(info, progress);
  item.append(article);

  // ItemModel serialised by Gson: transient/null fields are skipped, declaration order
  const data = { '@type': 'MedicalStudy', sponsor: { '@id': SPONSOR } };
  if (tag) data.studySubject = tag;
  if (title) data.name = title;
  data.status = currentPhase;
  return { item, data };
}

/**
 * Table progress block (pipeline of clinical programs).
 *
 * DOM de entrada (matriz EDS):
 *   block.table-progress
 *     ├── div > div → footer (rich text)
 *     └── div (item, N) → [tag] [title (rich text)] [phase: phase-0 … phase-5]
 *
 * @param {Element} block
 */
export default function decorate(block) {
  const rows = [...block.children];
  const component = el('div', 'cmp-table-progress');

  const header = el('div', 'cmp-table-progress__header ferrer-body-small');
  header.setAttribute('aria-hidden', 'true');
  header.append(el('span', '', t('table-progress.dialog.programs')));
  PHASES.forEach((phase) => {
    const span = el('span', '', t(`table-progress.dialog.${phase}`));
    span.dataset.phase = phase;
    header.append(span);
  });

  const list = el('ul', 'cmp-table-progress__list');
  list.setAttribute('role', 'list');
  const footer = el('footer', 'cmp-table-progress__footer ferrer-body-small');
  const programs = [];

  rows.forEach((row) => {
    if (row.children.length > 1) {
      const { item, data } = buildProgram(row);
      list.append(item);
      programs.push(data);
    } else if (row.firstElementChild) {
      moveInstrumentation(row.firstElementChild, footer);
      footer.append(...row.firstElementChild.childNodes);
    }
  });

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(programs)
    .replace(GSON_HTML_SAFE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);

  component.append(header, list, footer, script);
  block.append(component);
  rows.forEach((row) => row.remove());
}
