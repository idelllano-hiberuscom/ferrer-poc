import { getLinkInfo, BREAKPOINTS } from '../../scripts/ferrer-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/* UE instrumentation: Pendiente (Fase 3) */

let tabsCount = 0;

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
  return h.toString(16).padStart(8, '0');
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
 * Behaviour of content-tabs.js, scoped to one block.
 * @param {HTMLElement} component .cmp-content-tabs
 */
function initTabs(component) {
  const dropdownBtn = component.querySelector('.cmp-content-tabs__nav-button');
  const navList = component.querySelector('.cmp-content-tabs__nav-list');
  const triggers = [...component.querySelectorAll('.cmp-content-tabs__item-trigger')];
  const panels = [...component.querySelectorAll('.cmp-content-tabs__content-block')];
  const isMobile = () => window.innerWidth < BREAKPOINTS.desktop;

  const activate = (index) => {
    triggers.forEach((trigger, i) => {
      const active = i === index;
      trigger.parentElement.classList.toggle('is-active', active);
      panels[i].classList.toggle('is-active', active);
      trigger.setAttribute('aria-selected', active);
      trigger.setAttribute('tabindex', active ? '0' : '-1');
      panels[i].setAttribute('aria-hidden', !active);
    });
    if (triggers[index]) triggers[index].focus();
  };

  dropdownBtn.addEventListener('click', () => {
    navList.classList.toggle('is-open');
    dropdownBtn.classList.toggle('is-open');
  });

  triggers.forEach((trigger, index) => {
    trigger.addEventListener('click', () => {
      activate(index);
      if (isMobile()) {
        navList.classList.remove('is-open');
        dropdownBtn.classList.remove('is-open');
      }
    });

    trigger.addEventListener('keydown', (e) => {
      let newIndex = null;
      switch (e.key) {
        case 'ArrowRight': newIndex = index + 1; break;
        case 'ArrowLeft': newIndex = index - 1; break;
        case 'Home': newIndex = 0; break;
        case 'End': newIndex = triggers.length - 1; break;
        default:
      }
      if (newIndex !== null) {
        e.preventDefault();
        if (newIndex < 0) newIndex = triggers.length - 1;
        if (newIndex >= triggers.length) newIndex = 0;
        activate(newIndex);
      }
    });
  });
}

/**
 * Content tabs block.
 *
 * DOM de entrada (matriz EDS):
 *   block.content-tabs
 *     ├── div > div → title (título del desplegable)
 *     └── div (item, N) → [title] [text (rich text)] [link <a>texto</a>] [newTab true|false]
 *
 * @param {Element} block
 */
export default function decorate(block) {
  tabsCount += 1;
  const rows = [...block.children];
  const titleRow = rows.find((row) => row.children.length === 1);
  const tabRows = rows.filter((row) => row.children.length > 1);

  const component = el('div', 'cmp-content-tabs');
  component.dataset.component = 'cmp-content-tabs';

  const nav = el('nav', 'cmp-content-tabs__nav');
  const navButton = el('button', 'cmp-content-tabs__nav-button');
  navButton.type = 'button';
  const navTitle = el('span', 'ferrer-h5', titleRow ? titleRow.textContent.trim() : '');
  if (titleRow) moveInstrumentation(titleRow.firstElementChild, navTitle);
  const chevron = el('i', 'cmp-content-tabs__nav-chevron icon-chevron-down');
  chevron.setAttribute('aria-hidden', 'true');
  navButton.append(navTitle, chevron);

  const navList = el('ul', 'cmp-content-tabs__nav-list');
  navList.setAttribute('role', 'tablist');
  navList.setAttribute('aria-orientation', 'horizontal');

  const content = el('div', 'cmp-content-tabs__content');
  content.dataset.cmpIs = 'panelcontainer';
  content.setAttribute('data-cmp-panelcontainer', '');

  tabRows.forEach((row, index) => {
    const [titleCell, textCell, linkCell, targetCell] = [...row.children];
    const title = titleCell ? titleCell.textContent.trim() : '';
    const id = `item-${hash(`${window.location.pathname}-${tabsCount}-${index}-${title}`)}`;
    const first = index === 0;

    const item = el('li', `cmp-content-tabs__item ${first ? 'is-active' : ''} cmp-button--ghost`);
    // a11y (not in the HTL): <li> inside role=tablist must not expose the listitem role
    item.setAttribute('role', 'presentation');
    const trigger = el('button', 'cmp-content-tabs__item-trigger ferrer-body-large ferrer-bold cmp-button');
    trigger.type = 'button';
    trigger.setAttribute('role', 'tab');
    trigger.id = `${id}-tab`;
    trigger.setAttribute('aria-selected', first ? 'true' : 'false');
    trigger.setAttribute('aria-controls', `${id}-tabpanel`);
    trigger.setAttribute('tabindex', first ? '0' : '-1');
    trigger.dataset.index = index;
    trigger.append(el('span', 'cmp-button__text', title));
    item.append(trigger);
    navList.append(item);

    const panel = el('div', `cmp-content-tabs__content-block ${first ? 'is-active' : ''}`);
    panel.id = `${id}-tabpanel`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `${id}-tab`);
    panel.setAttribute('aria-hidden', first ? 'false' : 'true');
    panel.setAttribute('tabindex', '0');
    panel.dataset.index = index;
    moveInstrumentation(row, panel);

    const heading = el('h3', 'ferrer-h4', title);
    if (titleCell) moveInstrumentation(titleCell.querySelector('p') || titleCell, heading);
    const text = el('div');
    if (textCell) {
      moveInstrumentation(textCell, text);
      text.append(...textCell.childNodes);
    }

    const buttonWrapper = el('div', 'cmp-button--ghost');
    const authored = linkCell ? linkCell.querySelector('a[href]') : null;
    if (authored) {
      const href = authored.getAttribute('href');
      const link = el('a', 'cmp-button');
      link.href = href;
      const newTab = targetCell ? targetCell.textContent.trim() : '';
      if (newTab === 'true') link.target = '_blank';
      else if (newTab === 'false') link.target = '_self';
      moveInstrumentation(authored, link);
      const label = (authored.querySelector('.cmp-button__text') || authored).textContent.trim();
      const icon = el('i', `cmp-button__icon ${getLinkInfo(href).icon || ''}`);
      icon.setAttribute('aria-hidden', 'true');
      // link.text is optional: xwalk renders the URL when the text is empty
      link.append(el('span', 'cmp-button__text', label === href ? '' : label), icon);
      buttonWrapper.append(link);
    }

    panel.append(heading, text, buttonWrapper);
    content.append(panel);
  });

  nav.append(navButton, navList);
  component.append(nav, content);
  block.append(component);
  rows.forEach((row) => row.remove());
  initTabs(component);
}
