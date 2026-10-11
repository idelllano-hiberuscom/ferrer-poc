/**
 * Ferrer modal — port of _shared/templates/modal/modal.html + components/modal/modal.js.
 * The modal body was an Experience Fragment (ModalHelper); here it is an EDS fragment
 * (/modals/… or /fragments/…) loaded with blocks/fragment/fragment.js#loadFragment the
 * first time the modal opens.
 *
 * Usage from a block:
 *   const modal = buildModal({ id, path: link.href, overlayDisabled, blurEnabled });
 *   block.append(modal);
 *   trigger.classList.add('js-open-modal'); trigger.dataset.modalId = id;
 *   initModals(block);
 */
import { loadFragment } from '../blocks/fragment/fragment.js';
import { t } from './ferrer-i18n.js';

const OPEN_SELECTOR = '.js-open-modal[data-modal-id]';
const boundRoots = new WeakSet();
const lastTrigger = new WeakMap();
let globalListeners = false;

/**
 * Converts an AEM/EDS link into a fragment path loadable by loadFragment().
 * @param {string} href
 * @returns {string}
 */
function toFragmentPath(href) {
  if (!href) return '';
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return '';
    return url.pathname.replace(/(\.plain)?\.html$/, '');
  } catch {
    return '';
  }
}

/**
 * Loads the fragment of a modal once and moves its sections into .cmp-modal__content.
 * @param {HTMLElement} modal
 * @returns {Promise<void>}
 */
async function ensureContent(modal) {
  const path = modal.dataset.modalPath;
  if (!path || modal.dataset.modalStatus) return;
  modal.dataset.modalStatus = 'loading';
  const content = modal.querySelector('.cmp-modal__content');
  try {
    const fragment = await loadFragment(path);
    if (fragment && content) content.append(...fragment.childNodes);
    modal.dataset.modalStatus = 'loaded';
  } catch (error) {
    modal.dataset.modalStatus = 'error';
    // eslint-disable-next-line no-console
    console.error(`ferrer-modal: unable to load ${path}`, error);
  }
}

/** Toggles body.scroll-blocked while any modal is visible (modal.js#updateBodyScrollLock). */
function updateBodyScrollLock() {
  const visible = document.querySelector('.cmp-modal[aria-hidden="false"]');
  document.body.classList.toggle('scroll-blocked', !!visible);
}

/**
 * Opens a modal (by element or id). Loads its fragment on first open.
 * @param {HTMLElement|string} modalOrId
 * @param {HTMLElement} [trigger] element to return the focus to on close
 * @returns {Promise<void>}
 */
export async function openModal(modalOrId, trigger) {
  const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
  if (!modal) return;
  // eslint-disable-next-line no-use-before-define
  bindGlobalListeners();
  if (trigger) {
    lastTrigger.set(modal, trigger);
    trigger.setAttribute('aria-expanded', 'true');
  }
  modal.setAttribute('aria-hidden', 'false');
  updateBodyScrollLock();
  modal.querySelector('.cmp-modal__close')?.focus();
  await ensureContent(modal);
}

/**
 * Closes a modal (by element or id) and returns the focus to its trigger.
 * @param {HTMLElement|string} modalOrId
 */
export function closeModal(modalOrId) {
  const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
  if (!modal || modal.getAttribute('aria-hidden') === 'true') return;
  modal.setAttribute('aria-hidden', 'true');
  updateBodyScrollLock();
  const trigger = lastTrigger.get(modal);
  if (trigger) {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  }
}

