import { getMetadata } from '../../scripts/aem.js';
import { buildImage, buildText } from '../../scripts/ferrer-utils.js';
import { loadFragment } from '../fragment/fragment.js';

/* UE instrumentation: Pendiente (Fase 3) */

/*
 * Order of the sections of the footer fragment (default content only). An empty section
 * means "not configured" (data-sly-test of footer.html), e.g. an empty section 6 is the
 * hideLogoEuropeo option.
 */
const SECTIONS = {
  footnote: 0, // text
  links: 1, // image (logo) + up to 3 lists of links (footer-links 1, 2, 3)
  social: 2, // image + link pairs (social-links)
  legal: 3, // list of links (legal-links) + text (footer-legal-complementary)
  legalSecondary: 4, // text (footer-logo-subtext)
  europeo: 5, // image (footer-logo-europeo) + text (footer-logo-text)
  disclaimer: 6, // text
};
const MENU_CLASSES = ['ferrer--bold', 'ferrer-body-small', 'ferrer-body-small'];

/**
 * Element with classes and children.
 * @param {string} tag
 * @param {string} [className]
 * @param {...Node} children
 * @returns {HTMLElement}
 */
function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter(Boolean));
  return node;
}

/**
 * Text content of a fragment section: paragraphs/headings outside lists and images.
 * @param {Element|undefined} section
 * @returns {Element[]}
 */
