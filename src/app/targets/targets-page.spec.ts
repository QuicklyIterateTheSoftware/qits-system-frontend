import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigationLinks } from '@qits/ui-components';
import { routes } from '../app.routes';
import { settle as settleFixture } from '../testing/settle';

const TARGET = {
  id: 't1',
  name: 'build-box-1',
  description: 'the CI box',
  slotsTotal: 6,
  reservations: { ci: 2, workspace: 2, desk: 1 },
  used: { ci: 2, workspace: 1, desk: 0 },
  login: { claude: 'PRESENT', kimi: 'ABSENT', checkedAt: '2026-10-23T08:00:00Z' },
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
  lastHealthCheckAt: '2026-10-23T08:30:00Z',
  lastHealthCheckOk: true,
  createdAt: '2026-10-20T00:00:00Z',
};

const TARGETS_URL = '/system/api/targets';

/**
 * The Targets page (epic qits-1481): the list, the create form's one-time install line, an edit's
 * inline 409, a delete's inline 409, and the target's own leases — modelled on `swarm-lists.spec.ts`
 * and `node-containers-tab.spec.ts`'s shape (a read, a table, an empty sentence, an error with a
 * retry) plus the writes a card offers.
 */
describe('TargetsPage', () => {
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

  async function open(): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create('/targets');
    return harness.routeNativeElement as HTMLElement;
  }

  const settle = () => settleFixture(harness.fixture);

  function text(element: HTMLElement): string {
    return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function button(element: HTMLElement, label: string): HTMLButtonElement | undefined {
    return Array.from(element.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
  }

  /** The create form's own field — there is only ever one create form on this page. */
  function createField(element: HTMLElement, placeholderOrLabel: string): HTMLInputElement {
    const section = element.querySelector('.create') as HTMLElement;
    return fieldIn(section, placeholderOrLabel);
  }

  /** A target's edit draft field — scoped to the card, since the create form has fields of the
   * same names above it. */
  function editField(element: HTMLElement, placeholderOrLabel: string): HTMLInputElement {
    const section = element.querySelector('app-target-card .edit') as HTMLElement;
    return fieldIn(section, placeholderOrLabel);
  }

  /** A target card's own action field — the rotate action's slots input, scoped away from the
   * create form's field of the same label above it. */
  function fieldInCard(element: HTMLElement, placeholderOrLabel: string): HTMLInputElement {
    const section = element.querySelector('app-target-card .actions') as HTMLElement;
    return fieldIn(section, placeholderOrLabel);
  }

  function fieldIn(section: HTMLElement, placeholderOrLabel: string): HTMLInputElement {
    const byPlaceholder = section.querySelector<HTMLInputElement>(
      `input[placeholder="${placeholderOrLabel}"]`,
    );
    if (byPlaceholder) {
      return byPlaceholder;
    }
    const label = Array.from(section.querySelectorAll('label')).find((candidate) =>
      candidate.textContent?.includes(placeholderOrLabel),
    );
    const found = label?.querySelector('input');
    if (!found) {
      throw new Error(`No field "${placeholderOrLabel}" in the given section`);
    }
    return found;
  }

  function setValue(field: HTMLInputElement, value: string): void {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  async function openWithOneTarget(): Promise<HTMLElement> {
    const page = await open();
    http.expectOne(TARGETS_URL).flush([TARGET]);
    await settle();
    return page;
  }

  it('says it is working before the answer arrives', async () => {
    const page = await open();
    expect(text(page)).toContain('Loading the targets');
    http.expectOne(TARGETS_URL).flush([]);
    await settle();
  });

  it('lists a target with its slots against the reservations and its sign-in', async () => {
    const page = await openWithOneTarget();

    expect(text(page)).toContain('build-box-1');
    expect(text(page)).toContain('3/6 slots used');
    expect(text(page)).toContain('ci 2 used, 2 reserved');
    expect(text(page)).toContain('workspace 1 used, 2 reserved');
    expect(text(page)).toContain('desk 0 used, 1 reserved');
    expect(text(page)).toContain('PRESENT');
    expect(text(page)).toContain('ABSENT');
    expect(text(page)).toContain(TARGET.loginCommand);
  });

  it('reads an older service’s deprecated minimums, and shows use above a reservation', async () => {
    // qits-1682: a reservation is not a limit; ci uses 3 over 1 reserved while shared slots are free.
    const older: Record<string, unknown> = { ...TARGET };
    delete older['reservations'];
    const page = await open();
    http.expectOne(TARGETS_URL).flush([
      {
        ...older,
        minimums: { ci: 1, workspace: 0, desk: 0 },
        used: { ci: 3, workspace: 0, desk: 0 },
      },
    ]);
    await settle();

    expect(text(page)).toContain('ci 3 used, 1 reserved');
    expect(text(page)).toContain('workspace 0 used, 0 reserved');
  });

  it('says so rather than drawing nothing when no targets are declared', async () => {
    const page = await open();
    http.expectOne(TARGETS_URL).flush([]);
    await settle();

    expect(text(page)).toContain('No targets are declared yet');
  });

  it('reports a failed read in the service’s own words, with a retry', async () => {
    const page = await open();
    http
      .expectOne(TARGETS_URL)
      .flush(
        { message: 'the database is unreachable' },
        { status: 503, statusText: 'Unavailable' },
      );
    await settle();

    expect(text(page)).toContain('Could not load the targets — 503 the database is unreachable');

    button(page, 'Retry')?.click();
    http.expectOne(TARGETS_URL).flush([TARGET]);
    await settle();
    expect(text(page)).toContain('build-box-1');
  });

  it('declares a target and shows its one-time install line, once', async () => {
    const page = await open();
    http.expectOne(TARGETS_URL).flush([]);
    await settle();

    setValue(createField(page, 'build-box-1'), 'build-box-2');
    setValue(createField(page, 'Reserved ci'), '2');
    await settle();

    button(page, 'Declare')?.click();
    const create = http.expectOne(TARGETS_URL);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({
      name: 'build-box-2',
      reservations: { ci: 2, workspace: 0, desk: 0 },
      minimums: { ci: 2, workspace: 0, desk: 0 },
    });
    create.flush({
      target: { ...TARGET, id: 't2', name: 'build-box-2' },
      registrationToken: 'tok-secret',
      installLine: 'curl -fsSL https://system.qits.wohlben.eu/system/api/targets/install.sh | sh',
    });
    await settle();

    http.expectOne(TARGETS_URL).flush([TARGET, { ...TARGET, id: 't2', name: 'build-box-2' }]);
    await settle();

    expect(text(page)).toContain('Install line — build-box-2');
    expect(text(page)).toContain('curl -fsSL');
    expect(text(page)).toContain('QITS_SYSTEM_RUNNER_CREDENTIAL_VOLUME');

    button(page, 'Close')?.click();
    await settle();
    expect(text(page)).not.toContain('Install line');
  });

  it('declares a target with a slots total, sending it alongside the reservations', async () => {
    const page = await open();
    http.expectOne(TARGETS_URL).flush([]);
    await settle();

    setValue(createField(page, 'build-box-1'), 'build-box-3');
    setValue(createField(page, 'Slots total (optional)'), '8');
    await settle();

    button(page, 'Declare')?.click();
    const create = http.expectOne(TARGETS_URL);
    expect(create.request.body).toEqual({
      name: 'build-box-3',
      reservations: { ci: 0, workspace: 0, desk: 0 },
      minimums: { ci: 0, workspace: 0, desk: 0 },
      slots: 8,
    });
    create.flush({
      target: { ...TARGET, id: 't3', name: 'build-box-3', slotsTotal: 8 },
      registrationToken: 'tok-secret',
      installLine: 'curl -fsSL https://system.qits.wohlben.eu/system/api/targets/install.sh | sh',
    });
    await settle();

    http.expectOne(TARGETS_URL).flush([TARGET, { ...TARGET, id: 't3', name: 'build-box-3' }]);
    await settle();

    expect(text(page)).toContain('Install line — build-box-3');
  });

  it('says why a declare was refused, in the service’s words', async () => {
    const page = await open();
    http.expectOne(TARGETS_URL).flush([]);
    await settle();

    setValue(createField(page, 'build-box-1'), 'build-box-1');
    await settle();

    button(page, 'Declare')?.click();
    http
      .expectOne(TARGETS_URL)
      .flush(
        { code: 'TARGET_NAME_TAKEN', message: 'a target build-box-1 already exists' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();

    expect(text(page)).toContain('409 a target build-box-1 already exists');
  });

  it('edits reservations, and shows the 409 RESERVATIONS_EXCEED_TOTAL inline', async () => {
    const page = await openWithOneTarget();

    button(page, 'Edit')?.click();
    await settle();

    setValue(editField(page, 'Reserved ci'), '10');
    await settle();

    button(page, 'Save')?.click();
    const patch = http.expectOne(`${TARGETS_URL}/t1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({
      description: 'the CI box',
      reservations: { ci: 10, workspace: 2, desk: 1 },
      minimums: { ci: 10, workspace: 2, desk: 1 },
    });
    patch.flush(
      {
        code: 'RESERVATIONS_EXCEED_TOTAL',
        message: 'the reservations (13) are above the total (6) the runner reports',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(text(page)).toContain(
      'the reservations (13) are above the total (6) the runner reports',
    );
    // The form stays open on a refusal, so the operator can lower a value and retry.
    expect(editField(page, 'Reserved ci').value).toBe('10');
  });

  it('saves an edit that fits the total', async () => {
    const page = await openWithOneTarget();

    button(page, 'Edit')?.click();
    await settle();
    setValue(editField(page, 'Description'), 'renamed');
    await settle();

    button(page, 'Save')?.click();
    const patch = http.expectOne(`${TARGETS_URL}/t1`);
    patch.flush({ ...TARGET, description: 'renamed' });
    await settle();

    http.expectOne(TARGETS_URL).flush([{ ...TARGET, description: 'renamed' }]);
    await settle();

    expect(text(page)).toContain('renamed');
  });

  it('deletes with a second press, and surfaces the 409 TARGET_BUSY by opening its leases', async () => {
    const page = await openWithOneTarget();

    button(page, 'Delete')?.click();
    await settle();
    expect(text(page)).toContain('Confirm delete?');

    button(page, 'Confirm delete?')?.click();
    const remove = http.expectOne(`${TARGETS_URL}/t1`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(
      { code: 'TARGET_BUSY', message: 'it holds a lease that has not ended' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(text(page)).toContain('still holds a lease that has not ended');

    const leases = http.expectOne((candidate) => candidate.url === '/system/api/leases');
    expect(leases.request.params.get('targetId')).toBe('t1');
    leases.flush([
      {
        id: 'l1',
        slotType: 'CI',
        ownerApp: 'qits-ci',
        ownerRef: 'run-42',
        projectId: null,
        workKey: null,
        pinTargetId: null,
        targetId: 't1',
        priority: 0,
        state: 'RUNNING',
        exitCode: null,
        detail: null,
        requestedAt: null,
        grantedAt: null,
        startedAt: null,
        endedAt: null,
      },
    ]);
    await settle();

    expect(text(page)).toContain('qits-ci');
    expect(text(page)).toContain('run-42');
  });

  it('deletes outright when nothing holds it', async () => {
    const page = await openWithOneTarget();

    button(page, 'Delete')?.click();
    await settle();
    button(page, 'Confirm delete?')?.click();
    const remove = http.expectOne(`${TARGETS_URL}/t1`);
    remove.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    http.expectOne(TARGETS_URL).flush([]);
    await settle();
    expect(text(page)).toContain('No targets are declared yet');
  });

  it('rotates the registration token with no body, and shows the new install line', async () => {
    const page = await openWithOneTarget();

    button(page, 'Rotate registration token')?.click();
    const rotate = http.expectOne(`${TARGETS_URL}/t1/registration-token`);
    expect(rotate.request.method).toBe('POST');
    expect(rotate.request.body).toBeNull();
    rotate.flush({
      target: TARGET,
      registrationToken: 'tok-new',
      installLine: 'curl -fsSL https://system.qits.wohlben.eu/system/api/targets/install.sh | sh',
    });
    await settle();

    http.expectOne(TARGETS_URL).flush([TARGET]);
    await settle();

    expect(text(page)).toContain('Install line — build-box-1');
    expect(text(page)).toContain('curl -fsSL');
  });

  it('rotates with a slots total, sending it as the request body', async () => {
    const page = await openWithOneTarget();

    const slotsField = fieldInCard(page, 'Slots (optional)');
    setValue(slotsField, '4');
    await settle();

    button(page, 'Rotate registration token')?.click();
    const rotate = http.expectOne(`${TARGETS_URL}/t1/registration-token`);
    expect(rotate.request.body).toEqual({ slots: 4 });
    rotate.flush({
      target: { ...TARGET, slotsTotal: 4 },
      registrationToken: 'tok-new',
      installLine: 'curl -fsSL https://system.qits.wohlben.eu/system/api/targets/install.sh | sh',
    });
    await settle();

    http.expectOne(TARGETS_URL).flush([{ ...TARGET, slotsTotal: 4 }]);
    await settle();

    expect(text(page)).toContain('Install line — build-box-1');
  });

  it('refuses a rotate slots total outside 0..1024 before asking the service', async () => {
    const page = await openWithOneTarget();

    const slotsField = fieldInCard(page, 'Slots (optional)');
    setValue(slotsField, '2000');
    await settle();

    button(page, 'Rotate registration token')?.click();
    await settle();

    expect(text(page)).toContain('Slots total must be a whole number from 0 to 1024');
  });

  it('greenlights a quarantined target', async () => {
    const page = await open();
    http
      .expectOne(TARGETS_URL)
      .flush([{ ...TARGET, quarantined: true, quarantineReason: 'no health check yet' }]);
    await settle();

    expect(text(page)).toContain('QUARANTINED');
    expect(text(page)).toContain('no health check yet');

    button(page, 'Greenlight')?.click();
    const greenlight = http.expectOne(`${TARGETS_URL}/t1/greenlight`);
    expect(greenlight.request.method).toBe('POST');
    greenlight.flush({ ...TARGET, quarantined: false });
    await settle();

    http.expectOne(TARGETS_URL).flush([TARGET]);
    await settle();
    expect(text(page)).not.toContain('QUARANTINED');
  });

  it('requests a health check and a login check, each naming the answer as later', async () => {
    const page = await openWithOneTarget();

    button(page, 'Run health check')?.click();
    http
      .expectOne(`${TARGETS_URL}/t1/healthcheck`)
      .flush({ requestId: 'r1' }, { status: 202, statusText: 'Accepted' });
    await settle();
    expect(text(page)).toContain('Health check requested');

    button(page, 'Check sign-in')?.click();
    http
      .expectOne(`${TARGETS_URL}/t1/login-check`)
      .flush(null, { status: 202, statusText: 'Accepted' });
    await settle();
    expect(text(page)).toContain('Asked the target to check its sign-in');
  });

  it('shows a settled health report on request', async () => {
    const page = await openWithOneTarget();

    button(page, 'Details')?.click();
    const health = http.expectOne((candidate) => candidate.url === `${TARGETS_URL}/t1/health`);
    health.flush(
      {
        at: '2026-10-23T08:30:00Z',
        ok: true,
        checks: [{ name: 'slots', ok: true, detail: 'fits' }],
      },
      { status: 200, statusText: 'OK' },
    );
    await settle();

    expect(text(page)).toContain('slots');
    expect(text(page)).toContain('fits');
  });

  it('says so when no health check has settled yet', async () => {
    const page = await openWithOneTarget();

    button(page, 'Details')?.click();
    http
      .expectOne((candidate) => candidate.url === `${TARGETS_URL}/t1/health`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(text(page)).toContain('No health check has settled yet');
  });

  it('lists the leases of a target — type, owner, owner ref, state and detail', async () => {
    const page = await openWithOneTarget();

    button(page, 'Leases')?.click();
    const leases = http.expectOne((candidate) => candidate.url === '/system/api/leases');
    expect(leases.request.params.get('targetId')).toBe('t1');
    leases.flush([
      {
        id: 'l1',
        slotType: 'WORKSPACE',
        ownerApp: 'qits-workspaces',
        ownerRef: 'ws-9',
        projectId: null,
        workKey: 'ws-9',
        pinTargetId: null,
        targetId: 't1',
        priority: 0,
        state: 'QUEUED',
        exitCode: null,
        detail: 'target build-box-1 is not signed in: qits targets sign-in --target build-box-1',
        requestedAt: null,
        grantedAt: null,
        startedAt: null,
        endedAt: null,
      },
    ]);
    await settle();

    expect(text(page)).toContain('qits-workspaces');
    expect(text(page)).toContain('ws-9');
    expect(text(page)).toContain('QUEUED');
    expect(text(page)).toContain('qits targets sign-in --target build-box-1');

    button(page, 'Hide leases')?.click();
    await settle();
    expect(text(page)).not.toContain('ws-9');
  });

  it('shows the generic install script on request, and hides it again', async () => {
    const page = await open();
    http.expectOne(TARGETS_URL).flush([]);
    await settle();

    button(page, 'View install script')?.click();
    const script = http.expectOne(
      (candidate) => candidate.url === '/system/api/targets/install.sh',
    );
    expect(script.request.method).toBe('GET');
    script.flush('#!/bin/sh\necho installing\n');
    await settle();

    expect(text(page)).toContain('echo installing');

    button(page, 'Hide install script')?.click();
    await settle();
    expect(text(page)).not.toContain('echo installing');
  });

  it('says a target holds no leases rather than drawing an empty table', async () => {
    const page = await openWithOneTarget();

    button(page, 'Leases')?.click();
    http.expectOne((candidate) => candidate.url === '/system/api/leases').flush([]);
    await settle();

    expect(text(page)).toContain('This target holds no leases');
  });
});
