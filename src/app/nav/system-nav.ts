import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';

/** One line of the menu: a heading, or a link with the rule that decides when it is current. */
interface Entry {
  readonly heading?: string;
  readonly path?: string;
  readonly label?: string;
  readonly matches?: (segments: readonly string[]) => boolean;
}

/**
 * The menu, in the order a reader meets it.
 *
 * **The headings are not links**, and that is the whole reason they are rows in this list rather
 * than a second structure: "System" and "Swarm" are two questions about one machine, and a reader
 * scanning six entries needs to know which of them is cluster-wide before clicking. Nothing sits
 * at `/swarm` on its own, so a link there would be a dead end.
 *
 * **A terminal belongs to whatever opened it.** An exec terminal is reached from a node's container
 * table, so `terminals/:id` keeps Nodes current; the glances terminal is the overview itself.
 *
 * **Targets sits under "System" beside Overview, not under "Swarm" (epic qits-1481).** A target is
 * a machine qits-system-runner-daemon can place CI, workspace or desk slots on — the fleet, not the
 * one swarm Overview and Swarm already describe — so it answers the same question Overview does
 * ("what is the platform running on") rather than Swarm's ("what is this one swarm doing").
 */
const ENTRIES: readonly Entry[] = [
  { heading: 'System' },
  {
    path: '/',
    label: 'Overview',
    matches: (segments) => segments.length === 0,
  },
  {
    path: '/targets',
    label: 'Targets',
    matches: (segments) => segments[0] === 'targets',
  },
  { heading: 'Swarm' },
  {
    path: '/swarm/nodes',
    label: 'Nodes',
    // A terminal is opened from a container table, which lives under a node.
    matches: (segments) =>
      (segments[0] === 'swarm' && segments[1] === 'nodes') || segments[0] === 'terminals',
  },
  {
    path: '/swarm/services',
    label: 'Services',
    matches: (segments) => segments[0] === 'swarm' && segments[1] === 'services',
  },
  {
    path: '/swarm/configs',
    label: 'Configs',
    matches: (segments) => segments[0] === 'swarm' && segments[1] === 'configs',
  },
  {
    path: '/swarm/secrets',
    label: 'Secrets',
    matches: (segments) => segments[0] === 'swarm' && segments[1] === 'secrets',
  },
];

/**
 * This application's own menu, under its entry in the platform navigation.
 *
 * <p>The selection is derived from the router rather than held here: a reader arriving on a deep
 * link, or pressing back, must leave the menu showing the view actually on screen. That is also why
 * the match is a function of the URL and not `routerLinkActive` — `/` would otherwise be active on
 * every page, since every path starts with it.
 *
 * <p>Declared by the shell, not by a page: `RouterOutlet` destroys the outgoing component after
 * creating the incoming one, so a declaration inside a page would be torn down and rebuilt on every
 * hop, in a menu that did not itself change.
 */
@Component({
  selector: 'app-system-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <nav aria-label="System views">
      @for (entry of entries(); track entry.key) {
        @if (entry.heading) {
          <p class="heading">{{ entry.heading }}</p>
        } @else {
          <a
            [routerLink]="entry.path"
            [class.current]="entry.current"
            [attr.aria-current]="entry.current ? 'page' : null"
            >{{ entry.label }}</a
          >
        }
      }
    </nav>
  `,
  styles: `
    /* The layout contributes a bare block and no opinions, so every rule this menu needs is here.
       It renders inside a 240px column that already scrolls and pads, hence no padding of its own. */
    :host {
      display: block;
      min-width: 0;
      padding: 4px 0 8px;
    }
    nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    /* A heading is a label, not a target: small caps, no hover, and enough space above it that the
       group below reads as belonging to it. */
    .heading {
      margin: 8px 0 2px;
      padding: 0 10px;
      color: #9ca3af;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .heading:first-child {
      margin-top: 0;
    }
    a {
      padding: 4px 10px;
      border-left: 2px solid transparent;
      color: #4b5563;
      text-decoration: none;
      font-size: 13px;
    }
    a:hover {
      color: #111827;
    }
    a.current {
      border-left-color: #4338ca;
      color: #111827;
      font-weight: 600;
    }
  `,
})
export class SystemNav {
  private readonly router = inject(Router);

  /**
   * The URL, as a signal, because Angular 21.2 has no signal-valued `Router.url` — only a string
   * getter and `currentNavigation`, which is null once a navigation has finished. The seed matters
   * as much as the stream: a reader who lands directly on a deep link gets no `NavigationEnd`
   * before the first render.
   */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly entries = computed(() => {
    const path = this.url().split('#')[0].split('?')[0];
    const segments = path.split('/').filter(Boolean);
    return ENTRIES.map((entry) => ({
      key: entry.heading ?? entry.path,
      heading: entry.heading,
      path: entry.path,
      label: entry.label,
      current: entry.matches?.(segments) ?? false,
    }));
  });
}
