import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SystemApi, isNodeRemote } from './system-api';

/**
 * Every call, at the addresses qits-platform-system serves them at.
 *
 * The assertions worth having are the ones that are invisible on screen when they are wrong:
 * **every path is relative**, because a configured origin would leave the edge's session cookie
 * behind and turn every read into a 401; **the verbs are right**, because a POST that should have
 * been a DELETE fails as a 405 with nothing to see; **an id is encoded**, because a service name is
 * a path segment and a container ref is whatever the reader clicked; and **the create body is flat
 * and spells `container`**, because the service reads exactly that field and a `containerId` would
 * be a silent 400 on every shell.
 */
describe('SystemApi', () => {
  let api: SystemApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SystemApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the overview at a relative path', async () => {
    const overview = api.overview();

    const request = http.expectOne('/system/api/overview');
    expect(request.request.method).toBe('GET');
    request.flush({
      host: { hostname: 'wohlben', os: 'Fedora', cpus: 8, memoryBytes: 16, dockerVersion: '28' },
      swarm: { state: 'active', nodeId: 'n1', managers: 1, nodes: 1 },
    });

    expect((await overview).host.hostname).toBe('wohlben');
  });

  it('lists the swarm as bare arrays, never an envelope', async () => {
    const services = api.services();
    http.expectOne('/system/api/swarm/services').flush([]);
    expect(await services).toEqual([]);
  });

  it('reads one swarm object by id, encoded', async () => {
    void api.node('n1');
    http.expectOne('/system/api/swarm/nodes/n1').flush({ id: 'n1' });
  });

  /** Stopped containers are the ones a reader came for, so `all` is asked for and never varies. */
  it('asks for every container on a node, stopped ones included', async () => {
    void api.containers('n1');

    const request = http.expectOne(
      (candidate) => candidate.url === '/system/api/nodes/n1/containers',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('all')).toBe('true');
    request.flush([]);
  });

  it('reads a log tail as a query parameter, not a path segment', async () => {
    void api.containerLogs('n1', 'abc', 50);

    const request = http.expectOne(
      (candidate) => candidate.url === '/system/api/nodes/n1/containers/abc/logs',
    );
    expect(request.request.params.get('tail')).toBe('50');
    request.flush({ text: '', truncated: false });
  });

  it('reads the remaining node resource at its own path', async () => {
    void api.volumes('n1');
    http.expectOne('/system/api/nodes/n1/volumes').flush([]);
  });

  /** GLANCES is find-or-create, so the body carries the kind and nothing else. */
  it('asks for glances with a kind and no target', async () => {
    void api.createGlancesTerminal();

    const request = http.expectOne('/system/api/terminals');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ kind: 'GLANCES' });
    request.flush({ id: 't1', kind: 'GLANCES', container: null });
  });

  /** The field is `container`. A `containerId` would be a 400 the reader would read as "no bash". */
  it('asks for a shell with a flat body naming container and shell', async () => {
    void api.createExecTerminal('abc123', 'bash');

    const request = http.expectOne('/system/api/terminals');
    expect(request.request.body).toEqual({ kind: 'EXEC', container: 'abc123', shell: 'bash' });
    request.flush(
      { id: 't2', kind: 'EXEC', container: { id: 'abc123', name: '/x' } },
      {
        status: 201,
        statusText: 'Created',
      },
    );
  });

  it('reads and deletes one terminal by id', async () => {
    void api.terminal('t1');
    http
      .expectOne('/system/api/terminals/t1')
      .flush({ id: 't1', kind: 'GLANCES', container: null });

    void api.deleteTerminal('t1');
    const remove = http.expectOne('/system/api/terminals/t1');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
  });

  /** WebSocket takes no relative URL, so this is the one absolute address in the app. */
  it('builds an absolute socket URL from the page, same host and same path', () => {
    expect(api.socketUrl('t1')).toBe(`ws://${location.host}/system/api/terminals/t1`);
  });
});

/**
 * The one error read by its body rather than its status. 409 also means "that container is not
 * running", which is a different sentence and must not become a "not reachable" card.
 */
describe('isNodeRemote', () => {
  const conflict = (body: unknown) =>
    new HttpErrorResponse({ status: 409, statusText: 'Conflict', error: body });

  it('recognises the code the service sends for a foreign node', () => {
    expect(isNodeRemote(conflict({ code: 'NODE_REMOTE', message: 'only the local node' }))).toBe(
      true,
    );
  });

  it('does not mistake another 409 for it', () => {
    expect(isNodeRemote(conflict({ message: 'container is not running' }))).toBe(false);
    expect(isNodeRemote(new HttpErrorResponse({ status: 503 }))).toBe(false);
    expect(isNodeRemote(new Error('offline'))).toBe(false);
  });
});