/**
 * Builds the modal markup of modal.html:
 *   <div class="cmp-modal {modalClass}" id aria-modal="true" aria-hidden="true"
 *        aria-labelledby="{id}-title" role="dialog">
 *     <div class="cmp-modal__overlay {overlay classes} js-modal-close"></div>
 *     <div class="cmp-modal__container">
 *       <button class="cmp-modal__close js-modal-close" aria-label="…"><i class="icon-close"></i>
 *       <div class="cmp-modal__content container--no-padding scroll-bar">…</div>
 *     </div>
 *   </div>
 *
 * @param {object} options
 * @param {string} options.id modal id; triggers reference it with data-modal-id
 * @param {string} [options.path] fragment href/path, loaded lazily on first open
 * @param {Element|Node[]} [options.content] inline content instead of a fragment (moved in)
 * @param {boolean} [options.overlayDisabled=false] cmp-modal--overlay-disabled
 * @param {boolean} [options.blurEnabled=false] cmp-modal--blur-enabled
 * @param {string} [options.modalClass] extra classes for .cmp-modal
 * @param {string} [options.overlayClass] extra classes for .cmp-modal__overlay
 * @param {string} [options.labelledBy] id of the element naming the dialog (default {id}-title)
 * @param {boolean} [options.preload=false] load the fragment right away
 * @returns {HTMLDivElement}
 */
export function buildModal({
  id,
  path,
  content,
  overlayDisabled = false,
  blurEnabled = false,
  modalClass = '',
  overlayClass = '',
  labelledBy,
  preload = false,
} = {}) {
  const modal = document.createElement('div');
  modal.className = `cmp-modal ${modalClass}`.trim();
  if (id) modal.id = id;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-hidden', 'true');
  if (labelledBy || id) modal.setAttribute('aria-labelledby', labelledBy || `${id}-title`);

  const overlay = document.createElement('div');
  overlay.className = `cmp-modal__overlay ${overlayClass} js-modal-close`.replace(/\s+/g, ' ').trim();
  if (overlayDisabled) overlay.classList.add('cmp-modal--overlay-disabled');
  if (blurEnabled) overlay.classList.add('cmp-modal--blur-enabled');

  const container = document.createElement('div');
  container.className = 'cmp-modal__container';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cmp-modal__close js-modal-close';
  close.setAttribute('aria-label', t('common.accessibility.close-modal'));
  const icon = document.createElement('i');
  icon.className = 'icon-close';
  icon.setAttribute('aria-hidden', 'true');
  close.append(icon);

  const body = document.createElement('div');
  body.className = 'cmp-modal__content container--no-padding scroll-bar';
  if (content) {
    if (content instanceof Element) body.append(content);
    else body.append(...content);
  }

  container.append(close, body);
  modal.append(overlay, container);

  const fragmentPath = toFragmentPath(path);
  if (fragmentPath) {
    modal.dataset.modalPath = fragmentPath;
    if (preload) ensureContent(modal);
  }
  return modal;
}

/**
 * Global listeners (once): close buttons/overlay of any modal and Escape key.
 */
function bindGlobalListeners() {
  if (globalListeners) return;
  globalListeners = true;
  document.addEventListener('click', (event) => {
    const closer = event.target.closest('.cmp-modal .js-modal-close');
    if (closer) closeModal(closer.closest('.cmp-modal'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.cmp-modal[aria-hidden="false"]').forEach((modal) => {
      closeModal(modal);
    });
  });
}

/**
 * Port of modal.js: wires every `.js-open-modal[data-modal-id]` inside `root` (event
 * delegation, so triggers added later also work) plus the global close/Escape handlers.
 * Non-button triggers (div tabindex="0") also open with Enter / Space.
 * Safe to call several times on the same root.
 * @param {Element|Document} [root=document]
 */
export function initModals(root = document) {
  bindGlobalListeners();
  if (!root || boundRoots.has(root)) return;
  boundRoots.add(root);

  const open = (event) => {
    const trigger = event.target.closest(OPEN_SELECTOR);
    if (!trigger || !root.contains(trigger)) return;
    event.preventDefault();
    openModal(trigger.dataset.modalId, trigger);
  };
  root.addEventListener('click', open);
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const trigger = event.target.closest(OPEN_SELECTOR);
    if (!trigger || ['A', 'BUTTON'].includes(trigger.tagName)) return;
    open(event);
  });
}
