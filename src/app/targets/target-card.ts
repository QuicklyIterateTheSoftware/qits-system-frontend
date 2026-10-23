import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { QitsButton } from '@qits/ui-components';
import { errorCode, SystemApi } from '../api/system-api';
import {
  MINIMUMS_EXCEED_TOTAL,
  TARGET_BUSY,
  type LeaseDto,
  type PatchTargetDto,
  type TargetDto,
  type TargetHealthReportDto,
  type TargetRegistrationDto,
} from '../api/dto';
import { Async } from '../ui/async';
import { CopyText } from '../ui/copy-text';
import { Empty } from '../ui/empty';
import { NONE, formatRelative } from '../ui/format';
import { describeError, IDLE, loadInto, type Loadable } from '../ui/loadable';
import { StatusBadge } from '../ui/status-badge';

/** A target's editable fields, held as a draft until saved or cancelled. */
interface Draft {
  readonly description: string;
  readonly ci: number;
  readonly workspace: number;
  readonly desk: number;
}

/** Which verb is waiting on the service, so only its own button shows busy. */
type Busy = 'save' | 'rotate' | 'greenlight' | 'healthcheck' | 'logincheck' | 'delete' | null;

/**
 * One execution target: its slots, minimums, sign-in, quarantine, last health check, every write a
 * target offers, and its leases — the whole of what `TargetViews.TargetDto` carries (epic
 * qits-1481).
 *
 * Modelled on qits-workspaces' runner card (`qits-landing-app/.../workspaces/runners/runner-
 * card.ts`): an edit draft held until Save or Cancel, a two-press Delete, and every write ending
 * with `changed` so the page reads the list again. Unlike that card, leases and the health report
 * are each read on demand — a `Loadable` opened by its own toggle — because this SPA follows no
 * domain event and a target can hold either without a reader ever asking.
 */
@Component({
  selector: 'app-target-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, CopyText, Empty, QitsButton, StatusBadge],
  styleUrls: ['../ui/page.css', './target-card.css'],
  templateUrl: './target-card.html',
})
export class TargetCard {
  private readonly api = inject(SystemApi);

  readonly target = input.required<TargetDto>();
  /** The clock the "ago" labels are read against, in epoch milliseconds. */
  readonly now = input<number>(Date.now());

  /** A write landed (or was refused): the page reads the list again. */
  readonly changed = output<void>();
  /** A rotated token's one-time install line, for the page to show. */
  readonly registration = output<TargetRegistrationDto>();

  protected readonly none = NONE;

