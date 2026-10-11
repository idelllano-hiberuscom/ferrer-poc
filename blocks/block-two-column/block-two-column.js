import {
  buildTitle, buildText, buildImage, decorateAuthoredButton,
} from '../../scripts/ferrer-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/* UE instrumentation: Pendiente (Fase 3) */

const GRID_COLUMN = 'aem-GridColumn aem-GridColumn--default--12';

/**
 * Creates an element.
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Returns the authored link when the node is a button (default content button).
 * @param {Element} node
 * @returns {HTMLAnchorElement|null}
 */
function buttonLink(node) {
  if (node.tagName !== 'P') return null;
  const links = node.querySelectorAll('a');
  if (links.length !== 1 || node.textContent.trim() !== links[0].textContent.trim()) return null;
  const isButton = node.classList.contains('button-container')
    || links[0].classList.contains('button')
    || links[0].closest('strong, em');
  return isButton ? links[0] : null;
}

/**
 * Converts the default content of a column cell into the AEM components of the original
 * container (container.html): div.title / div.text / div.image / div.button, each with the
 * aem-GridColumn classes of the responsive grid.
 * @param {Element} cell
 * @returns {{components: HTMLElement[], hasText: boolean}}
 */
function buildComponents(cell) {
  const components = [];
  let textNodes = [];
  let hasText = false;

  const flushText = () => {
    if (!textNodes.length) return;
    const cmpText = buildText({ nodes: textNodes });
    textNodes = [];
    if (!cmpText) return;
    const wrapper = el('div', `text ${GRID_COLUMN}`);
    wrapper.append(cmpText);
    components.push(wrapper);
    hasText = true;
  };

  [...cell.children].forEach((node) => {
    const picture = node.tagName === 'PICTURE' ? node : node.querySelector(':scope > picture');
    const onlyPicture = picture && node.textContent.trim() === '';
    const link = buttonLink(node);

    if (/^H[1-6]$/.test(node.tagName)) {
      flushText();
      const wrapper = el('div', `title ${GRID_COLUMN}`);
      moveInstrumentation(node, wrapper);
      wrapper.append(buildTitle({ element: node }));
      components.push(wrapper);
    } else if (onlyPicture) {
      flushText();
      const wrapper = el('div', `image ${GRID_COLUMN}`);
      if (node !== picture) moveInstrumentation(node, wrapper);
      const image = buildImage({ src: picture });
      if (image) wrapper.append(image);
      components.push(wrapper);
    } else if (link) {
      flushText();
      const styleWrapper = decorateAuthoredButton(link);
      const wrapper = el('div', `button ${GRID_COLUMN}`);
      wrapper.classList.add(...[...styleWrapper.classList].filter((c) => c.startsWith('cmp-button--')));
      moveInstrumentation(styleWrapper, wrapper);
      wrapper.append(link);
      components.push(wrapper);
    } else {
      textNodes.push(node);
    }
  });
  flushText();
  return { components, hasText };
}

/**
 * Block two column — columns xwalk 2x1, each column is the original "container".
 *
 * DOM de entrada (matriz EDS):
 *   block.block-two-column
 *     └── div (fila)
 *           ├── div (left)  → contenido por defecto: título, texto, imagen, botón
 *           └── div (right) → contenido por defecto: título, texto, imagen, botón
 *
 * @param {Element} block
 */
export default function decorate(block) {
  const row = block.firstElementChild;
  const cells = row ? [...row.children].slice(0, 2) : [];
  const columns = cells.map((cell) => ({ cell, ...buildComponents(cell) }));

  // BlockTwoColumnModel#hasTwoText: both columns contain a text component
  const hasTwoText = columns.length === 2 && columns.every((column) => column.hasText);

  const component = el('div', 'cmp-block-two-column ferrer-row');
  ['left', 'right'].forEach((side, index) => {
    const column = el('div', `cmp-block-two-column__${side}`);
    if (hasTwoText) column.classList.add('cmp-block-two-column__two-text');
    const container = el('div', 'container');
    const grid = el('div', 'aem-Grid aem-Grid--12 aem-Grid--default--12');
    if (columns[index]) {
      moveInstrumentation(columns[index].cell, grid);
      grid.append(...columns[index].components);
    }
    container.append(grid);
    column.append(container);
    component.append(column);
  });

  block.append(component);
  [...block.children].filter((child) => child !== component).forEach((child) => child.remove());
}
