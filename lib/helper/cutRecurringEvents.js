function cutRecurringEvents(calendar, events, timeMin, timeMax) {
  return events
    .map((event) => {
      if (event.recurrence) {
        // Get first instance in timeframe
        // - request for next 32 days to cover monthly rules
        // - limit to 32 days for performance reasons
        // - there is no orderBy in the API to limit to first instance only
        const instances = Calendar.Events.instances(calendar.id, event.id, {
          timeMin: timeMin.toISOString(),
          timeMax: new Date(
            timeMin.getTime() + 32 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }).items.sort((i1, i2) => i1 > i2);

        // Instance found within timeframe
        if (instances.length) {
          event.start = instances[0].originalStartTime || instances[0].start;
          event.end = instances[0].end;

          // Limit UNTIL rule
          const until = getRecurrenceRuleDateStr({
            dateTime: timeMax.toISOString(),
          });
          let untilSet = false;
          event.recurrence = sortRecurrence(
            event.recurrence.map((el) => {
              if (el.substr(0, 6) === "RRULE:") {
                el = el
                  .split(";")
                  .map((subEl) => {
                    if (subEl.substr(0, 6) === "UNTIL=" && !untilSet) {
                      untilSet = true;
                      if (new Date(subEl.substr(6) > timeMax))
                        return "UNTIL=" + until;
                      else return subEl;
                    }
                    return subEl;
                  })
                  .join(";");
                if (!untilSet) {
                  untilSet = true;
                  el = el + ";UNTIL=" + until;
                }
                return el;
              }
              return el;
            }),
          );

          // Exclude all event series without instance within timeframe
        } else {
          event.status = "cancelled";
        }
      }
      return event;
    })
    .filter((e) => e.status !== "cancelled");
}
