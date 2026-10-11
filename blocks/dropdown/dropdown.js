import { buildText, wrapLooseText } from '../../scripts/ferrer-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildDownloadDocuments } from '../download-documents/download-documents.js';

/* UE instrumentation: Pendiente (Fase 3) */

/** Core Accordion v1 (accordion.js) class names, data attributes and keyboard keys. */
const CSS = {
  buttonExpanded: 'cmp-accordion__button--expanded',
  panelExpanded: 'cmp-accordion__panel--expanded',
  panelHidden: 'cmp-accordion__panel--hidden',
};
const ATTR_EXPANDED = 'data-cmp-expanded';
/** Delay Core uses before writing aria-expanded (WebKit screen reader bug 210934). */
const ARIA_DELAY = 100;
/** accordion.headingElement default of Core. */
const HEADING_ELEMENT = 'h3';

let accordionCount = 0;

/** Characters Gson escapes by default (htmlSafe). */
const GSON_HTML_SAFE = /[<>&='\u2028\u2029]/g;

/**
 * Short deterministic hash (stands in for ComponentUtils.generateId).
 * @param {string} value
 * @returns {string}
 */
function hash(value) {
  let h = 5381;
  [...value].forEach((char) => {
    h = ((h * 33) + char.charCodeAt(0)) % 4294967296;
  });
  return h.toString(16).padStart(8, '0').substring(0, 10);
}

/**
 * Splits the rich text of a "documents" item into download-documents groups: every
 * heading opens a group (its title); every link of a paragraph / list item is a document.
 * Text written after the link in the same paragraph / list item is the file size.
 * @param {Element} cell
 * @returns {object[]} [{title, titleNode, documents}]
 */
function readDocumentGroups(cell) {
  const groups = [];
  let current = null;
  const ensureGroup = () => {
    if (!current) {
      current = { title: '', titleNode: null, documents: [] };
      groups.push(current);
    }
    return current;
  };
  const addDocuments = (container) => {
    [...container.querySelectorAll('a[href]')].forEach((anchor) => {
      const href = anchor.getAttribute('href');
      const text = (anchor.querySelector('.cmp-button__text') || anchor).textContent.trim();
      const size = container.textContent.replace(anchor.textContent, '')
        .replace(/[(),]/g, ' ').trim();
      ensureGroup().documents.push({
        href, text: text || href, size, anchor,
      });
    });
  };
  [...wrapLooseText(cell).children].forEach((node) => {
    if (/^H[1-6]$/.test(node.tagName)) {
      current = { title: node.textContent.trim(), titleNode: node, documents: [] };
      groups.push(current);
    } else if (node.tagName === 'UL' || node.tagName === 'OL') {
      [...node.children].forEach((li) => addDocuments(li));
    } else {
      addDocuments(node);
    }
  });
  return groups;
}

/**
 * Panel content of a "documents" item: the container (style container--dropdown-documents)
 * holding one download-documents component (small view) per group.
 * @param {Element} cell
 * @param {boolean} isDark
 * @returns {HTMLElement}
 */
function buildDocumentsPanel(cell, isDark) {
  const container = document.createElement('div');
  container.className = 'container container--dropdown-documents';
  const cmpContainer = document.createElement('div');
  cmpContainer.className = 'cmp-container';
  moveInstrumentation(cell, cmpContainer);
  readDocumentGroups(cell).forEach((group) => {
    const component = document.createElement('div');
    component.className = 'download-documents';
    if (isDark) component.classList.add('download-documents--dark');
    component.append(buildDownloadDocuments({ view: 'small', ...group, isDark }));
    cmpContainer.append(component);
  });
  container.append(cmpContainer);
  return container;
}

/**
 * Panel content of a text item: the text component (div.text > div.cmp-text).
 * @param {Element} cell
 * @returns {HTMLElement|null}
 */
function buildTextPanel(cell) {
  const cmpText = buildText({ nodes: cell });
  if (!cmpText) return null;
  const component = document.createElement('div');
  component.className = 'text';
  component.append(cmpText);
  return component;
}

const BLOCK_TAGS = /^(ADDRESS|BLOCKQUOTE|BR|DD|DIV|DL|DT|H[1-6]|HR|LI|OL|P|PRE|TABLE|TD|TH|TR|UL)$/;

/**
 * Jsoup Document#text(): text content where block elements are separated by a space,
 * whitespace collapsed and trimmed.
 * @param {Node} node
 * @returns {string}
 */
function plainText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const inner = [...node.childNodes].map(plainText).join('');
  return BLOCK_TAGS.test(node.tagName) ? ` ${inner} ` : inner;
}

/**
 * DropdownModel#generateData: one schema.org ItemList entry per item (title + plain text).
 * Gson escapes <, >, &, = and ' (htmlSafe); same escaping so the script cannot be closed.
 * @param {object[]} entries [{name, description}]
 * @returns {string}
 */
