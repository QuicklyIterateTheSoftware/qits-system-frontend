import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigationLinks } from '@qits/ui-components';
import { routes } from '../app.routes';
import { WEB_SOCKET_FACTORY } from '../api/web-socket';
import { FakeSockets } from '../testing/fake-socket';
import { settle as settleFixture } from '../testing/settle';

const EXEC = {
  id: 't5',
  kind: 'EXEC',
  container: { id: 'f3a9c2e18b7d', name: 'qits-platform-idp.1.abc' },
  shell: 'bash',
};

/**
 * One terminal page, and the three rules that decide whether an operator trusts it.
 *
 * **A clean close is the end.** The service writes its exit line and closes with 1000; the page
 * says the terminal is no longer running and the socket does not come back. Reconnecting into a
 * finished session is how a terminal ends up looping on "no longer running".
 *
 * **Leaving does not terminate.** The PTY outlives the page, which is what makes the URL worth
 * sharing — and what makes `Terminate` a `DELETE` rather than a socket close.
 *
 * **The back link is the query parameter the container table passed.** Without one it falls back to
 * the node list, which is always right and one click further.
 */
describe('TerminalPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;
  let sockets: FakeSockets;

  beforeEach(() => {
    sockets = new FakeSockets();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsNavigationLinks([]),
        { provide: WEB_SOCKET_FACTORY, useValue: sockets.open },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  const settle = () => settleFixture(harness.fixture);

  async function open(url = '/terminals/t5?node=n1'): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement as HTMLElement;
  }

  function text(element: HTMLElement): string {
    return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function button(element: HTMLElement, label: string): HTMLButtonElement | undefined {
    return Array.from(element.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(label),
    );
  }

  it('names what is running and where, and attaches straight away', async () => {
    const page = await open();
    expect(sockets.latest?.url).toBe(`ws://${location.host}/system/api/terminals/t5`);

    http.expectOne('/system/api/terminals/t5').flush(EXEC);
    await settle();

    expect(text(page)).toContain('bash in qits-platform-idp.1.abc');
    expect(text(page)).toContain('EXEC');
  });

  it('paints the frames the PTY sends', async () => {
    const page = await open();
    http.expectOne('/system/api/terminals/t5').flush(EXEC);
    await settle();

    sockets.latest?.connect();
    sockets.latest?.deliver('# whoami\r\nroot\r\n');
    await settle();

    expect(page.querySelector('pre')?.textContent).toContain('root');
  });

  it('tells the PTY its size when the socket opens', async () => {
    await open();
    http.expectOne('/system/api/terminals/t5').flush(EXEC);
    await settle();

    sockets.latest?.connect();
    expect(sockets.latest?.sent.some((frame) => frame.includes('"type":"resize"'))).toBe(true);
  });

  /** 1000 is the service saying the process is gone. Anything else is a restart, and reconnects. */
  it('treats a clean close as final and says so', async () => {
    const page = await open();
    http.expectOne('/system/api/terminals/t5').flush(EXEC);
    await settle();

    sockets.latest?.connect();
    sockets.latest?.serverClose(1000);
    await settle();

    expect(text(page)).toContain('This terminal is no longer running');
    expect(sockets.opened).toHaveLength(1);
    expect(button(page, 'Terminate')?.disabled).toBe(true);
  });

  /**
   * The back link's own URL hands off to the landing app (qits-2352) — `swarm/nodes/:id` mounts no
   * component of its own any more (qits-2355 retired the last reason it did, `NodePage`), so
   * landing there makes no request of this app at all; `LandingRedirect` is what actually renders.
   */
  it('terminates on request and goes back where the reader came from', async () => {
    const page = await open();
    http.expectOne('/system/api/terminals/t5').flush(EXEC);
    await settle();

    button(page, 'Terminate')?.click();
    const request = http.expectOne('/system/api/terminals/t5');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(router.url).toBe('/swarm/nodes/n1/containers');
    await settle();
  });

  it('says why a terminate did not happen, and stays put', async () => {
    const page = await open();
    http.expectOne('/system/api/terminals/t5').flush(EXEC);
    await settle();

    button(page, 'Terminate')?.click();
    http
      .expectOne('/system/api/terminals/t5')
      .flush({ message: 'no such terminal' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(text(page)).toContain('Could not terminate — 404 no such terminal');
    expect(router.url).toBe('/terminals/t5?node=n1');
  });

  /** The whole reason the id alone is the address: the PTY is not this page's to end. */
  it('detaches on the way out and terminates nothing', async () => {
    await open();
    http.expectOne('/system/api/terminals/t5').flush(EXEC);
    await settle();

    harness.fixture.destroy();

    expect(sockets.latest?.closedByClient).toBe(true);
    http.verify();
  });

  it('falls back to the node list when nobody said where the reader came from', async () => {
    const page = await open('/terminals/t5');
    http.expectOne('/system/api/terminals/t5').flush(EXEC);
    await settle();

    expect(text(page)).toContain('Back to the nodes');
  });

  /** A terminal whose row cannot be read is still a terminal a reader can type into. */
  it('attaches even when the row behind the title cannot be read', async () => {
    const page = await open();
    http
      .expectOne('/system/api/terminals/t5')
      .flush({ message: 'no such terminal' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(sockets.opened).toHaveLength(1);
    expect(text(page)).toContain('Could not read the terminal — 404 no such terminal');
  });
});
