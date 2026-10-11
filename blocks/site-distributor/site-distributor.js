/**
 * Site Distributor Block — AEM Edge Delivery Services
 *
 * Origen: core-ferrer content/site-distributor (site-distributor.html, site-distributor.js,
 *         SiteDistributorModel/LanguageItem.java) + site/select-dropdown (select-dropdown.js).
 *         El árbol país → idiomas que el modelo Java leía de las páginas hijas de rootPath
 *         se autora aquí como items (país, idioma, URL) en el orden deseado.
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3)
 *
 * DOM de entrada (matriz EDS):
 *   div.site-distributor[.show-on-load]
 *     div > div > richtext                   (propiedad text)
 *     div > div > label                      (propiedad label = texto del botón)
 *     div > div > h4 + richtext              (grupo modal_: heading/headingType + body)
 *     div (fila = site-distributor-language)
 *       div > country
 *       div > language
 *       div > [p >] a[href]                  (url del sitio)
 *
 * DOM de salida (1:1 con el HTL):
 *   div.cmp-site-distributor[data-show-on-load]
 *     div.cmp-site-distributor__content-text
 *       div.cmp-text · div.cmp-button--primary.cmp-button--large.cmp-site-distributor__button
 *     div.cmp-modal.cmp-modal--site-distributor#site-distributor-N-modal (sin botón de cerrar)
 *       … div.cmp-site-distributor__text.cmp-modal__text
 *           h4 · div.__modal-text · div.__form (2 × .select-dropdown) · div.__actions
 */
import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildText, unwrapRichtext } from '../../scripts/ferrer-utils.js';
import { buildModal, initModals } from '../../scripts/ferrer-modal.js';
import { t } from '../../scripts/ferrer-i18n.js';

/* UE instrumentation: Pendiente (Fase 3) */

let instanceCount = 0;
let documentListenerBound = false;
const openDropdowns = new Set();

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
 * Port of select-dropdown.js for one `.select-dropdown`. Keyboard navigation only moves
 * through visible options (the original also stepped on the hidden languages of other
 * countries).
 * @param {HTMLElement} dropdown
 */
function initSelectDropdown(dropdown) {
  const container = dropdown.querySelector('.select-dropdown__container');
  const trigger = container.querySelector('button');
  const listbox = container.querySelector('.select-dropdown__list');
  const hiddenInput = container.querySelector('input[type="hidden"]');
  const valueSpan = container.querySelector('.select-dropdown__trigger-value');
  const allItems = () => [...listbox.querySelectorAll('.select-dropdown__option')];
  const visibleItems = () => allItems().filter((item) => !item.classList.contains('hide'));

  allItems().forEach((item, index) => {
    if (!item.id) item.id = `${trigger.id || 'dropdown'}-option-${index}`;
  });
  if (!listbox.id) listbox.id = `${trigger.id || 'dropdown'}-listbox`;
  trigger.setAttribute('aria-controls', listbox.id);

  let active = null;

  const close = () => {
    container.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-expanded', 'false');
    listbox.classList.remove('select-dropdown__list--open');
    trigger.removeAttribute('aria-activedescendant');
    openDropdowns.delete(close);
  };

  const setActiveDescendant = (item) => {
    allItems().forEach((i) => i.classList.remove('select-dropdown__option--active'));
    item.classList.add('select-dropdown__option--active');
    trigger.setAttribute('aria-activedescendant', item.id);
    item.scrollIntoView({ block: 'nearest' });
    active = item;
  };

  const open = () => {
    container.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-expanded', 'true');
    listbox.classList.add('select-dropdown__list--open');
    if (active && !active.classList.contains('hide')) setActiveDescendant(active);
    openDropdowns.add(close);
    openDropdowns.forEach((closeOther) => {
      if (closeOther !== close) closeOther();
    });
  };

  const isOpen = () => trigger.getAttribute('aria-expanded') === 'true';

  const selectOption = (item) => {
    allItems().forEach((i) => i.setAttribute('aria-selected', 'false'));
    item.setAttribute('aria-selected', 'true');
    valueSpan.textContent = item.textContent.trim();
    hiddenInput.value = item.dataset.value;
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    active = item;
    trigger.classList.add('select-dropdown__trigger--has-value');
    close();
    trigger.focus();
  };

  trigger.addEventListener('click', () => (isOpen() ? close() : open()));
  listbox.addEventListener('click', (event) => {
    const option = event.target.closest('.select-dropdown__option');
    if (option) selectOption(option);
  });

  trigger.addEventListener('keydown', (event) => {
    const items = visibleItems();
    const index = items.indexOf(active);
    const last = items.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen()) open();
        if (items.length) setActiveDescendant(items[index < last ? index + 1 : 0]);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen()) open();
        if (items.length) setActiveDescendant(items[index > 0 ? index - 1 : last]);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen() && index >= 0) selectOption(active);
        else open();
        break;
      case 'Escape':
        if (isOpen()) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
      case 'Home':
        event.preventDefault();
        if (isOpen() && items.length) setActiveDescendant(items[0]);
        break;
      case 'End':
        event.preventDefault();
        if (isOpen() && items.length) setActiveDescendant(items[last]);
        break;
      case 'Tab':
        close();
        break;
      default:
    }
  });

  dropdown.closeDropdown = close;
  if (!documentListenerBound) {
    documentListenerBound = true;
    document.addEventListener('click', (event) => {
      document.querySelectorAll('.site-distributor .select-dropdown').forEach((d) => {
        if (d.closeDropdown && !d.contains(event.target)) d.closeDropdown();
      });
    });
  }
}

