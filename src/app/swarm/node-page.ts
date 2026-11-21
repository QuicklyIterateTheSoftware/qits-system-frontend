import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  convertToParamMap,
} from '@angular/router';
import { SystemApi } from '../api/system-api';
import type { NodeDetailDto } from '../api/dto';
import { Async } from '../ui/async';
import { NONE, formatBytes, formatInstant, shortId } from '../ui/format';
import { LOADING, loadInto, type Loadable } from '../ui/loadable';
import { StatusBadge } from '../ui/status-badge';

/**
 * The resource list a node still shows here, in the order an operator opens them. `images`,
 * `volumes` and `networks` are no longer among them — their tabs hand off to the landing app now
 * (qits-2353, qits-2355, qits-2354).
 */
const TABS = [{ path: 'containers', label: 'Containers' }] as const;

/**
 * One node: what swarm knows about it, and a tab bar over what docker knows.
 *
 * **The tabs are child routes, not a signal.** Each list is an address a reader can paste and the
 * back button can return to; a tab held in this component would have left every one of them
 * sharing one URL and would have forgotten which was open on every reload.
 *
 * The facts here come from the manager, so they are readable for every node. What is underneath the
 * tabs is not: v1 reaches only the node this service runs on, and the one tab left says so for
 * itself rather than this page hiding it — a reader who followed a link to a foreign node deserves
 * to see why, not to find the tab missing.
 */
@Component({
  selector: 'app-node-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, RouterLink, RouterLinkActive, RouterOutlet, StatusBadge],
  styleUrls: ['../ui/page.css', './node-page.css'],
  templateUrl: './node-page.html',
})
export class NodePage {
  private readonly api = inject(SystemApi);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.paramMap, { initialValue: convertToParamMap({}) });

  /** The node this page is about, straight out of the URL. */
  protected readonly id = computed(() => this.params().get('id') ?? '');

  protected readonly none = NONE;
  protected readonly short = shortId;
  protected readonly tabs = TABS;

  protected readonly state = signal<Loadable<NodeDetailDto>>(LOADING);
  protected readonly node = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.value : null;
  });

  /** The facts worth a strip: the ones a table of nodes does not already show. */
  protected readonly facts = computed(() => {
    const node = this.node();
    if (!node) {
      return [];
    }
    return [
      { label: 'Role', value: node.role },
      { label: 'Engine', value: node.engineVersion || NONE },
      { label: 'OS', value: node.os || NONE },
      { label: 'Architecture', value: node.architecture || NONE },
      { label: 'CPUs', value: node.cpus ? `${node.cpus}` : NONE },
      { label: 'Memory', value: formatBytes(node.memoryBytes) },
      { label: 'Address', value: node.address || NONE },
      { label: 'Joined', value: formatInstant(node.createdAt ?? null) },
    ];
  });

  /** Swarm labels, as `key=value` chips. Empty is the ordinary case. */
  protected readonly labels = computed(() =>
    Object.entries(this.node()?.labels ?? {}).map(([key, value]) => `${key}=${value}`),
  );

  constructor() {
    // The id comes from the URL, so a navigation from one node to another must throw the old
    // node's facts away before the new read lands — otherwise the header names the wrong machine
    // for as long as the request takes.
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.state.set(LOADING);
        if (id) {
          void this.load();
        }
      });
    });
  }

  protected load(): Promise<void> {
    return loadInto(this.state, () => this.api.node(this.id()));
  }
}
