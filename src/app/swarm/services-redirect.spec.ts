import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigation, provideQitsNavigationTree } from '@qits/ui-components';
import { routes } from '../app.routes';
import { NAVIGATE_AWAY } from '../ui/navigate-away';
import { LANDING_ORIGIN_WAIT_MS, ServicesRedirect } from './services-redirect';

/** Where the fixture navigation says `qits-landing` answers — its own host, not this one. */
const LANDING_ORIGIN = 'https://landing.qits.example';

/**
 * `swarm/services`, the swarm-wide listing moved to the landing app (qits-2344): the point of this
 * group is that the hand-off actually happens through real routing, rather than a stubbed
 * `ActivatedRoute` — `app.spec.ts` never instantiates this page either, so this is the only place
 * reaching this address through the real route table would show a wrong destination.
 */
describe('ServicesRedirect', () => {
  describe('reached through routing', () => {
    let harness: RouterTestingHarness;
    let navigateAway: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      navigateAway = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          provideRouter(routes),
          provideLocationMocks(),
          provideHttpClient(),
          provideHttpClientTesting(),
          provideQitsNavigationTree({ applications: { 'qits-landing': { origin: LANDING_ORIGIN } } }),
          { provide: NAVIGATE_AWAY, useValue: navigateAway },
        ],
      });
      harness = await RouterTestingHarness.create();
    });

    it('hands the swarm services listing off to the landing app', async () => {
      await harness.navigateByUrl('/swarm/services');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/system/swarm/services`);
    });
  });

  /**
   * The origin-resolution fallback chain, in isolation from the route table that decides this
   * component gets reached at all — the group above covers that.
   */
  describe('when the landing origin never answers', () => {
    function configure(...providers: unknown[]): { navigateAway: ReturnType<typeof vi.fn> } {
      const navigateAway = vi.fn();
      TestBed.configureTestingModule({
        providers: [{ provide: NAVIGATE_AWAY, useValue: navigateAway }, ...providers],
      });
      return { navigateAway };
    }

    /**
     * A navigation that never answers must not strand the reader on this page forever —
     * {@link LANDING_ORIGIN_WAIT_MS} is the backstop. Before that bound passes, and with no origin
     * known yet, the page says so rather than showing a link to nowhere; `provideQitsNavigation()`
     * makes the one real request this component waits on, and leaving it unflushed models a
     * navigation that is slow, or dead, rather than one that answered with nothing.
     */
    it('shows the fallback message while no origin is known, then falls back to a relative path', async () => {
      vi.useFakeTimers();
      try {
        const { navigateAway } = configure(
          provideHttpClient(),
          provideHttpClientTesting(),
          provideQitsNavigation(),
        );
        const fixture = TestBed.createComponent(ServicesRedirect);
        fixture.detectChanges();
        const http = TestBed.inject(HttpTestingController);
        http.expectOne('/main-navigation');
        expect(navigateAway).not.toHaveBeenCalled();

        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('The swarm services moved to the landing app');
        expect(fixture.nativeElement.querySelector('a')).toBeNull();

        await vi.advanceTimersByTimeAsync(LANDING_ORIGIN_WAIT_MS);
        fixture.detectChanges();

        // Neither qits-landing's own origin nor the environment's is known without an answer, so
        // the last fallback — same-origin, a bare path — is what the reader gets rather than a hang.
        expect(navigateAway).toHaveBeenCalledWith('/system/swarm/services');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
