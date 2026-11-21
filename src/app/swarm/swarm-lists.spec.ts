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
 * The remaining swarm listing — configs — in the states it can be in. `services` moved to the
 * landing app (qits-2344), `nodes` followed (qits-2346), and `secrets` followed too (qits-2350);
 * those hand-offs are covered by `landing-redirect.spec.ts`.
 *
 * It is its own spec, kept in this shape — a read, a table, an empty sentence and an error with a
 * retry — because asserting that shape is what keeps a copied page from quietly losing its empty
 * state — the state nobody notices is missing until a fresh platform shows a blank screen.
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
});
