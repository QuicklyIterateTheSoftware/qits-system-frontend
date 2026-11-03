import { provideBrowserGlobalErrorListeners, type ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideQitsBearerSignIn, qitsBearerInterceptor } from '@qits/angular';
import {
  provideQitsBuilds,
  provideQitsNavigation,
  provideQitsProjects,
  provideQitsScope,
} from '@qits/ui-components';

import { routes } from './app.routes';

/**
 * Nine providers, in the order every sibling repeats.
 *
 * - `provideBrowserGlobalErrorListeners` funnels genuinely-global errors and unhandled rejections
 *   into Angular's `ErrorHandler`.
 * - `provideRouter` carries this app's state: every level of it is a path segment, so each screen
 *   is bookmarkable and the back button works with no code.
 * - `provideQitsBearerSignIn({ clientId: 'qits-spa' })` signs this page in with the idp's public PKCE
 *   client and puts `/auth/callback` in front of the app's own routes (epic qits-543). `withFetch`
 *   is not a preference. The default XHR backend is invisible to OTLP fetch instrumentation, so
 *   choosing it would quietly forfeit client spans the moment this deployment grows a telemetry
 *   relay, and it is also what `qitsBearerInterceptor` needs to attach the bearer. Every call this
 *   app makes is a same-origin path behind the edge, and the bearer authenticates it now rather than
 *   the session cookie. The terminal socket carries the same bearer, offered as the `qits.bearer`
 *   subprotocol — a `WebSocket` cannot carry an `Authorization` header.
 * - `provideQitsNavigation` gives `QitsMainLayout` its left navigation, by asking the edge for
 *   `/main-navigation` once at startup. The tree is the edge's answer — derived from the deployments
 *   it actually routes — not a list compiled into @qits/ui-components; without this provider the
 *   chrome renders no links at all. It needs the `provideHttpClient` above.
 * - `provideQitsProjects` puts the project picker in the chrome's top-left slot, from one
 *   `GET /projects/api/projects`. Every resource on this platform belongs to a project, so which one
 *   is open is the outermost fact about a page rather than a filter inside one of them. It also
 *   installs the repositories of whatever project is in scope, which the sidebar draws.
 * - `provideQitsScope('system')` says how deep this application's own addresses go: not at all. Its
 *   pages are about the platform, so there is no `/<slug>/...` route here to rewrite — and that is
 *   why picking a project LEAVES for qits-projects rather than landing the reader on a 404 with the
 *   right URL. Without this the picker is not rendered at all, because a control that cannot say
 *   what is selected is worse than the brand text it replaced.
 * - `provideQitsBuilds` puts the pending-builds bolt beside that picker: a popover of what qits-ci
 *   is building right now, from `GET /ci/api/runs/active`. Same-origin like every other read here —
 *   the edge routes `/ci` on every vhost — so it needs the `provideHttpClient` above and names no
 *   origin of its own. Providing it is what puts the bolt there, exactly as no project source means
 *   no picker. Closed, it asks nothing at all; it polls only while a reader keeps the panel open.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideQitsBearerSignIn({ clientId: 'qits-spa' }),
    provideHttpClient(withFetch(), withInterceptors([qitsBearerInterceptor])),
    provideQitsNavigation(),
    provideQitsProjects(),
    provideQitsScope('system'),
    provideQitsBuilds(),
  ],
};
