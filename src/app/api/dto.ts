/**
 * What qits-platform-system answers, spelled as the pinned contract spells it
 * (`qits-system-plan.md`, "API").
 *
 * **The reads are bare JSON, not envelopes.** The contract writes `GET /swarm/nodes → [NodeSummary]`,
 * so an array is what arrives and an array is what this app parses. Several sibling explorers unwrap
 * a `{items: […]}` wrapper; this one does not, and a service that grew one would break these pages
 * silently — which is why the API spec asserts the shape rather than trusting it.
 *
 * **Wire names are camelCase**, not docker's `PascalCase`. The service reads
 * `docker … --format '{{json .}}'` and translates; nothing in this app ever sees docker's own field
 * names, so a change in how docker spells a field is the service's problem alone.
 *
 * **Every enum is a plain string, not a union.** Docker adds status words without asking, and a
 * union would only move the surprise from the screen to the compiler on the day it happens.
 * `ui/status-tone.ts` colours a word it has not been taught grey and moves on.
 *
 * **A field this app can live without is optional.** Everything the tables actually draw is
 * required; the extras a detail page merely embellishes with are not, so a service that has not
 * grown one yet renders an em dash rather than `undefined`.
 */

/** Docker's own view of the machine — `docker info`. Sizes are bytes; counts are counts. */
export interface HostInfo {
  readonly hostname: string;
  readonly os: string;
  readonly kernelVersion?: string | null;
  readonly architecture?: string | null;
  readonly cpus: number;
  readonly memoryBytes: number;
  readonly dockerVersion: string;
  readonly containers?: number | null;
  readonly containersRunning?: number | null;
  readonly images?: number | null;
}

/** What the daemon's disk holds — `docker system df`. Every figure is bytes. */
export interface DiskUsage {
  readonly imagesBytes: number;
  readonly containersBytes: number;
  readonly volumesBytes: number;
  readonly buildCacheBytes: number;
  readonly reclaimableBytes?: number | null;
}

/**
 * Where the swarm stands, from this daemon's point of view.
 *
 * `nodeId` is the node this service runs on, and it is the one node whose containers, images,
 * volumes and networks are readable in v1 — every other node answers `NODE_REMOTE`.
 */
export interface SwarmInfo {
  readonly state: string;
  readonly nodeId: string | null;
  readonly managers: number;
  readonly nodes: number;
}

/** What the overview asks for in one call. */
export interface OverviewDto {
  readonly host: HostInfo;
  readonly usage?: DiskUsage | null;
  readonly swarm: SwarmInfo;
}

/** A row of `docker node ls`. */
export interface NodeSummaryDto {
  readonly id: string;
  readonly hostname: string;
  readonly role: string;
  readonly availability: string;
  readonly status: string;
  readonly managerStatus?: string | null;
  readonly engineVersion?: string | null;
  readonly address?: string | null;
}

/** One node, with what `docker node inspect` adds to its row. */
export interface NodeDetailDto extends NodeSummaryDto {
  readonly os?: string | null;
  readonly architecture?: string | null;
  readonly cpus?: number | null;
  readonly memoryBytes?: number | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly labels?: Readonly<Record<string, string>> | null;
}

/**
 * A row of `docker service ls`.
 *
 * `replicas` is docker's own string — `3/3`, `0/1`, `global` — and is not parsed here: the two
 * numbers mean "running of wanted", and a page that split them would have to invent a rendering for
 * a global service that has neither.
 */
export interface ServiceSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly mode: string;
  readonly replicas: string;
  readonly image: string;
  readonly ports?: string | null;
  readonly updatedAt?: string | null;
}

/** One task of a service: where it was placed, and how that went. */
export interface TaskDto {
  readonly id: string;
  readonly slot?: number | null;
  readonly nodeId?: string | null;
  readonly nodeHostname?: string | null;
  readonly state: string;
  readonly desiredState: string;
  readonly error?: string | null;
  readonly updatedAt?: string | null;
}

