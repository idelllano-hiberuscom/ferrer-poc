import { getLinkInfo, buildPicture } from '../../scripts/ferrer-utils.js';
import { t } from '../../scripts/ferrer-i18n.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/* UE instrumentation: Pendiente (Fase 3) */

const VIEWS = ['large', 'small', 'with-description', 'with-image'];
const DEFAULT_VIEW = 'large';
const DARK_CLASS = 'download-documents--dark';

/**
 * Creates an element with classes and optional text.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/**
 * Creates an icomoon <i> icon.
 * @param {string} className
 * @returns {HTMLElement}
 */
function icon(className) {
  const i = el('i', className);
  i.setAttribute('aria-hidden', 'true');
  return i;
}

/**
 * Extension shown in "(EXT, size)". The original read it from the DAM mimetype
 * (DocumentModel#init); in EDS it comes from the URL.
 * @param {string} href
 * @returns {string}
 */
export function getDocumentExtension(href) {
  if (!href) return '';
  let path = href;
  try {
    path = new URL(href, window.location.href).pathname;
  } catch {
    // keep raw value
  }
  const file = path.substring(path.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.substring(dot + 1).toUpperCase() : '';
}

/**
 * Reads href / visible text / node of the first link of a cell. The link may already have
 * been turned into a Ferrer button by the global decoration.
 * @param {Element} cell
 * @returns {{href: string, text: string, anchor: (HTMLAnchorElement|null)}}
 */
export function readLink(cell) {
  const anchor = cell ? cell.querySelector('a[href]') : null;
  if (!anchor) return { href: '', text: '', anchor: null };
  const label = anchor.querySelector('.cmp-button__text');
  const text = (label || anchor).textContent.trim();
  return { href: anchor.getAttribute('href'), text, anchor };
}

/**
 * Copies href, the download flag and the UE instrumentation of the authored link to a
 * new <a class="cmp-document …"> (LinkHelperModel: data-sly-attribute.download).
 * @param {object} doc
 * @param {string} className
 * @returns {{link: HTMLAnchorElement, iconClass: string}}
 */
function documentLink(doc, className) {
  const info = getLinkInfo(doc.href);
  const link = el('a', className);
  link.href = doc.href;
  if (info.isDownload) link.setAttribute('download', '');
  if (doc.anchor) moveInstrumentation(doc.anchor, link);
  return { link, iconClass: info.icon || '' };
}

/**
 * view-templates.html#small.
 * @param {object} doc {href, text, size, anchor}
 * @param {boolean} [isDark]
 * @returns {HTMLElement}
 */
export function renderSmallDocument(doc, isDark = false) {
  const wrapper = el('div', 'cmp-button--primary cmp-button--small');
  if (isDark) wrapper.classList.add('cmp-button--dark');
  const { link, iconClass } = documentLink(doc, 'cmp-document cmp-button');
  const extension = getDocumentExtension(doc.href);
  const size = (doc.size || '').trim();
  // DocumentModel#hasDocumentInfo: extension AND size
  const info = extension && size ? ` (${extension}, ${size})` : '';
  link.append(
    el('p', 'document__text cmp-button__text', `${doc.text}${info}`),
    icon(`document__icon ${iconClass} cmp-button__icon`),
  );
  wrapper.append(link);
  return wrapper;
}

/**
 * view-templates.html#large.
 * @param {object} doc
 * @returns {HTMLElement}
 */
function renderLarge(doc) {
  const { link, iconClass } = documentLink(doc, 'cmp-document card-basic card-basic--small');
  const container = el('div', 'card-basic__content-container');
  const content = el('div', 'card-basic__content');
  const info = el('div', 'card-basic__content-info');
  const header = el('div', 'card-basic__header');
  header.append(
    el('p', 'card-basic__header-title ferrer-h5', doc.text),
    icon(`${iconClass} card-basic__header-icon`),
  );
  info.append(header);
  content.append(info);
  container.append(content);
  link.append(container);
  return link;
}

/**
 * view-templates.html#withDescription.
 * @param {object} doc
 * @returns {HTMLElement[]}
 */
function renderWithDescription(doc) {
  const { link, iconClass } = documentLink(doc, 'cmp-document');
  const heading = el('h3', 'cmp-document__text ferrer-body ferrer--bold', doc.text);
  heading.append(icon(`cmp-document__icon ${iconClass}`));
  link.append(heading);
  const description = el('p', 'ferrer-body-small', doc.description);
  if (doc.descriptionNode) moveInstrumentation(doc.descriptionNode, description);
  return [link, description];
}

/**
 * view-templates.html#withImage.
 * @param {object} doc
 * @returns {HTMLElement}
 */
function renderWithImage(doc) {
  const { link, iconClass } = documentLink(doc, 'cmp-document card-basic card-basic--transparent card-basic--small');
  const media = el('div', 'card-basic__media');
  const picture = buildPicture({ src: doc.picture });
  if (picture) media.append(picture);
  const container = el('div', 'card-basic__content-container');
  const content = el('div', 'card-basic__content');
  const info = el('div', 'card-basic__content-info');
  const header = el('div', 'card-basic__header');
  header.append(
    el('h3', 'ferrer-h5 card-basic__header-title', doc.text),
    icon(`document__icon ${iconClass} card-basic__header-icon`),
  );
  info.append(header);
  content.append(info);
  container.append(content);
  link.append(media, container);
  return link;
}

/**
 * Renders one document with the template of the view.
 * @param {string} view
 * @param {object} doc
 * @param {boolean} isDark
 * @returns {HTMLElement[]}
 */
function renderDocument(view, doc, isDark) {
  if (view === 'large') return [renderLarge(doc)];
  if (view === 'small') return [renderSmallDocument(doc, isDark)];
  if (view === 'with-description') return renderWithDescription(doc);
  if (view === 'with-image') return [renderWithImage(doc)];
  return [];
}

/**
 * download-documents.html: the .cmp-download-documents markup for a list of documents.
 * Shared with the "documents" items of the dropdown block (small view).
 * @param {object} options
 * @param {string} options.view large | small | with-description | with-image
 * @param {string} [options.title] h3 title (small view only)
 * @param {Element} [options.titleNode] authored node holding the title (UE instrumentation)
 * @param {string} [options.downloadAll] zip URL for "Download all" (with-image only)
 * @param {object[]} options.documents [{href, text, size, description, picture, anchor, row}]
 * @param {boolean} [options.isDark] download-documents--dark style
 * @returns {HTMLDivElement}
 */
export function buildDownloadDocuments({
  view,
  title = '',
  titleNode,
  downloadAll,
  documents,
  isDark = false,
}) {
  const root = el('div', `cmp-download-documents cmp-download-documents--${view}`);

  if (view === 'small') {
    const heading = el('h3', 'cmp-download-documents__title ferrer-h4', title);
    if (titleNode) moveInstrumentation(titleNode, heading);
    root.append(heading);
  }

  if (view === 'with-image' && downloadAll && documents.length) {
    const block = el('div', 'cmp-download-documents__download-all');
    const wrapper = el('div', 'cmp-button--ghost cmp-button--large');
    const link = el('a', 'cmp-button');
    link.href = downloadAll;
    link.setAttribute('download', '');
    link.append(
      el('span', 'cmp-button__text', t('download-documents.component.download-all', 'Download all')),
      icon('icon-download cmp-button__icon'),
    );
    wrapper.append(link);
    block.append(wrapper);
    root.append(block);
  }

  const list = el('ul', 'cmp-download-documents__documents');
  documents.forEach((doc) => {
    const item = el('li', `cmp-download-documents__document cmp-download-documents__document--${view}`);
    if (doc.row) moveInstrumentation(doc.row, item);
    item.append(...renderDocument(view, doc, isDark));
    list.append(item);
  });
  root.append(list);
  return root;
}

/**
 * Reads one item row: link | description | image | size.
 * @param {Element} row
 * @returns {object|null}
 */
function readDocumentRow(row) {
  const [linkCell, descriptionCell, imageCell, sizeCell] = [...row.children];
  const { href, text, anchor } = readLink(linkCell);
  if (!href) return null;
  const descriptionNode = descriptionCell
    ? descriptionCell.querySelector('p') || descriptionCell : null;
  return {
    href,
    text: text || href,
    anchor,
    description: descriptionCell ? descriptionCell.textContent.trim() : '',
    descriptionNode,
    picture: imageCell ? imageCell.querySelector('picture') : null,
    size: sizeCell ? sizeCell.textContent.trim() : '',
    row,
  };
}

/**
 * Download documents block.
 *
 * DOM de entrada (matriz EDS):
 *   block.download-documents[.large|.small|.with-description|.with-image]
 *                           [.download-documents--dark]
 *     ├── div > div → title (texto, solo vista small)
 *     ├── div > div → <a> downloadAll (zip del DAM, opcional, solo vista with-image)
 *     └── div (item, N) → [link <a>texto</a>] [description] [image <picture>] [size]
 *
 * @param {Element} block
 */
export default function decorate(block) {
  const view = VIEWS.find((v) => block.classList.contains(v)) || DEFAULT_VIEW;
  const isDark = block.classList.contains(DARK_CLASS);

  let title = '';
  let titleNode = null;
  let downloadAll = '';
  const documents = [];

  [...block.children].forEach((row) => {
    if (row.children.length > 1) {
      const doc = readDocumentRow(row);
      if (doc) documents.push(doc);
      return;
    }
    const cell = row.firstElementChild;
    if (!cell) return;
    const { href } = readLink(cell);
    if (href) downloadAll = href;
    else if (cell.textContent.trim()) {
      title = cell.textContent.trim();
      titleNode = cell.querySelector('p') || cell;
    }
  });

  const component = buildDownloadDocuments({
    view, title, titleNode, downloadAll, documents, isDark,
  });
  block.append(component);
  [...block.children].filter((child) => child !== component).forEach((row) => row.remove());
}
