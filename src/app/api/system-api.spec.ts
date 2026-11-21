import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SystemApi } from './system-api';

/**
 * Every call, at the addresses qits-platform-system serves them at.
 *
 * The assertions worth having are the ones that are invisible on screen when they are wrong:
 * **every path is relative**, because a configured origin would leave the edge's session cookie
 * behind and turn every read into a 401; and **the verbs are right**, because a POST that should
 * have been a DELETE fails as a 405 with nothing to see.
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

  /** GLANCES is find-or-create, so the body carries the kind and nothing else. */
  it('asks for glances with a kind and no target', async () => {
    void api.createGlancesTerminal();

    const request = http.expectOne('/system/api/terminals');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ kind: 'GLANCES' });
    request.flush({ id: 't1', kind: 'GLANCES', container: null });
  });

  it('deletes one terminal by id', async () => {
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
