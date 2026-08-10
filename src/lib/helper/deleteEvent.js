function deleteEvents(calendarId, events) {
  events.forEach((event) => {
    Calendar.Events.remove(calendarId, event.id);
    try {
      Calendar.Events.remove(calendarId, event.id);
    } catch (e) {}
    Logger.log(
      `Deleted event "${event.summary || "(no title)"}" at ${createLocalDateStr(event.start)}`,
    );
  });
}
