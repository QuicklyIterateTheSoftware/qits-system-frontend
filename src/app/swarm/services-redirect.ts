import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { QitsAppLinks } from '@qits/ui-components';
import { NAVIGATE_AWAY } from '../ui/navigate-away';

/**
 * How long this page waits for the navigation to name `qits-landing`'s origin before giving up on
 * it and using whatever `QitsAppLinks.environmentOrigin` already answers.
 *
 * This can be the very first thing a browser requests, with no chrome mounted yet to have asked
 * the navigation the question first, so it waits itself, briefly, rather than firing at an origin
 * it has not actually been told yet. Ported from qits-artifacts-frontend's `RepositoryRedirect` and
 * qits-events-frontend's `landingOrigin` (qits-2338), where the same rule serves their own
 * hand-off pages.
 */
export const LANDING_ORIGIN_WAIT_MS = 1500;

/**
 * Where `qits-landing` answers: `QitsAppLinks.origin` first, `environmentOrigin` second — which on
 * this platform *is* the apex landing serves from — empty third, past {@link LANDING_ORIGIN_WAIT_MS}.
 *
 * `whenApiOrigin('qits-landing')` settles the moment the navigation does, which on a warm platform
 * is a single microtask. Past the bound the wait is abandoned and `environmentOrigin` is read as
 * it stands right now instead, so a reader is never left on this page by a navigation that is
 * merely slow — or that never answers at all.
 */
async function landingOrigin(links: QitsAppLinks): Promise<string> {
  const settled = links
    .whenApiOrigin('qits-landing')
    .then(() => links.origin('qits-landing') ?? links.environmentOrigin() ?? '');
  const bound = new Promise<string>((resolve) => {
    setTimeout(() => resolve(links.environmentOrigin() ?? ''), LANDING_ORIGIN_WAIT_MS);
  });
  return Promise.race([settled, bound]);
}

/** The landing app's own path for this page's one address. */
const LANDING_PATH = '/system/swarm/services';

/**
 * `swarm/services` — the swarm-wide service listing moved to the landing app (qits-2344), at
 * `<landing origin>/system/swarm/services`. `swarm/services/:id`, a single service's own page,
 * stayed here and is untouched.
 *
 * This draws almost nothing of its own: a message naming where the page went, with a link to it,
 * for as long as the hand-off itself is still in flight — and the hand-off is what actually sends
 * a reader there, through {@link NAVIGATE_AWAY} rather than the router, because the destination is
 * a different Angular application and a `routerLink` would compile and go nowhere.
 *
 * Copied from qits-artifacts-frontend's `RepositoryRedirect` and qits-events-frontend's
 * `ProjectRedirect`/`EventRedirect` (qits-2338), the same shape of hand-off for their own moved
 * pages.
 */
@Component({
  selector: 'app-services-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>
      The swarm services moved to the landing app.
      @if (href(); as url) {
        <a [href]="url">{{ url }}</a>
      } @else {
        <span>Resolving the landing app's address…</span>
      }
    </p>
  `,
})
export class ServicesRedirect {
  /** The landing app's address for this page, once an origin for it is known. */
  protected readonly href = signal<string | undefined>(undefined);

  constructor() {
    const links = inject(QitsAppLinks);
    const navigateAway = inject(NAVIGATE_AWAY);
    void landingOrigin(links).then((origin) => {
      const url = `${origin.replace(/\/+$/, '')}${LANDING_PATH}`;
      this.href.set(url);
      navigateAway(url);
    });
  }
}
