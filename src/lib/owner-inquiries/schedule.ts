export type Slot = { startAt: number; endAt: number };
export type ScheduleCheck =
  | "INCOMPLETE"
  | "BAD_RANGE"
  | "CONFLICT"
  | "ROUTE_UNAVAILABLE"
  | "OUTSIDE_HOURS"
  | "READY";

export const MINUTE = 60_000;

export function checkSchedule(
  slot: Slot,
  occupied: Slot[],
  options: {
    required: boolean;
    routeAvailable?: boolean;
    hours?: Slot;
    outsideConfirmed?: boolean;
  },
): ScheduleCheck {
  if (!options.required) return "INCOMPLETE";
  if (
    !Number.isFinite(slot.startAt) ||
    !Number.isFinite(slot.endAt) ||
    slot.endAt <= slot.startAt
  ) {
    return "BAD_RANGE";
  }
  if (
    occupied.some(
      (other) => slot.startAt < other.endAt && other.startAt < slot.endAt,
    )
  ) {
    return "CONFLICT";
  }
  if (options.routeAvailable === false) return "ROUTE_UNAVAILABLE";
  if (
    options.hours &&
    !options.outsideConfirmed &&
    (slot.startAt < options.hours.startAt || slot.endAt > options.hours.endAt)
  ) {
    return "OUTSIDE_HOURS";
  }
  return "READY";
}
