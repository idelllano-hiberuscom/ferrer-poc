import { getMetadata } from '../../scripts/aem.js';
import { t } from '../../scripts/ferrer-i18n.js';

/* UE instrumentation: Pendiente (Fase 3) */

/*
 * Breadcrumb Block — AEM Edge Delivery Services
 * Port of content/breadcrumb (Core Breadcrumb v2 proxy + BreadcrumbModel JSON-LD).
 * Model: xwalk (EDS + Universal Editor)
 *
 * The page tree of AEM does not exist in EDS: the trail is built from the URL and the
 * titles of /query-index.json (column `title`, optional `hide-in-nav`).
 * Core startLevel=2 -> the trail starts at the language root (/es, /en, /ca) or at "/".
 */

const LANGUAGE_SEGMENT = /^[a-z]{2}(-[a-z]{2})?$/i;
let indexPromise;

/**
 * Fetches query-index.json once and indexes it by path (without trailing slash).
 * @returns {Promise<Map<string, object>|null>} null when the index is not available
 */
function fetchIndex() {
  if (!indexPromise) {
    indexPromise = fetch('/query-index.json')
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((json) => {
        if (!json || !Array.isArray(json.data)) return null;
        return new Map(json.data.map((row) => [row.path.replace(/(.)\/$/, '$1'), row]));
      })
      .catch(() => null);
  }
  return indexPromise;
}

/**
 * Ancestor paths of the current page, from the root of the trail to the page itself.
 * @param {string} pathname
 * @returns {string[]}
 */
function getTrailPaths(pathname) {
  const segments = pathname.replace(/(\.plain)?\.html$/, '').split('/').filter(Boolean);
  const paths = segments.length && LANGUAGE_SEGMENT.test(segments[0]) ? [] : ['/'];
  segments.forEach((segment, index) => paths.push(`/${segments.slice(0, index + 1).join('/')}`));
  return paths;
}

/**
 * Readable fallback title of a path segment (used until/unless the index answers).
 * @param {string} path
 * @returns {string}
 */
function titleFromPath(path) {
  const segment = path.split('/').filter(Boolean).pop();
  if (!segment) return 'Home';
  return decodeURIComponent(segment).replace(/[-_]+/g, ' ');
}

/**
 * Builds the trail items (Core NavigationItem equivalent).
 * @param {Map<string, object>|null} index query-index rows by path
 * @returns {{path: string, title: string, hidden: boolean, active: boolean}[]}
 */
function getItems(index) {
  const paths = getTrailPaths(window.location.pathname);
  const currentPath = paths[paths.length - 1];
  return paths
    .map((path) => {
      const active = path === currentPath;
      const row = index ? index.get(path) : null;
      // with an index, an ancestor that is not a page (bare folder) is not part of the trail
      if (index && !row && !active) return null;
      const pageTitle = active ? (getMetadata('og:title') || document.title) : '';
      return {
        path,
        title: (row && row.title) || pageTitle || titleFromPath(path),
        hidden: !!row && String(row['hide-in-nav']).toLowerCase() === 'true',
        active,
      };
    })
    .filter(Boolean);
}

/**
 * One <li> of breadcrumb.html.
 * @param {object} item trail item
 * @param {boolean} isLast last item of the full list (data-sly-list last)
 * @param {string} lang page language (lang/hreflang of the link)
 * @returns {HTMLLIElement}
 */
function buildListItem(item, isLast, lang) {
  const li = document.createElement('li');
  li.className = 'ferrer-body-small ferrer--bold cmp-breadcrumb__list-item';
  const label = document.createElement('span');
  label.textContent = item.title;
  if (item.active) {
    li.classList.add('cmp-breadcrumb__list-item--active');
    li.setAttribute('aria-current', 'location');
    li.append(label);
  } else {
    const link = document.createElement('a');
    link.className = 'cmp-breadcrumb__list-item-link';
    link.href = item.path;
    if (lang) {
      link.lang = lang;
      link.hreflang = lang;
    }
    link.append(label);
    li.append(link);
  }
  if (!isLast) {
    const separator = document.createElement('span');
    separator.className = 'cmp-breadcrumb__list-item-separator';
    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = '/';
    li.append(separator);
  }
  return li;
}

/**
 * JSON-LD BreadcrumbList of BreadcrumbModel (all items, also the hidden ones).
 * @param {object[]} items
 * @returns {string}
 */
function buildStructuredData(items) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@id': new URL(item.path, window.location.origin).href,
        name: item.title,
      },
    })),
  });
}

/**
 * Renders the items into the list and the JSON-LD script (idempotent).
 * @param {HTMLOListElement} list
 * @param {HTMLScriptElement} script
 * @param {object[]} items
 */
function render(list, script, items) {
  const lang = document.documentElement.lang || '';
  [...list.children].forEach((li) => li.remove());
  items.forEach((item, index) => {
    if (!item.hidden) list.append(buildListItem(item, index === items.length - 1, lang));
  });
  script.textContent = buildStructuredData(items);
}

/**
 * Builds the breadcrumb of the current page.
 *
 * DOM de entrada (matriz EDS): sin filas (el bloque solo tiene `classes`:
 * breadcrumb--dark | breadcrumb--light).
 *
 * DOM de salida (breadcrumb.html):
 *   div.breadcrumb
 *     [div.content-container]            (no dentro de hero: allí la política no es fullWidth)
 *       nav.cmp-breadcrumb[aria-label]
 *         ol.cmp-breadcrumb__list > li.cmp-breadcrumb__list-item …
 *     script[type=application/ld+json]
 *
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  [...block.children].forEach((row) => row.remove());

  const nav = document.createElement('nav');
  nav.className = 'cmp-breadcrumb';
  nav.setAttribute('aria-label', t('Breadcrumb', 'Breadcrumb'));
  const list = document.createElement('ol');
  list.className = 'cmp-breadcrumb__list';
  nav.append(list);

  if (block.closest('.cmp-hero')) {
    block.append(nav);
  } else {
    const container = document.createElement('div');
    container.className = 'content-container';
    container.append(nav);
    block.append(container);
  }

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  block.append(script);

  // first paint with URL-based titles (no layout shift), refined with the index
  render(list, script, getItems(null));
  fetchIndex().then((index) => {
    if (index) render(list, script, getItems(index));
  });
}
