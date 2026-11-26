import type { Bottle } from '../../../types';
import Button from '../../ui/Button';
import BottleGroupLabel from './BottleGroupLabel';

interface BottleGroupActionRowProps {
  /** The first bottle of the group, for its name and category. */
  bottle: Bottle;
  count: number;
  isEmpty: boolean;
  /** Shown under the label, e.g. when the action does less than its text says. */
  note?: string;
  /** Text of the button. */
  actionText: string;
  /** Accessible name of the button, which names the bottle. */
  actionLabel: string;
  onAction: () => void;
}

/** A group of identical bottles outside the menu, with the button that brings it in. */
export default function BottleGroupActionRow({
  bottle,
  count,
  isEmpty,
  note,
  actionText,
  actionLabel,
  onAction,
}: BottleGroupActionRowProps) {
  return (
    <li className="flex items-center gap-3 p-3 rounded-lg border border-line-strong bg-canvas">
      <div className="flex-1 min-w-0">
        <BottleGroupLabel bottle={bottle} count={count} isEmpty={isEmpty} />
        {note && <p className="mt-1 text-xs text-warning">{note}</p>}
      </div>
      <Button variant="secondary" size="sm" aria-label={actionLabel} onClick={onAction}>
        {actionText}
      </Button>
    </li>
  );
}
