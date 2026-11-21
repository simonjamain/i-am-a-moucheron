import { activeLayout } from './layouts.ts';
export const ROOM_SCALE: number = 1; // Compatibility alias; room geometry is already in metres.
// Live view of the active layout (see layouts.js): reads always follow the
// layout of the room being handled. `bounds` is shared by every layout.
type ActiveLayout = ReturnType<typeof activeLayout>;
export const OFFICE_LAYOUT: {
  readonly base: ActiveLayout['base'];
  readonly bounds: ActiveLayout['bounds'];
  readonly bin: ActiveLayout['bin'];
} = {
  get base() {
    return activeLayout().base;
  },
  get bounds() {
    return activeLayout().bounds;
  },
  get bin() {
    return activeLayout().bin;
  },
};
