function deleteEvents(calendarId, events) {
  events.forEach((event) => {
    retryOnRateLimit(() => Calendar.Events.remove(calendarId, event.id));
    Logger.log(
      `Deleted event "${event.summary || "(no title)"}" at ${createLocalDateStr(event.start)}`,
    );
    // Pause between the requests to avoid exceeding the Google Calendar API quota
    Utilities.sleep(250);
  });
}
