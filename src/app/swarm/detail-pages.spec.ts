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
 * The two detail pages left here: a node's facts, and a config's contents. A service's own page
 * moved to the landing app (qits-2345); `landing-redirect.spec.ts` covers its hand-off.
 *
 * The assertion worth having is the one a copied page loses: a config must draw its data as the
 * bytes it is, unformatted.
 */
describe('the detail pages', () => {
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

  const settle = () => settleFixture(harness.fixture);

  async function open(url: string): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement as HTMLElement;
  }

  function text(element: HTMLElement): string {
    return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  describe('a node', () => {
    it('draws its facts and offers the four resource tabs', async () => {
      const page = await open('/swarm/nodes/n1/containers');
      http.expectOne('/system/api/swarm/nodes/n1').flush({
        id: 'n1',
        hostname: 'wohlben',
        role: 'manager',
        availability: 'Active',
        status: 'Ready',
        engineVersion: '28.5.2',
        cpus: 8,
        memoryBytes: 16_000_000_000,
        labels: { tier: 'platform' },
      });
      http.expectOne((candidate) => candidate.url === '/system/api/nodes/n1/containers').flush([]);
      await settle();

      expect(text(page)).toContain('wohlben');
      expect(text(page)).toContain('16.0 GB');
      expect(text(page)).toContain('tier=platform');
      const tabs = Array.from(page.querySelectorAll('.tabs a')).map((link) =>
        link.textContent?.trim(),
      );
      expect(tabs).toEqual(['Containers', 'Images', 'Volumes', 'Networks']);
      expect(page.querySelector('.tabs a.current')?.textContent?.trim()).toBe('Containers');
    });
  });

  describe('a config', () => {
    /** Bytes as stored: pretty-printing what looked like JSON would change what a reader believes. */
    it('draws the data as the text it is', async () => {
      const page = await open('/swarm/configs/c1');
      http.expectOne('/system/api/swarm/configs/c1').flush({
        id: 'c1',
        name: 'edge-routes',
        createdAt: '2026-08-20T10:00:00Z',
        labels: { tier: 'platform' },
        data: 'routes:\n  - /system\n',
      });
      await settle();

      expect(page.querySelector('pre.data')?.textContent).toBe('routes:\n  - /system\n');
      expect(text(page)).toContain('edge-routes');
      expect(text(page)).toContain('tier=platform');
    });

    it('says a config is empty rather than drawing an empty box', async () => {
      const page = await open('/swarm/configs/c2');
      http.expectOne('/system/api/swarm/configs/c2').flush({ id: 'c2', name: 'blank', data: '' });
      await settle();

      expect(page.querySelector('pre.data')).toBeNull();
      expect(text(page)).toContain('This config is empty');
    });
  });
});
