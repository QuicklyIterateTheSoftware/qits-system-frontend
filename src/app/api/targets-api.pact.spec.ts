import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  addGoldenInteraction,
  assertPactPart,
  goldenMasters,
  type GoldenMasters,
} from '@qits/angular/testing';
import { QITS_API_BASE } from './api-base';
import { errorCode, SystemApi } from './system-api';
import type {
  CreateTargetDto,
  PatchTargetDto,
  StartTargetSignInDto,
  TargetSignInCodeDto,
} from './dto';

/**
 * `SystemApi`'s pact with qits-system-service's targets doors (epic qits-1481), in the same shape
 * `qits-projects-frontend/src/app/api/projects-api.pact.spec.ts` uses: one call through the real
 * client per row, against a pact mock server answering qits-system's golden master, compared with
 * (or, with `QITS_GOLDEN_UPDATE=true npm test`, written into)
 * `pacts/qits-system-frontend_qits-system-service.json`.
 *
 * **Every row below is skipped today, and named individually rather than failing the file.** The
 * provider's `@qits/system-golden-masters` is pinned at `2026.1010.145705`, recorded before the
 * targets module existed — its `golden-masters/index.json` carries only `a single-node swarm`. The
 * states this file reads (`a declared target`, `no target`, `an unregistered runner`,
 * `a queued lease`) are already committed on `qits-system-service`'s `epic/qits-1481` branch
 * (`golden-masters/a-declared-target/…`, etc.) but have not reached a release yet, so they are not
 * in the published package. `qits-system-runner-daemon`'s `ToolkitPactTest` carries the identical
 * note for `registerTarget`, on the same branch. Once a release publishes them, bump this
 * devDependency and every `it.skipIf` below starts running on its own — no other edit is needed,
 * because every path and field name here was read from those already-committed fixtures.
 *
 * The four sign-in rows (qits-1593) follow the same rule: `a connected target` and `a connected
 * target with a claude sign-in awaiting its code` are recorded on `qits-system-service`'s
 * `ticket/qits-1593` branch and skip here until a release publishes them and the devDependency is
 * bumped.
 */
const CONSUMER = 'qits-system-frontend';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS = [
  'createTarget',
  'listTargets',
  'getTarget',
  'patchTarget',
  'deleteTarget',
  'rotateTargetRegistrationToken',
  'greenlightTarget',
  'requestTargetHealthCheck',
  'requestTargetLoginCheck',
  'getTargetHealth',
  'getTargetInstallScript',
  'listLeases',
  'startTargetSignIn',
  'getTargetSignIn',
  'submitTargetSignInCode',
  'cancelTargetSignIn',
];

const DECLARED_TARGET = 'a declared target';
const NO_TARGET = 'no target';
const UNREGISTERED_RUNNER = 'an unregistered runner';
const QUEUED_LEASE = 'a queued lease';
const CONNECTED_TARGET = 'a connected target';
const AWAITING_CODE = 'a connected target with a claude sign-in awaiting its code';

/** `null` while the published package predates the targets module (see the file comment). */
const masters: GoldenMasters | null = (() => {
  try {
    return goldenMasters('@qits/system-golden-masters', 'qits-system');
  } catch {
    return null;
  }
})();

/** Whether `state`/`operationId` is recorded in the package this run resolved. */
function recorded(state: string, operationId: string): boolean {
  if (!masters) {
    return false;
  }
  try {
    masters.operation(state, operationId);
    return true;
  } catch {
    return false;
  }
}

const dir = mkdtempSync(join(tmpdir(), 'qits-system-frontend-targets-api-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

const given = (
  state: string,
  operationId: string,
  interaction: string,
  consumes: readonly string[],
) =>
  addGoldenInteraction(pact, masters!, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes,
  });

/** `state`'s param `name`, as recorded for `operationId`. */
const param = (state: string, operationId: string, name: string) =>
  masters!.operation(state, operationId).params[name];

/** What the recording sent, for a write whose body this spec must send back unchanged. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the recorded JSON, as `body` types it
const sent = (state: string, operationId: string): any =>
  masters!.operation(state, operationId).body;

/** `SystemApi`, talking to the pact mock server at `url` through a real `HttpClient`. */
function apiAt(url: string): SystemApi {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withFetch()), { provide: QITS_API_BASE, useValue: url }],
  });
  return TestBed.inject(SystemApi);
}

