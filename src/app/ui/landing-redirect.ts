import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, type ActivatedRouteSnapshot } from '@angular/router';
import { QitsAppLinks } from '@qits/ui-components';
import { NAVIGATE_AWAY } from './navigate-away';

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

/**
 * What a route mounting {@link LandingRedirect} must say in its own `data`: where the landing app
 * answers for this address, and the sentence telling a reader that is where their page went.
 */
export interface LandingRedirectData {
  /**
   * The landing app's own path for this page's one address, e.g. `/system/swarm/services`. May
   * carry a literal `:id` segment, for a route whose own path matches one too (e.g.
   * `swarm/services/:id`) — it is replaced with that route's matched `id` param, percent-encoded,
   * because a reader's id can hold anything a path segment cannot.
   */
  readonly landingPath: string;
  /** The sentence shown while the hand-off is still in flight, e.g. `The swarm services moved to
   * the landing app.` */
  readonly moved: string;
}

/** {@link LandingRedirectData.landingPath}, with any `:id` filled from the matched route. */
function resolveLandingPath(landingPath: string, snapshot: ActivatedRouteSnapshot): string {
  if (!landingPath.includes(':id')) {
    return landingPath;
  }
  return landingPath.replace(':id', encodeURIComponent(snapshot.paramMap.get('id') ?? ''));
}

/**
 * The hand-off for every System page that moved to the landing app — `swarm/services` first
 * (qits-2344), `swarm/nodes` next (qits-2346), `swarm/services/:id` next (qits-2345), `targets` next
 * (qits-2351), and later siblings as they move too. Each mounting route says where it goes and what
 * to tell the reader through its own `data`, typed by {@link LandingRedirectData}.
 *
 * This draws almost nothing of its own: the route's own sentence naming where the page went, with
 * a link to it, for as long as the hand-off itself is still in flight — and the hand-off is what
 * actually sends a reader there, through {@link NAVIGATE_AWAY} rather than the router, because the
 * destination is a different Angular application and a `routerLink` would compile and go nowhere.
 *
 * Copied from qits-artifacts-frontend's `RepositoryRedirect` and qits-events-frontend's
 * `ProjectRedirect`/`EventRedirect` (qits-2338), the same shape of hand-off for their own moved
 * pages.
 */
@Component({
  selector: 'app-landing-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>
      {{ moved() }}
      @if (href(); as url) {
        <a [href]="url">{{ url }}</a>
      } @else {
        <span>Resolving the landing app's address…</span>
      }
    </p>
  `,
})
export class LandingRedirect {
  /** The sentence this route's `data` named, naming the page that moved. */
  protected readonly moved = signal('');

  /** The landing app's address for this page, once an origin for it is known. */
  protected readonly href = signal<string | undefined>(undefined);

  constructor() {
    const links = inject(QitsAppLinks);
    const navigateAway = inject(NAVIGATE_AWAY);
    const snapshot = inject(ActivatedRoute).snapshot;
    const data = snapshot.data as LandingRedirectData;
    this.moved.set(data.moved);
    const path = resolveLandingPath(data.landingPath, snapshot);
    void landingOrigin(links).then((origin) => {
      const url = `${origin.replace(/\/+$/, '')}${path}`;
      this.href.set(url);
      navigateAway(url);
    });
  }
}
