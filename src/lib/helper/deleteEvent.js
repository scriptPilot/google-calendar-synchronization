function deleteEvents(calendarId, events) {
  events.forEach((event) => {
    Calendar.Events.remove(calendarId, event.id);
    Logger.log(
      `Deleted event "${event.summary || "(no title)"}" at ${createLocalDateStr(event.start)}`,
    );
  });
}
