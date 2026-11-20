import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigationLinks } from '@qits/ui-components';
import { routes } from '../app.routes';
import { settle as settleFixture } from '../testing/settle';

/**
 * The remaining swarm listings — nodes, configs and secrets — in the states any of them can be in.
 * `services` moved to the landing app (qits-2344); `services-redirect.spec.ts` covers its hand-off.
 *
 * They are one spec rather than three because they are one shape: a read, a table, an empty sentence
 * and an error with a retry. Asserting that shape once per page is what keeps a copied page from
 * quietly losing its empty state — the state nobody notices is missing until a fresh platform shows
 * a blank screen.
 */
describe('the swarm listings', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsNavigationLinks([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function open(url: string): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement as HTMLElement;
  }

  const settle = () => settleFixture(harness.fixture);

  function text(element: HTMLElement): string {
    return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function rows(element: HTMLElement): number {
    return element.querySelectorAll('tbody tr').length;
  }

  describe('nodes', () => {
    const NODE = {
      id: 'x7k2m9p4q1w8e3r6t5y0u2i4o',
      hostname: 'wohlben',
      role: 'manager',
      availability: 'Active',
      status: 'Ready',
      managerStatus: 'Leader',
      engineVersion: '28.5.2',
      address: '10.0.0.1',
    };

    it('says it is working before the answer arrives', async () => {
      const page = await open('/swarm/nodes');
      expect(text(page)).toContain('Loading the nodes');
      http.expectOne('/system/api/swarm/nodes').flush([]);
      await settle();
    });

    it('draws a row per node, with the short id docker prints', async () => {
      const page = await open('/swarm/nodes');
      http.expectOne('/system/api/swarm/nodes').flush([NODE]);
      await settle();

      expect(rows(page)).toBe(1);
      expect(text(page)).toContain('wohlben');
      expect(text(page)).toContain('x7k2m9p4q1w8');
      expect(text(page)).toContain('Leader');
      expect(text(page)).toContain('1 node.');
    });

    /** A blank table and a failed read look identical, and mean opposite things. */
    it('says so rather than drawing nothing when the swarm is empty', async () => {
      const page = await open('/swarm/nodes');
      http.expectOne('/system/api/swarm/nodes').flush([]);
      await settle();

      expect(rows(page)).toBe(0);
      expect(text(page)).toContain('The manager reports no nodes');
    });

    it('reports a failed read in the service’s own words, with a retry', async () => {
      const page = await open('/swarm/nodes');
      http
        .expectOne('/system/api/swarm/nodes')
        .flush({ message: 'docker is unreachable' }, { status: 503, statusText: 'Unavailable' });
      await settle();

      expect(text(page)).toContain('Could not load the nodes — 503 docker is unreachable');

      const retry = Array.from(page.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Retry'),
      );
      retry?.click();
      http.expectOne('/system/api/swarm/nodes').flush([NODE]);
      await settle();
      expect(rows(page)).toBe(1);
    });
  });

  describe('configs', () => {
    it('lists configs and counts their labels', async () => {
      const page = await open('/swarm/configs');
      http
        .expectOne('/system/api/swarm/configs')
        .flush([{ id: 'c1', name: 'edge-routes', labels: { owner: 'qits', tier: 'platform' } }]);
      await settle();

      expect(rows(page)).toBe(1);
      expect(text(page)).toContain('edge-routes');
      expect(text(page)).toContain('2');
    });
  });

  describe('secrets', () => {
    /** The promise this page must keep: metadata, and a sentence saying why that is all. */
    it('shows metadata and says a value is not something swarm gives back', async () => {
      const page = await open('/swarm/secrets');
      http
        .expectOne('/system/api/swarm/secrets')
        .flush([{ id: 'k1', name: 'idp-signing-key', createdAt: '2026-08-20T10:00:00Z' }]);
      await settle();

      expect(text(page)).toContain('idp-signing-key');
      expect(text(page)).toContain('Metadata only');
      expect(text(page)).not.toContain('Value');
    });
  });
});
