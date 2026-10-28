import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { QitsButton } from '@qits/ui-components';
import { errorCode, SystemApi } from '../api/system-api';
import {
  RESERVATIONS_EXCEED_TOTAL,
  SIGN_IN_RUNNING,
  TARGET_BUSY,
  TERMINAL_SIGN_IN_STATES,
  type LeaseDto,
  type PatchTargetDto,
  type SignInHarness,
  type TargetDto,
  type TargetHealthReportDto,
  type TargetRegistrationDto,
  type TargetSignInDto,
} from '../api/dto';
import { Async } from '../ui/async';
import { CopyText } from '../ui/copy-text';
import { Empty } from '../ui/empty';
import { NONE, formatRelative } from '../ui/format';
import { describeError, IDLE, loadInto, statusOf, type Loadable } from '../ui/loadable';
import { QITS_SCHEDULER } from '../ui/scheduler';
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

/** One harness's sign-in as this card follows it (qits-1593). */
interface SignInFlow {
  /** The sign-in as last read, or `null` before one is started. */
  readonly view: TargetSignInDto | null;
  /** Which of its own writes is waiting on the service. */
  readonly busy: 'start' | 'code' | 'cancel' | null;
  /** The code typed so far (claude, `AWAITING_CODE`). */
  readonly code: string;
  /** The state the code was posted in: the submit stays disabled until the sign-in leaves it, so
   * one code is posted once. */
  readonly codeSentIn: string | null;
  readonly error: string | null;
}

const NO_SIGN_IN: SignInFlow = { view: null, busy: null, code: '', codeSentIn: null, error: null };

/** How often a running sign-in is read, and how often the list is re-read after it succeeded. */
const SIGN_IN_POLL_MS = 2000;
/** How many list re-reads after a success wait for the runner's login probe to report PRESENT. */
const SIGNED_IN_REFRESHES = 5;

const HARNESSES: readonly { readonly harness: SignInHarness; readonly label: string }[] = [
  { harness: 'claude', label: 'Claude' },
  { harness: 'kimi', label: 'Kimi' },
];

