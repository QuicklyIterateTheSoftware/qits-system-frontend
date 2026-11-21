import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import type { VolumeSummaryDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { NONE, formatInstant, plural } from '../ui/format';
import { NodeResourceTab } from './node-resource-tab';

/**
 * Every volume on this node.
 *
 * The mountpoint is shown because it is the one fact a reader cannot get anywhere else on this
 * platform, and the one they need before going to the disk itself.
 */
@Component({
  selector: 'app-node-volumes-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty],
  styleUrls: ['../ui/page.css', './node-tab.css'],
  templateUrl: './node-volumes-tab.html',
})
export class NodeVolumesTab extends NodeResourceTab<VolumeSummaryDto> {
  protected readonly none = NONE;
  protected readonly instant = formatInstant;

  protected readonly caption = computed(() => plural(this.rows().length, 'volume'));

  protected read(nodeId: string): Promise<readonly VolumeSummaryDto[]> {
    return this.api.volumes(nodeId);
  }
}
