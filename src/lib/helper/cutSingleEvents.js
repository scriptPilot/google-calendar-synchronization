function cutSingleEvents(events, dateMin, dateMax) {
  return events.map((event) => {
    if (!event.recurrence) {
      const startDate = new Date(event.start.dateTime || event.start.date);
      const endDate = new Date(event.end.dateTime || event.end.date);
      if (startDate < dateMin) {
        if (event.start.dateTime) event.start.dateTime = dateMin.toISOString();
        else event.start.date = dateMin.toLocaleDateString("en-CA");
      }
      if (endDate > dateMax) {
        if (event.end.dateTime) event.end.dateTime = dateMax.toISOString();
        else event.end.date = dateMax.toLocaleDateString("en-CA");
      }
    }
    return event;
  });
}
