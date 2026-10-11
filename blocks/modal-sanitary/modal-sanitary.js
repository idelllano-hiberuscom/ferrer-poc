import { getMetadata, readBlockConfig } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildButton } from '../../scripts/ferrer-utils.js';
import { t } from '../../scripts/ferrer-i18n.js';
import { closeModal, initModals } from '../../scripts/ferrer-modal.js';
import { loadFragment } from '../fragment/fragment.js';

/* UE instrumentation: Pendiente (Fase 3) */

let instances = 0;

/**
 * ModalSanitaryModel.buildCookieName(): computed and exposed, never read (same as AEM).
 * @param {string} path
 * @returns {string}
 */
function buildCookieName(path) {
  const sanitized = path.startsWith('/') ? path.substring(1) : path;
  return `mSanitary-${sanitized.replace(/\//g, '-')}`;
}

/**
 * Text of a cell (first link href for link cells), or ''.
 * @param {Element|null} cell
 * @param {boolean} [asLink]
 * @returns {string}
 */
function cellValue(cell, asLink = false) {
  if (!cell) return '';
  if (asLink) {
    const link = cell.querySelector('a[href]');
    return link ? link.getAttribute('href') : cell.textContent.trim();
  }
  return cell.textContent.trim();
}

/**
 * Element with the given classes and text.
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * Page metadata of the sanitary modal (names fixed by the auto-block of scripts.js, L0).
 * @returns {{show: boolean, redirect: string, overlayDisabled: boolean, blurEnabled: boolean}}
 */
function pageOptions() {
  return {
    show: getMetadata('show-modal-sanitary').toLowerCase() === 'true',
    redirect: getMetadata('modal-sanitary-redirect'),
    overlayDisabled: getMetadata('modal-sanitary-overlay-disabled').toLowerCase() === 'true',
    blurEnabled: getMetadata('modal-sanitary-blur-enabled').toLowerCase() === 'true',
  };
}

/**
 * Applies the page options (ModalSanitaryModel: redirect link, overlay and blur).
 * @param {HTMLElement} modal .cmp-modal-sanitary
 * @param {{redirect: string, overlayDisabled: boolean, blurEnabled: boolean}} options
 */
function applyOptions(modal, { redirect, overlayDisabled, blurEnabled }) {
  const overlay = modal.querySelector('.cmp-modal__overlay');
  overlay.classList.toggle('cmp-modal--overlay-disabled', overlayDisabled);
  overlay.classList.toggle('cmp-modal--blur-enabled', blurEnabled);
  const no = modal.querySelector('a.cmp-button');
  if (redirect && no) no.href = redirect;
}

/**
 * Shows the modal on the page (modal-sanitary.js): scroll lock, Escape and initial focus.
 * "Sí" (.js-modal-close) is closed by the global listener of ferrer-modal.js.
 * @param {HTMLElement} modal
 */
function activate(modal) {
  initModals();
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('scroll-blocked');
  // modal.js: Escape hides every visible modal, the sanitary one included
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeModal(modal);
  });
  window.requestAnimationFrame(() => {
    const first = modal.querySelector('.cmp-button');
    if (first) first.focus({ preventScroll: true });
  });
}

/**
 * Renders the dialog of modal-sanitary.html from the authored fields.
 * @param {Element} block
 * @param {Element[]} rows title · text · ref
 * @returns {HTMLElement} the .cmp-modal-sanitary element
 */
function renderModal(block, rows) {
  const [titleCell, textCell, refCell] = rows.map((row) => row.firstElementChild);
  instances += 1;
  const id = `modal-sanitary-${instances}`;

  const modal = el('div', 'cmp-modal-sanitary cmp-modal');
  modal.id = id;
  modal.dataset.cookieName = buildCookieName(window.location.pathname);
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', `${id}-title`);
  modal.setAttribute('aria-hidden', 'false');

  const overlay = el('div', 'cmp-modal__overlay');
  const dialog = el('div', 'cmp-modal-sanitary__dialog');
  const title = el('p', 'cmp-modal-sanitary__dialog-title ferrer-h4', cellValue(titleCell));
  title.id = `${id}-title`;
  if (titleCell) moveInstrumentation(titleCell, title);
  const text = el('p', 'cmp-modal-sanitary__dialog-text ferrer-body', cellValue(textCell));
  if (textCell) moveInstrumentation(textCell, text);

  const buttons = el('div', 'cmp-modal-sanitary__dialog-buttons');
  const yes = buildButton({
    text: t('modal-sanitary.component.yes'), style: 'primary', size: 'large', classes: 'js-modal-close',
  });
  const no = buildButton({
    text: t('modal-sanitary.component.no'),
    href: cellValue(refCell, true) || '#',
    style: 'secondary',
    size: 'large',
    icon: false,
  });
  if (refCell) moveInstrumentation(refCell, no.querySelector('a'));
  buttons.append(yes, no);

  dialog.append(title, text, buttons);
  modal.append(overlay, dialog);
  block.append(modal);
  rows.forEach((row) => row.remove());
  initModals();
  return modal;
}

/**
 * Modal Sanitary Block — AEM Edge Delivery Services
 *
 * Source: structure/modal-sanitary (modal-sanitary.html, .js, .scss, ModalSanitaryModel)
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3 - UE & QA Specialist)
 *
 * Page metadata (auto-block of scripts.js, L0): show-modal-sanitary · modal-sanitary
 * (fragment path) · modal-sanitary-redirect · modal-sanitary-overlay-disabled ·
 * modal-sanitary-blur-enabled.
 *
 * DOM de entrada (matriz EDS), dos formas:
 *   a) bloque autorado (en el fragmento /fragments/…):
 *        div > div  título · div > div  texto · div > div > a  enlace del botón «No»
 *   b) auto-bloque de L0 (clave/valor, readBlockConfig):
 *        fragment | a[href] · [redirect | a[href]] · overlay-disabled | bool · blur-enabled | bool
 *
 * DOM de salida (modal-sanitary.html):
 *   div.cmp-modal-sanitary.cmp-modal[.in-xf][data-cookie-name][aria-hidden=false]
 *     div.cmp-modal__overlay[.cmp-modal--overlay-disabled][.cmp-modal--blur-enabled]
 *     div.cmp-modal-sanitary__dialog
 *       p.__dialog-title.ferrer-h4 · p.__dialog-text.ferrer-body
 *       div.__dialog-buttons > div.cmp-button--primary (button.js-modal-close)
 *                              div.cmp-button--secondary (a.cmp-button)
 *
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  const rows = [...block.children];
  const isAutoBlock = rows.length && rows[0].firstElementChild
    && rows[0].firstElementChild.textContent.trim().toLowerCase() === 'fragment';

  if (!isAutoBlock) {
    const modal = renderModal(block, rows);
    const options = pageOptions();
    applyOptions(modal, options);
    if (!block.isConnected) return; // decorated inside a fragment: the auto-block shows it
    if (options.show) activate(modal);
    else modal.classList.add('in-xf'); // the fragment page itself: XF preview
    return;
  }

  const config = readBlockConfig(block);
  rows.forEach((row) => row.remove());
  const path = new URL(config.fragment, window.location.href).pathname;
  loadFragment(path).then((fragment) => {
    const modal = fragment ? fragment.querySelector('.cmp-modal-sanitary') : null;
    if (!modal) return;
    applyOptions(modal, {
      redirect: config.redirect || '',
      overlayDisabled: String(config['overlay-disabled']) === 'true',
      blurEnabled: String(config['blur-enabled']) === 'true',
    });
    modal.classList.remove('in-xf');
    block.append(modal);
    activate(modal);
  });
}
