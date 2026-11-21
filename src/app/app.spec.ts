import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QitsNavSubmenuSlot, provideQitsNavigationLinks } from '@qits/ui-components';
import { App } from './app';
import { routes } from './app.routes';
import { WEB_SOCKET_FACTORY } from './api/web-socket';
import { FakeSockets } from './testing/fake-socket';
import { NAVIGATE_AWAY } from './ui/navigate-away';

/**
 * A fixture navigation, not the platform's. `provideQitsNavigationLinks` answers the layout's
 * `QITS_NAVIGATION` from a literal, so the chrome makes no `/main-navigation` request — which is
 * what keeps `http.verify()` honest instead of failing on a call this file never asked for.
 */
const NAV = [
  { label: 'Deployments', href: '/platform-deployments/' },
  { label: 'System', href: '/system/' },
] as const;

/**
 * The shell owns two things — the outlet and the sub-menu — so those are what is asserted here,
 * plus the route table putting every door inside the chrome.
 *
 * The layout assertion is not ceremony. These pages are an administrator's, and one accidentally
 * mounted outside `QitsMainLayout` would be a screen that opens root shells on the deployment host
 * with no way back to anything — invisible on the page itself and a two-character edit away in this
 * table.
 */
describe('App', () => {
  let http: HttpTestingController;
  let sockets: FakeSockets;

  beforeEach(() => {
    sockets = new FakeSockets();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsNavigationLinks(NAV),
        { provide: WEB_SOCKET_FACTORY, useValue: sockets.open },
        // The hand-off at `/swarm/nodes`, `/swarm/nodes/:id`, `/swarm/configs` and `/swarm/secrets`
        // fires this the moment it mounts; nothing here tests where it goes —
        // `landing-redirect.spec.ts` does — so this keeps it from ever reaching jsdom's
        // unimplemented real navigation.
        { provide: NAVIGATE_AWAY, useValue: () => undefined },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /**
   * The sub-menu is *offered*, not drawn: it is an `<ng-template>` the layout renders somewhere
   * else, so the shell on its own paints an outlet and nothing at all.
   */
  it('is an outlet and an offered sub-menu, and no page of its own', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const shell = fixture.nativeElement as HTMLElement;
    expect(shell.querySelector('router-outlet')).not.toBeNull();
    expect(shell.querySelector('h1')).toBeNull();
    expect(TestBed.inject(QitsNavSubmenuSlot).template()).not.toBeNull();
    http.verify();
  });

  it('draws the overview at the base path, inside the chrome', async () => {
    const harness = await RouterTestingHarness.create('/');
    http.expectOne('/system/api/overview').flush({
      host: {
        hostname: 'wohlben',
        os: 'Fedora 42',
        cpus: 8,
        memoryBytes: 16e9,
        dockerVersion: '28.5.2',
      },
      swarm: { state: 'active', nodeId: 'n1', managers: 1, nodes: 1 },
    });
    http.expectOne('/system/api/terminals').flush({ id: 't1', kind: 'GLANCES', container: null });
    await harness.fixture.whenStable();

    const layout = harness.routeNativeElement as HTMLElement;
    expect(layout.tagName.toLowerCase()).toBe('qits-main-layout');
    expect(layout.querySelectorAll('nav a').length).toBeGreaterThanOrEqual(NAV.length);
    expect(layout.querySelector('main app-overview-page')).not.toBeNull();
    http.verify();
  });

  it('routes each swarm listing to its page, still inside the chrome', async () => {
    const harness = await RouterTestingHarness.create('/swarm/nodes');
    await harness.fixture.whenStable();
    expect(
      (harness.routeNativeElement as HTMLElement).querySelector('main app-landing-redirect'),
    ).not.toBeNull();

    await harness.navigateByUrl('/swarm/configs');
    await harness.fixture.whenStable();
    expect(
      (harness.routeNativeElement as HTMLElement).querySelector('main app-landing-redirect'),
    ).not.toBeNull();

    await harness.navigateByUrl('/swarm/secrets');
    await harness.fixture.whenStable();
    expect(
      (harness.routeNativeElement as HTMLElement).querySelector('main app-landing-redirect'),
    ).not.toBeNull();

    http.verify();
  });

  /**
   * The bare node path hands off to the landing app now (qits-2347) — `landing-redirect.spec.ts`
   * covers where it goes and the id encoding. Its four tab children stay on `NodePage` here.
   */
  it('hands the bare node path off to the landing app', async () => {
    const harness = await RouterTestingHarness.create('/swarm/nodes/n1');
    await harness.fixture.whenStable();
    expect(
      (harness.routeNativeElement as HTMLElement).querySelector('main app-landing-redirect'),
    ).not.toBeNull();
    http.verify();
  });

  it('still renders the containers tab on NodePage at the tab child route', async () => {
    const harness = await RouterTestingHarness.create('/swarm/nodes/n1/containers');
    http.expectOne('/system/api/swarm/nodes/n1').flush({
      id: 'n1',
      hostname: 'wohlben',
      role: 'manager',
      availability: 'Active',
      status: 'Ready',
    });
    http.expectOne((candidate) => candidate.url === '/system/api/nodes/n1/containers').flush([]);
    await harness.fixture.whenStable();

    const layout = harness.routeNativeElement as HTMLElement;
    expect(layout.querySelector('main app-node-page app-node-containers-tab')).not.toBeNull();
    http.verify();
  });

  it('routes a terminal id to its page and attaches a socket', async () => {
    const harness = await RouterTestingHarness.create('/terminals/t9?node=n1');
    http
      .expectOne('/system/api/terminals/t9')
      .flush({ id: 't9', kind: 'EXEC', container: { id: 'abc', name: 'qits-idp.1' }, shell: 'sh' });
    await harness.fixture.whenStable();

    const layout = harness.routeNativeElement as HTMLElement;
    expect(layout.querySelector('main app-terminal-page')).not.toBeNull();
    expect(sockets.latest?.url).toBe(`ws://${location.host}/system/api/terminals/t9`);
    http.verify();
  });

  it('draws an unknown URL under /system/ as a page, still inside the chrome', async () => {
    const harness = await RouterTestingHarness.create('/nothing-here');

    const layout = harness.routeNativeElement as HTMLElement;
    expect(layout.tagName.toLowerCase()).toBe('qits-main-layout');
    expect(layout.querySelector('main app-not-found')).not.toBeNull();
    http.verify();
  });
});
