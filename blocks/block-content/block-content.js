import {
  buildTitle, buildText, buildImage, decorateAuthoredButton, wrapLooseText,
} from '../../scripts/ferrer-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/* UE instrumentation: Pendiente (Fase 3) */

const VIEWS = ['view-1', 'view-2', 'vertical'];
const DEFAULT_VIEW = 'view-1';
const POSITIONS = ['left', 'right'];
const DEFAULT_POSITION = 'left';
/** Title font of the embedded title component: Boldine (special-1) unless DM Sans is set. */
const TITLE_DM_SANS = 'title-dm-sans';

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
 * Returns the authored button link of a paragraph (<p>[<strong>|<em>]<a></p>), if any.
 * @param {Element} node
 * @returns {HTMLAnchorElement|null}
 */
function buttonLink(node) {
  if (!node || node.tagName !== 'P') return null;
  const links = node.querySelectorAll('a');
  if (links.length !== 1 || node.textContent.trim() !== links[0].textContent.trim()) return null;
  return links[0];
}

/**
 * Reads the authored rows by content: heading row → title, picture row → image, the rest
 * is the body (rich text + optional CTA as last paragraph).
 * @param {Element} block
 * @returns {{title: (Element|null), titleCell: (Element|null), textNodes: Element[],
 *   textCell: (Element|null), cta: (HTMLAnchorElement|null), picture: (Element|null)}}
 */
function readContent(block) {
  const content = {
    title: null, titleCell: null, textNodes: [], textCell: null, cta: null, picture: null,
  };
  [...block.children].forEach((row) => {
    const cell = wrapLooseText(row.firstElementChild);
    if (!cell) return;
    const children = [...cell.children];
    const picture = cell.querySelector('picture');
    if (picture && !cell.textContent.trim()) {
      content.picture = picture;
    } else if (children.length === 1 && /^H[1-6]$/.test(children[0].tagName)) {
      [content.title] = children;
      content.titleCell = cell;
    } else if (children.length) {
      const last = children[children.length - 1];
      const link = buttonLink(last);
      if (link) {
        content.cta = link;
        children.pop();
      }
      content.textNodes = children;
      content.textCell = cell;
    }
  });
  return content;
}

/**
 * The embedded AEM components (data-sly-resource with decorationTagName='div').
 * div.title[.cssClassName] > div.cmp-title > hN
 * @param {object} content
 * @param {string} font buildTitle() font ('special-1' | 'primary')
 * @param {string} [cssClassName]
 * @returns {HTMLElement|null}
 */
function titleComponent(content, font, cssClassName) {
  if (!content.title) return null;
  const wrapper = el('div', 'title');
  if (cssClassName) wrapper.classList.add(cssClassName);
  moveInstrumentation(content.titleCell, wrapper);
  wrapper.append(buildTitle({ element: content.title, font }));
  return wrapper;
}

/**
 * div.text > div.cmp-text
 * @param {object} content
 * @returns {HTMLElement|null}
 */
function textComponent(content) {
  const cmpText = content.textNodes.length ? buildText({ nodes: content.textNodes }) : null;
  if (!cmpText) return null;
  const wrapper = el('div', 'text');
  moveInstrumentation(content.textCell, cmpText);
  wrapper.append(cmpText);
  return wrapper;
}

/**
 * div.button.cmp-button--{style}.cmp-button--{size} > a.cmp-button
 * @param {object} content
 * @returns {HTMLElement|null}
 */
function buttonComponent(content) {
  if (!content.cta) return null;
  const styleWrapper = decorateAuthoredButton(content.cta);
  const wrapper = el('div', 'button');
  wrapper.classList.add(...[...styleWrapper.classList].filter((c) => c.startsWith('cmp-button--')));
  moveInstrumentation(styleWrapper, wrapper);
  wrapper.append(content.cta);
  return wrapper;
}

/**
 * div.image[.cssClassName] > div.cmp-image
 * @param {object} content
 * @param {string} cssClassName
 * @returns {HTMLElement|null}
 */
function imageComponent(content, cssClassName) {
  if (!content.picture) return null;
  const image = buildImage({ src: content.picture });
  if (!image) return null;
  const wrapper = el('div', `image ${cssClassName}`);
  wrapper.append(image);
  return wrapper;
}

/**
 * Appends the non-null nodes.
 * @param {HTMLElement} parent
 * @param {Array<HTMLElement|null>} nodes
 */
function appendAll(parent, nodes) {
  parent.append(...nodes.filter(Boolean));
}

/**
 * Block content — title, text, button and image in three layouts.
 *
 * DOM de entrada (matriz EDS):
 *   block.block-content[.view-1|.view-2|.vertical][.left|.right]
 *                      [.block-content--bottom][.template-theme--*][.title-dm-sans]
 *     ├── div > div → title (<hN>; graffiti `[[…]]`, see decorateGraffiti)
 *     ├── div > div → text (rich text) + cta (<p><strong|em><a></p>, último párrafo)
 *     └── div > div → image (<picture>, solo view-2)
 *
 * @param {Element} block
 */
export default function decorate(block) {
  const view = VIEWS.find((v) => block.classList.contains(v)) || DEFAULT_VIEW;
  const position = POSITIONS.find((p) => block.classList.contains(p)) || DEFAULT_POSITION;
  const font = block.classList.contains(TITLE_DM_SANS) ? 'primary' : 'special-1';
  const content = readContent(block);

  const component = el('div', 'cmp-block-content');

  if (view === 'vertical') {
    const vertical = el('div', 'cmp-block-content__vertical');
    appendAll(vertical, [
      titleComponent(content, font), textComponent(content), buttonComponent(content),
    ]);
    component.append(vertical);
  } else {
    const layout = el('div', `cmp-block-content__${view} cmp-block-content--${position} ferrer-row`);
    const first = el('div', 'col-12 col-xl-6');
    const second = el('div', `col-12 col-xl-6 cmp-block-content__${view}-text`);
    if (view === 'view-1') {
      appendAll(first, [titleComponent(content, font, 'block-content-title')]);
      appendAll(second, [textComponent(content), buttonComponent(content)]);
    } else {
      appendAll(first, [imageComponent(content, 'cmp-block-content__view-2-image')]);
      appendAll(second, [
        titleComponent(content, font), textComponent(content), buttonComponent(content),
      ]);
    }
    layout.append(first, second);
    component.append(layout);
  }

  block.append(component);
  [...block.children].filter((child) => child !== component).forEach((child) => child.remove());
}
