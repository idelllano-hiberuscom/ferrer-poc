/**
 * Header Block — AEM Edge Delivery Services
 *
 * Migración 1:1 de AEM clásico (core-ferrer):
 *   structure/header + header-simple + navigation + navigation-simple + languagenavigation
 *   FE: components/header/header.js + components/navigation/navigation.js
 * Model: xwalk (EDS + Universal Editor)
 * UE instrumentation: Pendiente (Fase 3 - UE & QA Specialist)
 *
 * DOM de entrada: el bloque llega vacío (lo crea loadHeader en aem.js). El contenido sale
 * del fragmento /nav (metadato `nav` para otra ruta). En el fragmento, cada parte del
 * header es una sección identificada por su estilo (section-metadata `style`):
 *
 *   .section.header-banner       texto enriquecido            → header-block__banner
 *   .section.header-top-left     enlaces (máx. 3)              → header-block__links--left
 *   .section.header-top-center   1 enlace                      → header-block__title
 *   .section.header-top-right    enlaces (máx. 3)              → header-block__links--right
 *   .section.header-languages    lista anidada país > idiomas  → languagenavigation
 *   .section.header-logo         imagen + enlace a la home     → header-block__logo
 *   .section.header-highlighted  enlaces                       → header-block__links--highlighted
 *   .section.header-nav-item     (una por entrada de nivel 0)
 *       h1-h6 (título, opcionalmente enlazado) | p>a (enlace) → título y página
 *       p                                                     → descripción
 *       picture                                               → imagen del panel
 *       ul anidada (hasta 4 niveles)                          → hijos
 *   .section.header-simple (en cualquier sección) o metadato `header-variant: simple`
 *                                                             → variante header-simple
 *
 * @param {Element} block - Root element of the block
 */
import { getMetadata, toClassName } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { t, formatMessage, getLanguage } from '../../scripts/ferrer-i18n.js';
import { loadFragment } from '../fragment/fragment.js';

/* UE instrumentation: Pendiente (Fase 3) */

const BREAKPOINT_TABLET = 601;
const ACTIVE_CLASS = 'cmp-navigation__control--active';
const SECTION = {
  banner: 'header-banner',
  left: 'header-top-left',
  center: 'header-top-center',
  right: 'header-top-right',
  languages: 'header-languages',
  logo: 'header-logo',
  highlighted: 'header-highlighted',
  navItem: 'header-nav-item',
  simple: 'header-simple',
};

let uniqueIdCounter = 0;

/**
 * Devuelve un id único en el documento a partir de un texto.
 * @param {string} base prefijo del id
 * @param {string} text texto que se normaliza
 * @returns {string}
 */
function uniqueId(base, text = '') {
  uniqueIdCounter += 1;
  const slug = toClassName(text);
  return `${base}${slug ? `-${slug}` : ''}-${uniqueIdCounter}`;
}

/**
 * Traduce una clave del vocabulario de AEM y sustituye {0}, {1}… por los argumentos.
 * @param {string} key clave i18n
 * @param {...string} args argumentos de formato
 * @returns {string}
 */
function tr(key, ...args) {
  return formatMessage(t(key), ...args);
}

/**
 * Crea un elemento con clases, atributos e hijos.
 * @param {string} tag etiqueta
 * @param {object} [options] className, attrs, text
 * @param {Array<Node|string>} [children] hijos
 * @returns {HTMLElement}
 */
function createEl(tag, { className, attrs, text } = {}, children = []) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (attrs) {
    Object.entries(attrs).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== false) el.setAttribute(name, value);
    });
  }
  if (text !== undefined) el.textContent = text;
  children.filter(Boolean).forEach((child) => el.append(child));
  return el;
}

/**
 * Icono icomoon decorativo.
 * @param {string} className clases del icono
 * @returns {HTMLElement}
 */
function icon(className) {
  return createEl('i', { className, attrs: { 'aria-hidden': 'true' } });
}

/**
 * Normaliza un href a pathname (sin extensión .html) o null si es externo.
 * @param {string} href
 * @returns {string|null}
 */
function toPathname(href) {
  if (!href) return null;
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return url.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  } catch (e) {
    return null;
  }
}

/**
 * Estado de navegación de un enlace respecto a la página actual.
 * @param {string} href
 * @returns {{active: boolean, current: boolean}}
 */
function linkState(href) {
  const path = toPathname(href);
  const here = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  if (!path) return { active: false, current: false };
  const current = path === here;
  const active = current || (path !== '/' && here.startsWith(`${path}/`));
  return { active, current };
}

/* ------------------------------------------------------------------ */
/* Lectura del fragmento /nav                                          */
/* ------------------------------------------------------------------ */

/**
 * Contenido de una sección del fragmento.
 * @param {Element} section
 * @returns {Element}
 */
function sectionContent(section) {
  return section.querySelector(':scope > .default-content-wrapper') || section;
}

/**
 * Enlaces de una sección.
 * @param {Element} section
 * @returns {Array<{text: string, href: string, source: Element}>}
 */
function readLinks(section) {
  if (!section) return [];
  return [...section.querySelectorAll('a[href]')].map((a) => ({
    text: a.textContent.trim(),
    href: a.getAttribute('href'),
    source: a,
  }));
}

/**
 * Lee un <li> de la lista anidada de navegación.
 * @param {Element} li
 * @param {number} level nivel AEM del item
 * @returns {object}
 */
function parseListItem(li, level) {
  const nested = li.querySelector(':scope > ul, :scope > ol');
  const own = li.cloneNode(true);
  own.querySelectorAll(':scope > ul, :scope > ol').forEach((list) => list.remove());
  const link = own.querySelector('a[href]');
  const href = link ? link.getAttribute('href') : '';
  return {
    level,
    title: own.textContent.trim(),
    href,
    ...linkState(href),
    children: nested ? [...nested.children].map((child) => parseListItem(child, level + 1)) : [],
  };
}

/**
 * Lee una sección header-nav-item (item de nivel 0).
 * @param {Element} section
 * @returns {object}
 */
function parseNavSection(section) {
  const content = sectionContent(section);
  const elements = [...content.children];
  const heading = elements.find((el) => /^H[1-6]$/.test(el.tagName));
  const isLinkParagraph = (el) => {
    const a = el.tagName === 'P' && el.querySelector('a[href]');
    return a && el.textContent.trim() === a.textContent.trim() ? a : null;
  };
  let link = heading ? heading.querySelector('a[href]') : null;
  if (!link) link = elements.map(isLinkParagraph).find(Boolean) || null;
  const title = (heading || link)?.textContent.trim() || '';
  const description = elements
    .filter((el) => el.tagName === 'P' && !isLinkParagraph(el) && !el.querySelector('picture, img'))
    .map((el) => el.textContent.trim())
    .filter(Boolean)
    .join(' ');
  const picture = content.querySelector('picture');
  const list = elements.find((el) => el.tagName === 'UL' || el.tagName === 'OL');
  const href = link ? link.getAttribute('href') : '';
  return {
    level: 0,
    title,
    href,
    ...linkState(href),
    description,
    picture,
    source: section,
    children: list ? [...list.children].map((li) => parseListItem(li, 1)) : [],
  };
}

/**
 * Código de idioma deducido de un enlace (atributos o segmento de ruta).
 * @param {Element} a
 * @returns {string}
 */
function languageOf(a) {
  if (!a) return '';
  const explicit = a.getAttribute('hreflang') || a.getAttribute('lang');
  if (explicit) return explicit.toLowerCase();
  const path = toPathname(a.getAttribute('href')) || '';
  const segment = path.split('/').reverse().find((s) => /^[a-z]{2}([-_][a-z]{2})?$/i.test(s));
  return segment ? segment.toLowerCase() : '';
}

/**
 * Lee la lista de idiomas (país > idiomas, o plana).
 * @param {Element} list
 * @param {number} level
 * @returns {Array<object>}
 */
function parseLanguageList(list, level = 0) {
  return [...list.children].map((li) => {
    const nested = li.querySelector(':scope > ul, :scope > ol');
    const own = li.cloneNode(true);
    own.querySelectorAll(':scope > ul, :scope > ol').forEach((l) => l.remove());
    const a = own.querySelector('a[href]');
    return {
      level,
      title: own.textContent.trim(),
      href: a ? a.getAttribute('href') : '',
      language: languageOf(a),
      children: nested ? parseLanguageList(nested, level + 1) : [],
    };
  });
}

/**
 * Marca el item de idioma activo (prefijo más largo de la URL actual) y lo devuelve.
 * @param {Array<object>} items
 * @returns {{item: object, parent: object}|null}
 */
