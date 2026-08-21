// Cut event series according to the specified timerange

function cutEventsSeries(events, dateMin, dateMax, calendarTimeZone) {
  return events
    .map((event) => {
      if (event.recurrence) {
        // Create rule object (including DTSTART, RRULE and EXDATE)
        const eventStartTimeZone = event.start.timeZone || calendarTimeZone;
        const eventStart = DateTime.fromISO(
          event.start.dateTime || event.start.date,
          { zone: eventStartTimeZone },
        );
        const rrule = RRuleStr(
          `DTSTART:${eventStart.toFormat("yMMdd'T'HHmmss")}\n${event.recurrence.join("\n")}`,
        );

        // Get instances
        const correctedDateMin = DateTime.fromJSDate(dateMin).toJSDate();
        const correctedDateMax = DateTime.fromJSDate(dateMax)
          .minus({ seconds: 1 })
          .toJSDate();
        const instances = rrule
          .between(correctedDateMin, correctedDateMax, true)
          .map((i) =>
            DateTime.fromJSDate(i)
              .toUTC()
              .setZone(eventStartTimeZone, { keepLocalTime: true })
              .toJSDate(),
          );

        // No valid instances within the sync range -> out of scope
        const exdates =
          typeof rrule.exdates === "function"
            ? rrule.exdates().map((exdate) => exdate.toISOString())
            : [];
        const instancesWithoutExdates = instances.filter(
          (instance) => !exdates.includes(instance.toISOString()),
        );
        if (!instancesWithoutExdates.length)
          return { ...event, status: "cancelled" };

        // Keep the original recurrence rule (DTSTART, COUNT, UNTIL) unchanged.
        // The series is synchronized as a whole so that occurrences outside the
        // sync range are created in the target calendar as well and the series
        // does not need to be recreated on every sync run. The sync range only
        // decides whether the series is in scope, which is handled by the source
        // event request (timeMin/timeMax) and the in-scope check above.
      }
      return event;
    })
    .filter((e) => e.status !== "cancelled");
}
