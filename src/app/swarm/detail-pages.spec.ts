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
 * The one detail page left here: a node's facts. A service's own page moved to the landing app
 * (qits-2345), and a config's (qits-2349); `landing-redirect.spec.ts` covers both hand-offs.
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
      const page = await open('/swarm/nodes/n1/images');
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
      http.expectOne('/system/api/nodes/n1/images').flush([]);
      await settle();

      expect(text(page)).toContain('wohlben');
      expect(text(page)).toContain('16.0 GB');
      expect(text(page)).toContain('tier=platform');
      const tabs = Array.from(page.querySelectorAll('.tabs a')).map((link) =>
        link.textContent?.trim(),
      );
      expect(tabs).toEqual(['Containers', 'Images', 'Volumes', 'Networks']);
      expect(page.querySelector('.tabs a.current')?.textContent?.trim()).toBe('Images');
    });
  });
});