function markActiveLanguage(items) {
  let best = null;
  const visit = (list, parent) => list.forEach((item) => {
    const path = toPathname(item.href);
    const here = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    if (path && (here === path || here.startsWith(`${path}/`))) {
      if (!best || path.length > toPathname(best.item.href).length) best = { item, parent };
    }
    visit(item.children, item);
  });
  visit(items, null);
  // solo el idioma: marcar también el país pintaría como activos todos sus idiomas
  if (best) best.item.active = true;
  return best;
}

/* ------------------------------------------------------------------ */
/* Plantillas (equivalentes a los HTL)                                 */
/* ------------------------------------------------------------------ */

/**
 * Lista de enlaces del header (leftLinks / rightLinks / highlightedLinks).
 * @param {Array<object>} links
 * @param {string} linkClass clases del <a>
 * @returns {HTMLElement}
 */
function buildLinkList(links, linkClass) {
  return createEl('ul', {}, links.map((link) => createEl('li', {}, [
    createEl('a', { className: linkClass, attrs: { href: link.href }, text: link.text }),
  ])));
}

/**
 * Imagen del panel de navegación (PageHelperModel.image en AEM).
 * @param {object} item
 * @returns {Element|null}
 */
function panelPicture(item) {
  if (!item.picture) return null;
  const picture = item.picture.cloneNode(true);
  const img = picture.querySelector('img');
  if (img) {
    img.loading = 'lazy';
    img.decoding = 'async';
  }
  return picture;
}

/**
 * Enlace del título del panel (hideLinkInNavigation ⇢ sin href).
 * @param {object} item
 * @returns {Array<Node>}
 */
function buildPanelTitle(item) {
  const title = createEl('span', { className: 'cmp-navigation__panel-title ferrer-h5', text: item.title });
  if (!item.href) return [title];
  const link = createEl('a', {
    className: 'cmp-navigation__item-title cmp-navigation__control',
    attrs: { href: item.href },
  }, [title, createEl('span', { className: 'icon-arrow-up-right', attrs: { 'aria-hidden': 'true' } })]);
  const nodes = [link];
  if (item.description) {
    nodes.push(createEl('p', { className: 'cmp-navigation__item-description', text: item.description }));
  }
  return nodes;
}

/* eslint-disable no-use-before-define */

/**
 * group.html
 * @param {Array<object>} items
 * @param {boolean} simple variante navigation-simple
 * @returns {HTMLElement}
 */
function buildGroup(items, simple) {
  return createEl('ul', { className: 'cmp-navigation__group cmp-navigation__list' }, items.map((item) => buildItem(item, simple)));
}

/**
 * itemContent.html — nivel 0.
 * @param {object} item
 * @param {boolean} simple
 * @returns {Array<HTMLElement>}
 */
function buildLevel0Content(item, simple) {
  const hasChildren = item.children.length > 0;
  const triggerContent = [
    createEl('span', { className: 'cmp-button__text', text: item.title }),
    icon('cmp-button__icon icon-chevron-right'),
  ];
  const trigger = hasChildren
    ? createEl('button', {
      className: 'cmp-navigation__trigger cmp-navigation__control cmp-button cmp-button--default',
      attrs: { 'data-id': item.title, 'aria-expanded': 'false' },
    }, triggerContent)
    : createEl('a', {
      className: 'cmp-navigation__trigger cmp-navigation__control cmp-button cmp-button--default',
      attrs: { href: item.href || null, 'data-id': item.title },
    }, triggerContent);

  const imageColumn = createEl('div', { className: 'cmp-navigation__item-image' }, [
    createEl('button', {
      className: 'cmp-navigation__panel-close cmp-navigation__control',
      attrs: { 'aria-label': tr('header.component.close-menu') },
    }, [
      icon('icon-close'),
      createEl('p', { className: 'ferrer--bold', text: tr('header.component.menu') }),
    ]),
    simple ? null : createEl('div', { className: 'cmp-navigation__panel-image' }, [panelPicture(item)]),
  ]);

  return [
    createEl('div', { className: 'cmp-navigation__item-title button cmp-button--navbar cmp-button--dark cmp-button--large' }, [trigger]),
    createEl('div', { className: 'cmp-navigation__grid content-container' }, [
      createEl('div', { className: 'cmp-navigation__item-container', attrs: { 'data-item-id': item.title } }, [
        createEl('div', { className: 'cmp-navigation__panel-content' }, [
          createEl('div', { className: 'cmp-navigation__item-body' }, [
            createEl('div', { className: 'cmp-navigation__item-details' }, [
              createEl('div', { className: 'cmp-navigation__item-text' }, buildPanelTitle(item)),
              hasChildren ? buildGroup(item.children, simple) : null,
            ]),
            imageColumn,
          ]),
        ]),
      ]),
    ]),
  ];
}

/**
 * itemContent.html — niveles > 0.
 * @param {object} item
 * @param {boolean} simple
 * @param {string} childrenId id del panel de hijos
 * @returns {Node}
 */
function buildLevelNContent(item, simple, childrenId) {
  if (item.children.length) {
    return createEl('button', {
      className: 'cmp-navigation__toggle cmp-navigation__control',
      attrs: {
        'data-toggle-id': item.title,
        'aria-expanded': 'false',
        'aria-haspopup': 'menu',
        'aria-controls': childrenId,
        type: 'button',
      },
    }, [
      createEl('span', { className: 'cmp-navigation__text', text: simple ? item.title.toUpperCase() : item.title }),
      icon('icon-chevron-down'),
    ]);
  }
  if (!item.href) return document.createTextNode(item.title);
  return createEl('a', {
    className: 'cmp-navigation__item-link cmp-navigation__control',
    attrs: {
      href: item.href,
      'aria-current': item.current ? 'page' : null,
      'data-cmp-clickable': 'true',
    },
    text: item.title,
  });
}

/**
 * item.html
 * @param {object} item
 * @param {boolean} simple
 * @returns {HTMLElement}
 */
function buildItem(item, simple) {
  const li = createEl('li', {
    className: `cmp-navigation__item cmp-navigation__list-item cmp-navigation__item--level-${item.level}${item.active ? ' cmp-navigation__item--active' : ''}`,
    attrs: { 'data-id': item.title },
  });
  if (item.level === 0) {
    li.append(...buildLevel0Content(item, simple));
    return li;
  }
  const childrenId = item.children.length ? uniqueId('cmp-navigation__children', item.title) : null;
  li.append(buildLevelNContent(item, simple, childrenId));
  if (item.children.length) {
    const access = !simple && item.href
      ? createEl('a', {
        className: 'cmp-navigation__panel-access cmp-navigation__control',
        attrs: { href: item.href },
      }, [createEl('span', { text: tr('header.component.access-to', item.title) })])
      : null;
    li.append(createEl('div', {
      className: 'cmp-navigation__children',
      attrs: { id: childrenId, 'data-children-id': item.title, hidden: '' },
    }, [access, buildGroup(item.children, simple)]));
  }
  return li;
}

/* eslint-enable no-use-before-define */

/**
 * navigation.html (selectores "root" y por defecto).
 * @param {Array<object>} items
 * @param {boolean} simple
 * @param {string} labelKey clave i18n del aria-label
 * @returns {HTMLElement|null}
 */
function buildNavigation(items, simple, labelKey) {
  if (!items.length) return null;
  return createEl('nav', {
    className: `cmp-navigation${simple ? ' cmp-navigation--simple' : ''}`,
    attrs: {
      itemscope: '',
      itemtype: 'http://schema.org/SiteNavigationElement',
      'aria-label': tr(labelKey),
      role: 'navigation',
    },
  }, [buildGroup(items, simple)]);
}

/**
 * Botón de acceso "Acceder a X" de los paneles de escritorio.
 * @param {object} item
 * @returns {HTMLElement|null}
 */
function buildPanelAccess(item) {
  if (!item.href) return null;
  return createEl('a', {
    className: 'cmp-navigation__panel-access cmp-navigation__control',
    attrs: { href: item.href },
  }, [createEl('span', { text: tr('header.component.access-to', item.title) })]);
}

/**
 * Enlace de nivel 1 del panel izquierdo.
 * @param {object} level1
 * @param {boolean} withToggle
 * @returns {Node}
 */
function buildLevel1Entry(level1, withToggle) {
  if (withToggle && level1.children.length) {
    return createEl('button', {
      className: 'cmp-navigation__toggle cmp-navigation__control',
      attrs: { 'data-toggle-id': level1.title, 'aria-expanded': 'false', type: 'button' },
    }, [document.createTextNode(level1.title), icon('icon-chevron-right')]);
  }
  if (!level1.href) return document.createTextNode(level1.title);
  return createEl('a', {
    className: 'cmp-navigation__item-link cmp-navigation__control',
    attrs: {
      href: level1.href,
      'aria-current': level1.current ? 'page' : null,
      'data-cmp-clickable': 'true',
    },
    text: level1.title,
  });
}

