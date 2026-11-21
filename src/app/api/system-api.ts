import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { DOCUMENT, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QITS_API_BASE } from './api-base';
import {
  NODE_REMOTE,
  type ConfigDetailDto,
  type ContainerLogsDto,
  type ContainerSummaryDto,
  type CreateTerminalDto,
  type ImageSummaryDto,
  type NetworkSummaryDto,
  type NodeDetailDto,
  type OverviewDto,
  type ServiceSummaryDto,
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

  node(id: string): Promise<NodeDetailDto> {
    return firstValueFrom(this.http.get<NodeDetailDto>(this.swarmUrl('nodes', id)));
  }

  services(): Promise<readonly ServiceSummaryDto[]> {
    return firstValueFrom(
      this.http.get<ServiceSummaryDto[]>(`${this.base}/system/api/swarm/services`),
    );
  }

  /** One config with its contents. The service base64-decodes; this app renders the text as it is. */
  config(id: string): Promise<ConfigDetailDto> {
    return firstValueFrom(this.http.get<ConfigDetailDto>(this.swarmUrl('configs', id)));
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
   * other answer would be describing a deployment that does not exist. `WEB_SOCKET_FACTORY`
   * (`@qits/angular`'s `QITS_WEB_SOCKET`, epic qits-543) is what authenticates the upgrade now — a
   * socket cannot carry an `Authorization` header, so the bearer rides as the `qits.bearer`
   * subprotocol instead of the session cookie.
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
