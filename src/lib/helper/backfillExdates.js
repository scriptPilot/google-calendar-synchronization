// Fetch all cancelled instances of a recurring series via the Google Calendar
// instances API and return them as exdate strings (same format as correctExdates).
// This captures cancellations outside the sync range as well and is intended
// to run only when a target event is (re)created, not on every sync run.

function backfillExdates({ calendarId, eventId, calendarTimeZone, dateMax }) {
  const exdates = [];
  let pageToken = null;
  const baseOptions = {
    showDeleted: true,
    maxResults: 2500,
    ...(dateMax ? { timeMax: dateMax.toISOString() } : {}),
  };
  do {
    const options = pageToken
      ? { ...baseOptions, pageToken }
      : { ...baseOptions };
    const response = Calendar.Events.instances(calendarId, eventId, options);
    const items = response.items || [];
    items.forEach((instance) => {
      if (instance.status !== "cancelled") return;
      if (!instance.originalStartTime) return;
      const instanceExdate = DateTime.fromISO(
        instance.originalStartTime.dateTime || instance.originalStartTime.date,
        {
          zone: instance.originalStartTime.timeZone || calendarTimeZone,
        },
      );
      exdates.push(
        instance.originalStartTime.dateTime
          ? instanceExdate.toFormat("yMMdd'T'HHmmss")
          : instanceExdate.toFormat("yMMdd"),
      );
    });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return exdates;
}