/**
 * Columnas izquierda/derecha/nivel 3 del panel de escritorio completo.
 * @param {object} item
 * @returns {HTMLElement}
 */
function buildFullPanelGroup(item) {
  const left = createEl('div', { className: 'cmp-navigation__panel-left scroll-bar' }, [
    createEl('div', { className: 'cmp-navigation__level-1' }, item.children.map((level1) => createEl('ul', {}, [
      createEl('li', {}, [buildLevel1Entry(level1, true)]),
    ]))),
  ]);

  const childrenList = createEl('div', { className: 'cmp-navigation__children-list' }, item.children.map((level1) => createEl('div', {
    className: 'cmp-navigation__panel-children',
    attrs: { 'data-panel-children': level1.title, hidden: '' },
  }, [
    buildPanelAccess(level1),
    createEl('ul', { className: 'cmp-navigation__level-2' }, level1.children.map((child) => createEl('li', {}, [
      child.children.length
        ? createEl('button', {
          className: 'cmp-navigation__toggle-l3 cmp-navigation__panel-link cmp-navigation__control',
          attrs: { 'data-toggle-l3': child.title, 'aria-expanded': 'false', type: 'button' },
        }, [document.createTextNode(child.title), icon('icon-chevron-right')])
        : createEl('a', {
          className: 'cmp-navigation__panel-link cmp-navigation__control',
          attrs: { href: child.href || null },
          text: child.title,
        }),
    ]))),
  ])));

  const right = createEl('div', { className: 'cmp-navigation__panel-right scroll-bar' }, [
    createEl('div', { className: 'cmp-navigation__panel-divider js-panel-divider' }),
    childrenList,
  ]);

  const level3Panels = item.children.flatMap((level1) => level1.children
    .filter((child) => child.children.length)
    .map((child) => createEl('div', {
      className: 'cmp-navigation__panel-level-3',
      attrs: { 'data-panel-level-3': child.title, hidden: '' },
    }, [
      createEl('a', {
        className: 'cmp-navigation__panel-access cmp-navigation__control',
        attrs: { href: child.href || null },
      }, [createEl('span', { text: tr('header.component.access-to', child.title) })]),
      createEl('ul', { className: 'cmp-navigation__level-3' }, child.children.map((level3) => {
        if (!level3.children.length) {
          return createEl('li', {}, [createEl('a', {
            className: 'cmp-navigation__panel-link cmp-navigation__control',
            attrs: { href: level3.href || null },
            text: level3.title,
          })]);
        }
        return createEl('li', {}, [
          createEl('button', {
            className: 'cmp-navigation__toggle-l4 cmp-navigation__panel-link cmp-navigation__control',
            attrs: { 'data-toggle-l4': level3.title, 'aria-expanded': 'false', type: 'button' },
          }, [document.createTextNode(level3.title), icon('icon-chevron-down')]),
          createEl('ul', {
            className: 'cmp-navigation__level-4',
            attrs: { 'data-panel-level4': level3.title, hidden: '' },
          }, [
            createEl('li', {}, [createEl('a', {
              className: 'cmp-navigation__panel-access cmp-navigation__control',
              attrs: { href: level3.href || null },
            }, [createEl('span', { text: tr('header.component.access-to', level3.title) })])]),
            ...level3.children.map((level4) => createEl('li', {}, [createEl('a', {
              className: 'cmp-navigation__panel-link cmp-navigation__panel-link--level-4 cmp-navigation__control',
              attrs: { href: level4.href || null },
              text: level4.title,
            })])),
          ]),
        ]);
      })),
    ])));

  const panel3 = createEl('div', { className: 'cmp-navigation__panel-3 scroll-bar' }, [
    createEl('div', { className: 'cmp-navigation__panel-divider js-panel-divider-l3' }),
    createEl('div', { className: 'cmp-navigation__panel-3 scroll-bar' }, level3Panels),
  ]);

  return createEl('div', { className: 'cmp-navigation__group' }, [
    left,
    right,
    panel3,
    createEl('div', { className: 'cmp-navigation__item-image' }, [
      createEl('div', { className: 'cmp-navigation__panel-image' }, [panelPicture(item)]),
    ]),
  ]);
}

/**
 * Botón de cierre del panel de escritorio.
 * @returns {HTMLElement}
 */
function buildPanelClose() {
  return createEl('div', {}, [createEl('button', {
    className: 'cmp-navigation__panel-close cmp-navigation__control',
    attrs: { 'aria-label': tr('header.component.close-menu') },
  }, [icon('icon-close')])]);
}

/**
 * Cabecera (título + descripción) del panel de escritorio.
 * @param {object} item
 * @returns {HTMLElement}
 */
function buildPanelTitleWrapper(item) {
  return createEl('div', { className: 'cmp-navigation__item-title-wrapper' }, buildPanelTitle(item));
}

/**
 * desktopPanel.html (navigation y navigation-simple).
 * @param {Array<object>} items
 * @param {boolean} simple
 * @returns {HTMLElement}
 */
function buildDesktopPanel(items, simple) {
  const lis = items.map((item) => {
    let body;
    if (simple) {
      const level1 = item.children.length
        ? createEl('div', { className: 'cmp-navigation__group' }, [
          createEl('div', { className: 'cmp-navigation__panel-left scroll-bar' }, [
            createEl('div', { className: 'cmp-navigation__level-1' }, item.children.map((child) => createEl('ul', {}, [
              createEl('li', {}, [buildLevel1Entry(child, false)]),
            ]))),
          ]),
        ])
        : null;
      body = createEl('div', { className: 'cmp-navigation__item-body' }, [
        createEl('div', { className: 'cmp-navigation__item-top' }, [
          createEl('div', { className: 'cmp-navigation__item-text' }, [buildPanelTitleWrapper(item)]),
          buildPanelClose(),
        ]),
        createEl('div', { className: 'cmp-navigation__panel-content' }, [
          createEl('div', { className: 'cmp-navigation__item-details' }, [level1]),
          createEl('div', { className: 'cmp-navigation__divider' }),
          createEl('div', { className: 'cmp-navigation__item-image' }, [
            createEl('div', { className: 'cmp-navigation__panel-image' }, [panelPicture(item)]),
          ]),
        ]),
      ]);
    } else {
      body = createEl('div', { className: 'cmp-navigation__item-body' }, [
        createEl('div', { className: 'cmp-navigation__item-details' }, [
          createEl('div', { className: 'cmp-navigation__item-text' }, [buildPanelClose(), buildPanelTitleWrapper(item)]),
          item.children.length ? buildFullPanelGroup(item) : null,
        ]),
      ]);
    }

    const li = createEl('li', {
      className: 'cmp-navigation__item cmp-navigation__item--level-0 cmp-navigation__item--hidden-level-0 cmp-navigation__item--full-navegation',
      attrs: { 'data-id': item.title },
    }, [
      createEl('button', {
        className: 'cmp-navigation__trigger cmp-navigation__control cmp-navigation__trigger--hidden',
        attrs: { 'data-id': item.title, 'aria-expanded': 'false' },
        text: item.title,
      }),
      createEl('div', { className: 'cmp-navigation__item-container' }, [
        createEl('div', { className: 'cmp-navigation__panel-content' }, [body]),
      ]),
    ]);
    if (item.source) moveInstrumentation(item.source, li);
    return li;
  });

  return createEl('div', { className: `cmp-navigation${simple ? ' cmp-navigation--simple' : ''}` }, [
    createEl('ul', { className: 'cmp-navigation__group' }, lis),
  ]);
}

/**
 * group.html de languagenavigation (core component).
 * @param {Array<object>} items
 * @returns {HTMLElement}
 */
function buildLanguageGroup(items) {
  return createEl('ul', { className: 'cmp-languagenavigation__group' }, items.map((item) => {
    const classes = ['cmp-languagenavigation__item'];
    if (item.language) classes.push(`cmp-languagenavigation__item--langcode-${item.language}`);
    classes.push(`cmp-languagenavigation__item--level-${item.level}`);
    if (item.active) classes.push('cmp-languagenavigation__item--active');
    const li = createEl('li', { className: classes.join(' ') });
    if (item.children.length || !item.href) {
      li.append(createEl('span', { className: 'cmp-languagenavigation__item-title', text: item.title }));
    } else {
      li.append(createEl('a', {
        className: 'cmp-languagenavigation__item-link',
        attrs: {
          href: item.href,
          hreflang: item.language || null,
          lang: item.language || null,
          rel: 'alternate',
          title: item.title,
        },
        text: item.title,
      }));
    }
    if (item.children.length) li.append(buildLanguageGroup(item.children));
    return li;
  }));
}