/**
 * Builds one `.select-dropdown` (country or language) of the HTL.
 * @param {object} options
 * @returns {{dropdown: HTMLElement, list: HTMLUListElement}}
 */
function buildDropdown({
  modalId, type, jsClass, inputName, listType,
}) {
  const dropdown = el('div', `select-dropdown cmp-site-distributor__field ${jsClass}`);
  const container = el('div', 'cmp-site-distributor__dropdown-container select-dropdown__container', {
    role: 'combobox', 'aria-expanded': 'false', 'aria-haspopup': 'listbox',
  });
  const label = el('label', 'cmp-site-distributor__label ferrer--bold', {
    id: `${modalId}-${type}-label`, for: `${modalId}-${type}`,
  });
  label.textContent = t(`site-distributor.modal.${type}-label`);
  const trigger = el('button', 'select-dropdown__trigger', {
    type: 'button',
    id: `${modalId}-${type}`,
    'aria-labelledby': `${modalId}-${type}-label`,
    'aria-expanded': 'false',
    'aria-haspopup': 'listbox',
    'aria-invalid': 'false',
  });
  const value = el('span', 'select-dropdown__trigger-value');
  value.textContent = t(`site-distributor.modal.${type}-placeholder`);
  const icon = el('i', 'select-dropdown__trigger-icon icon-chevron-down', { 'aria-hidden': 'true' });
  trigger.append(value, icon);
  const list = el('ul', 'select-dropdown__list scroll-bar', {
    role: 'listbox', 'data-list-type': listType,
  });
  const input = el('input', '', { type: 'hidden', name: inputName, value: '' });
  input.required = true;
  container.append(label, trigger, list, input);
  dropdown.append(container);
  return { dropdown, list };
}

/**
 * Builds the country / language form from the authored items.
 * @param {string} modalId
 * @param {Element[]} itemRows
 * @returns {HTMLElement|null}
 */
