import { buildText, MEDIA } from '../../scripts/ferrer-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/* UE instrumentation: Pendiente (Fase 3) */

const ID_PREFIX = 'sidebar-item';
let sidebarCount = 0;

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
 * content-sidebar.js: showItemByIndex.
 * @param {HTMLElement} component
 * @param {number} index
 */
function showItemByIndex(component, index) {
  component.querySelectorAll('[data-cmp-hook-content-sidebar="item"]').forEach((element, idx) => {
    element.classList.toggle('cmp-content-sidebar__item--hidden', idx !== index);
    element.classList.toggle('cmp-content-sidebar__item--active', idx === index);
  });
}

/**
 * Behaviour of content-sidebar.js, scoped to one block.
 * @param {HTMLElement} component .cmp-content-sidebar
 */
function initSidebar(component) {
  const nav = component.querySelector('.cmp-content-sidebar__nav');
  const navTitle = component.querySelector('.cmp-content-sidebar__nav-title');
  const navList = component.querySelector('.cmp-content-sidebar__nav-list');
  const links = [...component.querySelectorAll('.cmp-content-sidebar__nav-link')];
  const desktop = window.matchMedia(MEDIA.desktop);

  const closeList = () => {
    navList.classList.remove('cmp-content-sidebar__nav-list--open');
    navTitle.setAttribute('aria-expanded', 'false');
  };

  navTitle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = navList.classList.toggle('cmp-content-sidebar__nav-list--open');
    navTitle.setAttribute('aria-expanded', isOpen);
  });

  links.forEach((link, index) => {
    link.addEventListener('click', (e) => {
      links.forEach((other) => other.classList.remove('cmp-content-sidebar__nav-link--active'));
      link.classList.add('cmp-content-sidebar__nav-link--active');
      closeList();
      e.preventDefault();
      if (!desktop.matches) {
        showItemByIndex(component, index);
      } else {
        const targetId = link.getAttribute('href').replace('#', '');
        const target = document.getElementById(targetId);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.pushState(null, '', `#${targetId}`);
      }
    });
  });

  if (links[0]) links[0].classList.add('cmp-content-sidebar__nav-link--active');
  showItemByIndex(component, 0);

  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) closeList();
  });
}

/**
 * Content sidebar block.
 *
 * DOM de entrada (matriz EDS):
 *   block.content-sidebar
 *     ├── div > div → title (título de la navegación)
 *     └── div (item = sección del sidebar, N) → [title (cq:panelTitle)] [id (ancla, opcional)]
 *                                                [text (rich text)]
 *
 * @param {Element} block
 */
export default function decorate(block) {
  sidebarCount += 1;
  const rows = [...block.children];
  const titleRow = rows.find((row) => row.children.length === 1);
  const itemRows = rows.filter((row) => row.children.length > 1);
  const title = titleRow ? titleRow.textContent.trim() : '';
  const listId = `nav-list-content-sidebar-${sidebarCount}`;

  const component = el('div', 'cmp-content-sidebar ferrer-row');

  const nav = el('nav', 'cmp-content-sidebar__nav col-12 col-xl-4');
  nav.setAttribute('aria-label', title);
  const navTitle = el('button', 'cmp-content-sidebar__nav-title ferrer-h5 ferrer--white');
  navTitle.setAttribute('aria-expanded', 'false');
  navTitle.setAttribute('aria-controls', listId);
  const navTitleText = el('span', '', title);
  if (titleRow) moveInstrumentation(titleRow.firstElementChild, navTitleText);
  navTitle.append(navTitleText, el('i', 'icon-chevron-down'));
  const navList = el('ul', 'cmp-content-sidebar__nav-list');
  navList.id = listId;
  nav.append(navTitle, navList);

  const content = el('div', 'cmp-content-sidebar__content col-12 col-xl-8');

  itemRows.forEach((row, index) => {
    const [titleCell, idCell, textCell] = [...row.children];
    const itemTitle = titleCell ? titleCell.textContent.trim() : '';
    const authoredId = idCell ? idCell.textContent.trim() : '';
    // ContainerModel#getId: authored id or generated "sidebar-item-<hash>"
    const id = authoredId || `${ID_PREFIX}-${hash(`${window.location.pathname}-${sidebarCount}-${index}`)}`;

    const navItem = el('li', 'cmp-content-sidebar__nav-item');
    const navLink = el('a', 'cmp-content-sidebar__nav-link', itemTitle);
    navLink.href = `#${id}`;
    navItem.append(navLink);
    navList.append(navItem);

    const section = el('section', `cmp-content-sidebar__item${index === 0 ? '' : ' cmp-content-sidebar__item--hidden'}`);
    section.id = id;
    section.dataset.cmpHookContentSidebar = 'item';
    moveInstrumentation(row, section);

    // content-sidebar/container/container.html
    const container = el('div', 'container');
    const header = el('div', 'cmp-content-sidebar__header');
    const heading = el('h2', 'ferrer-h4 title-sidebar-ipe-js', itemTitle);
    if (titleCell) moveInstrumentation(titleCell.querySelector('p') || titleCell, heading);
    header.append(heading);
    const cmpContainer = el('div', 'cmp-container');
    const cmpText = textCell ? buildText({ nodes: textCell }) : null;
    if (cmpText) {
      const text = el('div', 'text');
      text.append(cmpText);
      cmpContainer.append(text);
    }
    container.append(header, cmpContainer);
    section.append(container);
    content.append(section);
  });

  component.append(nav, content);
  rows.forEach((row) => row.remove());
  // content-sidebar.html: data-sly-test="${model.items}"
  if (!itemRows.length) return;
  block.append(component);
  initSidebar(component);
}
