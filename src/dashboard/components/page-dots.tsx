import type { CSSProperties, JSX } from 'react';
import type { PageDirection } from '../hooks/use-page';

type PageDotsProps = {
  count: number;
  page: number;
  direction: PageDirection | null;
  onGo: (page: number) => void;
};

/**
 * The dots along the bottom that choose a page. A bright pill sits on the
 * current dot; its leading edge sets off first and the trailing one follows,
 * so it stretches across and then catches up as it moves.
 */
export const PageDots = ({ count, page, direction, onGo }: PageDotsProps): JSX.Element => (
  <nav
    className="pager glass"
    aria-label="Pages"
    data-dash=""
    data-direction={direction ?? undefined}
    style={{ '--page': page, '--pages': count } as CSSProperties}
  >
    <span className="pager-thumb" aria-hidden="true" />
    {Array.from({ length: count }, (_unused, index) => (
      <button
        key={index}
        type="button"
        className="pager-dot"
        aria-label={`Page ${index + 1}`}
        aria-current={index === page ? 'page' : undefined}
        title={`Page ${index + 1}`}
        onClick={() => onGo(index)}
      />
    ))}
  </nav>
);
