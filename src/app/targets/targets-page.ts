import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { QitsButton } from '@qits/ui-components';
import { SystemApi } from '../api/system-api';
import type { CreateTargetDto, TargetDto, TargetRegistrationDto } from '../api/dto';
import { Async } from '../ui/async';
import { CopyText } from '../ui/copy-text';
import { Empty } from '../ui/empty';
import { describeError, IDLE, loadInto, LOADING, type Loadable } from '../ui/loadable';
import { tickingNow } from '../ui/ticker';
import { TargetCard } from './target-card';

/**
 * Every execution target: a swarm this service's runner holds typed slots on (epic qits-1481,
 * dossier "Targets in qits-system: data, doors, allocation"). Modelled on qits-workspaces'
 * runners page (`qits-landing-app/.../workspaces/runners/`), carried over to this SPA's own
 * simpler shape — one `SystemApi` call per write, `Loadable` for every read, no event follow.
 *
 * **The create form answers a one-time install line.** `createTarget` returns the target plus its
 * registration token and the line that carries it; both are shown once, by `registration()`, and a
 * reload loses them for good — `Rotate registration token` on the card is the way back.
 *
 * **A card owns its own edit, actions and leases.** This page only lists, creates and reloads —
 * `TargetCard` emits `changed` after every write (so the list and every target's slot counts stay
 * current) and `registration` when a rotate answers a fresh install line.
 */
@Component({
  selector: 'app-targets-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, CopyText, Empty, QitsButton, TargetCard],
  styleUrls: ['../ui/page.css', './targets-page.css'],
  templateUrl: './targets-page.html',
})
export class TargetsPage {
  private readonly api = inject(SystemApi);
  private readonly now = tickingNow(30000);

  protected readonly state = signal<Loadable<readonly TargetDto[]>>(LOADING);
  protected readonly targets = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.value : [];
  });

  /** A declared or rotated target's one-time install line. Nothing else holds it. */
  protected readonly registration = signal<TargetRegistrationDto | null>(null);

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly minCi = signal(0);
  protected readonly minWorkspace = signal(0);
  protected readonly minDesk = signal(0);
  protected readonly creating = signal(false);
  protected readonly createProblem = signal('');

  protected readonly clock = this.now;

  /** The generic install script, read on demand — the same text every install line pipes to
   * `sh`, shown so an operator can read it before pasting a line that fetches and runs it. */
  protected readonly installScriptOpen = signal(false);
  protected readonly installScriptState = signal<Loadable<string>>(IDLE);
  protected readonly installScript = computed(() => {
    const state = this.installScriptState();
    return state.kind === 'ready' ? state.value : '';
  });

  constructor() {
    void this.load();
  }

  protected load(): Promise<void> {
    return loadInto(this.state, () => this.api.targets());
  }

  protected async create(): Promise<void> {
    if (this.creating()) {
      return;
    }
    const name = this.name().trim();
    if (!name) {
      this.createProblem.set('A target needs a name.');
      return;
    }
    this.creating.set(true);
    this.createProblem.set('');
    const description = this.description().trim();
    const body: CreateTargetDto = {
      name,
      ...(description ? { description } : {}),
      minimums: { ci: this.minCi(), workspace: this.minWorkspace(), desk: this.minDesk() },
    };
    try {
      const created = await this.api.createTarget(body);
      this.registration.set(created);
      this.name.set('');
      this.description.set('');
      this.minCi.set(0);
      this.minWorkspace.set(0);
      this.minDesk.set(0);
      await this.load();
    } catch (error) {
      this.createProblem.set(describeError(error));
    } finally {
      this.creating.set(false);
    }
  }

  /** A card rotated its token, or a create just answered: show the line until closed. */
  protected show(registration: TargetRegistrationDto): void {
    this.registration.set(registration);
  }

  protected closeRegistration(): void {
    this.registration.set(null);
  }

  protected toggleInstallScript(): void {
    const open = !this.installScriptOpen();
    this.installScriptOpen.set(open);
    if (open && this.installScriptState().kind === 'idle') {
      void this.loadInstallScript();
    }
  }

  protected loadInstallScript(): Promise<void> {
    return loadInto(this.installScriptState, () => this.api.targetInstallScript());
  }
}