  protected readonly draft = signal<Draft | null>(null);
  protected readonly busy = signal<Busy>(null);
  protected readonly rowError = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);

  protected readonly loginCheckRequested = signal(false);
  protected readonly healthCheckRequested = signal(false);

  protected readonly leasesOpen = signal(false);
  protected readonly leasesState = signal<Loadable<readonly LeaseDto[]>>(IDLE);
  protected readonly leases = computed(() => {
    const state = this.leasesState();
    return state.kind === 'ready' ? state.value : [];
  });

  protected readonly healthOpen = signal(false);
  protected readonly healthState = signal<Loadable<TargetHealthReportDto | null>>(IDLE);
  protected readonly healthReport = computed(() => {
    const state = this.healthState();
    return state.kind === 'ready' ? state.value : null;
  });

  protected readonly usedTotal = computed(() => {
    const used = this.target().used;
    return used.ci + used.workspace + used.desk;
  });

  protected ago(iso: string | null | undefined): string {
    return formatRelative(iso ?? null, this.now());
  }

  // --- edit --------------------------------------------------------------------------------------

  protected startEdit(): void {
    const target = this.target();
    this.draft.set({
      description: target.description ?? '',
      ci: target.minimums.ci,
      workspace: target.minimums.workspace,
      desk: target.minimums.desk,
    });
    this.rowError.set(null);
  }

  protected cancelEdit(): void {
    this.draft.set(null);
    this.rowError.set(null);
  }

  protected edit(change: Partial<Draft>): void {
    this.draft.update((draft) => (draft ? { ...draft, ...change } : draft));
  }

  protected async saveEdit(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.busy()) {
      return;
    }
    this.busy.set('save');
    this.rowError.set(null);
    const body: PatchTargetDto = {
      description: draft.description,
      minimums: { ci: draft.ci, workspace: draft.workspace, desk: draft.desk },
    };
    try {
      await this.api.patchTarget(this.target().id, body);
      this.draft.set(null);
      this.changed.emit();
    } catch (error) {
      this.rowError.set(
        errorCode(error) === MINIMUMS_EXCEED_TOTAL
          ? `Could not save — ${describeError(error)}.`
          : `Could not save these minimums — ${describeError(error)}.`,
      );
    } finally {
      this.busy.set(null);
    }
  }

  // --- actions -------------------------------------------------------------------------------------

  protected async rotate(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set('rotate');
    this.rowError.set(null);
    try {
      const registration = await this.api.rotateTargetRegistrationToken(this.target().id);
      this.registration.emit(registration);
      this.changed.emit();
    } catch (error) {
      this.rowError.set(`Could not rotate the registration token — ${describeError(error)}.`);
    } finally {
      this.busy.set(null);
    }
  }

  protected async greenlight(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set('greenlight');
    this.rowError.set(null);
    try {
      await this.api.greenlightTarget(this.target().id);
      this.changed.emit();
    } catch (error) {
      this.rowError.set(`Could not greenlight this target — ${describeError(error)}.`);
    } finally {
      this.busy.set(null);
    }
  }

  protected async runHealthCheck(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set('healthcheck');
    this.rowError.set(null);
    try {
      await this.api.requestTargetHealthCheck(this.target().id);
      this.healthCheckRequested.set(true);
    } catch (error) {
      this.rowError.set(`Could not run a health check — ${describeError(error)}.`);
    } finally {
      this.busy.set(null);
    }
  }

  protected async loginCheck(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set('logincheck');
    this.rowError.set(null);
    try {
      await this.api.requestTargetLoginCheck(this.target().id);
      this.loginCheckRequested.set(true);
    } catch (error) {
      this.rowError.set(`Could not check sign-in — ${describeError(error)}.`);
    } finally {
      this.busy.set(null);
    }
  }

  protected async pressDelete(): Promise<void> {
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      this.rowError.set(null);
      return;
    }
    if (this.busy()) {
      return;
    }
    this.busy.set('delete');
    this.rowError.set(null);
    try {
      await this.api.deleteTarget(this.target().id);
      this.changed.emit();
    } catch (error) {
      if (errorCode(error) === TARGET_BUSY) {
        this.rowError.set(
          'This target still holds a lease that has not ended — see its leases below.',
        );
        this.leasesOpen.set(true);
        void this.loadLeases();
      } else {
        this.rowError.set(`Could not delete this target — ${describeError(error)}.`);
      }
    } finally {
      this.busy.set(null);
      this.confirmingDelete.set(false);
    }
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
    this.rowError.set(null);
  }

  // --- leases --------------------------------------------------------------------------------------

  protected toggleLeases(): void {
    const open = !this.leasesOpen();
    this.leasesOpen.set(open);
    if (open && this.leasesState().kind === 'idle') {
      void this.loadLeases();
    }
  }

  protected loadLeases(): Promise<void> {
    return loadInto(this.leasesState, () => this.api.targetLeases(this.target().id));
  }

  // --- health ----------------------------------------------------------------------------------

  protected toggleHealth(): void {
    const open = !this.healthOpen();
    this.healthOpen.set(open);
    if (open && this.healthState().kind === 'idle') {
      void this.loadHealth();
    }
  }

  protected loadHealth(): Promise<void> {
    return loadInto(this.healthState, () => this.api.targetHealth(this.target().id));
  }
}
