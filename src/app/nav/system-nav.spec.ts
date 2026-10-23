import { provideLocationMocks } from '@angular/common/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Routes } from '@angular/router';
import { SystemNav } from './system-nav';

/** A destination for the router to land on, so a URL can be asserted without mounting a page. */
@Component({
  selector: 'app-nav-spec-blank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class Blank {}

/**
 * The real route table is not used here on purpose: this spec is about the mapping between the URL
 * and the highlighted entry, and mounting the real pages would drag their reads in and assert them
 * by accident.
 */
const STUB_ROUTES: Routes = [{ path: '**', component: Blank }];

/**
 * The sub-navigation, which is the whole navigation of this app.
 *
 * Two rules, asserted in both directions: the URL decides which entry is current — including for
 * the pages that are not entries of their own, a node and a terminal, which belong to Nodes — and
 * the group headings are labels, never links, so a reader cannot click into a `/swarm` that does
 * not exist.
 */
describe('SystemNav', () => {
  let router: Router;
  let fixture: ComponentFixture<SystemNav>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(STUB_ROUTES), provideLocationMocks()],
    });
    router = TestBed.inject(Router);
  });

  async function mountAt(url: string): Promise<void> {
    await router.navigateByUrl(url);
    fixture = TestBed.createComponent(SystemNav);
    await fixture.whenStable();
  }

  function current(): string {
    const element = fixture.nativeElement as HTMLElement;
    return element.querySelector('a.current')?.textContent?.trim() ?? '';
  }

  function texts(selector: string): string[] {
    const element = fixture.nativeElement as HTMLElement;
    return Array.from(element.querySelectorAll(selector)).map(
      (node) => node.textContent?.trim() ?? '',
    );
  }

  it('offers six views under two headings', async () => {
    await mountAt('/');
    expect(texts('.heading')).toEqual(['System', 'Swarm']);
    expect(texts('a')).toEqual(['Overview', 'Targets', 'Nodes', 'Services', 'Configs', 'Secrets']);
  });

  it('marks Overview on the base path, and nowhere else', async () => {
    await mountAt('/');
    expect(current()).toBe('Overview');

    await mountAt('/swarm/services');
    expect(current()).toBe('Services');
  });

  it('marks Targets under its own entry, not under Swarm', async () => {
    await mountAt('/targets');
    expect(current()).toBe('Targets');
  });

  /** A node page and a container tab are reached from Nodes, and read as being under it. */
  it('keeps Nodes current inside a node and inside its tabs', async () => {
    await mountAt('/swarm/nodes/n1');
    expect(current()).toBe('Nodes');

    await mountAt('/swarm/nodes/n1/containers');
    expect(current()).toBe('Nodes');
  });

  /** A shell is opened from a container table, so the menu keeps pointing at where it came from. */
  it('keeps Nodes current on a terminal', async () => {
    await mountAt('/terminals/t1?node=n1');
    expect(current()).toBe('Nodes');
  });

  it('marks a service detail under Services, and a config detail under Configs', async () => {
    await mountAt('/swarm/services/qits-platform-idp');
    expect(current()).toBe('Services');

    await mountAt('/swarm/configs/c1');
    expect(current()).toBe('Configs');

    await mountAt('/swarm/secrets');
    expect(current()).toBe('Secrets');
  });

  /** A deep link renders before any NavigationEnd arrives, so the seed is what is asserted here. */
  it('follows a navigation made after it was mounted', async () => {
    await mountAt('/');
    await router.navigateByUrl('/swarm/nodes');
    await fixture.whenStable();
    expect(current()).toBe('Nodes');
  });
});
