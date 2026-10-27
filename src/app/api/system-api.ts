import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { DOCUMENT, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QITS_API_BASE } from './api-base';
import {
  NODE_REMOTE,
  type ConfigDetailDto,
  type ConfigSummaryDto,
  type ContainerLogsDto,
  type ContainerSummaryDto,
  type CreateTargetDto,
  type CreateTerminalDto,
  type HealthCheckRequestedDto,
  type ImageSummaryDto,
  type LeaseDto,
  type NetworkSummaryDto,
  type NodeDetailDto,
  type NodeSummaryDto,
  type OverviewDto,
  type PatchTargetDto,
  type RotateTargetRegistrationTokenDto,
  type SecretSummaryDto,
  type SignInHarness,
  type StartTargetSignInDto,
  type ServiceDetailDto,
  type ServiceSummaryDto,
  type TargetDto,
  type TargetHealthReportDto,
  type TargetRegistrationDto,
  type TargetSignInCodeDto,
  type TargetSignInDto,
  type TerminalDto,
  type TerminalShell,
  type VolumeSummaryDto,
} from './dto';

/**
 * Everything this app says to qits-platform-system, through the edge, at `/system/api`.
 *
 * **Reads everywhere, and three writes that are the point of the application**: create a terminal,
 * and delete one. Nothing here changes the swarm — v1 does not scale, restart or remove anything.
 *
 * **Every path is relative.** The SPA is served at `/system/` by the service itself, behind the edge
 * that serves `/system/api/…`, so a same-origin absolute path is what lets the browser's session
 * cookie reach the service. A configured origin would move every call cross-origin, leave the
 * cookie behind, and answer 401 with nothing on screen to explain it. {@link socketUrl} makes the
 * same path absolute for one reason only: `WebSocket` takes no relative URL.
 *
 * **Failures are thrown, not described.** An `HttpErrorResponse` reaching a caller still holds the
 * service's `{"message": …}` body; `ui/loadable.ts` is the one place that body is read. The one
 * error a caller reads rather than reports is the 409 `NODE_REMOTE` a foreign node's resources
 * answer, and {@link isNodeRemote} is how a page recognises it.
 */
