function createTargetEvent({ sourceEvent, sourceCalendar }) {
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

  // Add source calendar id and source event id
  targetEvent.extendedProperties = {
    private: {
      sourceCalendarId: sourceCalendar.id,
      sourceEventId: sourceEvent.id,
    },
  };

  // Return target event
  return targetEvent;
}