/** One service with its spec and every task swarm has placed for it. */
export interface ServiceDetailDto extends ServiceSummaryDto {
  readonly createdAt?: string | null;
  readonly labels?: Readonly<Record<string, string>> | null;
  readonly tasks: readonly TaskDto[];
}

/** A row of `docker config ls` — and, for a secret, of `docker secret ls`. */
export interface ConfigSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly labels?: Readonly<Record<string, string>> | null;
}

/**
 * One config with its contents, base64-decoded by the service.
 *
 * There is no secret equivalent and there will not be one: swarm does not hand a secret's value
 * back, so the secrets page shows metadata and says so.
 */
export interface ConfigDetailDto extends ConfigSummaryDto {
  readonly data: string;
}

/** A secret, which is a name and some dates. The value is not readable, by swarm's design. */
export type SecretSummaryDto = ConfigSummaryDto;

/** A row of `docker ps -a` on one node. */
export interface ContainerSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly state: string;
  readonly status: string;
  readonly createdAt?: string | null;
  readonly ports?: string | null;
}

/** A row of `docker image ls`. */
export interface ImageSummaryDto {
  readonly id: string;
  readonly repository: string;
  readonly tag: string;
  readonly createdAt?: string | null;
  readonly sizeBytes?: number | null;
}

/** A row of `docker volume ls`. */
export interface VolumeSummaryDto {
  readonly name: string;
  readonly driver: string;
  readonly mountpoint?: string | null;
  readonly createdAt?: string | null;
}

/** A row of `docker network ls`. */
export interface NetworkSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly driver: string;
  readonly scope: string;
  readonly createdAt?: string | null;
}

/**
 * The tail of a container's log.
 *
 * `truncated` is the service saying it dropped bytes, and the page says so too: a log a reader
 * believes is complete and is not is worse than no log.
 */
export interface ContainerLogsDto {
  readonly text: string;
  readonly truncated: boolean;
}

/** What a terminal is running. `GLANCES` is the host monitor; `EXEC` is a shell in a container. */
export type TerminalKind = 'GLANCES' | 'EXEC';

/** The two shells an exec terminal may ask for. The service refuses anything else with a 400. */
export type TerminalShell = 'bash' | 'sh';

/** The container an exec terminal is attached to. Null on a glances terminal. */
export interface TerminalTargetDto {
  readonly id: string;
  readonly name: string;
}

/** A live terminal, as `POST /terminals` and `GET /terminals/{id}` answer it. */
export interface TerminalDto {
  readonly id: string;
  readonly kind: TerminalKind;
  readonly container: TerminalTargetDto | null;
  readonly shell?: TerminalShell | null;
  readonly createdAt?: string | null;
  readonly createdBy?: string | null;
  readonly attachedClients?: number | null;
  readonly socketPath?: string | null;
}

/**
 * What `POST /terminals` is asked for.
 *
 * A FLAT record, never a polymorphic body: the service's own note says so, and a discriminated
 * union on the wire would need a Jackson subtype registration that native image has to be told
 * about. `container` and `shell` are absent on a GLANCES request rather than null.
 */
export interface CreateTerminalDto {
  readonly kind: TerminalKind;
  readonly container?: string;
  readonly shell?: TerminalShell;
}

/**
 * What a node-scoped read answers for a node that is not this one: 409 with a code.
 *
 * It is the one error this app reads by its body rather than by its status, because it is not a
 * fault — it is v1's boundary, and the page draws it as a card instead of as a red bar.
 */
export const NODE_REMOTE = 'NODE_REMOTE';

/** The `{"message": …}` envelope every error in this service carries, with the optional code. */
export interface ErrorDto {
  readonly message: string;
  readonly code?: string;
}

/**
 * Targets, leases and work volumes — `eu.wohlben.qits.system.targets`, the one module of this
 * service that writes (epic qits-1481, dossier "Targets in qits-system: data, doors, allocation").
 * A target is a swarm this service's runner holds typed slots on; a lease is one owner's claim on a
 * slot of one type.
 */

/** Slots per type. Always filled on a read — `TargetViews.SlotCounts.of` defaults every member to
 * `0` — so a target's `reservations` and `used` are never partial; only a write may omit a member. */