@Injectable({ providedIn: 'root' })
export class SystemApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(QITS_API_BASE);
  private readonly document = inject(DOCUMENT);

  /** The host, its disk and the swarm, in one call — what the overview's header line is made of. */
  overview(): Promise<OverviewDto> {
    return firstValueFrom(this.http.get<OverviewDto>(`${this.base}/system/api/overview`));
  }

  /** Every node in the swarm. Cluster-wide: this read is answered by the manager. */
  nodes(): Promise<readonly NodeSummaryDto[]> {
    return firstValueFrom(this.http.get<NodeSummaryDto[]>(`${this.base}/system/api/swarm/nodes`));
  }

  node(id: string): Promise<NodeDetailDto> {
    return firstValueFrom(this.http.get<NodeDetailDto>(this.swarmUrl('nodes', id)));
  }

  services(): Promise<readonly ServiceSummaryDto[]> {
    return firstValueFrom(
      this.http.get<ServiceSummaryDto[]>(`${this.base}/system/api/swarm/services`),
    );
  }

  /** One service with its tasks — where swarm placed each replica, and how that went. */
  service(id: string): Promise<ServiceDetailDto> {
    return firstValueFrom(this.http.get<ServiceDetailDto>(this.swarmUrl('services', id)));
  }

  configs(): Promise<readonly ConfigSummaryDto[]> {
    return firstValueFrom(
      this.http.get<ConfigSummaryDto[]>(`${this.base}/system/api/swarm/configs`),
    );
  }

  /** One config with its contents. The service base64-decodes; this app renders the text as it is. */
  config(id: string): Promise<ConfigDetailDto> {
    return firstValueFrom(this.http.get<ConfigDetailDto>(this.swarmUrl('configs', id)));
  }

  /** Secrets, metadata only. There is no detail call, because swarm does not hand back a value. */
  secrets(): Promise<readonly SecretSummaryDto[]> {
    return firstValueFrom(
      this.http.get<SecretSummaryDto[]>(`${this.base}/system/api/swarm/secrets`),
    );
  }

  /**
   * Every container on one node, stopped ones included.
   *
   * `all=true` is the default this app asks for and never varies: a container that exited two
   * minutes ago is the one an operator came to look at, and hiding it would make the page useless
   * for the only question it is opened with.
   */
  containers(nodeId: string): Promise<readonly ContainerSummaryDto[]> {
    return firstValueFrom(
      this.http.get<ContainerSummaryDto[]>(`${this.nodeUrl(nodeId)}/containers`, {
        params: new HttpParams().set('all', true),
      }),
    );
  }

  /** The tail of a container's log — the last `tail` lines, as one blob of text. */
  containerLogs(nodeId: string, containerId: string, tail = 200): Promise<ContainerLogsDto> {
    return firstValueFrom(
      this.http.get<ContainerLogsDto>(
        `${this.nodeUrl(nodeId)}/containers/${encodeURIComponent(containerId)}/logs`,
        { params: new HttpParams().set('tail', tail) },
      ),
    );
  }

  images(nodeId: string): Promise<readonly ImageSummaryDto[]> {
    return firstValueFrom(this.http.get<ImageSummaryDto[]>(`${this.nodeUrl(nodeId)}/images`));
  }

  volumes(nodeId: string): Promise<readonly VolumeSummaryDto[]> {
    return firstValueFrom(this.http.get<VolumeSummaryDto[]>(`${this.nodeUrl(nodeId)}/volumes`));
  }

  networks(nodeId: string): Promise<readonly NetworkSummaryDto[]> {
    return firstValueFrom(this.http.get<NetworkSummaryDto[]>(`${this.nodeUrl(nodeId)}/networks`));
  }

  /**
   * Ask for the host monitor.
   *
   * **Find-or-create, and the service decides which.** One glances container serves every operator
   * on the platform, so a second visitor is handed the first one's session — 200 rather than 201 —
   * and the page attaches to it. That is also why leaving the overview only detaches: deleting the
   * session on the way out would blank the screen of whoever else is watching. The service ends it
   * a few seconds after the last viewer detaches, so nothing is left running.
   */
  createGlancesTerminal(): Promise<TerminalDto> {
    return this.createTerminal({ kind: 'GLANCES' });
  }

  /**
   * Open a shell in a container.
   *
   * The container is sent as the id or name the caller has; the service validates it, resolves it
   * through `docker container inspect`, and never puts the caller's string in an argv. A container
   * that is not running is a 409, and an unknown one a 404 — both reach the caller whole.
   */
  createExecTerminal(container: string, shell: TerminalShell): Promise<TerminalDto> {
    return this.createTerminal({ kind: 'EXEC', container, shell });
  }

  terminal(id: string): Promise<TerminalDto> {
    return firstValueFrom(this.http.get<TerminalDto>(this.terminalUrl(id)));
  }

  /** Terminate a terminal now. The PTY dies with it; a browser closing its socket does not. */
  deleteTerminal(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.terminalUrl(id)));
  }

  /**
   * The absolute `ws://` (or `wss://`) URL of one terminal's socket.
   *
   * It is absolute because `WebSocket` takes no relative URL, and the scheme is derived from the
   * page's rather than configured: the SPA is same-origin with the service by construction, so any
   * other answer would be describing a deployment that does not exist. The session cookie the edge
   * set is what authenticates the upgrade — a socket cannot carry an Authorization header.
   */
  socketUrl(id: string): string {
    const page = this.document.defaultView?.location;
    const scheme = page?.protocol === 'https:' ? 'wss:' : 'ws:';
    const origin = page ? `${scheme}//${page.host}` : '';
    return `${origin}${this.terminalUrl(id)}`;
  }

  private createTerminal(body: CreateTerminalDto): Promise<TerminalDto> {
    return firstValueFrom(this.http.post<TerminalDto>(`${this.base}/system/api/terminals`, body));
  }

  // --- targets (epic qits-1481) -------------------------------------------------------------

  /** Every target, by name. */
  targets(): Promise<readonly TargetDto[]> {
    return firstValueFrom(this.http.get<TargetDto[]>(`${this.base}/system/api/targets`));
  }

  target(id: string): Promise<TargetDto> {
    return firstValueFrom(this.http.get<TargetDto>(this.targetUrl(id)));
  }

  /** Declares a target; answers its install line and registration token, once. */
  createTarget(body: CreateTargetDto): Promise<TargetRegistrationDto> {
    return firstValueFrom(
      this.http.post<TargetRegistrationDto>(`${this.base}/system/api/targets`, body),
    );
  }

  /** Changes a target's description or reservations. 409 `RESERVATIONS_EXCEED_TOTAL` when their sum is
   * above the total the runner last reported. */
  patchTarget(id: string, body: PatchTargetDto): Promise<TargetDto> {
    return firstValueFrom(this.http.patch<TargetDto>(this.targetUrl(id), body));
  }

  /**
   * Decommissions a target. 409 `TARGET_BUSY` while it holds a lease that has not ended. The 204's
   * empty body is discarded — `HttpClient` hands it over as `null` — so this resolves `undefined`,
   * as qits-projects-frontend's `ProjectsApi.deleteWork` does.
   */
  async deleteTarget(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<unknown>(this.targetUrl(id)));
  }

  /**
   * Replaces a target's registration token; answers a new one-time install line. Works on a
   * registered target too: pasting the new line reinstalls its runner under the same target id,
   * and the old runner's client is decommissioned once the new one registers.
   *
   * `slots` resets the install line's `QITS_SYSTEM_RUNNER_SLOTS` the way {@link createTarget}'s
   * does. Left undefined, no body is sent at all — byte-identical to a plain rotate — so a caller
   * that never passes it keeps today's request exactly.
   */
  rotateTargetRegistrationToken(id: string, slots?: number): Promise<TargetRegistrationDto> {
    const body: RotateTargetRegistrationTokenDto | null = slots === undefined ? null : { slots };
    return firstValueFrom(
      this.http.post<TargetRegistrationDto>(`${this.targetUrl(id)}/registration-token`, body),
    );
  }

  /** Lifts a target's quarantine. */
  greenlightTarget(id: string): Promise<TargetDto> {
    return firstValueFrom(this.http.post<TargetDto>(`${this.targetUrl(id)}/greenlight`, {}));
  }

  /** Asks a connected target for a health check. 409 `TARGET_UNAVAILABLE` when it is not
   * connected. The answer is only an acknowledgement; read {@link targetHealth} once it settles. */
  requestTargetHealthCheck(id: string): Promise<HealthCheckRequestedDto> {
    return firstValueFrom(
      this.http.post<HealthCheckRequestedDto>(`${this.targetUrl(id)}/healthcheck`, {}),
    );
  }

  /** Asks a connected target to probe its sign-in now. 409 `TARGET_UNAVAILABLE` when it is not
   * connected. */
  requestTargetLoginCheck(id: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.targetUrl(id)}/login-check`, {}));
  }

  /**
   * A target's newest settled health check, or `null` when none has settled yet.
   *
   * The service answers 204 for "nothing yet", which carries no body for `HttpClient` to parse —
   * `observe: 'response'` is what lets this read the status without `HttpClient` trying anyway.
   */
  async targetHealth(id: string): Promise<TargetHealthReportDto | null> {
    const response = await firstValueFrom(
      this.http.get<TargetHealthReportDto>(`${this.targetUrl(id)}/health`, {
        observe: 'response',
      }),
    );
    return response.status === 204 ? null : response.body;
  }

  /**
   * The generic install script the install line pipes to `sh` — carries no secret, so it is safe
   * to show an operator who wants to read it before pasting the line that pipes it in.
   */
  targetInstallScript(): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.base}/system/api/targets/install.sh`, { responseType: 'text' }),
    );
  }

  /**
   * Signs a connected target in to `harness` (qits-1593): its runner runs the harness's own login
   * and relays the URL and code it prints. Answers 202 with the sign-in, `STARTING`; poll
   * {@link targetSignIn} from there. 409 `TARGET_UNAVAILABLE` when the target is not connected,
   * 409 `SIGN_IN_RUNNING` while one for that harness has not settled.
   */
  startTargetSignIn(id: string, harness: SignInHarness): Promise<TargetSignInDto> {
    const body: StartTargetSignInDto = { harness };
    return firstValueFrom(this.http.post<TargetSignInDto>(`${this.targetUrl(id)}/sign-ins`, body));
  }

  /** One sign-in, while it runs and ~15 minutes after it settles. 404 `SIGN_IN_NOT_FOUND` after. */
  targetSignIn(id: string, signInId: string): Promise<TargetSignInDto> {
    return firstValueFrom(this.http.get<TargetSignInDto>(this.signInUrl(id, signInId)));
  }

  /** Hands an `AWAITING_CODE` sign-in the code the browser showed. 409
   * `SIGN_IN_NOT_AWAITING_CODE` in any other state. */
  submitTargetSignInCode(id: string, signInId: string, code: string): Promise<TargetSignInDto> {
    const body: TargetSignInCodeDto = { code };
    return firstValueFrom(
      this.http.post<TargetSignInDto>(`${this.signInUrl(id, signInId)}/code`, body),
    );
  }

  /** Stops a sign-in; answers it `CANCELLED`, or as it settled when it already had. */
  cancelTargetSignIn(id: string, signInId: string): Promise<TargetSignInDto> {
    return firstValueFrom(this.http.delete<TargetSignInDto>(this.signInUrl(id, signInId)));
  }

  /** The leases of one target — type, owner, state and detail. */
  targetLeases(targetId: string): Promise<readonly LeaseDto[]> {
    return firstValueFrom(
      this.http.get<LeaseDto[]>(`${this.base}/system/api/leases`, {
        params: new HttpParams().set('targetId', targetId),
      }),
    );
  }

  private targetUrl(id: string): string {
    return `${this.base}/system/api/targets/${encodeURIComponent(id)}`;
  }

  private signInUrl(id: string, signInId: string): string {
    return `${this.targetUrl(id)}/sign-ins/${encodeURIComponent(signInId)}`;
  }

  private swarmUrl(kind: string, id: string): string {
    return `${this.base}/system/api/swarm/${kind}/${encodeURIComponent(id)}`;
  }

  private nodeUrl(nodeId: string): string {
    return `${this.base}/system/api/nodes/${encodeURIComponent(nodeId)}`;
  }

  private terminalUrl(id: string): string {
    return `${this.base}/system/api/terminals/${encodeURIComponent(id)}`;
  }
}

/**
 * Whether a failed node-scoped read is v1's boundary rather than a fault.
 *
 * The service answers 409 `{"code":"NODE_REMOTE"}` for a node that is not the one it runs on. It is
 * checked by code and not by status alone because 409 also means "that container is not running",
 * which is an entirely different sentence on screen.
 */
export function isNodeRemote(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 409 &&
    typeof error.error === 'object' &&
    error.error !== null &&
    (error.error as { code?: unknown }).code === NODE_REMOTE
  );
}

/**
 * The `code` of a failed write's `{"message": …, "code": …}` body, when it carries one.
 *
 * The targets doors answer several named codes on the one status (409 alone carries
 * `RESERVATIONS_EXCEED_TOTAL`, `TARGET_BUSY` and `TARGET_UNAVAILABLE`), so a caller that must read one
 * apart from the others asks this rather than growing a fourth `isXxx` beside {@link isNodeRemote}.
 */
export function errorCode(error: unknown): string | undefined {
  if (
    !(error instanceof HttpErrorResponse) ||
    typeof error.error !== 'object' ||
    error.error === null
  ) {
    return undefined;
  }
  const code = (error.error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
