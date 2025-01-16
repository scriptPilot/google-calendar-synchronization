function cutEventsSeries(events, dateMin, dateMax, calendarId) {
  return events
    .map((event) => {
      if (event.recurrence) {
        // Get first instance in timeframe based on original start date
        // - request for next 32 days to cover monthly rules
        // - limit to 32 days for performance reasons
        // - there is no orderBy in the API to limit to first instance only
        const instances = Calendar.Events.instances(calendarId, event.id, {
          timeMin: dateMin.toISOString(),
          timeMax: new Date(
            dateMin.getTime() + 32 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }).items.sort((a, b) => {
          const aOriginalStart = new Date(
            a.originalStartTime.dateTime || a.originalStartTime.date,
          );
          const bOriginalStart = new Date(
            b.originalStartTime.dateTime || b.originalStartTime.date,
          );
          return aOriginalStart <= bOriginalStart ? -1 : 1;
        });

        // Instance found within timeframe
        if (instances.length) {
          // Calculate new event start and end dates
          const eventStart = new Date(event.start.dateTime || event.start.date);
          const eventEnd = new Date(event.end.dateTime || event.end.date);
          const duration = eventEnd - eventStart;
          const instanceOriginalEventStart = new Date(
            instances[0].originalStartTime.dateTime ||
              instances[0].originalStartTime.date,
          );
          const newEventStart = instanceOriginalEventStart;
          const newEventEnd = new Date(
            instanceOriginalEventStart.getTime() + duration,
          );

          // Set new event start end end dates
          // TODO: manage timezones properly
          event.start = {
            ...event.start,
            ...(event.start.dateTime
              ? { dateTime: newEventStart.toISOString() }
              : { date: newEventStart.toLocaleDateString("en-CA") }),
          };
          event.end = {
            ...event.end,
            ...(event.end.dateTime
              ? { dateTime: newEventEnd.toISOString() }
              : { date: newEventEnd.toLocaleDateString("en-CA") }),
          };

          // Limit instances
          const ruleWithCount = event.recurrence.filter((r) =>
            r.includes("COUNT"),
          )[0];
          if (ruleWithCount) {
            let countStartDate = new Date(
              event.start.dateTime || event.start.date,
            );
            let countDate = new Date(countStartDate.getTime());
            let count = 0;
            while (countDate < dateMax) {
              count++;
              if (ruleWithCount.includes("DAILY"))
                countDate = new Date(
                  countDate.getFullYear(),
                  countDate.getMonth(),
                  countDate.getDate() + 1,
                );
              if (ruleWithCount.includes("WEEKLY"))
                countDate = new Date(
                  countDate.getFullYear(),
                  countDate.getMonth(),
                  countDate.getDate() + 7,
                );
              if (ruleWithCount.includes("MONTHLY"))
                countDate = new Date(
                  countDate.getFullYear(),
                  countDate.getMonth() + 1,
                  countDate.getDate(),
                );
              if (ruleWithCount.includes("YEARLY"))
                countDate = new Date(
                  countDate.getFullYear() + 1,
                  countDate.getMonth(),
                  countDate.getDate(),
                );
            }
            const newRuleWithCount = ruleWithCount.replace(
              /COUNT=[0-9]+/,
              `COUNT=${count}`,
            );
            event.recurrence = event.recurrence.map((r) =>
              r === ruleWithCount ? newRuleWithCount : r,
            );
          }
          if (!ruleWithCount) {
            // reduce by 1 ms to get the date string of the last day and not the next day for allday events
            const until = createRRuleDateStr({
              date: new Date(
                dateMax.getTime() - (isAlldayEvent(event) ? 1 : 0),
              ).toLocaleDateString("en-CA"),
            });
            let untilSet = false;
            event.recurrence = event.recurrence.map((el) => {
              if (el.substr(0, 6) === "RRULE:") {
                el = el
                  .split(";")
                  .map((subEl) => {
                    if (subEl.substr(0, 6) === "UNTIL=" && !untilSet) {
                      untilSet = true;
                      if (new Date(subEl.substr(6) > dateMax))
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
            });
            event = createSortedEvent(event);
          }
        } else {
          // Exclude all event series without instance within timeframe
          event.status = "cancelled";
        }
      }
      return event;
    })
    .filter((e) => e.status !== "cancelled");
}