export interface SlotCountsDto {
  readonly ci: number;
  readonly workspace: number;
  readonly desk: number;
}

/** A target's sign-in state for each harness. `null` is never probed; `UNKNOWN` is probed and
 * inconclusive — two different facts the page must not collapse into one dash. */
export interface TargetLoginDto {
  readonly claude: string | null;
  readonly kimi: string | null;
  readonly checkedAt: string | null;
}

/** `GET /system/api/targets` and `/targets/{id}`: everything the list and the card draw. */
export interface TargetDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly slotsTotal: number;
  /** Slots reserved per type. Not a limit: a type may use more while shared slots are free.
   * Absent from a qits-system older than qits-1682; read it through {@link reservationsOf}. */
  readonly reservations?: SlotCountsDto;
  /** @deprecated The old name of `reservations`, same values (qits-1682). */
  readonly minimums?: SlotCountsDto;
  readonly used: SlotCountsDto;
  readonly login: TargetLoginDto;
  readonly credentialVolume: string | null;
  readonly loginCommand: string | null;
  readonly kimiLoginCommand: string | null;
  readonly connected: boolean;
  readonly connectedSince: string | null;
  readonly quarantined: boolean;
  readonly quarantineReason: string | null;
  readonly quarantinedAt: string | null;
  readonly runnerVersion: string | null;
  readonly registered: boolean;
  readonly registeredAt: string | null;
  readonly lastSeenAt: string | null;
  readonly lastHealthCheckAt: string | null;
  readonly lastHealthCheckOk: boolean | null;
  readonly createdAt: string | null;
}

/**
 * What `POST /targets`, and `POST /targets/{id}/registration-token`, answer: the target, and its
 * one-use registration token carried in `installLine` once. Neither field is ever shown again.
 */
export interface TargetRegistrationDto {
  readonly target: TargetDto;
  readonly registrationToken: string;
  readonly installLine: string;
}

/** `POST /targets` — reservations default to 0 where left out. When `slots` is left out, the
 * install line's total is `max(reported total, sum of reservations)`; given, it must fit 0..1024
 * and be no less than the reservations' sum, or the service answers 400. */
export interface CreateTargetDto {
  readonly name: string;
  readonly description?: string;
  readonly reservations?: Partial<SlotCountsDto>;
  /** @deprecated The old name of `reservations`; send both until every qits-system reads the new
   * one (qits-1682). */
  readonly minimums?: Partial<SlotCountsDto>;
  readonly slots?: number;
}

/** `POST /targets/{id}/registration-token` — `RotateTargetRegistrationTokenRequest` on the wire.
 * Left out (no body at all), rotation behaves as it always has; given, it resets the install
 * line's total the same way {@link CreateTargetDto.slots} does, even on an already-registered
 * target — reinstalling with the new token reinstalls the runner under the same target id. */
export interface RotateTargetRegistrationTokenDto {
  readonly slots?: number;
}

/** `PATCH /targets/{id}` — a blank description clears it, an absent one leaves it; an absent
 * reservations member leaves its own value. */
export interface PatchTargetDto {
  readonly description?: string | null;
  readonly reservations?: Partial<SlotCountsDto>;
  /** @deprecated The old name of `reservations`; send both until every qits-system reads the new
   * one (qits-1682). */
  readonly minimums?: Partial<SlotCountsDto>;
}

/** A target's reservations: `reservations`, else the deprecated `minimums` an older qits-system
 * answers (qits-1682). */
export function reservationsOf(target: TargetDto): SlotCountsDto {
  return target.reservations ?? target.minimums ?? { ci: 0, workspace: 0, desk: 0 };
}

/** The same reservations under the new name and the deprecated one, for a write (qits-1682). */
export function withReservations(
  reservations: Partial<SlotCountsDto>,
): Pick<PatchTargetDto, 'reservations' | 'minimums'> {
  return { reservations, minimums: reservations };
}