function structuredData(entries) {
  const data = entries.map(({ name, description }) => ({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    description,
  }));
  return JSON.stringify(data).replace(GSON_HTML_SAFE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * Port of Core Accordion v1 (core.wcm.components.accordion.v1/accordion.js), scoped to
 * one accordion: single expansion, --expanded/--hidden classes, aria-expanded,
 * keyboard navigation and deep linking by URL hash.
 * @param {HTMLElement} accordion .cmp-accordion
 */
function initAccordion(accordion) {
  const items = [...accordion.querySelectorAll(':scope > [data-cmp-hook-accordion="item"]')];
  const buttons = items.map((item) => item.querySelector('[data-cmp-hook-accordion="button"]'));
  const panels = items.map((item) => item.querySelector(':scope > [data-cmp-hook-accordion="panel"]'));
  const singleExpansion = accordion.dataset.cmpSingleExpansion === 'true';

  const isExpanded = (item) => item.hasAttribute(ATTR_EXPANDED);

  const refreshItem = (item) => {
    const index = items.indexOf(item);
    const button = buttons[index];
    const panel = panels[index];
    const expanded = isExpanded(item);
    button.classList.toggle(CSS.buttonExpanded, expanded);
    setTimeout(() => button.setAttribute('aria-expanded', expanded), ARIA_DELAY);
    panel.classList.toggle(CSS.panelExpanded, expanded);
    panel.classList.toggle(CSS.panelHidden, !expanded);
    panel.setAttribute('aria-hidden', !expanded);
  };

  const setExpanded = (item, expanded) => {
    if (expanded) item.setAttribute(ATTR_EXPANDED, '');
    else item.removeAttribute(ATTR_EXPANDED);
    refreshItem(item);
  };

  const toggle = (index) => {
    const item = items[index];
    if (!item) return;
    if (singleExpansion) {
      items.filter((other) => other !== item && isExpanded(other))
        .forEach((other) => setExpanded(other, false));
    }
    setExpanded(item, !isExpanded(item));
  };

  const focusButton = (index) => buttons[index] && buttons[index].focus();

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => {
      toggle(index);
      focusButton(index);
    });
    button.addEventListener('keydown', (event) => {
      const last = buttons.length - 1;
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          if (index > 0) focusButton(index - 1);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          if (index < last) focusButton(index + 1);
          break;
        case 'Home':
          event.preventDefault();
          focusButton(0);
          break;
        case 'End':
          event.preventDefault();
          focusButton(last);
          break;
        default:
      }
    });
  });

  // single expansion with several items expanded: keep only the first one open
  if (singleExpansion) {
    items.filter(isExpanded).slice(1).forEach((item) => item.removeAttribute(ATTR_EXPANDED));
  }
  items.forEach(refreshItem);

  // containerUtils.getDeepLinkItem: open the item targeted by the URL hash
  const openFromHash = () => {
    const id = decodeURIComponent(window.location.hash.substring(1));
    if (!id) return;
    const target = document.getElementById(id);
    const item = target && items.find((candidate) => candidate.contains(target));
    if (!item) return;
    const index = items.indexOf(item);
    if (!isExpanded(item)) toggle(index);
    target.scrollIntoView();
  };
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
}

/**
 * Dropdown block — Core Accordion with Ferrer styles.
 *
 * DOM de entrada (matriz EDS):
 *   block.dropdown[.dropdown--dark]
 *     └── div (item, N)
 *           ├── div → title (cq:panelTitle)
 *           ├── div → view: text | documents | documents-dark
 *           └── div → rich text (text) · documents: [hN título] + enlaces (p o ul/li),
 *                     con el tamaño opcional escrito tras el enlace
 *
 * @param {Element} block
 */
export default function decorate(block) {
  accordionCount += 1;
  const rows = [...block.children];
  const accordionId = `accordion-${hash(`${window.location.pathname}-${accordionCount}`)}`;

  const accordion = document.createElement('div');
  accordion.id = accordionId;
  accordion.className = 'cmp-accordion';
  accordion.dataset.cmpIs = 'accordion';
  accordion.dataset.cmpSingleExpansion = 'true';

  const entries = [];
  rows.forEach((row, index) => {
    const [titleCell, viewCell, contentCell] = [...row.children];
    const title = titleCell ? titleCell.textContent.trim() : '';
    const view = viewCell ? viewCell.textContent.trim() : 'text';
    const itemId = `${accordionId}-item-${hash(`${title}-${index}`)}`;

    const item = document.createElement('div');
    item.className = 'cmp-accordion__item';
    item.dataset.cmpHookAccordion = 'item';
    item.id = itemId;
    moveInstrumentation(row, item);

    const header = document.createElement(HEADING_ELEMENT);
    header.className = 'cmp-accordion__header';
    const button = document.createElement('button');
    button.id = `${itemId}-button`;
    button.className = 'cmp-accordion__button';
    button.type = 'button';
    button.setAttribute('aria-controls', `${itemId}-panel`);
    button.dataset.cmpHookAccordion = 'button';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'cmp-accordion__title ferrer-h5';
    const titleSource = titleCell && (titleCell.querySelector('p') || titleCell);
    if (titleSource) moveInstrumentation(titleSource, titleSpan);
    const chevron = document.createElement('i');
    chevron.className = 'icon-chevron-down';
    titleSpan.append(title, ' ', chevron);
    button.append(titleSpan);
    header.append(button);

    const panel = document.createElement('div');
    panel.dataset.cmpHookAccordion = 'panel';
    panel.id = `${itemId}-panel`;
    panel.className = `cmp-accordion__panel ${CSS.panelHidden}`;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', `${itemId}-button`);

    let description = '';
    if (contentCell) {
      if (view.startsWith('documents')) {
        panel.append(buildDocumentsPanel(contentCell, view === 'documents-dark'));
      } else {
        // Jsoup.parse(text).text(): plain text with collapsed whitespace
        description = plainText(contentCell).replace(/\s+/g, ' ').trim();
        const text = buildTextPanel(contentCell);
        if (text) panel.append(text);
      }
    }
    entries.push({ name: title, description });

    item.append(header, panel);
    accordion.append(item);
  });

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = structuredData(entries);
  accordion.append(script);

  block.append(accordion);
  rows.forEach((row) => row.remove());
  initAccordion(accordion);
}
