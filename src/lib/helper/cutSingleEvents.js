// Cut single events according to the specified timeframe

function cutSingleEvents(events, dateMin, dateMax) {
  const DateTime = loadDateTime();
  const dateTimeMin = DateTime.fromJSDate(dateMin);
  const dateTimeMax = DateTime.fromJSDate(dateMax);
  return events
    .map((event) => {
      if (!event.recurrence) {
        let dateTimeStart = DateTime.fromISO(
          event.start.dateTime || event.start.date,
        );
        let dateTimeEnd = DateTime.fromISO(
          event.end.dateTime || event.end.date,
        );
        if (dateTimeStart < dateTimeMin) dateTimeStart = dateTimeMin;
        if (dateTimeEnd > dateTimeMax) dateTimeEnd = dateTimeMax;
        if (dateTimeEnd <= dateTimeStart)
          return { ...event, status: "cancelled" };
        return {
          ...event,
          start: {
            ...event.start,
            ...(event.start.dateTime
              ? { dateTime: dateTimeStart.toISO() }
              : { date: dateTimeStart.toISODate() }),
          },
          end: {
            ...event.end,
            ...(event.end.dateTime
              ? { dateTime: dateTimeEnd.toISO() }
              : { date: dateTimeEnd.toISODate() }),
          },
        };
      }
      return event;
    })
    .filter((e) => e.status !== "cancelled");
}
