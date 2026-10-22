// A day drawn as an empty column. Recorded time of 0 is still a bar: only a day marked
// unrecorded with no active time is omitted from the series.
export function trendUnrecorded(day) {
  return day.recorded === false && !day.ms;
}

// The local day a trend bar selects. `dataIndex` is the same index the tooltip and the
// bar series use. An unrecorded column has no bar, so it is not a day. A recorded zero is.
export function trendDayAt(days, dataIndex) {
  if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= (days?.length ?? 0)) return null;
  const day = days[dataIndex];
  if (!day || trendUnrecorded(day) || !Number.isFinite(day.at)) return null;
  return day.at;
}