function buildForm(modalId, itemRows) {
  const countries = [];
  const languages = [];
  itemRows.forEach((row) => {
    const [countryCell, languageCell, urlCell] = row.children;
    const country = countryCell ? countryCell.textContent.trim() : '';
    const link = urlCell && urlCell.querySelector('a');
    const url = link ? link.getAttribute('href') : (urlCell && urlCell.textContent.trim()) || '';
    if (!country) return;
    let countryIndex = countries.indexOf(country);
    if (countryIndex < 0) {
      countries.push(country);
      countryIndex = countries.length - 1;
    }
    languages.push({
      row, country, countryIndex, title: languageCell ? languageCell.textContent.trim() : '', url,
    });
  });
  if (!countries.length) return null;

  const form = el('div', 'cmp-site-distributor__form');
  const country = buildDropdown({
    modalId, type: 'country', jsClass: 'js-site-distributor-country', inputName: 'country', listType: 'countries',
  });
  countries.forEach((name, index) => {
    const option = el('li', 'ferrer-body-small select-dropdown__option', {
      role: 'option',
      tabindex: '-1',
      'aria-selected': 'false',
      'data-value': String(index),
      'data-country-index': String(index),
      'data-country-name': name,
    });
    option.textContent = name;
    country.list.append(option);
  });

  const language = buildDropdown({
    modalId, type: 'language', jsClass: 'js-site-distributor-language', inputName: 'language', listType: 'languages',
  });
  languages.forEach((item) => {
    const option = el('li', 'ferrer-body-small select-dropdown__option hide', {
      role: 'option',
      tabindex: '-1',
      'aria-selected': 'false',
      'data-value': item.url,
      'data-country-index': String(item.countryIndex),
      'data-country-name': item.country,
      'data-language-title': item.title,
      'data-url': item.url,
    });
    moveInstrumentation(item.row, option);
    option.textContent = item.title;
    language.list.append(option);
  });

  const disclaimer = el('p', 'cmp-site-distributor__disclaimer ferrer-body-small ferrer--bold');
  const required = el('span', '', { 'aria-hidden': 'true' });
  const asterisk = el('span', 'cmp-site-distributor__required');
  asterisk.textContent = '*';
  required.append('(', asterisk, ')');
  disclaimer.append(
    `${t('site-distributor.modal.required-disclaimer')} `,
    required,
    ` ${t('site-distributor.modal.required-disclaimer-required')}`,
  );

  form.append(country.dropdown, language.dropdown, disclaimer);
  return form;
}

/**
 * Builds the continue / cancel actions.
 * @returns {HTMLDivElement}
 */
function buildActions() {
  const actions = el('div', 'cmp-site-distributor__actions');
  const continueWrap = el('div', 'cmp-button--primary cmp-button--small');
  const continueLink = el('a', 'button cmp-button cmp-site-distributor__continue js-site-distributor-continue', {
    'aria-disabled': 'true',
  });
  const continueText = el('span', 'cmp-button__text');
  continueText.textContent = t('site-distributor.modal.continue');
  continueLink.append(continueText);
  continueWrap.append(continueLink);

  const cancelWrap = el('div', 'cmp-button--ghost cmp-button--large');
  const cancel = el('button', 'cmp-button cmp-site-distributor__cancel js-modal-close', { type: 'button' });
  const cancelText = el('span', 'cmp-button__text');
  cancelText.textContent = t('site-distributor.modal.cancel');
  cancel.append(cancelText);
  cancelWrap.append(cancel);

  actions.append(continueWrap, cancelWrap);
  return actions;
}

/**
 * Port of site-distributor.js: country filters languages, continue gets the language URL,
 * everything resets when the modal is hidden.
 * @param {HTMLElement} distributor
 */
function bindBehaviour(distributor) {
  const continueBtn = distributor.querySelector('.js-site-distributor-continue');
  const countryInput = distributor.querySelector('.js-site-distributor-country input[type="hidden"]');
  const languageInput = distributor.querySelector('.js-site-distributor-language input[type="hidden"]');
  if (!continueBtn || !countryInput || !languageInput) return;

  const modal = distributor.querySelector('.cmp-modal');
  const countryList = distributor.querySelector('.js-site-distributor-country .select-dropdown__list');
  const countryValue = distributor.querySelector('.js-site-distributor-country .select-dropdown__trigger-value');
  const countryTrigger = distributor.querySelector('.js-site-distributor-country .select-dropdown__trigger');
  const countryPlaceholder = countryValue.textContent.trim();
  const languageList = distributor.querySelector('.js-site-distributor-language .select-dropdown__list');
  const languageValue = distributor.querySelector('.js-site-distributor-language .select-dropdown__trigger-value');
  const languageTrigger = distributor.querySelector('.js-site-distributor-language .select-dropdown__trigger');
  const languagePlaceholder = languageValue.textContent.trim();
  const languageOptions = () => languageList.querySelectorAll('.select-dropdown__option');

  const updateState = () => {
    const url = languageInput.value.trim();
    if (countryInput.value.trim() !== '' && url !== '') {
      continueBtn.setAttribute('href', url);
      continueBtn.removeAttribute('aria-disabled');
    } else {
      continueBtn.removeAttribute('href');
      continueBtn.setAttribute('aria-disabled', 'true');
    }
  };

  const resetLanguage = () => {
    languageInput.value = '';
    languageValue.textContent = languagePlaceholder;
    languageTrigger.classList.remove('select-dropdown__trigger--has-value');
    languageOptions().forEach((option) => option.setAttribute('aria-selected', 'false'));
  };

  countryInput.addEventListener('change', () => {
    const selected = [...countryList.querySelectorAll('.select-dropdown__option')]
      .find((option) => option.dataset.value === countryInput.value);
    const countryName = selected ? selected.dataset.countryName : null;
    if (countryName) {
      languageOptions().forEach((option) => {
        option.classList.toggle('hide', option.dataset.countryName !== countryName);
      });
    }
    resetLanguage();
    updateState();
  });
  languageInput.addEventListener('change', updateState);

  const resetAll = () => {
    countryInput.value = '';
    countryValue.textContent = countryPlaceholder;
    countryTrigger.classList.remove('select-dropdown__trigger--has-value');
    countryList.querySelectorAll('.select-dropdown__option')
      .forEach((option) => option.setAttribute('aria-selected', 'false'));
    resetLanguage();
    languageOptions().forEach((option) => option.classList.add('hide'));
    updateState();
  };

  if (modal) {
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'aria-hidden' && modal.getAttribute('aria-hidden') === 'true') {
          resetAll();
        }
      });
    }).observe(modal, { attributes: true });
  }
  updateState();
}