describe('qits-system-frontend → qits-system-service pact: SystemApi (targets)', () => {
  afterAll(() => {
    if (!masters) {
      // Nothing was recorded against this run, so nothing to compare or write — see the file
      // comment. Cleaning the scratch dir is still worth doing.
      rmSync(dir, { recursive: true, force: true });
      return;
    }
    try {
      assertPactPart(
        join(dir, `${CONSUMER}-${PROVIDER}.json`),
        COMMITTED,
        OPERATIONS,
        'QITS_GOLDEN_UPDATE',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!recorded(NO_TARGET, 'createTarget'))(
    'declare-target: createTarget answers the target, its token and its install line',
    () => {
      const body = sent(NO_TARGET, 'createTarget') as CreateTargetDto;
      return given(NO_TARGET, 'createTarget', 'declare-target', [
        'target.id',
        'target.name',
        'target.description',
        'target.slotsTotal',
        'target.minimums',
        'target.used',
        'target.login',
        'target.connected',
        'target.quarantined',
        'registrationToken',
        'installLine',
      ]).executeTest(async (server) => {
        const created = await apiAt(server.url).createTarget(body);
        expect(created.target.name).toBe(body.name);
        expect(created.installLine).toBeTruthy();
        expect(created.registrationToken).toBeTruthy();
      });
    },
  );

  it.skipIf(!recorded(DECLARED_TARGET, 'listTargets'))(
    'list-targets: listTargets answers the slots, minimums, login and quarantine every row draws',
    () =>
      given(DECLARED_TARGET, 'listTargets', 'list-targets', [
        '[].id',
        '[].name',
        '[].slotsTotal',
        '[].minimums',
        '[].used',
        '[].login',
        '[].connected',
        '[].quarantined',
        '[].loginCommand',
        '[].kimiLoginCommand',
        '[].runnerVersion',
        '[].lastHealthCheckAt',
        '[].lastHealthCheckOk',
      ]).executeTest(async (server) => {
        const targets = await apiAt(server.url).targets();
        expect(targets.length).toBeGreaterThan(0);
        expect(targets[0].minimums).toBeDefined();
        expect(targets[0].used).toBeDefined();
      }),
  );

  it.skipIf(!recorded(DECLARED_TARGET, 'getTarget'))(
    'read-target: getTarget answers one whole target',
    () =>
      given(DECLARED_TARGET, 'getTarget', 'read-target', [
        'id',
        'name',
        'description',
        'slotsTotal',
        'minimums',
        'used',
        'login',
        'credentialVolume',
        'loginCommand',
        'kimiLoginCommand',
        'connected',
        'connectedSince',
        'quarantined',
        'quarantineReason',
        'quarantinedAt',
        'runnerVersion',
        'registered',
        'registeredAt',
        'lastSeenAt',
        'lastHealthCheckAt',
        'lastHealthCheckOk',
        'createdAt',
      ]).executeTest(async (server) => {
        const target = await apiAt(server.url).target(
          param(DECLARED_TARGET, 'getTarget', 'targetId'),
        );
        expect(target.name).toBeTruthy();
      }),
  );

  it.skipIf(!recorded(DECLARED_TARGET, 'patchTarget'))(
    'save-target-edit: patchTarget sends exactly description and the changed minimums',
    () => {
      const body = sent(DECLARED_TARGET, 'patchTarget') as PatchTargetDto;
      return given(DECLARED_TARGET, 'patchTarget', 'save-target-edit', [
        'id',
        'name',
        'description',
        'minimums',
      ]).executeTest(async (server) => {
        const patched = await apiAt(server.url).patchTarget(
          param(DECLARED_TARGET, 'patchTarget', 'targetId'),
          body,
        );
        expect(patched.description).toBe(body.description);
      });
    },
  );

  it.skipIf(!recorded(DECLARED_TARGET, 'deleteTarget'))(
    'delete-target: deleteTarget answers 204',
    () =>
      given(DECLARED_TARGET, 'deleteTarget', 'delete-target', []).executeTest(async (server) => {
        await expect(
          apiAt(server.url).deleteTarget(param(DECLARED_TARGET, 'deleteTarget', 'targetId')),
        ).resolves.toBeUndefined();
      }),
  );

  it.skipIf(!recorded(UNREGISTERED_RUNNER, 'rotateTargetRegistrationToken'))(
    'rotate-token: rotateTargetRegistrationToken answers a new one-time install line',
    () =>
      given(UNREGISTERED_RUNNER, 'rotateTargetRegistrationToken', 'rotate-token', [
        'target.id',
        'target.name',
        'registrationToken',
        'installLine',
      ]).executeTest(async (server) => {
        const rotated = await apiAt(server.url).rotateTargetRegistrationToken(
          param(UNREGISTERED_RUNNER, 'rotateTargetRegistrationToken', 'runnerId'),
        );
        expect(rotated.installLine).toBeTruthy();
      }),
  );

  it.skipIf(!recorded(DECLARED_TARGET, 'greenlightTarget'))(
    'greenlight-target: greenlightTarget answers the target as it now is',
    () =>
      given(DECLARED_TARGET, 'greenlightTarget', 'greenlight-target', [
        'id',
        'name',
        'quarantined',
      ]).executeTest(async (server) => {
        const target = await apiAt(server.url).greenlightTarget(
          param(DECLARED_TARGET, 'greenlightTarget', 'targetId'),
        );
        expect(target.id).toBeTruthy();
      }),
  );

  it.skipIf(!recorded(DECLARED_TARGET, 'requestTargetHealthCheck'))(
    'run-health-check: requestTargetHealthCheck refuses a disconnected target with TARGET_UNAVAILABLE',
    () =>
      given(DECLARED_TARGET, 'requestTargetHealthCheck', 'run-health-check', [
        'code',
        'message',
      ]).executeTest(async (server) => {
        const outcome = apiAt(server.url).requestTargetHealthCheck(
          param(DECLARED_TARGET, 'requestTargetHealthCheck', 'targetId'),
        );
        await expect(outcome).rejects.toSatisfy(
          (error: unknown) => errorCode(error) === 'TARGET_UNAVAILABLE',
        );
      }),
  );

  it.skipIf(!recorded(DECLARED_TARGET, 'requestTargetLoginCheck'))(
    'check-login: requestTargetLoginCheck refuses a disconnected target with TARGET_UNAVAILABLE',
    () =>
      given(DECLARED_TARGET, 'requestTargetLoginCheck', 'check-login', [
        'code',
        'message',
      ]).executeTest(async (server) => {
        const outcome = apiAt(server.url).requestTargetLoginCheck(
          param(DECLARED_TARGET, 'requestTargetLoginCheck', 'targetId'),
        );
        await expect(outcome).rejects.toSatisfy(
          (error: unknown) => errorCode(error) === 'TARGET_UNAVAILABLE',
        );
      }),
  );

  it.skipIf(!recorded(DECLARED_TARGET, 'getTargetHealth'))(
    'health-details: getTargetHealth answers a settled report with its checks',
    () =>
      given(DECLARED_TARGET, 'getTargetHealth', 'health-details', [
        'at',
        'ok',
        'detail',
        'requestId',
        'checks',
      ]).executeTest(async (server) => {
        const report = await apiAt(server.url).targetHealth(
          param(DECLARED_TARGET, 'getTargetHealth', 'targetId'),
        );
        expect(report?.checks.length).toBeGreaterThan(0);
      }),
  );

  it.skipIf(!recorded(NO_TARGET, 'getTargetInstallScript'))(
    'view-install-script: getTargetInstallScript answers text/plain',
    () =>
      addGoldenInteraction(pact, masters!, {
        provider: PROVIDER,
        state: NO_TARGET,
        operationId: 'getTargetInstallScript',
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'view-install-script' },
        consumes: [],
        // Not JSON, so the harness's `response` (as qits-ui-components' RAW_FILE block does for
        // qits-githost's `getRaw`): the pact binds the status and `Content-Type: text/plain`, which
        // is what `responseType: 'text'` needs. No example body: pact-jvm's verifier checks a body's
        // media type by sniffing the provider's real bytes, and a `#!/bin/sh` script sniffs as
        // `application/x-sh` whatever its header says, so a `text/plain` body could never verify.
        response: { contentType: 'text/plain' },
      }).executeTest(async (server) => {
        // The mock answers the bound header and no bytes; the client hands the text back as is.
        await expect(apiAt(server.url).targetInstallScript()).resolves.toBe('');
      }),
  );

  it.skipIf(!recorded(QUEUED_LEASE, 'listLeases'))(
    'list-leases: listLeases answers the type, owner, state and detail the leases table draws',
    () =>
      given(QUEUED_LEASE, 'listLeases', 'list-leases', [
        '[].id',
        '[].slotType',
        '[].ownerApp',
        '[].ownerRef',
        '[].state',
        '[].detail',
      ]).executeTest(async (server) => {
        // The recorded interaction answers an unfiltered `GET /leases`; `SystemApi.targetLeases`
        // always asks with `?targetId=`, which this fixture does not bind a query for yet. This
        // row therefore binds the shape with a bare fetch rather than through that method, until a
        // `targetId`-filtered recording publishes — at which point it should call
        // `apiAt(server.url).targetLeases(...)` like every other row here.
        const response = await fetch(`${server.url}/system/api/leases`, {
          headers: { Accept: 'application/json' },
        });
        const body = (await response.json()) as readonly { ownerApp: string }[];
        expect(body.length).toBeGreaterThan(0);
        expect(body[0].ownerApp).toBeTruthy();
      }),
  );

  it.skipIf(!recorded(CONNECTED_TARGET, 'startTargetSignIn'))(
    'start-sign-in: startTargetSignIn answers the sign-in, STARTING',
    () => {
      const body = sent(CONNECTED_TARGET, 'startTargetSignIn') as StartTargetSignInDto;
      return given(CONNECTED_TARGET, 'startTargetSignIn', 'start-sign-in', [
        'signInId',
        'targetId',
        'harness',
        'state',
        'url',
        'userCode',
        'detail',
        'startedAt',
        'updatedAt',
      ]).executeTest(async (server) => {
        const started = await apiAt(server.url).startTargetSignIn(
          param(CONNECTED_TARGET, 'startTargetSignIn', 'targetId'),
          body.harness,
        );
        expect(started.harness).toBe(body.harness);
        expect(started.signInId).toBeTruthy();
      });
    },
  );

  it.skipIf(!recorded(AWAITING_CODE, 'getTargetSignIn'))(
    'poll-sign-in: getTargetSignIn answers the state, url and code the card draws',
    () =>
      given(AWAITING_CODE, 'getTargetSignIn', 'poll-sign-in', [
        'signInId',
        'targetId',
        'harness',
        'state',
        'url',
        'userCode',
        'detail',
        'startedAt',
        'updatedAt',
      ]).executeTest(async (server) => {
        const read = await apiAt(server.url).targetSignIn(
          param(AWAITING_CODE, 'getTargetSignIn', 'targetId'),
          param(AWAITING_CODE, 'getTargetSignIn', 'signInId'),
        );
        expect(read.state).toBe('AWAITING_CODE');
        expect(read.url).toBeTruthy();
      }),
  );

  it.skipIf(!recorded(AWAITING_CODE, 'submitTargetSignInCode'))(
    'submit-sign-in-code: submitTargetSignInCode sends exactly the code',
    () => {
      const body = sent(AWAITING_CODE, 'submitTargetSignInCode') as TargetSignInCodeDto;
      return given(AWAITING_CODE, 'submitTargetSignInCode', 'submit-sign-in-code', [
        'signInId',
        'targetId',
        'harness',
        'state',
        'url',
        'userCode',
        'detail',
        'startedAt',
        'updatedAt',
      ]).executeTest(async (server) => {
        const submitted = await apiAt(server.url).submitTargetSignInCode(
          param(AWAITING_CODE, 'submitTargetSignInCode', 'targetId'),
          param(AWAITING_CODE, 'submitTargetSignInCode', 'signInId'),
          body.code,
        );
        expect(submitted.state).toBeTruthy();
      });
    },
  );

  it.skipIf(!recorded(AWAITING_CODE, 'cancelTargetSignIn'))(
    'cancel-sign-in: cancelTargetSignIn answers the sign-in, CANCELLED',
    () =>
      given(AWAITING_CODE, 'cancelTargetSignIn', 'cancel-sign-in', [
        'signInId',
        'targetId',
        'harness',
        'state',
        'url',
        'userCode',
        'detail',
        'startedAt',
        'updatedAt',
      ]).executeTest(async (server) => {
        const cancelled = await apiAt(server.url).cancelTargetSignIn(
          param(AWAITING_CODE, 'cancelTargetSignIn', 'targetId'),
          param(AWAITING_CODE, 'cancelTargetSignIn', 'signInId'),
        );
        expect(cancelled.state).toBe('CANCELLED');
      }),
  );
});
