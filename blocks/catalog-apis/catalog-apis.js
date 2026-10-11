/**
 * Catalog APIs Block — AEM Edge Delivery Services
 *
 * Origen: core-ferrer content/catalog-apis (catalog-apis.html, CatalogApisModel/ApiModel.java)
 *         + site/cards/card_api.js (volteo de la tarjeta)
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3)
 *
 * DOM de entrada (matriz EDS):
 *   div.catalog-apis
 *     div > div > title                          (propiedad)
 *     div > div > [p >] a[href]                  (propiedad fullCatalog, PDF)
 *     div > div > mailto                         (propiedad, e-mail)
 *     div (fila = catalog-api)
 *       div > title
 *       div > p description, p tag              (grupo info_)
 *       div > p casNumber, p state, p size, p validity, p availability, p pharmacopoeia
 *       div > [p >] a[href]                      (pdf)
 *
 * DOM de salida (1:1 con el HTL, microdatos schema.org incluidos):
 *   section.cmp-catalog-apis[itemscope][itemtype=ItemList]
 *     div.cmp-catalog-apis__catalog > p.ferrer-h5 + div.cmp-button--ghost.cmp-button--dark > a
 *     div.cmp-catalog-apis__list.ferrer-row
 *       div.col-12.col-lg-6.col-xl-3 > article.cmp-catalog-apis__list-item.card-api
 *         div.card-api__front · div.card-api__back · div.card-api__actions
 */
import { moveInstrumentation } from '../../scripts/scripts.js';
import { getLinkInfo } from '../../scripts/ferrer-utils.js';
import { t } from '../../scripts/ferrer-i18n.js';

/* UE instrumentation: Pendiente (Fase 3) */

const SPEC_FIELDS = [
  ['casNumber', 'catalog-apis.component.cas-number'],
  ['state', 'catalog-apis.component.state'],
  ['size', 'catalog-apis.component.size'],
  ['validity', 'catalog-apis.component.validity'],
  ['availability', 'catalog-apis.component.availability'],
  ['pharmacopoeia', 'catalog-apis.component.pharmacopoeia'],
];

/**
 * Port of ApiModel.getMailtoSubject(): java.net.URLEncoder.encode(title, UTF-8)
 * (application/x-www-form-urlencoded: spaces as '+', !'()~ percent-encoded).
 * @param {string} value
 * @returns {string}
 */
