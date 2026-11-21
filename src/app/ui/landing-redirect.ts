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

/**
 * The matched route's `id` param, read off `snapshot` itself or, failing that, its nearest
 * ancestor that has one — needed because `swarm/nodes/:id/images` (qits-2353),
 * `swarm/nodes/:id/containers` (qits-2352), `swarm/nodes/:id/networks` (qits-2354) and
 * `swarm/nodes/:id/volumes` (qits-2355) all mount this page as a child of `:id` rather than at the
 * segment that carries it. The parent `swarm/nodes/:id` route holds no component of its own any
 * more — every one of its children is this page — but it still contributes an
 * `ActivatedRouteSnapshot` of its own to walk up to: a component-less route still matches a path
 * segment and still carries that segment's params.
 */
function findIdParam(snapshot: ActivatedRouteSnapshot): string {
  for (let route: ActivatedRouteSnapshot | null = snapshot; route; route = route.parent) {
    const id = route.paramMap.get('id');
    if (id !== null) {
      return id;
    }
  }
  return '';
}

/** {@link LandingRedirectData.landingPath}, with any `:id` filled from the matched route. */
function resolveLandingPath(landingPath: string, snapshot: ActivatedRouteSnapshot): string {
  if (!landingPath.includes(':id')) {
    return landingPath;
  }
  return landingPath.replace(':id', encodeURIComponent(findIdParam(snapshot)));
}

/**
 * The reader's own query string, verbatim — e.g. `?node=my0ms2bdz5` — or `''` when there is none.
 *
 * Read off `queryParamMap` rather than copied from the browser's own URL: a route can be reached
 * with the same query parameter repeated, which `queryParamMap.getAll` keeps and a single string
 * read would silently drop to its last value. `URLSearchParams` is what both encodes a value that
 * needs it (`node=a b` becomes `node=a+b`) and renders nothing at all when the map is empty, so a
 * mounting route that carries no query parameters hands off to a bare path rather than a trailing
 * `?`.
 */
function resolveQueryString(snapshot: ActivatedRouteSnapshot): string {
  const map = snapshot.queryParamMap;
  if (!map) {
    return '';
  }
  const params = new URLSearchParams();
  for (const key of map.keys) {
    for (const value of map.getAll(key)) {
      params.append(key, value);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * The hand-off for every System page that moved to the landing app — `swarm/services` first
 * (qits-2344), `swarm/nodes` next (qits-2346), `swarm/nodes/:id` next (qits-2347),
 * `swarm/services/:id` next (qits-2345), `swarm/configs` next (qits-2348), `swarm/configs/:id` next
 * (qits-2349), `targets` next (qits-2351), a node's `images` tab next (qits-2353), a node's
 * `containers` tab next (qits-2352), a node's `networks` tab next (qits-2354), a node's `volumes`
 * tab next (qits-2355), `terminals/:id` last (qits-2356) — with it, every one of a node's four
 * resource tabs, and the node page itself, and a terminal, lives here rather than in this
 * application. Each mounting route says where it goes and what to tell the reader through its own
 * `data`, typed by {@link LandingRedirectData}.
 *
 * This draws almost nothing of its own: the route's own sentence naming where the page went, with
 * a link to it, for as long as the hand-off itself is still in flight — and the hand-off is what
 * actually sends a reader there, through {@link NAVIGATE_AWAY} rather than the router, because the
 * destination is a different Angular application and a `routerLink` would compile and go nowhere.
 *
 * **Every query parameter of the address a reader actually hit rides along.** `terminals/:id`
 * (qits-2356) is why: its `node` parameter is the back link's only way home, and it is exactly as
 * much view state in the landing app as it was here. {@link resolveQueryString} copies the whole
 * query string rather than naming `node` alone, so a mounting route with query parameters of its
 * own needs nothing extra to carry them too; a route reached with none hands off to a bare path,
 * with no trailing `?`.
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
    const path = resolveLandingPath(data.landingPath, snapshot) + resolveQueryString(snapshot);
    void landingOrigin(links).then((origin) => {
      const url = `${origin.replace(/\/+$/, '')}${path}`;
      this.href.set(url);
      navigateAway(url);
    });
  }
}