/**
 * languagenavigation.html
 * @param {object} languages datos de idiomas
 * @param {{className: string}} wrapper clases del contenedor decorado
 * @returns {HTMLElement|null}
 */
function buildLanguageNavigation(languages, { className }) {
  if (!languages || !languages.items.length) return null;
  const navId = uniqueId('header-language');
  const menuId = `${navId}-menu`;
  const label = [languages.country, languages.language.toUpperCase()].filter(Boolean).join(' · ');
  return createEl('div', { className }, [
    createEl('div', { className: 'header-block__language-container' }, [
      icon('icon-globe'),
      createEl('button', {
        className: 'header-block__language-toggle ferrer-body-xsmall',
        attrs: {
          'aria-haspopup': 'true',
          'aria-expanded': 'false',
          'aria-controls': menuId,
          'aria-label': label,
        },
      }, [
        createEl('p', { attrs: { lang: languages.language || null }, text: label }),
        icon('icon-chevron-down'),
      ]),
    ]),
    createEl('div', { className: 'header-block__language-menu scroll-bar', attrs: { id: menuId } }, [
      createEl('nav', {
        className: 'cmp-languagenavigation',
        attrs: { id: navId, 'aria-label': tr('header.component.language') },
      }, [buildLanguageGroup(languages.items)]),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Comportamiento (header.js + navigation.js)                          */
/* ------------------------------------------------------------------ */

/**
 * Vincula el comportamiento de header.js y navigation.js al header renderizado.
 * @param {HTMLElement} root el bloque .header
 */
function bindBehaviour(root) {
  const isMobile = () => window.innerWidth <= BREAKPOINT_TABLET;
  const qs = (sel) => root.querySelector(sel);
  const qsAll = (sel) => root.querySelectorAll(sel);
  const headerBlock = qs('.header-block');
  const headerTop = qs('.header-block__top');
  const mobileNav = qs('.header-block__mobile-nav');
  const navigationPanel = qs('.header-block__nav-panel--desktop-only');
  const desktopNav = navigationPanel?.querySelector('.cmp-navigation');
  const mobileToggle = qs('.header-block__mobile-toggle');
  const actions = qs('.header-block__actions');
  const searchButton = qs('.header-block__search');
  const tabletToggle = qs('.header-block__tablet-toggle');
  const topContent = qs('.header-block__top-content');
  const headerBottom = qs('.header-block__bottom--dark');
  const banner = qs('.header-block__banner');

  const setChevronRotated = (toggle, rotated) => toggle?.classList.toggle('is-chevron-rotated', rotated);

  /* ---------- header.js: selector de idioma ---------- */
  const getLanguageMenu = (toggle) => toggle.closest('.header-block__language')?.querySelector('.header-block__language-menu');

  const closeLanguageMenu = (toggle, menu) => {
    menu.classList.remove('is-visible');
    toggle.setAttribute('aria-expanded', 'false');
    setChevronRotated(toggle, false);
  };

  const closeLanguageMenuGlobal = () => {
    qsAll('.header-block__language-toggle').forEach((toggle) => {
      const menu = getLanguageMenu(toggle);
      if (menu) closeLanguageMenu(toggle, menu);
    });
  };

  const openLanguageMenu = (toggle, menu) => {
    menu.classList.add('is-visible');
    toggle.setAttribute('aria-expanded', 'true');
    setChevronRotated(toggle, true);
  };

  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.header-block__language-toggle');
    if (toggle && root.contains(toggle)) {
      e.preventDefault();
      e.stopPropagation();
      const menu = getLanguageMenu(toggle);
      if (!menu) return;
      if (menu.classList.contains('is-visible')) {
        closeLanguageMenu(toggle, menu);
      } else {
        closeLanguageMenuGlobal();
        openLanguageMenu(toggle, menu);
        // navigation.js: foco al primer idioma y cierre al salir con Tab
        setTimeout(() => {
          const langLinks = [...menu.querySelectorAll('.cmp-languagenavigation__item a')];
          if (!langLinks.length) return;
          langLinks[0].focus();
          langLinks.forEach((link, index) => {
            if (link.langTabHandler) return;
            link.langTabHandler = (ev) => {
              const leavingStart = index === 0 && ev.key === 'Tab' && ev.shiftKey;
              const leavingEnd = index === langLinks.length - 1 && ev.key === 'Tab' && !ev.shiftKey;
              if (leavingStart || leavingEnd) closeLanguageMenu(toggle, menu);
            };
            link.addEventListener('keydown', link.langTabHandler);
          });
        }, 50);
      }
      return;
    }
    if (!e.target.closest('.header-block__language-menu')) closeLanguageMenuGlobal();
  });

  document.addEventListener('focusin', (e) => {
    if (!e.target.closest('.header-block__language-toggle, .header-block__language-menu')) {
      closeLanguageMenuGlobal();
    }
  });

  /* ---------- header.js: menú móvil ---------- */
  const enableScrollLock = () => {
    document.body.classList.add('header-scroll-lock');
    headerBlock.classList.add('is-mobile-menu-open');
  };

  const disableScrollLock = () => {
    document.body.classList.remove('header-scroll-lock');
    headerBlock.classList.remove('is-mobile-menu-open');
  };

  const resetMobileHeaderToggle = () => {
    if (!mobileToggle) return;
    const toggleIcon = mobileToggle.querySelector('i') || mobileToggle;
    toggleIcon.classList.remove('icon-close');
    toggleIcon.classList.add('icon-menu');
    mobileToggle.setAttribute('aria-expanded', 'false');
  };

  if (mobileToggle && headerTop && mobileNav && actions) {
    const mobileToggleIcon = mobileToggle.querySelector('i') || mobileToggle;
    const originalNextSibling = mobileToggle.nextSibling;

    const restoreMobileTogglePosition = () => {
      if (originalNextSibling && originalNextSibling.parentNode === actions) {
        actions.insertBefore(mobileToggle, originalNextSibling);
      } else {
        actions.append(mobileToggle);
      }
    };

    mobileToggle.addEventListener('click', () => {
      const isOpen = headerTop.classList.toggle('is-mobile-visible');
      mobileNav.classList.toggle('is-mobile-visible', isOpen);
      mobileToggle.setAttribute('aria-expanded', isOpen);
      mobileToggleIcon.classList.toggle('icon-menu', !isOpen);
      mobileToggleIcon.classList.toggle('icon-close', isOpen);
      if (isOpen) {
        enableScrollLock();
        actions.append(mobileToggle);
        setTimeout(() => mobileNav.querySelector('a, button')?.focus(), 0);
      } else {
        disableScrollLock();
        restoreMobileTogglePosition();
      }
    });

    mobileToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        mobileToggle.click();
      }
    });

    // ⚠️ TODO REQUIRES_BUSINESS_INPUT: el buscador (popup .cmp-search-popup) no se migra.
    // El botón se mantiene y, como en el original, cierra el menú móvil si está abierto.
    searchButton?.addEventListener('click', () => {
      if (!headerTop.classList.contains('is-mobile-visible')) return;
      headerTop.classList.remove('is-mobile-visible');
      mobileNav.classList.remove('is-mobile-visible');
      disableScrollLock();
      mobileToggle.setAttribute('aria-expanded', 'false');
      mobileToggleIcon.classList.add('icon-menu');
      mobileToggleIcon.classList.remove('icon-close');
      restoreMobileTogglePosition();
    });
  }

  /* ---------- header.js: menú tablet (icon-menu-dots) ---------- */
  const closeTabletMenu = () => {
    qsAll('.header-block__links--left, .header-block__links--right, .header-block__title, .header-block__top-content')
      .forEach((el) => el.classList.remove('is-visible'));
    tabletToggle?.classList.remove('icon-close');
    tabletToggle?.classList.add('icon-menu-dots');
    tabletToggle?.setAttribute('aria-expanded', 'false');
  };

  if (tabletToggle && topContent) {
    const openTabletMenu = () => {
      qsAll('.header-block__links--left, .header-block__links--right, .header-block__title, .header-block__top-content')
        .forEach((el) => el.classList.add('is-visible'));
      tabletToggle.classList.remove('icon-menu-dots');
      tabletToggle.classList.add('icon-close');
      tabletToggle.setAttribute('aria-expanded', 'true');
      setTimeout(() => topContent.querySelector('a, button')?.focus(), 0);
    };

    tabletToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (topContent.classList.contains('is-visible')) closeTabletMenu();
      else openTabletMenu();
    });

    tabletToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tabletToggle.click();
      }
    });

    document.addEventListener('click', (e) => {
      if (topContent.classList.contains('is-visible') && !topContent.contains(e.target) && !tabletToggle.contains(e.target)) {
        closeTabletMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      setTimeout(() => {
        if (topContent.classList.contains('is-visible')
          && !topContent.contains(document.activeElement)
          && !tabletToggle.contains(document.activeElement)) {
          closeTabletMenu();
        }
      }, 0);
    });
  }

  /* ---------- navigation.js: estado de paneles ---------- */
  const removeActiveClass = (target) => target?.classList.remove('item-active', ACTIVE_CLASS);
  const addActiveClass = (target) => target?.classList.add('item-active', ACTIVE_CLASS);
  const removeActiveClasses = () => qsAll(`.item-active, .${ACTIVE_CLASS}`).forEach(removeActiveClass);

  const closeLevel4Panels = () => {
    qsAll('.cmp-navigation__level-4').forEach((panel) => {
      panel.classList.remove('cmp-navigation__level-4--open');
      panel.setAttribute('hidden', 'true');
    });
    qsAll('.cmp-navigation__toggle-l4').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
      setChevronRotated(btn, false);
      removeActiveClass(btn);
    });
  };

  const closeLevel3Panels = () => {
    qsAll('.cmp-navigation__panel-level-3').forEach((panel) => {
      panel.classList.remove('cmp-navigation__panel-level-3--open');
      panel.setAttribute('hidden', 'true');
    });
    qsAll('.cmp-navigation__toggle-l3').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
      removeActiveClass(btn);
    });
    qsAll('.cmp-navigation__item-body').forEach((b) => b.classList.remove('is-level3-open'));
    qsAll('.js-panel-divider-l3').forEach((d) => d.classList.remove('is-visible'));
    closeLevel4Panels();
  };

  const closeDesktopPanels = () => {
    qsAll('.cmp-navigation__panel-children').forEach((panel) => {
      panel.classList.remove('cmp-navigation__panel-children--open');
      panel.setAttribute('hidden', 'true');
    });
    qsAll('.cmp-navigation__toggle').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
      setChevronRotated(btn, false);
    });
    qsAll('.js-panel-divider').forEach((d) => d.classList.remove('is-visible'));
    closeLevel3Panels();
  };

  const resetLevel0Items = () => {
    qsAll('.cmp-navigation__item--level-0').forEach((item) => {
      item.classList.remove('cmp-navigation__item--open', 'cmp-navigation__item--hidden-level-0', 'has-open-children', 'is-mobile-hidden');
      const trigger = item.querySelector('.cmp-navigation__trigger');
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.classList.remove('hide-trigger');
      item.querySelector('.cmp-navigation__item-container')?.classList.remove('cmp-navigation__item-container--open');
    });
  };

  const hideMobileHeaderTop = () => {
    if (!isMobile()) return;
    headerTop?.classList.add('header-block__top--hidden');
    mobileNav?.classList.add('is-mobile-overlay');
  };

  const showMobileHeaderTop = () => {
    if (!isMobile()) return;
    if (!mobileNav?.classList.contains('is-mobile-visible')) return;
    mobileNav.classList.remove('is-mobile-overlay');
    headerTop?.classList.remove('header-block__top--hidden');
    headerTop?.classList.add('is-mobile-visible');
  };

  const resetToggleIcons = (mode) => {
    qsAll('.cmp-navigation__toggle').forEach((btn) => setChevronRotated(btn, false));
    qsAll('.cmp-navigation__toggle i').forEach((toggleIcon) => {
      toggleIcon.classList.remove('icon-chevron-up', 'icon-chevron-down', 'icon-chevron-right');
      toggleIcon.classList.add(mode === 'mobile' ? 'icon-chevron-down' : 'icon-chevron-right');
    });
  };

  // syncLanguageAriaCurrent
  qsAll('.cmp-languagenavigation__item .cmp-languagenavigation__item-link').forEach((link) => link.removeAttribute('aria-current'));
  qsAll('.cmp-languagenavigation__item--active > .cmp-languagenavigation__item-link').forEach((link) => link.setAttribute('aria-current', 'true'));

  /* ---------- navigation.js: navegación por teclado ---------- */
  const isElementVisible = (el) => !!(el
    && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const focusParentTrigger = (parentTrigger) => setTimeout(
    () => parentTrigger?.focus({ preventScroll: true }),
    0,
  );

  const openChildPanel = (toggle, config) => {
    if (!toggle.classList.contains(config.toggleClass)) return;
    const childPanel = root.querySelector(config.panelSel(toggle.getAttribute(config.dataAttr)));
    if (!childPanel) return;
    childPanel.parentTrigger = toggle;
    if (!childPanel.classList.contains(config.openClass)) toggle.click();
    const focusIn = (tries = 0) => {
      const first = childPanel.querySelector(config.firstItemSel);
      if (first && isElementVisible(first)) {
        config.setup(childPanel);
        first.focus({ preventScroll: true });
        return;
      }
      if (tries < 10) requestAnimationFrame(() => focusIn(tries + 1));
    };
    focusIn();
  };

  const bindKeyboardPanel = (panelRoot, {
    sel, propKey, onLeft, onRight,
  }) => {
    if (!panelRoot) return;
    const arrowKeys = onRight ? ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowUp', 'ArrowDown'];
    panelRoot.querySelectorAll(sel).forEach((link) => {
      link.tabIndex = 0;
      if (link[propKey]) link.removeEventListener('keydown', link[propKey]);
      link[propKey] = (e) => {
        if (arrowKeys.includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
        const current = [...panelRoot.querySelectorAll(sel)];
        const idx = current.indexOf(e.currentTarget);
        if (idx === -1) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const next = e.key === 'ArrowDown' ? (idx + 1) % current.length : (idx - 1 + current.length) % current.length;
          current[next]?.focus({ preventScroll: true });
          return;
        }
        if (e.key === 'ArrowLeft') {
          onLeft(panelRoot);
          return;
        }
        if (e.key === 'ArrowRight' && onRight) onRight(e.currentTarget);
      };
      link.addEventListener('keydown', link[propKey]);
    });
  };

  const keyboardPanelLevel4 = (panelRoot) => bindKeyboardPanel(panelRoot, {
    sel: '.cmp-navigation__panel-access, .cmp-navigation__panel-link',
    propKey: 'lvl4',
    onLeft: (r) => {
      closeLevel4Panels();
      focusParentTrigger(r.parentTrigger);
    },
  });

  const keyboardPanelLevel3 = (panelRoot) => bindKeyboardPanel(panelRoot, {
    sel: '.cmp-navigation__panel-access, .cmp-navigation__level-3 > li > .cmp-navigation__panel-link',
    propKey: 'lvl3',
    onLeft: (r) => {
      closeLevel3Panels();
      focusParentTrigger(r.parentTrigger);
    },
    onRight: (trigger) => openChildPanel(trigger, {
      toggleClass: 'cmp-navigation__toggle-l4',
      dataAttr: 'data-toggle-l4',
      panelSel: (id) => `.cmp-navigation__level-4[data-panel-level4="${CSS.escape(id)}"]`,
      openClass: 'cmp-navigation__level-4--open',
      firstItemSel: '.cmp-navigation__panel-access, .cmp-navigation__panel-link',
      setup: keyboardPanelLevel4,
    }),
  });

  const keyboardPanelLevel2 = (panelRoot) => bindKeyboardPanel(panelRoot, {
    sel: '.cmp-navigation__panel-access, .cmp-navigation__panel-link',
    propKey: 'lvl2',
    onLeft: (r) => {
      const { parentTrigger } = r;
      closeDesktopPanels();
      removeActiveClass(parentTrigger);
      focusParentTrigger(parentTrigger);
    },
    onRight: (trigger) => openChildPanel(trigger, {
      toggleClass: 'cmp-navigation__toggle-l3',
      dataAttr: 'data-toggle-l3',
      panelSel: (id) => `.cmp-navigation__panel-level-3[data-panel-level-3="${CSS.escape(id)}"]`,
      openClass: 'cmp-navigation__panel-level-3--open',
      firstItemSel: '.cmp-navigation__panel-access, .cmp-navigation__level-3 > li > .cmp-navigation__panel-link',
      setup: keyboardPanelLevel3,
    }),
  });

  const keyboardPanelLevel1 = (panelRootEl) => {
    const panelRoot = panelRootEl || root;
    panelRoot.querySelectorAll('.cmp-navigation__level-1 ul li').forEach((li) => {
      const el = li.querySelector('.cmp-navigation__toggle, .cmp-navigation__item-link');
      if (!el) return;
      el.tabIndex = 0;
      if (el.lvl1) el.removeEventListener('keydown', el.lvl1);
      el.lvl1 = (e) => {
        if (window.innerWidth <= BREAKPOINT_TABLET) return;
        const visible = [...panelRoot.querySelectorAll('.cmp-navigation__level-1 ul li')];
        const idx = visible.indexOf(li);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const next = e.key === 'ArrowDown' ? (idx + 1) % visible.length : (idx - 1 + visible.length) % visible.length;
          visible[next]?.querySelector('.cmp-navigation__toggle, .cmp-navigation__item-link')?.focus({ preventScroll: true });
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const toggleBtn = li.querySelector(':scope > .cmp-navigation__toggle');
          if (!toggleBtn) return;
          const panelId = toggleBtn.getAttribute('data-toggle-id');
          const childPanel = root.querySelector(`.cmp-navigation__panel-children[data-panel-children="${CSS.escape(panelId)}"]`);
          if (!childPanel) return;
          childPanel.parentTrigger = toggleBtn;
          const isOpen = childPanel.classList.contains('cmp-navigation__panel-children--open') && !childPanel.hasAttribute('hidden');
          if (!isOpen) toggleBtn.click();
          const focusIntoLevel2 = (tries = 0) => {
            const firstLink = childPanel.querySelector('.cmp-navigation__panel-access, .cmp-navigation__panel-link');
            if (firstLink && isElementVisible(firstLink)) {
              keyboardPanelLevel2(childPanel);
              firstLink.focus({ preventScroll: true });
              return;
            }
            if (tries < 10) requestAnimationFrame(() => focusIntoLevel2(tries + 1));
          };
          focusIntoLevel2();
        }
      };
      el.addEventListener('keydown', el.lvl1);
    });
  };

  const getActiveMobileItems = (parentItem) => {
    const result = [];
    parentItem.querySelectorAll('li.cmp-navigation__item--level-1').forEach((li) => {
      const toggle = li.querySelector(':scope > button.cmp-navigation__toggle');
      const link = li.querySelector(':scope > a.cmp-navigation__item-link');
      if (toggle && isElementVisible(toggle)) {
        result.push(toggle);
        const open = toggle.getAttribute('aria-expanded') === 'true'
          && li.querySelector(':scope > .cmp-navigation__children')?.classList.contains('is-open');
        if (open) {
          result.push(...li.querySelectorAll(':scope > .cmp-navigation__children a.cmp-navigation__panel-access, :scope > .cmp-navigation__children a.cmp-navigation__item-link'));
        }
      } else if (link && isElementVisible(link)) {
        result.push(link);
      }
    });
    return result;
  };

  const mobileCombinationLevels = () => {
    if (window.innerWidth > BREAKPOINT_TABLET) return;
    const parentItem = root.querySelector('.cmp-navigation__item--level-0.cmp-navigation__item--open');
    if (!parentItem) return;
    getActiveMobileItems(parentItem).forEach((el) => {
      el.tabIndex = 0;
      if (el.combined) el.removeEventListener('keydown', el.combined);
      el.combined = (e) => {
        const items = getActiveMobileItems(parentItem);
        const idx = items.indexOf(e.currentTarget);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
          items[next]?.focus({ preventScroll: true });
        }
      };
      el.addEventListener('keydown', el.combined);
    });
  };

  /* ---------- navigation.js: clicks ---------- */
  qsAll('.cmp-navigation__toggle, .cmp-navigation__trigger').forEach((button) => {
    button.addEventListener('click', () => {
      const panelId = button.getAttribute('data-toggle-id');
      const panel = panelId ? root.querySelector(`.cmp-navigation__panel-children[data-panel-children="${CSS.escape(panelId)}"]`) : null;
      const isOpen = isMobile()
        ? button.getAttribute('aria-expanded') === 'true'
        : panel?.classList.contains('cmp-navigation__panel-children--open');

      if (isOpen) {
        removeActiveClass(button);
        if (isMobile()) {
          const ownPanel = button.closest('.cmp-navigation__item')?.querySelector(':scope > .cmp-navigation__children');
          ownPanel?.querySelectorAll(`.item-active, .${ACTIVE_CLASS}`).forEach(removeActiveClass);
        }
        return;
      }

      qsAll(`.item-active, .${ACTIVE_CLASS}`).forEach((el) => {
        if (el === button) return;
        const isTrigger = el.classList.contains('cmp-navigation__trigger');
        const isCurrentToggle = button.classList.contains('cmp-navigation__toggle');
        if (isMobile()) {
          const elPanel = el.closest('.cmp-navigation__item')?.querySelector(':scope > .cmp-navigation__children');
          if (elPanel && elPanel.contains(button)) return;
        }
        if (isCurrentToggle && isTrigger) return;
        removeActiveClass(el);
      });
      if (button.classList.contains('cmp-navigation__trigger')) closeDesktopPanels();
      addActiveClass(button);
    });
  });

  qsAll('.cmp-navigation__item-link, .cmp-languagenavigation__item').forEach((el) => {
    el.addEventListener('click', () => {
      removeActiveClasses();
      addActiveClass(el);
    });
  });

  qsAll('.cmp-navigation__item--level-0 .cmp-navigation__trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      if (trigger.tagName === 'A') return;
      const { id } = trigger.dataset;
      const parentItem = trigger.closest('.cmp-navigation__item--level-0');

      if (isMobile()) {
        const grid = parentItem?.querySelector('.cmp-navigation__grid');
        const container = grid?.querySelector('.cmp-navigation__item-container');
        resetLevel0Items();
        hideMobileHeaderTop();
        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add('hide-trigger');
        parentItem?.classList.add('cmp-navigation__item--open', 'has-open-children');
        grid?.classList.add('cmp-navigation__grid--open');
        container?.classList.add('cmp-navigation__item-container--open');
        qsAll('.cmp-navigation__item--level-0').forEach((item) => {
          if (item !== parentItem) item.classList.add('is-mobile-hidden');
        });
        return;
      }

      navigationPanel?.classList.add('is-open');
      desktopNav?.querySelectorAll('.cmp-navigation__item--level-0').forEach((item) => {
        item.classList.add('cmp-navigation__item--hidden-level-0');
        item.classList.remove('cmp-navigation__item--open', 'has-open-children');
        item.querySelector('.cmp-navigation__item-container')?.classList.remove('cmp-navigation__item-container--open');
      });

      const matchingItem = desktopNav?.querySelector(`.cmp-navigation__item--level-0[data-id="${CSS.escape(id)}"]`);
      if (matchingItem) {
        matchingItem.classList.remove('cmp-navigation__item--hidden-level-0');
        matchingItem.classList.add('cmp-navigation__item--open', 'has-open-children');
        matchingItem.querySelector('.cmp-navigation__item-container')?.classList.add('cmp-navigation__item-container--open');
      }

      parentItem?.classList.add('cmp-navigation__item--open', 'has-open-children');
      trigger.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        const title = matchingItem?.querySelector('.cmp-navigation__item-title');
        if (title) {
          title.focus({ preventScroll: true });
        } else {
          matchingItem?.querySelector('.cmp-navigation__level-1 a, .cmp-navigation__level-1 button')?.focus({ preventScroll: true });
        }
        keyboardPanelLevel1(matchingItem);
      }, 100);
    });
  });

  root.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.cmp-navigation__panel-close');
    if (!closeBtn) return;
    const parentItem = closeBtn.closest('.cmp-navigation__item--level-0');
    const dataId = parentItem?.dataset.id;
    let triggerToFocus = null;
    if (isMobile()) {
      triggerToFocus = parentItem?.querySelector('.cmp-navigation__trigger');
    } else if (dataId) {
      triggerToFocus = root.querySelector(`.cmp-navigation__trigger[data-id="${CSS.escape(dataId)}"]:not(.cmp-navigation__trigger--hidden)`);
    }
    navigationPanel?.classList.remove('is-open');
    qsAll('.cmp-navigation__grid--open').forEach((g) => g.classList.remove('cmp-navigation__grid--open'));
    closeDesktopPanels();
    removeActiveClasses();
    resetLevel0Items();
    showMobileHeaderTop();
    if (triggerToFocus) setTimeout(() => triggerToFocus.focus({ preventScroll: true }), 30);
  });

  qsAll('.cmp-navigation__toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const panelId = toggle.getAttribute('data-toggle-id');

      if (isMobile()) {
        const parentItem = toggle.closest('.cmp-navigation__item');
        const children = parentItem?.querySelector(':scope > .cmp-navigation__children');
        const isOpen = children?.classList.contains('is-open');
        qsAll('.cmp-navigation__children').forEach((c) => {
          if (c === children || c.contains(toggle)) return;
          c.classList.remove('is-open');
        });
        qsAll('.cmp-navigation__toggle').forEach((btn) => {
          if (btn === toggle) return;
          const btnPanel = btn.closest('.cmp-navigation__item')?.querySelector(':scope > .cmp-navigation__children');
          if (btnPanel && btnPanel.contains(toggle)) return;
          btn.setAttribute('aria-expanded', 'false');
          setChevronRotated(btn, false);
        });
        if (children && !isOpen) {
          children.classList.add('is-open');
          toggle.setAttribute('aria-expanded', 'true');
          setChevronRotated(toggle, true);
        } else if (children && isOpen) {
          children.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          setChevronRotated(toggle, false);
        }
        setTimeout(mobileCombinationLevels, 50);
        return;
      }

      const targetPanel = root.querySelector(`.cmp-navigation__panel-children[data-panel-children="${CSS.escape(panelId)}"]`);
      const isOpen = targetPanel?.classList.contains('cmp-navigation__panel-children--open');
      closeDesktopPanels();
      if (!isOpen && targetPanel) {
        targetPanel.classList.add('cmp-navigation__panel-children--open');
        targetPanel.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
        qsAll('.js-panel-divider').forEach((d) => d.classList.add('is-visible'));
      }
    });
  });

  qsAll('.cmp-navigation__toggle-l3').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      if (isMobile()) return;
      const id = toggle.getAttribute('data-toggle-l3');
      const targetPanel = root.querySelector(`.cmp-navigation__panel-level-3[data-panel-level-3="${CSS.escape(id)}"]`);
      const isOpen = targetPanel?.classList.contains('cmp-navigation__panel-level-3--open');
      const itemBody = toggle.closest('.cmp-navigation__item-body');
      closeLevel3Panels();
      if (!isOpen && targetPanel) {
        itemBody?.classList.add('is-level3-open');
        qsAll('.js-panel-divider-l3').forEach((d) => d.classList.add('is-visible'));
        targetPanel.classList.add('cmp-navigation__panel-level-3--open');
        targetPanel.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
        addActiveClass(toggle);
      }
    });
  });

  qsAll('.cmp-navigation__toggle-l4').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      if (isMobile()) return;
      const id = toggle.getAttribute('data-toggle-l4');
      const targetPanel = root.querySelector(`.cmp-navigation__level-4[data-panel-level4="${CSS.escape(id)}"]`);
      const isOpen = targetPanel?.classList.contains('cmp-navigation__level-4--open');
      closeLevel4Panels();
      if (!isOpen && targetPanel) {
        targetPanel.classList.add('cmp-navigation__level-4--open');
        targetPanel.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
        setChevronRotated(toggle, true);
        addActiveClass(toggle);
      }
    });
  });

  /* ---------- navigation.js: teclado nivel 0 en móvil ---------- */
  let footerShiftTabHandlerAttached = false;
  const attachFooterShiftTabHandler = (allLvl0Buttons) => {
    if (footerShiftTabHandlerAttached) return;
    const firstLink = root.querySelector('.header-block__links--left a');
    if (!firstLink) return;
    firstLink.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        allLvl0Buttons.filter(isElementVisible).at(-1)?.focus({ preventScroll: true });
      }
    });
    footerShiftTabHandlerAttached = true;
  };

  const lvl0Buttons = [...qsAll('.cmp-navigation__item--level-0 .cmp-navigation__trigger')];
  lvl0Buttons.forEach((btn) => {
    btn.tabIndex = 0;
    btn.addEventListener('keydown', (e) => {
      if (window.innerWidth > BREAKPOINT_TABLET) return;
      const visible = lvl0Buttons.filter((b) => {
        const s = window.getComputedStyle(b);
        return isElementVisible(b) && s.display !== 'none' && s.visibility !== 'hidden';
      });
      const idx = visible.indexOf(e.currentTarget);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = e.key === 'ArrowDown' ? (idx + 1) % visible.length : (idx - 1 + visible.length) % visible.length;
        visible[next]?.focus({ preventScroll: true });
      }
      if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
        setTimeout(() => {
          const grid = btn.closest('.cmp-navigation__item--level-0')?.querySelector('.cmp-navigation__grid');
          grid?.querySelector('.cmp-navigation__item-title')?.focus({ preventScroll: true });
          mobileCombinationLevels();
        }, 100);
        return;
      }
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (idx === 0) {
            e.preventDefault();
            mobileToggle?.focus();
          }
        } else if (idx === visible.length - 1) {
          e.preventDefault();
          root.querySelector('.header-block__links--left a')?.focus();
          attachFooterShiftTabHandler(lvl0Buttons);
        }
      }
    });
  });

  /* ---------- navigation.js: cambio de breakpoint ---------- */
  const resetNavigationState = () => {
    headerTop?.classList.remove('is-mobile-visible', 'header-block__top--hidden');
    mobileNav?.classList.remove('is-mobile-visible', 'is-mobile-overlay');
    disableScrollLock();
    resetMobileHeaderToggle();
    closeDesktopPanels();
    resetLevel0Items();
  };

  const mediaQuery = window.matchMedia(`(width <= ${BREAKPOINT_TABLET}px)`);
  const handleMediaChange = (e) => {
    resetNavigationState();
    resetToggleIcons(e.matches ? 'mobile' : 'desktop');
  };
  mediaQuery.addEventListener('change', handleMediaChange);
  handleMediaChange(mediaQuery);

  /* ---------- navigation.js: inert del fondo con la navegación abierta ---------- */
  const collectBackgroundBranches = (container, activeNode, out = []) => {
    [...container.children].forEach((child) => {
      if (child === activeNode) return;
      if (child.contains(activeNode)) {
        collectBackgroundBranches(child, activeNode, out);
        return;
      }
      out.push(child);
    });
    return out;
  };

  const syncBackgroundInert = () => {
    const navOpen = navigationPanel?.classList.contains('is-open') || mobileNav?.classList.contains('is-mobile-visible');
    collectBackgroundBranches(document.body, headerBlock).forEach((el) => {
      if (navOpen) {
        if (el.hasAttribute('inert')) return;
        el.setAttribute('data-nav-inert-managed', 'true');
        el.setAttribute('inert', '');
        return;
      }
      if (!el.hasAttribute('data-nav-inert-managed')) return;
      el.removeAttribute('data-nav-inert-managed');
      el.removeAttribute('inert');
    });
  };

  [navigationPanel, mobileNav].filter(Boolean).forEach((target) => {
    new MutationObserver(syncBackgroundInert).observe(target, { attributes: true, attributeFilter: ['class'] });
  });
  syncBackgroundInert();

  /* ---------- header.js: cierre de capas al hacer scroll ---------- */
  const closeNavigationPanel = () => {
    if (!navigationPanel?.classList.contains('is-open')) return;
    navigationPanel.classList.remove('is-open');
    navigationPanel.querySelectorAll('[aria-expanded="true"]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
    removeActiveClasses();
    resetLevel0Items();
  };

  let overlaysTicking = false;
  let overlaysLastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    if (overlaysTicking) return;
    overlaysTicking = true;
    window.requestAnimationFrame(() => {
      const currentScrollY = window.scrollY;
      if (Math.abs(currentScrollY - overlaysLastScrollY) >= 5) {
        closeNavigationPanel();
        closeLanguageMenuGlobal();
        closeTabletMenu();
        overlaysLastScrollY = currentScrollY;
      }
      overlaysTicking = false;
    });
  });

  /* ---------- header.js: alturas del header como custom properties ---------- */
  const remFromPx = (px) => {
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return `${(px / rootFontSize).toFixed(4)}rem`;
  };

  if (headerTop && headerBottom && 'ResizeObserver' in window) {
    const updateHeight = () => {
      const menuOpen = headerTop.classList.contains('is-mobile-visible') || mobileNav?.classList.contains('is-mobile-visible');
      if (menuOpen) return;
      const bannerHeight = banner ? banner.getBoundingClientRect().height : 0;
      const topHeight = headerTop.getBoundingClientRect().height;
      const bottomHeight = headerBottom.getBoundingClientRect().height;
      const { style } = document.documentElement;
      style.setProperty('--header-banner-height', remFromPx(bannerHeight));
      style.setProperty('--header-top-height', remFromPx(topHeight));
      style.setProperty('--header-bottom-height', remFromPx(bottomHeight));
      style.setProperty('--header-total-height', remFromPx(bannerHeight + topHeight + bottomHeight));
    };
    const observer = new ResizeObserver(updateHeight);
    if (banner) observer.observe(banner);
    observer.observe(headerTop);
    observer.observe(headerBottom);
    updateHeight();
  }

  /* ---------- header.js: barra inferior fija (stickyBottomBarFallback) ---------- */
  if (headerTop && headerBottom) {
    const placeholder = createEl('div', { className: 'header-block__bottom-placeholder' });
    headerBottom.before(placeholder);
    const RELEASE_OFFSET = 22;
    let ticking = false;
    let isFixed = false;
    let hasInitialized = false;
    let lastScrollY = window.scrollY;
    const desktopQuery = window.matchMedia(`(width >= ${BREAKPOINT_TABLET}px)`);

    const setFixed = (nextIsFixed) => {
      if (nextIsFixed === isFixed) return;
      isFixed = nextIsFixed;
      headerBottom.classList.toggle('is-fixed', isFixed);
      placeholder.classList.toggle('is-active', isFixed);
    };

    const update = () => {
      if (!desktopQuery.matches) {
        setFixed(false);
        const offset = banner ? Math.min(Math.max(window.scrollY, 0), banner.offsetHeight) : 0;
        // valor dinámico dependiente del scroll: no expresable en CSS
        headerBlock.style.transform = offset ? `translateY(-${offset}px)` : '';
        ticking = false;
        return;
      }
      headerBlock.style.transform = '';
      const currentScrollY = window.scrollY;
      const isScrollingDown = currentScrollY > lastScrollY;
      const topBottom = headerTop.getBoundingClientRect().bottom;
      if (!hasInitialized) {
        setFixed(topBottom <= 0);
        hasInitialized = true;
      } else if (isFixed) {
        if (!isScrollingDown && topBottom >= -RELEASE_OFFSET) setFixed(false);
      } else if (isScrollingDown && topBottom <= 0) {
        setFixed(true);
      }
      lastScrollY = currentScrollY;
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }
}

