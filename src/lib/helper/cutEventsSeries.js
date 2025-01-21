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
          `DTSTART;TZID=${eventStartTimeZone}:${eventStart.toFormat("yMMdd'T'HHmmss")}\n${event.recurrence.join("\n")}`,
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

        // No valid instances
        const exdates =
          typeof rrule.exdates === "function"
            ? rrule.exdates().map((exdate) => exdate.toISOString())
            : [];
        const instancesWithoutExdates = instances.filter(
          (instance) => !exdates.includes(instance.toISOString()),
        );
        if (!instancesWithoutExdates.length)
          return { ...event, status: "cancelled" };

        // Update start date
        const newEventStart = DateTime.fromJSDate(instances[0]);
        event.start = {
          ...event.start,
          ...(event.start.dateTime
            ? { dateTime: newEventStart.toISO() }
            : { date: newEventStart.toISODate() }),
        };

        // Update end date
        const eventEndTimeZone = event.end.timeZone || calendarTimeZone;
        const eventEnd = DateTime.fromISO(
          event.end.dateTime || event.end.date,
          { zone: eventEndTimeZone },
        );
        const eventDuration = eventEnd - eventStart;
        const newEventEnd = newEventStart.plus({
          seconds: eventDuration / 1000,
        });
        event.end = {
          ...event.end,
          ...(event.end.dateTime
            ? { dateTime: newEventEnd.toISO() }
            : { date: newEventEnd.toISODate() }),
        };

        // Remove COUNT, update UNTIL
        const lastInstanceEndOfDay = DateTime.fromJSDate(
          instances.slice(-1)[0],
        ).endOf("day");
        const timeframeEndDate = DateTime.fromJSDate(dateMax);
        const newUntilDate = DateTime.min(
          lastInstanceEndOfDay,
          timeframeEndDate,
        );
        event.recurrence = event.recurrence.map((arrEl) => {
          if (arrEl.substr(0, 6) === "RRULE:") {
            let [rulePrefix, ruleStr] = arrEl.split(":");
            let ruleStrParts = ruleStr.split(";");
            ruleStrParts = ruleStrParts.filter(
              (rsp) => rsp.substr(0, 6) !== "COUNT=",
            );
            ruleStrParts = ruleStrParts.filter(
              (rsp) => rsp.substr(0, 6) !== "UNTIL=",
            );
            ruleStrParts.push(
              `UNTIL=${newUntilDate.toUTC().toFormat("yMMdd'T'HHmmss'Z'")}`,
            );
            ruleStr = ruleStrParts.join(";");
            return [rulePrefix, ruleStr].join(":");
          } else {
            return arrEl;
          }
        });
      }
      return event;
    })
    .filter((e) => e.status !== "cancelled");
}