/**
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  instanceCount += 1;
  const modalId = `site-distributor-${instanceCount}-modal`;
  const titleId = `${modalId}-title`;
  const showOnLoad = block.classList.contains('show-on-load');

  const rows = [...block.children];
  const propertyRows = rows.filter((row) => row.children.length === 1);
  const itemRows = rows.filter((row) => row.children.length > 1);
  const [textRow, labelRow, modalRow] = propertyRows;
  const label = labelRow ? labelRow.textContent.trim() : '';

  if (!label) {
    // data-sly-test="${model.buttonText}": nothing is rendered without the button text
    rows.forEach((row) => row.remove());
    return;
  }

  const distributor = el('div', 'cmp-site-distributor', { 'data-show-on-load': String(showOnLoad) });

  // content text + trigger button
  const contentText = el('div', 'cmp-site-distributor__content-text');
  const text = textRow ? buildText({ nodes: textRow.firstElementChild }) : null;
  if (text) contentText.append(text);
  const buttonWrap = el('div', 'cmp-button--primary cmp-button--large cmp-site-distributor__button');
  const button = el('button', 'button cmp-button js-open-modal', {
    type: 'button',
    'data-modal-id': modalId,
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
  });
  const buttonText = el('span', 'cmp-button__text');
  buttonText.textContent = label;
  button.append(buttonText);
  buttonWrap.append(button);
  contentText.append(buttonWrap);

  // modal body
  const modalText = el('div', 'cmp-site-distributor__text cmp-modal__text');
  const modalCell = modalRow ? modalRow.firstElementChild : null;
  const heading = modalCell && modalCell.querySelector('h1, h2, h3, h4, h5, h6');
  let hasTitle = false;
  if (heading && heading.textContent.trim()) {
    const h4 = el('h4', 'ferrer-h4', { id: titleId });
    moveInstrumentation(heading, h4);
    h4.append(...heading.childNodes);
    heading.remove();
    modalText.append(h4);
    hasTitle = true;
  }
  if (modalCell && modalCell.textContent.trim()) {
    const body = el('div', 'cmp-site-distributor__modal-text');
    // Universal Editor: without the heading, the modal_body group is the whole cell
    moveInstrumentation(unwrapRichtext(modalCell), body);
    body.append(...modalCell.childNodes);
    modalText.append(body);
  }
  const form = buildForm(modalId, itemRows);
  if (form) modalText.append(form);
  modalText.append(buildActions());

  const modal = buildModal({
    id: modalId,
    content: modalText,
    modalClass: 'cmp-modal--site-distributor',
    labelledBy: hasTitle ? titleId : undefined,
  });
  if (!hasTitle) modal.removeAttribute('aria-labelledby');
  // the close button is commented out in the HTL
  modal.querySelector('.cmp-modal__close').remove();
  if (showOnLoad) modal.setAttribute('aria-hidden', 'false');

  distributor.append(contentText, modal);
  rows.forEach((row) => row.remove());
  block.append(distributor);

  distributor.querySelectorAll('.select-dropdown').forEach(initSelectDropdown);
  bindBehaviour(distributor);
  initModals(block);
}
