/* UE instrumentation: Pendiente (Fase 3) */

const THICKNESS = ['line-none', 'line-thin', 'line-medium', 'line-thick', 'line-xthick'];
const SPACE = ['space-small', 'space-medium', 'space-large'];
const DEFAULT_SPACE = 'space-medium';

/**
 * Divider block.
 *
 * DOM de entrada (matriz EDS): block.divider[.line-*][.space-*] sin filas
 * (thickness y spaceSize llegan como clases del bloque).
 *
 * @param {Element} block
 */
export default function decorate(block) {
  const thickness = THICKNESS.find((value) => block.classList.contains(value));
  const space = SPACE.find((value) => block.classList.contains(value)) || DEFAULT_SPACE;

  const divider = document.createElement('div');
  divider.classList.add('cmp-divider');
  if (thickness) divider.classList.add(`cmp-divider--${thickness}`);
  divider.classList.add(`cmp-divider--${space}`);
  divider.setAttribute('role', 'separator');
  // divider.html: aria-hidden only when thickness == cmp-divider--line-none
  if (thickness === 'line-none') divider.setAttribute('aria-hidden', 'true');

  [...block.children].forEach((row) => row.remove());
  block.append(divider);
}
