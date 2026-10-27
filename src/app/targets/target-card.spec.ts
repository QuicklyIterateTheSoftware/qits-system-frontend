import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { TargetDto, TargetSignInDto } from '../api/dto';
import { ManualScheduler } from '../testing/manual-scheduler';
import { settle as settleFixture } from '../testing/settle';
import { QITS_SCHEDULER } from '../ui/scheduler';
import { TargetCard } from './target-card';

const TARGET: TargetDto = {
  id: 't1',
  name: 'build-box-1',
  description: 'the CI box',
  slotsTotal: 6,
  reservations: { ci: 2, workspace: 2, desk: 1 },
  used: { ci: 0, workspace: 0, desk: 0 },
  login: { claude: 'ABSENT', kimi: 'PRESENT', checkedAt: '2026-10-23T08:00:00Z' },
  credentialVolume: 'qits-system-runner-work-build-box-1',
  loginCommand: 'docker run --rm -it -v qits-system-runner-work-build-box-1:/claude-home claude',
  kimiLoginCommand: null,
  connected: true,
  connectedSince: '2026-10-23T07:00:00Z',
  quarantined: false,
  quarantineReason: null,
  quarantinedAt: null,
  runnerVersion: '2026.1023.1',
  registered: true,
  registeredAt: '2026-10-20T00:00:00Z',
  lastSeenAt: '2026-10-23T09:00:00Z',
  lastHealthCheckAt: null,
  lastHealthCheckOk: null,
  createdAt: '2026-10-20T00:00:00Z',
};

const SIGN_IN_ID = '00000000-0000-4000-8000-000000000003';
const SIGN_INS_URL = '/system/api/targets/t1/sign-ins';
const SIGN_IN_URL = `${SIGN_INS_URL}/${SIGN_IN_ID}`;

function signIn(change: Partial<TargetSignInDto>): TargetSignInDto {
  return {
    signInId: SIGN_IN_ID,
    targetId: 't1',
    harness: 'claude',
    state: 'STARTING',
    url: null,
    userCode: null,
    detail: null,
    startedAt: '2026-10-25T12:00:00Z',
    updatedAt: '2026-10-25T12:00:00Z',
    ...change,
  };
}

const CLAUDE_URL = 'https://claude.com/cai/oauth/authorize?code=true&client_id=c&state=s';

/**
 * The card's sign-in relay (qits-1593): start, poll every two seconds through the injected
 * scheduler, the claude code hand-over, cancel, the success refresh and the terminal states —
 * mounted on its own, since the flow lives in the card and the page only re-reads on `changed`.
 */
