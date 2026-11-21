import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigation, provideQitsNavigationTree } from '@qits/ui-components';
import { routes } from '../app.routes';
import { NAVIGATE_AWAY } from './navigate-away';
import {
  LANDING_ORIGIN_WAIT_MS,
  LandingRedirect,
  type LandingRedirectData,
} from './landing-redirect';

/** Where the fixture navigation says `qits-landing` answers — its own host, not this one. */
const LANDING_ORIGIN = 'https://landing.qits.example';

/**
 * The hand-off every moved System page mounts — `swarm/services` (qits-2344), `swarm/nodes`
 * (qits-2346), `swarm/nodes/:id` (qits-2347), `swarm/services/:id` (qits-2345), `swarm/configs`
 * (qits-2348), `swarm/configs/:id` (qits-2349), `swarm/secrets` (qits-2350), `targets` (qits-2351),
 * `swarm/nodes/:id/images` (qits-2353), `swarm/nodes/:id/networks` (qits-2354) and
 * `swarm/nodes/:id/volumes` (qits-2355) so far — the point of this group is that the hand-off
 * actually happens through real routing, rather than a stubbed `ActivatedRoute` — `app.spec.ts`
 * never instantiates this page either, so this is the only place reaching one of these addresses
 * through the real route table would show a wrong destination.
 */
describe('LandingRedirect', () => {
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
          provideQitsNavigationTree({
            applications: { 'qits-landing': { origin: LANDING_ORIGIN } },
          }),
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

    it('hands the swarm nodes listing off to the landing app', async () => {
      await harness.navigateByUrl('/swarm/nodes');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/system/swarm/nodes`);
    });

    it('hands the swarm configs listing off to the landing app', async () => {
      await harness.navigateByUrl('/swarm/configs');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/system/swarm/configs`);
    });

    it('hands the swarm secrets listing off to the landing app', async () => {
      await harness.navigateByUrl('/swarm/secrets');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/system/swarm/secrets`);
    });

    /** The id rides through `:id` in `landingPath`, percent-encoded — not copied from the URL as-is. */
    it('hands one swarm service off to the landing app, with its id encoded', async () => {
      await harness.navigateByUrl('/swarm/services/dev%20x');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/system/swarm/services/dev%20x`);
    });

    /**
     * The bare node path hands off; of its tab children, `images`, `volumes` and `networks` do too
     * (below) — the remaining one, Containers, stays on `NodePage`, which `app.spec.ts` covers.
     */
    it('hands one swarm node off to the landing app, with its id encoded', async () => {
      await harness.navigateByUrl('/swarm/nodes/dev%20x');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/system/swarm/nodes/dev%20x`);
    });

    /** The id comes off the parent `:id` route, not this child's own path. */
    it("hands one node's images off to the landing app, with its id encoded", async () => {
      await harness.navigateByUrl('/swarm/nodes/dev%20x/images');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(
        `${LANDING_ORIGIN}/system/swarm/nodes/dev%20x/images`,
      );
    });

    /**
     * The `networks` tab's `:id` belongs to the parent `swarm/nodes/:id` route, not to this child
     * route itself — the case `landing-redirect.ts`'s `findIdParam` walk was added for (qits-2353,
     * qits-2354). The id still rides through `landingPath`'s `:id`, percent-encoded, same as every
     * other one.
     */
    it("hands one node's networks off to the landing app, with its id encoded", async () => {
      await harness.navigateByUrl('/swarm/nodes/a%2Fb/networks');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(
        `${LANDING_ORIGIN}/system/swarm/nodes/a%2Fb/networks`,
      );
    });

    /** The `volumes` tab's `:id` belongs to the parent `swarm/nodes/:id` route too (qits-2355). */
    it("hands one node's volumes off to the landing app, with its id encoded", async () => {
      await harness.navigateByUrl('/swarm/nodes/a%2Fb/volumes');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(
        `${LANDING_ORIGIN}/system/swarm/nodes/a%2Fb/volumes`,
      );
    });

    /** The id rides through `:id` in `landingPath`, percent-encoded — not copied from the URL as-is. */
    it('hands one swarm config off to the landing app, with its id encoded', async () => {
      await harness.navigateByUrl('/swarm/configs/dev%20x');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/system/swarm/configs/dev%20x`);
    });

    it('hands the targets listing off to the landing app', async () => {
      await harness.navigateByUrl('/targets');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/system/targets`);
    });
  });

  /**
   * The origin-resolution fallback chain, and the route `data` this component reads, in isolation
   * from the route table that decides which page gets reached at all — the group above covers that.
   */
  describe('when the landing origin never answers', () => {
    const DATA: LandingRedirectData = {
      landingPath: '/system/swarm/services',
      moved: 'The swarm services moved to the landing app.',
    };

    function configure(...providers: unknown[]): { navigateAway: ReturnType<typeof vi.fn> } {
      const navigateAway = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          { provide: NAVIGATE_AWAY, useValue: navigateAway },
          { provide: ActivatedRoute, useValue: { snapshot: { data: DATA } } },
          ...providers,
        ],
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
        const fixture = TestBed.createComponent(LandingRedirect);
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
