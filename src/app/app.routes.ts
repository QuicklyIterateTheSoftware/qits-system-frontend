import type { Routes } from '@angular/router';
import { QitsMainLayout } from '@qits/ui-components';
import { NotFound } from './not-found/not-found';

/**
 * Every address of this app, all of them inside the platform chrome.
 *
 * **`QitsMainLayout` is the root route component** — the platform's convention, stated in the
 * component's own docs. Mounted this way the bar and the navigation mount once and survive every
 * navigation beneath them; wrapping each page in a tag would rebuild the whole skeleton on every
 * hop. It is an eager import for that reason: it is not a page, it is the frame the pages arrive
 * in, and a frame that loaded in its own chunk would show a blank application while it did.
 *
 * **The path shape repeats the API's, noun for noun.** `/swarm/services/qits-platform-idp` is the
 * page for what `GET /system/api/swarm/services/qits-platform-idp` answers.
 *
 * **Every address here starts at the root**, because this application is served at `/` on its own
 * host. It is a `system` app: what it shows is the machine the whole platform runs on, which belongs
 * to no project, so it has no `/<slug>/...` form and adds none — picking a project in the chrome
 * leaves for qits-projects instead. The API and the terminal socket keep their segment and are
 * path-routed on every host, so nothing below changes address.
 *
 * **A node's four resource lists are child routes, not a tab widget.** `…/containers`, `…/images`,
 * `…/volumes` and `…/networks` are each a URL a reader can paste and the back button can return to;
 * a tab held in a signal would leave every one of them as the same address. The bare node path
 * redirects to `containers`, because that is the list an operator opens a node for.
 *
 * **A terminal is addressed by its own id and nothing else.** It outlives the page that opened it —
 * a reader can reload, or send the link to a colleague, and land back on the same PTY. The node it
 * was opened from rides along as a query parameter so the back link knows where to go; it is view
 * state rather than identity, which is exactly what a query parameter is for.
 *
 * **Every one of these is a deep link a reader will paste.** They survive a reload only because
 * qits-platform-system sets `quarkus.quinoa.enable-spa-routing=true`, which answers an unknown path
 * with `index.html` instead of a 404; `/system` — and with it `/system/api` and `/system/q` — is held
 * back from that by `quarkus.quinoa.ignored-path-prefixes`.
 */
export const routes: Routes = [
  {
    path: '',
    component: QitsMainLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./overview/overview-page').then((m) => m.OverviewPage),
      },
      {
        path: 'targets',
        pathMatch: 'full',
        loadComponent: () => import('./targets/targets-page').then((m) => m.TargetsPage),
      },
      {
        path: 'swarm/nodes',
        pathMatch: 'full',
        loadComponent: () => import('./swarm/nodes-page').then((m) => m.NodesPage),
      },
      {
        path: 'swarm/nodes/:id',
        loadComponent: () => import('./swarm/node-page').then((m) => m.NodePage),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'containers' },
          {
            path: 'containers',
            loadComponent: () =>
              import('./swarm/node-containers-tab').then((m) => m.NodeContainersTab),
          },
          {
            path: 'images',
            loadComponent: () => import('./swarm/node-images-tab').then((m) => m.NodeImagesTab),
          },
          {
            path: 'volumes',
            loadComponent: () => import('./swarm/node-volumes-tab').then((m) => m.NodeVolumesTab),
          },
          {
            path: 'networks',
            loadComponent: () => import('./swarm/node-networks-tab').then((m) => m.NodeNetworksTab),
          },
        ],
      },
      {
        path: 'swarm/services',
        pathMatch: 'full',
        loadComponent: () => import('./swarm/services-page').then((m) => m.ServicesPage),
      },
      {
        path: 'swarm/services/:id',
        loadComponent: () => import('./swarm/service-page').then((m) => m.ServicePage),
      },
      {
        path: 'swarm/configs',
        pathMatch: 'full',
        loadComponent: () => import('./swarm/configs-page').then((m) => m.ConfigsPage),
      },
      {
        path: 'swarm/configs/:id',
        loadComponent: () => import('./swarm/config-page').then((m) => m.ConfigPage),
      },
      {
        path: 'swarm/secrets',
        loadComponent: () => import('./swarm/secrets-page').then((m) => m.SecretsPage),
      },
      {
        path: 'terminals/:id',
        loadComponent: () => import('./terminals/terminal-page').then((m) => m.TerminalPage),
      },
      { path: '**', component: NotFound },
    ],
  },
];
