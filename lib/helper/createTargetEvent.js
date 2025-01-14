function createTargetEvent(sourceEvent, sourceCalendar) {
  // Create target event
  const targetEvent = {};

  // Keep only time-based properties to avoid any unwanted data exposure
  const defaultProps = ["start", "end", "recurrence"];
  defaultProps.forEach((prop) => {
    if (sourceEvent[prop] !== undefined) targetEvent[prop] = sourceEvent[prop];
  });

  // Use default summary
  const defaultSummary = "Busy";
  if (!defaultProps.includes("summary")) targetEvent.summary = defaultSummary;

  // Add missing timezone to recurring events
  targetEvent.start.timeZone =
    targetEvent.start.timeZone || sourceCalendar.timeZone;
  targetEvent.end.timeZone =
    targetEvent.end.timeZone || sourceCalendar.timeZone;

  // Add source calendar id
  targetEvent.extendedProperties = {
    private: {
      sourceCalendarId: sourceCalendar.id,
    },
  };

  // Return target event
  return targetEvent;
}
