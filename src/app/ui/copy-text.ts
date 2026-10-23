import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { QitsButton } from '@qits/ui-components';

/** How long the button says "Copied" after a copy. */
export const COPIED_MS = 2000;

/**
 * A one-line value shown as code, with a button that puts it on the clipboard and says "Copied"
 * for two seconds — the targets page's install line, registration token and login commands (epic
 * qits-1481).
 *
 * Without a clipboard (an insecure origin, a denied permission) the press does nothing: the text
 * is on screen to select, which is why this never reports a failed copy as an error.
 */
@Component({
  selector: 'app-copy-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsButton],
  template: `
    <code class="copy-text">{{ text() }}</code>
    <qits-button variant="ghost" size="sm" (pressed)="copy()">{{ buttonLabel() }}</qits-button>
  `,
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .copy-text {
      min-width: 0;
      flex: 1 1 auto;
      padding: 0.3rem 0.5rem;
      border-radius: 0.3rem;
      background: #f3f4f6;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.82rem;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
  `,
})
export class CopyText {
  private readonly document = inject(DOCUMENT);

  readonly text = input.required<string>();
  /** The button's label before a copy (`Copy`, `Copy install line`). */
  readonly label = input('Copy');

  private readonly copied = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly buttonLabel = computed(() => (this.copied() ? 'Copied' : this.label()));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  protected async copy(): Promise<void> {
    const clipboard = this.document.defaultView?.navigator?.clipboard;
    if (!clipboard) {
      return;
    }
    try {
      await clipboard.writeText(this.text());
    } catch {
      return;
    }
    this.copied.set(true);
    this.clear();
    this.timer = setTimeout(() => this.copied.set(false), COPIED_MS);
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = null;
  }
}
