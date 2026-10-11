import { getMetadata } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  buildPicture, buildText, buildTitle, decorateAuthoredButton,
} from '../../scripts/ferrer-utils.js';

/* UE instrumentation: Pendiente (Fase 3) */

const VIEWS = {
  'view-button': 'button',
  'view-text-box': 'text-box',
  'view-text-center': 'text-center',
};

/**
 * Creates an element with the given classes.
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
 * Link of an authored button paragraph (strong/em link, or already a Ferrer button).
 * @param {Element} node
 * @returns {HTMLAnchorElement|null}
 */
function buttonLink(node) {
  const decorated = node.querySelector('a.cmp-button');
  if (decorated) return decorated;
  if (node.tagName !== 'P') return null;
  const link = node.querySelector('a');
  if (!link || !(link.closest('strong') || link.closest('em'))) return null;
  return node.textContent.trim() === link.textContent.trim() ? link : null;
}

/**
 * Resolves the view (TeaserModel.view) from the block options. Default: button
 * (view="button" in the component template).
 * @param {Element} block
 * @returns {string}
 */
function getView(block) {
  const option = Object.keys(VIEWS).find((name) => block.classList.contains(name));
  return option ? VIEWS[option] : 'button';
}

/**
 * Teaser Block — AEM Edge Delivery Services
 *
 * Source: content/teaser (teaser.html, teaser.scss, TeaserModel)
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3 - UE & QA Specialist)
 *
 * DOM de entrada (matriz EDS):
 *   div.teaser[.view-button|.view-text-box|.view-text-center][.bcorp]
 *             [.cmp-teaser--black-white][.template-theme--*]
 *     div > div   picture (imagen + alt)
 *     div > div   rich text: [hN título (vista button)] + texto + [p > strong|em > a botón]
 *
 * DOM de salida (teaser.html):
 *   div.teaser > div.cmp-teaser.cmp-teaser--{view}[.content-container si text-box]
 *     picture > img.cmp-teaser__img
 *     div.cmp-teaser__content[.content-container si no es text-box]
 *       div.cmp-teaser__content-text
 *         [div.title > div.cmp-title > hN]
 *         div.text.ferrer-body-large > div.cmp-text
 *         [div > img B Corp]
 *       [div.button]
 *
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  const rows = [...block.children];
  const [imageCell, textCell] = rows.map((row) => row.firstElementChild);
  const view = getView(block);
  const isButtonView = view === 'button';

  const teaser = el('div', `cmp-teaser cmp-teaser--${view}`);
  if (view === 'text-box') teaser.classList.add('content-container');

  // the LCP when the teaser opens the page: first section -> eager
  const main = block.closest('main');
  const eager = !!main && block.closest('.section') === main.querySelector('.section');
  const picture = buildPicture({
    src: imageCell ? imageCell.querySelector('img') : null,
    eager,
    classImg: 'cmp-teaser__img',
  });
  if (picture) teaser.append(picture);

  const content = el('div', 'cmp-teaser__content');
  if (view !== 'text-box') content.classList.add('content-container');
  const contentText = el('div', 'cmp-teaser__content-text');
  content.append(contentText);

  const nodes = textCell ? [...textCell.children] : [];
  if (textCell) moveInstrumentation(textCell, contentText);
  const textNodes = [];
  const buttons = [];
  nodes.forEach((node) => {
    if (isButtonView && buttonLink(node)) buttons.push(node);
    else textNodes.push(node);
  });

  if (isButtonView) {
    const heading = textNodes.find((node) => /^H[1-6]$/.test(node.tagName));
    if (heading) {
      textNodes.splice(textNodes.indexOf(heading), 1);
      const title = el('div', 'title');
      title.append(buildTitle({ element: heading }));
      contentText.append(title);
    }
  }

  const text = textNodes.length ? buildText({ nodes: textNodes }) : null;
  if (text) {
    const textWrapper = el('div', 'text ferrer-body-large');
    textWrapper.append(text);
    contentText.append(textWrapper);
  }

  const bCorpLogo = getMetadata('bcorp-logo');
  if (isButtonView && block.classList.contains('bcorp') && bCorpLogo) {
    const logo = document.createElement('img');
    logo.src = bCorpLogo;
    logo.alt = 'Certified Logo';
    const logoWrapper = el('div');
    logoWrapper.append(logo);
    contentText.append(logoWrapper);
  }

  buttons.forEach((node) => {
    const link = buttonLink(node);
    const styled = link.classList.contains('cmp-button') && link.closest('[class*="cmp-button--"]');
    const buttonWrapper = styled || decorateAuthoredButton(link);
    if (buttonWrapper) {
      const holder = el('div', 'button');
      holder.append(buttonWrapper);
      content.append(holder);
    }
  });

  teaser.append(content);
  block.append(teaser);
  rows.forEach((row) => row.remove());
}