function urlEncode(value) {
  return encodeURIComponent(value || '')
    .replace(/[!'()~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

/**
 * Creates an element with classes and optional attributes.
 * @param {string} tag
 * @param {string} [className]
 * @param {Object<string,string>} [attrs]
 * @returns {HTMLElement}
 */
function el(tag, className, attrs = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

/**
 * Text values of the paragraphs of a grouped cell (in authored order).
 * @param {Element} cell
 * @returns {string[]}
 */
function groupValues(cell) {
  if (!cell) return [];
  const paragraphs = cell.querySelectorAll('p');
  if (!paragraphs.length) return [cell.textContent.trim()];
  return [...paragraphs].map((p) => p.textContent.trim());
}

/**
 * Reads the leading single-cell property rows (title, fullCatalog, mailto).
 * @param {Element[]} rows
 * @returns {{title: string, fullCatalog: string, mailto: string}}
 */
function readProperties(rows) {
  const props = { title: '', fullCatalog: '', mailto: '' };
  rows.forEach((row) => {
    const link = row.querySelector('a');
    const value = row.textContent.trim();
    if (link && !link.getAttribute('href').startsWith('mailto:')) {
      props.fullCatalog = link.getAttribute('href');
    } else if (/^\S+@\S+$/.test(value) || (link && link.href.startsWith('mailto:'))) {
      props.mailto = link ? link.getAttribute('href').replace(/^mailto:/, '') : value;
    } else if (value) {
      props.title = value;
    }
  });
  return props;
}

/**
 * Builds one back-side field (dt/dd pair with microdata).
 * @param {string} labelKey
 * @param {string} value
 * @param {boolean} identifier wraps the value in span[itemprop=identifier]
 * @returns {HTMLDivElement}
 */
function buildField(labelKey, value, identifier) {
  const field = el('div', 'card-api__back-field', {
    itemprop: 'additionalProperty', itemscope: '', itemtype: 'https://schema.org/PropertyValue',
  });
  const dt = el('dt', 'card-api__back-field-label ferrer-body-xsmall ferrer--bold', { itemprop: 'name' });
  dt.textContent = t(labelKey);
  const dd = el('dd', 'card-api__back-field-value ferrer-body-xsmall ferrer--bold', { itemprop: 'value' });
  if (identifier) {
    const span = el('span', '', { itemprop: 'identifier' });
    span.textContent = value;
    dd.append(span);
  } else {
    dd.textContent = value;
  }
  field.append(dt, dd);
  return field;
}

/**
 * Builds the card-api <article> of one API.
 * @param {Element} row
 * @param {string} mailto
 * @returns {HTMLElement}
 */
function buildCard(row, mailto) {
  const [titleCell, infoCell, specsCell, pdfCell] = row.children;
  const title = titleCell ? titleCell.textContent.trim() : '';
  const [description = '', tag = ''] = groupValues(infoCell);
  const specs = groupValues(specsCell);
  const pdfLink = pdfCell && pdfCell.querySelector('a');
  const pdf = pdfLink ? pdfLink.getAttribute('href') : '';

  const article = el('article', 'cmp-catalog-apis__list-item card-api', {
    itemprop: 'itemListElement', itemscope: '', itemtype: 'https://schema.org/ListItem',
  });
  moveInstrumentation(row, article);

  // front
  const front = el('div', 'card-api__front');
  const frontTitle = el('div', 'card-api__front-title ferrer-body-large');
  const frontH3 = el('h3', '', { itemprop: 'name' });
  frontH3.textContent = title;
  frontTitle.append(frontH3);
  const frontDescription = el('p', 'card-api__front-description', { itemprop: 'description' });
  frontDescription.textContent = description;
  front.append(frontTitle, frontDescription);

  // back
  const back = el('div', 'card-api__back', {
    itemprop: 'item', itemscope: '', itemtype: 'https://schema.org/MedicalTherapy',
  });
  const backTitle = el('div', 'card-api__back-title ferrer-body-large');
  const backH3 = el('h3', '', { itemprop: 'name' });
  backH3.textContent = title;
  backTitle.append(backH3);
  const tagEl = el('span', 'card-api__back-tag', {
    itemprop: 'relevantSpecialty', itemscope: '', itemtype: 'https://schema.org/MedicalSpecialty',
  });
  const tagName = el('span', 'ferrer-body-xsmall ferrer--bold', { itemprop: 'name' });
  tagName.textContent = tag;
  tagEl.append(tagName);
  const grid = el('dl', 'card-api__back-grid');
  SPEC_FIELDS.forEach(([name, key], index) => {
    grid.append(buildField(key, specs[index] || '', name === 'casNumber'));
  });
  back.append(backTitle, tagEl, grid);

  // actions
  const actions = el('div', 'card-api__actions');
  const left = el('div', 'card-api__actions-left');
  const download = el('a', '', { target: '_blank', 'aria-label': t('catalog-apis.component.download') });
  if (pdf) download.href = pdf;
  const downloadIcon = el('i', getLinkInfo(pdf).icon || '', { 'aria-hidden': 'true' });
  download.append(downloadIcon);
  const contact = el('a', '', {
    href: `mailto:${mailto}?subject=${urlEncode(title)}`,
    'aria-label': t('catalog-apis.component.contact'),
  });
  contact.append(el('i', 'icon-envelope', { 'aria-hidden': 'true' }));
  left.append(download, contact);

  const more = el('a', '', {
    class: 'card-api__toggle',
    role: 'button',
    tabindex: '0',
    'aria-expanded': 'false',
    'aria-label': t('catalog-apis.component.more'),
  });
  more.append(
    el('i', 'icon-plus', { 'aria-hidden': 'true' }),
    el('i', 'icon-minus', { 'aria-hidden': 'true' }),
  );
  more.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    article.click();
  });
  actions.append(left, more);

  article.append(front, back, actions);
  return article;
}

/**
 * Sets the flipped state of a card. aria-expanded lives on the "more" toggle (role=button):
 * the original put it on the <article>, where it is not an allowed ARIA attribute.
 * @param {Element} card
 * @param {boolean} flipped
 */
function setFlipped(card, flipped) {
  card.classList.toggle('card-api--flipped', flipped);
  const toggle = card.querySelector('.card-api__toggle');
  if (toggle) toggle.setAttribute('aria-expanded', String(flipped));
}

/**
 * Port of card_api.js: clicking a card flips it and unflips every other card of the page.
 * @param {HTMLElement} card
 */
function bindFlip(card) {
  card.addEventListener('click', () => {
    const isFlipped = card.classList.contains('card-api--flipped');
    document.querySelectorAll('.card-api').forEach((c) => setFlipped(c, false));
    if (!isFlipped) setFlipped(card, true);
  });
}

/**
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  const rows = [...block.children];
  const propertyRows = rows.filter((row) => row.children.length === 1);
  const itemRows = rows.filter((row) => row.children.length > 1);
  const props = readProperties(propertyRows);

  const section = el('section', 'cmp-catalog-apis', {
    itemscope: '', itemtype: 'https://schema.org/ItemList',
  });

  const catalog = el('div', 'cmp-catalog-apis__catalog');
  const title = el('p', 'ferrer-h5');
  title.textContent = t(props.title, props.title);
  const buttonWrap = el('div', 'cmp-button--ghost cmp-button--dark');
  const button = el('a', 'cmp-button cmp-button--small');
  if (props.fullCatalog) button.href = props.fullCatalog;
  const label = el('span', 'cmp-button__text');
  label.textContent = t('catalog-apis.component.full-catalog');
  button.append(label);
  const { icon } = getLinkInfo(props.fullCatalog);
  if (icon) button.append(el('i', `cmp-button__icon ${icon}`, { 'aria-hidden': 'true' }));
  buttonWrap.append(button);
  catalog.append(title, buttonWrap);
  if (propertyRows[0]) moveInstrumentation(propertyRows[0], title);

  const list = el('div', 'cmp-catalog-apis__list ferrer-row');
  itemRows.forEach((row) => {
    const col = el('div', 'col-12 col-lg-6 col-xl-3');
    const card = buildCard(row, props.mailto);
    bindFlip(card);
    col.append(card);
    list.append(col);
  });

  rows.forEach((row) => row.remove());
  section.append(catalog, list);
  block.append(section);
}