function textNodes(section) {
  if (!section) return [];
  return [...section.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ol')]
    .filter((node) => !node.closest('ul') && !node.querySelector('picture, img')
      && node.textContent.trim());
}

/**
 * AEM decoration of an embedded text component: div.text.{classes} > div.cmp-text.
 * @param {Element|undefined} section
 * @param {string} classes
 * @returns {HTMLElement|null}
 */
function textComponent(section, classes) {
  const nodes = textNodes(section);
  const text = nodes.length ? buildText({ nodes }) : null;
  return text ? el('div', `text ${classes}`, text) : null;
}

/**
 * AEM decoration of an embedded image component: div.image.{classes} > div.cmp-image.
 * @param {Element|undefined} section
 * @param {string} classes
 * @returns {HTMLElement|null}
 */
function imageComponent(section, classes) {
  const img = section ? section.querySelector('img') : null;
  const image = img ? buildImage({ src: img }) : null;
  return image ? el('div', `image ${classes}`, image) : null;
}

/**
 * footer-links component: div.footer-links.{classes} > ul > li > a (authored list moved).
 * @param {HTMLUListElement|undefined} list
 * @param {string} classes
 * @returns {HTMLElement|null}
 */
function linksComponent(list, classes) {
  if (!list) return null;
  list.querySelectorAll('a[target="_blank"]').forEach((link) => {
    link.rel = 'noopener noreferrer nofollow';
  });
  return el('div', `footer-links ${classes}`, list);
}

/**
 * social-links component: each authored image is paired with the next link.
 *   div.social-links.cmp-footer__links-social > ul > li > a[title][target=_blank] > img
 * @param {Element|undefined} section
 * @returns {HTMLElement|null}
 */
function socialComponent(section) {
  if (!section) return null;
  const items = [];
  let pending = null;
  section.querySelectorAll('picture, img:not(picture img), a[href]').forEach((node) => {
    if (node.tagName === 'A') {
      if (!pending) return;
      const label = node.textContent.trim();
      const img = pending.tagName === 'IMG' ? pending : pending.querySelector('img');
      img.alt = label;
      img.loading = 'lazy';
      const link = el('a', '', pending);
      link.href = node.getAttribute('href');
      link.rel = 'nofollow noopener';
      link.target = '_blank';
      link.title = label;
      items.push(el('li', '', link));
      pending = null;
    } else {
      pending = node;
    }
  });
  return items.length ? el('div', 'social-links cmp-footer__links-social', el('ul', '', ...items)) : null;
}

/**
 * Builds .cmp-footer from the sections of the fragment (footer.html / footer-simple.html).
 * @param {Element[]} sections
 * @param {boolean} simple footer-simple variant
 * @returns {HTMLElement}
 */
function buildFooter(sections, simple) {
  const at = (name) => sections[SECTIONS[name]];
  const footer = el('div', simple ? 'cmp-footer cmp-footer--simple' : 'cmp-footer');

  const footnote = textComponent(at('footnote'), 'cmp-footer__footnote-text ferrer-body-xlarge');
  if (footnote) {
    footer.append(el('div', 'cmp-footer__footnote', el('div', 'content-container', footnote)));
  }

  const logo = imageComponent(at('links'), 'cmp-footer__links-logo');
  const legalSection = at('legal');
  const legalColumn = el(
    'div',
    simple ? 'col-12' : 'col-12 col-xl-8',
    linksComponent(legalSection && legalSection.querySelector('ul'), 'cmp-footer__links-legal-menu'),
    textComponent(legalSection, 'cmp-footer__links-legal-text-complementary ferrer-body-xsmall'),
    textComponent(at('legalSecondary'), 'cmp-footer__links-legal-text-secondary ferrer-body-xsmall'),
  );
  const legalRow = el('div', 'ferrer-row', legalColumn);
  const row = el('div', 'ferrer-row');

  if (simple) {
    row.append(el('div', 'col-12', logo));
  } else {
    const lists = at('links') ? [...at('links').querySelectorAll('ul')] : [];
    const menuRow = el('div', 'ferrer-row cmp-footer__links-menu-row');
    MENU_CLASSES.forEach((classes, index) => {
      menuRow.append(el('div', 'col-12 col-lg-4', linksComponent(lists[index], `cmp-footer__links-menu ${classes}`)));
    });

    const bCorpColumn = el('div', 'col-12 col-lg-1');
    const bCorpLogo = getMetadata('bcorp-logo');
    const hideBCorpLogo = getMetadata('footer-hide-bcorp-logo').toLowerCase() === 'true';
    if (bCorpLogo && !hideBCorpLogo) {
      const img = el('img');
      img.src = bCorpLogo;
      img.alt = 'Logo B Corp';
      img.loading = 'lazy';
      bCorpColumn.append(el('div', 'cmp-footer__links-img', img));
    }

    const europeo = at('europeo');
    const europeoLogo = imageComponent(europeo, 'cmp-footer__links-legal-text-logo');
    const europeoText = textComponent(europeo, 'cmp-footer__links-legal-text-primary ferrer-body-xsmall');
    const europeoColumn = el('div', 'col-12 col-xl-4');
    if (europeoLogo || europeoText) {
      europeoColumn.append(el('div', 'cmp-footer__links-legal-text', europeoLogo, europeoText));
    }
    legalRow.append(europeoColumn);

    row.append(
      el('div', 'col-12 col-lg-2', logo),
      el('div', 'col-12 col-lg-9', menuRow),
      bCorpColumn,
      el('div', 'col-12', socialComponent(at('social'))),
    );
  }
  row.append(el('div', 'col-12', el('div', 'cmp-footer__links-legal', legalRow)));
  footer.append(el('div', 'cmp-footer__links', el('div', 'content-container', row)));

  const disclaimer = textComponent(at('disclaimer'), 'cmp-footer__disclaimer-text ferrer--bold ferrer-body-large');
  footer.append(el('div', 'cmp-footer__disclaimer', el('div', 'content-container', disclaimer)));
  return footer;
}

/**
 * Footer Block — AEM Edge Delivery Services
 *
 * Source: structure/footer + structure/footer-simple + content/footer-links +
 *         content/social-links (footer.html, footer-simple.html, footer.scss)
 * Model: xwalk (EDS + Universal Editor) — the content is the fragment /footer
 *        (metadata `footer` overrides the path; `footer-variant: simple` = footer-simple).
 * UE instrumentation: Pendiente (Fase 3 - UE & QA Specialist)
 *
 * DOM de entrada: fragmento con 7 secciones de contenido por defecto, en este orden:
 *   1 footnote (texto) · 2 logo (imagen) + hasta 3 listas de enlaces · 3 redes sociales
 *   (pares imagen + enlace) · 4 lista de enlaces legales + texto complementario ·
 *   5 texto secundario · 6 logo europeo (imagen) + texto · 7 disclaimer (texto)
 *
 * DOM de salida: div.footer > div.cmp-footer[.cmp-footer--simple] > __footnote · __links ·
 *   __disclaimer (ver footer.html)
 *
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const simple = getMetadata('footer-variant').toLowerCase() === 'simple';

  loadFragment(footerPath).then((fragment) => {
    if (!fragment) return;
    const sections = [...fragment.querySelectorAll(':scope > .section')];
    [...block.children].forEach((row) => row.remove());
    block.append(buildFooter(sections, simple));
  });
}