/* ------------------------------------------------------------------ */
/* Montaje                                                             */
/* ------------------------------------------------------------------ */

/**
 * Construye header.html / header-simple.html con los datos del fragmento.
 * @param {HTMLElement} block bloque header
 * @param {HTMLElement} fragment <main> del fragmento /nav
 */
function renderHeader(block, fragment) {
  const find = (name) => fragment.querySelector(`.section.${name}`);
  const simple = getMetadata('header-variant').toLowerCase() === 'simple' || !!find(SECTION.simple);
  if (simple) block.classList.add('header-simple');

  const leftLinks = readLinks(find(SECTION.left));
  const rightLinks = readLinks(find(SECTION.right));
  const highlightedLinks = readLinks(find(SECTION.highlighted));
  const centralLink = readLinks(find(SECTION.center))[0];
  const navItems = [...fragment.querySelectorAll(`.section.${SECTION.navItem}`)].map(parseNavSection).filter((item) => item.title);

  // languagenavigation
  let languages = null;
  const languageSection = find(SECTION.languages);
  const languageList = languageSection?.querySelector('ul, ol');
  if (languageList) {
    const items = parseLanguageList(languageList);
    const activeLanguage = markActiveLanguage(items);
    languages = {
      items,
      country: activeLanguage?.parent?.title || '',
      language: activeLanguage?.item.language || getLanguage(),
    };
  }

  // logo + homePath
  const logoSection = find(SECTION.logo);
  const logoPicture = logoSection?.querySelector('picture');
  const homeHref = readLinks(logoSection)[0]?.href || '/';

  /* ---- banner ---- */
  const bannerSection = find(SECTION.banner);
  let bannerEl = null;
  if (bannerSection && bannerSection.textContent.trim()) {
    const text = createEl('div', { className: 'cmp-text' }, [...sectionContent(bannerSection).childNodes]);
    const bannerText = createEl('div', { className: 'header-block__banner-text ferrer--bold ferrer-body-xsmall' }, [text]);
    moveInstrumentation(bannerSection, bannerText);
    bannerEl = createEl('div', { className: 'header-block__banner' }, [
      createEl('div', { className: 'content-container' }, [bannerText]),
    ]);
  }

  /* ---- top ---- */
  const tabletMenuId = uniqueId('header-tablet-menu');
  const rightLinksEl = createEl('div', { className: 'header-block__links header-block__links--right' }, [
    buildLinkList(rightLinks, 'ferrer-body-small ferrer--bold'),
    createEl('div', { className: 'header-block__divider' }),
    buildLanguageNavigation(languages, { className: 'header-block__language' }),
  ]);
  const topContent = createEl('div', { className: 'header-block__top-content', attrs: { id: tabletMenuId } }, [
    createEl('div', { className: 'header-block__links header-block__links--left' }, [
      buildLinkList(leftLinks, 'ferrer-body-small ferrer--bold'),
    ]),
    !simple && centralLink ? createEl('a', {
      className: 'header-block__title ferrer-body-xsmall',
      attrs: { href: centralLink.href },
      text: centralLink.text,
    }) : null,
    rightLinksEl,
  ]);
  const top = createEl('div', { className: 'header-block__top' }, [
    createEl('div', { className: 'content-container' }, [
      createEl('i', {
        className: 'icon-menu-dots header-block__tablet-toggle',
        attrs: {
          tabindex: '0',
          'aria-expanded': 'false',
          'aria-haspopup': 'true',
          'aria-controls': tabletMenuId,
          role: 'button',
          'aria-label': tr('header.component.menu'),
        },
      }),
      topContent,
    ]),
    buildLanguageNavigation(languages, {
      className: 'header-block__language header-block__language--tablet',
    }),
  ]);

  /* ---- bottom ---- */
  const logoContainer = createEl('div', { className: 'image' });
  if (logoPicture) {
    const logoImg = logoPicture.querySelector('img');
    if (logoImg) {
      logoImg.loading = 'eager';
      logoImg.classList.add('cmp-image__image');
    }
    const cmpImage = createEl('div', { className: 'cmp-image' }, [logoPicture]);
    moveInstrumentation(logoSection, cmpImage);
    logoContainer.append(cmpImage);
  }

  const mobileNavId = uniqueId('header-mobile-nav');
  const navRoot = buildNavigation(navItems, simple, 'header.accessibility.nav-main');
  const bottom = createEl('div', { className: 'header-block__bottom header-block__bottom--dark bg-dark' }, [
    createEl('div', { className: 'content-container' }, [
      createEl('a', { className: 'header-block__logo', attrs: { href: homeHref } }, [logoContainer]),
      createEl('div', { className: 'header-block__nav-group' }, [
        createEl('div', { className: 'header-block__links header-block__links--highlighted' }, [
          buildLinkList(highlightedLinks, 'ferrer--bold'),
        ]),
        navRoot ? createEl('div', { className: 'header-block__nav header-block__nav--desktop-only' }, [navRoot]) : null,
      ]),
      createEl('div', { className: 'header-block__actions' }, [
        simple ? null : createEl('button', {
          className: 'header-block__search',
          attrs: { 'aria-label': tr('header.accessibility.search') },
        }, [icon('icon-type-search')]),
        createEl('button', {
          className: 'header-block__mobile-toggle',
          attrs: {
            'aria-expanded': 'false',
            'aria-label': tr('header.component.open-mobile-menu'),
            'aria-controls': mobileNavId,
          },
        }, [icon('icon-menu')]),
      ]),
    ]),
    createEl('div', { className: 'header-block__mobile-nav scroll-bar', attrs: { id: mobileNavId } }, [
      createEl('div', { className: 'header-block__links header-block__links--highlighted header-block__links--highlighted-mobile' }, [
        buildLinkList(highlightedLinks, 'ferrer--bold'),
      ]),
      buildNavigation(navItems, simple, 'header.accessibility.nav-mobile'),
    ]),
  ]);

  const panel = navItems.length
    ? createEl('div', { className: 'header-block__nav-panel header-block__nav-panel--desktop-only' }, [buildDesktopPanel(navItems, simple)])
    : null;

  const headerBlock = createEl('div', { className: 'header-block' }, [bannerEl, top, bottom, panel]);
  block.append(headerBlock);
  bindBehaviour(block);
}

/**
 * Loads and decorates the header (header + header-simple).
 * @param {Element} block - Root element of the block
 */
export default function decorate(block) {
  // el bloque autogenerado por loadHeader trae una fila vacía sin contenido ni instrumentación
  [...block.children].forEach((row) => {
    if (!row.textContent.trim() && !row.querySelector('picture, img, a')) row.remove();
  });

  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  loadFragment(navPath).then((fragment) => {
    if (fragment) renderHeader(block, fragment);
  });
}