/** A uuid in a `SIGN_IN_RUNNING` message — the service names the sign-in that is already running. */
const SIGN_IN_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * One execution target: its slots, reservations, sign-in, quarantine, last health check, every write a
 * target offers, and its leases — the whole of what `TargetViews.TargetDto` carries (epic
 * qits-1481).
 *
 * Modelled on qits-workspaces' runner card (`qits-landing-app/.../workspaces/runners/runner-
 * card.ts`): an edit draft held until Save or Cancel, a two-press Delete, and every write ending
 * with `changed` so the page reads the list again. Unlike that card, leases and the health report
 * are each read on demand — a `Loadable` opened by its own toggle — because this SPA follows no
 * domain event and a target can hold either without a reader ever asking.
 *
 * **Sign-in runs on the target, relayed here** (qits-1593). `Sign in to Claude`/`Kimi` asks the
 * target's runner to run the harness's own login; the card then reads that sign-in every two
 * seconds through `QITS_SCHEDULER` until it settles, showing the URL to open, kimi's user code, and
 * for claude the field the browser's code is pasted into. A success re-reads the list until the
 * runner's own login probe reports PRESENT. The copy-paste login commands stay, folded under
 * "Manual sign-in", for a target whose runner predates the relay.
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
  private readonly scheduler = inject(QITS_SCHEDULER);

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

  /** The rotate action's optional slots total. `null` means left blank — the service keeps
   * `max(reported total, sum of reservations)`. */
  protected readonly rotateSlots = signal<number | null>(null);

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

  protected readonly harnesses = HARNESSES;
  protected readonly signIns = signal<Readonly<Record<SignInHarness, SignInFlow>>>({
    claude: NO_SIGN_IN,
    kimi: NO_SIGN_IN,
  });
  /** Each harness's running poll (sign-in reads, then post-success list re-reads), by its stop. */
  private readonly polls = new Map<SignInHarness, () => void>();
  /** Harnesses whose sign-in read is in flight, so a slow answer is not asked for twice. */
  private readonly reading = new Set<SignInHarness>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const stop of this.polls.values()) {
        stop();
      }
      this.polls.clear();
    });
  }

  /** Slots reserved per type. Not a limit: a type may use more while shared slots are free. */
  protected readonly reserved = computed(() => this.target().reservations);

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
    const reserved = target.reservations;
    this.draft.set({
      description: target.description ?? '',
      ci: reserved.ci,
      workspace: reserved.workspace,
      desk: reserved.desk,
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
      reservations: { ci: draft.ci, workspace: draft.workspace, desk: draft.desk },
    };
    try {
      await this.api.patchTarget(this.target().id, body);
      this.draft.set(null);
      this.changed.emit();
    } catch (error) {
      this.rowError.set(
        errorCode(error) === RESERVATIONS_EXCEED_TOTAL
          ? `Could not save — ${describeError(error)}.`
          : `Could not save these reservations — ${describeError(error)}.`,
      );
    } finally {
      this.busy.set(null);
    }
  }

  // --- actions -------------------------------------------------------------------------------------

  /** Mirrors `targets-page.ts`'s `setSlots`: `valueAsNumber` answers `NaN` for an emptied field,
   * which reads as "left blank" rather than as a number to send. */
  protected setRotateSlots(value: number): void {
    this.rotateSlots.set(Number.isNaN(value) ? null : value);
  }

  protected async rotate(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const slots = this.rotateSlots();
    if (slots !== null && (!Number.isInteger(slots) || slots < 0 || slots > 1024)) {
      this.rowError.set('Slots total must be a whole number from 0 to 1024.');
      return;
    }
    this.busy.set('rotate');
    this.rowError.set(null);
    try {
      const registration = await this.api.rotateTargetRegistrationToken(
        this.target().id,
        slots ?? undefined,
      );
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

  // --- sign-in (qits-1593) -------------------------------------------------------------------

  protected isTerminal(view: TargetSignInDto | null): boolean {
    return view === null || TERMINAL_SIGN_IN_STATES.includes(view.state);
  }

  /** A harness is offered a sign-in while it is not PRESENT on a connected target and nothing is
   * already running for it. */
  protected canSignIn(harness: SignInHarness): boolean {
    const target = this.target();
    return (
      target.connected &&
      target.login[harness] !== 'PRESENT' &&
      this.isTerminal(this.signIns()[harness].view)
    );
  }

  protected setCode(harness: SignInHarness, code: string): void {
    this.patchFlow(harness, { code });
  }

  protected async startSignIn(harness: SignInHarness): Promise<void> {
    if (this.signIns()[harness].busy) {
      return;
    }
    this.stopPoll(harness);
    this.patchFlow(harness, { ...NO_SIGN_IN, busy: 'start' });
    try {
      this.apply(harness, await this.api.startTargetSignIn(this.target().id, harness));
    } catch (error) {
      const running = errorCode(error) === SIGN_IN_RUNNING ? runningSignInId(error) : null;
      if (running) {
        // One is already running for this harness — from another tab, or the CLI. Follow it.
        await this.read(harness, running);
      } else {
        this.patchFlow(harness, { error: `Could not start a sign-in — ${describeError(error)}.` });
      }
    } finally {
      this.patchFlow(harness, { busy: null });
    }
  }

  protected async submitCode(harness: SignInHarness): Promise<void> {
    const flow = this.signIns()[harness];
    const code = flow.code.trim();
    if (!flow.view || flow.busy || flow.codeSentIn !== null || !code) {
      return;
    }
    this.patchFlow(harness, { busy: 'code', error: null });
    try {
      const view = await this.api.submitTargetSignInCode(
        this.target().id,
        flow.view.signInId,
        code,
      );
      this.patchFlow(harness, { code: '', codeSentIn: view.state });
      this.apply(harness, view);
    } catch (error) {
      this.patchFlow(harness, { error: `Could not hand over the code — ${describeError(error)}.` });
    } finally {
      this.patchFlow(harness, { busy: null });
    }
  }

  protected async cancelSignIn(harness: SignInHarness): Promise<void> {
    const flow = this.signIns()[harness];
    if (!flow.view || flow.busy) {
      return;
    }
    this.patchFlow(harness, { busy: 'cancel', error: null });
    try {
      this.apply(harness, await this.api.cancelTargetSignIn(this.target().id, flow.view.signInId));
    } catch (error) {
      this.patchFlow(harness, { error: `Could not cancel the sign-in — ${describeError(error)}.` });
    } finally {
      this.patchFlow(harness, { busy: null });
    }
  }

  /** Takes a sign-in as read: polls while it runs, stops once it settles, refreshes on success. */
  private apply(harness: SignInHarness, view: TargetSignInDto): void {
    const flow = this.signIns()[harness];
    const settledBefore = flow.view !== null && this.isTerminal(flow.view);
    this.patchFlow(harness, {
      view,
      codeSentIn: flow.codeSentIn === view.state ? flow.codeSentIn : null,
    });
    if (!this.isTerminal(view)) {
      this.pollSignIn(harness);
    } else if (view.state === 'SUCCEEDED' && !settledBefore) {
      this.refreshUntilPresent(harness);
    } else {
      this.stopPoll(harness);
    }
  }

  private async read(harness: SignInHarness, signInId: string): Promise<void> {
    if (this.reading.has(harness)) {
      return;
    }
    this.reading.add(harness);
    try {
      this.apply(harness, await this.api.targetSignIn(this.target().id, signInId));
    } catch (error) {
      if (statusOf(error) === 404) {
        this.stopPoll(harness);
        this.patchFlow(harness, {
          view: null,
          error: 'The service no longer holds this sign-in — start again.',
        });
      } else {
        this.patchFlow(harness, { error: `Could not read the sign-in — ${describeError(error)}.` });
      }
    } finally {
      this.reading.delete(harness);
    }
  }

  private pollSignIn(harness: SignInHarness): void {
    if (this.polls.has(harness)) {
      return;
    }
    this.polls.set(
      harness,
      this.scheduler.every(SIGN_IN_POLL_MS, () => {
        const view = this.signIns()[harness].view;
        if (view) {
          void this.read(harness, view.signInId);
        }
      }),
    );
  }

  /**
   * After a success the runner probes its login and reports it a moment later, so one re-read of
   * the list can still show the old badge: the list is re-read now and every two seconds after,
   * until the harness reads PRESENT or a handful of tries have passed.
   */
  private refreshUntilPresent(harness: SignInHarness): void {
    this.stopPoll(harness);
    this.changed.emit();
    let left = SIGNED_IN_REFRESHES;
    this.polls.set(
      harness,
      this.scheduler.every(SIGN_IN_POLL_MS, () => {
        if (this.target().login[harness] === 'PRESENT' || left-- <= 0) {
          this.stopPoll(harness);
          return;
        }
        this.changed.emit();
      }),
    );
  }

  private stopPoll(harness: SignInHarness): void {
    this.polls.get(harness)?.();
    this.polls.delete(harness);
  }

  private patchFlow(harness: SignInHarness, change: Partial<SignInFlow>): void {
    this.signIns.update((flows) => ({ ...flows, [harness]: { ...flows[harness], ...change } }));
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

/** The `signInId` a `SIGN_IN_RUNNING` refusal names, or `null` when its message carries none. */
function runningSignInId(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse) || typeof error.error !== 'object' || !error.error) {
    return null;
  }
  const message = (error.error as { message?: unknown }).message;
  return typeof message === 'string' ? (SIGN_IN_ID.exec(message)?.[0] ?? null) : null;
}