describe('TargetCard sign-in', () => {
  let http: HttpTestingController;
  let scheduler: ManualScheduler;
  let fixture: ComponentFixture<TargetCard>;
  let changed: number;

  beforeEach(() => {
    scheduler = new ManualScheduler();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: QITS_SCHEDULER, useValue: scheduler },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function mount(target: TargetDto = TARGET): Promise<HTMLElement> {
    fixture = TestBed.createComponent(TargetCard);
    fixture.componentRef.setInput('target', target);
    changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  const settle = () => settleFixture(fixture);

  function text(element: HTMLElement): string {
    return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function button(element: HTMLElement, label: string): HTMLButtonElement | undefined {
    return Array.from(element.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
  }

  function codeField(element: HTMLElement): HTMLInputElement {
    return element.querySelector('.sign-in input') as HTMLInputElement;
  }

  async function startClaude(card: HTMLElement): Promise<void> {
    button(card, 'Sign in to Claude')?.click();
    const start = http.expectOne(SIGN_INS_URL);
    expect(start.request.method).toBe('POST');
    expect(start.request.body).toEqual({ harness: 'claude' });
    start.flush(signIn({}), { status: 202, statusText: 'Accepted' });
    await settle();
  }

  async function poll(answer: TargetSignInDto): Promise<void> {
    scheduler.fire(2000);
    const read = http.expectOne(SIGN_IN_URL);
    expect(read.request.method).toBe('GET');
    read.flush(answer);
    await settle();
  }

  it('offers a sign-in only for a harness that is not PRESENT on a connected target', async () => {
    const card = await mount();
    expect(button(card, 'Sign in to Claude')).toBeDefined();
    expect(button(card, 'Sign in to Kimi')).toBeUndefined();

    fixture.componentRef.setInput('target', { ...TARGET, connected: false });
    await settle();
    expect(button(card, 'Sign in to Claude')).toBeUndefined();
  });

  it('keeps the copy-paste login commands under Manual sign-in', async () => {
    const card = await mount();
    expect(card.querySelector('details.manual summary')?.textContent).toContain('Manual sign-in');
    expect(text(card.querySelector('details.manual') as HTMLElement)).toContain(
      TARGET.loginCommand,
    );
  });

  it('signs claude in: polls, links the URL, posts the code once, and refreshes on success', async () => {
    const card = await mount();
    await startClaude(card);

    expect(text(card)).toContain('STARTING');
    expect(button(card, 'Sign in to Claude')).toBeUndefined();
    expect(scheduler.count(2000)).toBe(1);

    await poll(signIn({ state: 'AWAITING_CODE', url: CLAUDE_URL }));
    const link = card.querySelector('.sign-in a') as HTMLAnchorElement;
    expect(link.href).toBe(CLAUDE_URL);
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');

    const field = codeField(card);
    field.value = ' the-code#state ';
    field.dispatchEvent(new Event('input'));
    await settle();

    button(card, 'Submit code')?.click();
    const submit = http.expectOne(`${SIGN_IN_URL}/code`);
    expect(submit.request.method).toBe('POST');
    expect(submit.request.body).toEqual({ code: 'the-code#state' });
    submit.flush(signIn({ state: 'AWAITING_CODE', url: CLAUDE_URL }), {
      status: 202,
      statusText: 'Accepted',
    });
    await settle();

    // Still AWAITING_CODE: the code went once, and the submit stays shut until the state moves.
    expect(text(card)).toContain('Code handed over');
    expect(button(card, 'Submit code')?.disabled).toBe(true);
    button(card, 'Submit code')?.click();
    http.expectNone(`${SIGN_IN_URL}/code`);

    await poll(signIn({ state: 'SUCCEEDED', url: CLAUDE_URL }));
    expect(text(card)).toContain('SUCCEEDED');
    expect(changed).toBe(1);

    // The runner's probe lands a moment later: the list is re-read until the badge is PRESENT.
    scheduler.fire(2000);
    expect(changed).toBe(2);
    http.expectNone(SIGN_IN_URL);
    fixture.componentRef.setInput('target', {
      ...TARGET,
      login: { ...TARGET.login, claude: 'PRESENT' },
    });
    await settle();
    scheduler.fire(2000);
    expect(changed).toBe(2);
    expect(scheduler.count(2000)).toBe(0);
    expect(button(card, 'Sign in to Claude')).toBeUndefined();
  });

  it('shows kimi its URL and user code', async () => {
    const card = await mount({ ...TARGET, login: { ...TARGET.login, kimi: 'ABSENT' } });

    button(card, 'Sign in to Kimi')?.click();
    const start = http.expectOne(SIGN_INS_URL);
    expect(start.request.body).toEqual({ harness: 'kimi' });
    start.flush(signIn({ harness: 'kimi' }), { status: 202, statusText: 'Accepted' });
    await settle();

    await poll(
      signIn({
        harness: 'kimi',
        state: 'AWAITING_BROWSER',
        url: 'https://www.kimi.com/code/authorize_device?user_code=ABCD-1234',
        userCode: 'ABCD-1234',
      }),
    );

    expect(text(card)).toContain('AWAITING_BROWSER');
    expect(text(card)).toContain('ABCD-1234');
    expect((card.querySelector('.sign-in a') as HTMLAnchorElement).href).toContain('kimi.com');
    expect(codeField(card)).toBeNull();
  });

  it('cancels a running sign-in, stops polling, and offers to start again', async () => {
    const card = await mount();
    await startClaude(card);

    button(card, 'Cancel sign-in')?.click();
    const cancel = http.expectOne(SIGN_IN_URL);
    expect(cancel.request.method).toBe('DELETE');
    cancel.flush(signIn({ state: 'CANCELLED' }), { status: 202, statusText: 'Accepted' });
    await settle();

    expect(text(card)).toContain('CANCELLED');
    expect(scheduler.count(2000)).toBe(0);
    expect(button(card, 'Cancel sign-in')).toBeUndefined();
    expect(button(card, 'Sign in to Claude')).toBeDefined();
    expect(changed).toBe(0);
  });

  it('says why a sign-in failed, and lets it start again', async () => {
    const card = await mount();
    await startClaude(card);

    await poll(
      signIn({ state: 'FAILED', detail: 'Login failed: Request failed with status code 400' }),
    );

    expect(text(card)).toContain('Claude sign-in failed: Login failed: Request failed');
    expect(scheduler.count(2000)).toBe(0);
    expect(changed).toBe(0);

    await startClaude(card);
    expect(text(card)).toContain('STARTING');
    expect(text(card)).not.toContain('Login failed');
  });

  it('follows the sign-in already running when the service answers SIGN_IN_RUNNING', async () => {
    const card = await mount();

    button(card, 'Sign in to Claude')?.click();
    http.expectOne(SIGN_INS_URL).flush(
      {
        code: 'SIGN_IN_RUNNING',
        message: `Target build-box-1 is already signing in to claude: sign-in ${SIGN_IN_ID}`,
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    http.expectOne(SIGN_IN_URL).flush(signIn({ state: 'AWAITING_CODE', url: CLAUDE_URL }));
    await settle();

    expect(text(card)).toContain('AWAITING_CODE');
    expect(scheduler.count(2000)).toBe(1);
  });

  it('reports a refused start in the service’s words', async () => {
    const card = await mount();

    button(card, 'Sign in to Claude')?.click();
    http
      .expectOne(SIGN_INS_URL)
      .flush(
        { code: 'TARGET_UNAVAILABLE', message: 'Target build-box-1 is not connected' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();

    expect(text(card)).toContain(
      'Could not start a sign-in — 409 Target build-box-1 is not connected',
    );
    expect(scheduler.count(2000)).toBe(0);
  });

  it('stops polling when the card is destroyed', async () => {
    const card = await mount();
    await startClaude(card);
    expect(scheduler.count(2000)).toBe(1);

    fixture.destroy();
    expect(scheduler.count(2000)).toBe(0);
  });
});
