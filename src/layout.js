import { activeLayout } from './layouts.js';
export const ROOM_SCALE = 1; // Compatibility alias; room geometry is already in metres.
// Live view of the active layout (see layouts.js): reads always follow the
// layout of the room being handled. `bounds` is shared by every layout.
export const OFFICE_LAYOUT = {
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
