import { computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { SystemApi, isNodeRemote } from '../api/system-api';
import { IDLE, LOADING, failed, ready, type Loadable } from '../ui/loadable';

/**
 * What the three resource tabs of a node share: the id out of the parent route, one read, and the
 * one answer none of them is allowed to draw as an error.
 *
 * **`NODE_REMOTE` is not a failure.** A node-scoped read for a machine this service does not run on
 * answers 409 with that code, and it means "v1 does not reach there" — a fact about this platform,
 * not about the node. Drawn as a red bar it would send an operator looking for an outage; drawn as
 * a card it explains itself and the reader moves on. Every tab therefore renders `remote()` ahead
 * of everything else, and the load state is left idle so the shared error bar stays silent.
 *
 * A base class rather than one generic component, because the tabs differ only in their columns —
 * and a component that took its columns as data would be a table framework nobody asked for. The
 * read and the template are the subclass's; everything else is here.
 */
export abstract class NodeResourceTab<T> {
  protected readonly api = inject(SystemApi);
  private readonly route = inject(ActivatedRoute);

  /** The node id lives on the PARENT route: `swarm/nodes/:id/containers` is this route's own path. */
  private readonly params = toSignal(this.route.parent?.paramMap ?? of(convertToParamMap({})), {
    initialValue: convertToParamMap({}),
  });

  protected readonly nodeId = computed(() => this.params().get('id') ?? '');

  protected readonly state = signal<Loadable<readonly T[]>>(LOADING);

  /** The service's own sentence about a node v1 cannot reach, or nothing. */
  protected readonly remote = signal('');

  protected readonly rows = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.value : [];
  });

  constructor() {
    effect(() => {
      const id = this.nodeId();
      untracked(() => {
        this.remote.set('');
        this.state.set(LOADING);
        if (id) {
          void this.load();
        }
      });
    });
  }

  /** The one call this tab makes. */
  protected abstract read(nodeId: string): Promise<readonly T[]>;

  protected async load(): Promise<void> {
    const id = this.nodeId();
    if (!id) {
      return;
    }
    this.remote.set('');
    if (this.state().kind !== 'ready') {
      this.state.set(LOADING);
    }
    try {
      this.state.set(ready(await this.read(id)));
    } catch (error) {
      if (isNodeRemote(error)) {
        this.remote.set(remoteMessage(error));
        this.state.set(IDLE);
        return;
      }
      this.state.set(failed(error));
    }
  }
}

/** The service's words for a foreign node, with a fallback for the day it sends only a code. */
function remoteMessage(error: unknown): string {
  const body = (error as { error?: { message?: unknown } }).error;
  const message = body?.message;
  return typeof message === 'string' && message.length > 0
    ? message
    : 'only the local node is reachable in v1';
}
