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