/** `POST /targets/{id}/healthcheck`, 202: the request this ask was given, settled later. */
export interface HealthCheckRequestedDto {
  readonly requestId: string;
}

/** One named check inside a settled health report. */
export interface TargetHealthCheckDto {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string | null;
}

/** `GET /targets/{id}/health`, 200: the newest settled report. A 204 (nothing has settled yet) is
 * read as `null` by {@link SystemApi.targetHealth}. */
export interface TargetHealthReportDto {
  readonly at: string;
  readonly ok: boolean;
  readonly detail?: string | null;
  readonly requestId?: string | null;
  readonly checks: readonly TargetHealthCheckDto[];
}

/** A harness a target signs in to: the two `TargetLoginDto` carries a state for. */
export type SignInHarness = 'claude' | 'kimi';

/** `STARTING`, `AWAITING_CODE` (claude: open `url`, post the code the browser shows),
 * `AWAITING_BROWSER` (kimi: open `url`, approve `userCode`), then one of the terminal four —
 * `SUCCEEDED`, `FAILED`, `EXPIRED`, `CANCELLED`. Plain on the wire, like every other enum here. */
export type SignInState = string;

/** The states a sign-in never leaves; {@link TargetSignInDto} stops moving once it reaches one. */
export const TERMINAL_SIGN_IN_STATES: readonly SignInState[] = [
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
];

/**
 * `POST /targets/{id}/sign-ins` and the reads and writes on one (qits-1593): the runner on the
 * target runs the harness's own login in its credential volume and relays what it prints. Held in
 * the service's memory only, it expires after 10 minutes and is readable ~15 minutes after settling.
 */
export interface TargetSignInDto {
  readonly signInId: string;
  readonly targetId: string;
  readonly harness: SignInHarness;
  readonly state: SignInState;
  readonly url: string | null;
  readonly userCode: string | null;
  readonly detail: string | null;
  readonly startedAt: string;
  readonly updatedAt: string;
}

/** `POST /targets/{id}/sign-ins` — `StartSignInRequest` on the wire. */
export interface StartTargetSignInDto {
  readonly harness: SignInHarness;
}

/** `POST /targets/{id}/sign-ins/{signInId}/code` — `SignInCodeRequest` on the wire. */
export interface TargetSignInCodeDto {
  readonly code: string;
}

/** `CI`, `WORKSPACE` or `DESK` — a plain string on the wire, like every other enum here. */
export type SlotType = string;

/** `QUEUED`, `GRANTED`, `RUNNING`, `EXITED`, `FAILED`, `ENDING` or `ENDED` — plain, not a union. */
export type LeaseState = string;

/** `GET /leases`: one owner's claim on a slot of one type, on one target. */
export interface LeaseDto {
  readonly id: string;
  readonly slotType: SlotType;
  readonly ownerApp: string;
  readonly ownerRef: string;
  readonly projectId: string | null;
  readonly workKey: string | null;
  readonly pinTargetId: string | null;
  readonly targetId: string | null;
  readonly priority: number;
  readonly state: LeaseState;
  readonly spec?: unknown;
  readonly specHash?: string | null;
  readonly adopt?: unknown;
  readonly exitCode: number | null;
  readonly detail: string | null;
  readonly requestedAt: string | null;
  readonly grantedAt: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
}

/** `PATCH /targets/{id}`, 409: the reservations' sum is above the total the runner reported. */
export const RESERVATIONS_EXCEED_TOTAL = 'RESERVATIONS_EXCEED_TOTAL';

/** @deprecated {@link RESERVATIONS_EXCEED_TOTAL} as a qits-system older than qits-1682 names it. */
export const MINIMUMS_EXCEED_TOTAL = 'MINIMUMS_EXCEED_TOTAL';

/** `DELETE /targets/{id}`, 409: it still holds a lease that has not ended. */
export const TARGET_BUSY = 'TARGET_BUSY';

/** `POST /targets/{id}/sign-ins`, 409: a sign-in for that harness has not settled; the message
 * names its `signInId`. */
export const SIGN_IN_RUNNING = 'SIGN_IN_RUNNING';
