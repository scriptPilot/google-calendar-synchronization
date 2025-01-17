// Google Calendar Synchronization, build on 2025-01-17
// Source: https://github.com/scriptPilot/google-calendar-synchronization

function start() {
  // Check onStart function
  if (typeof onStart !== "function") {
    throw new Error(
      "onStart() function is missing - please check the documentation",
    );
  }

  // Remove all existing triggers
  ScriptApp.getProjectTriggers().forEach((trigger) =>
    ScriptApp.deleteTrigger(trigger),
  );

  // Set the script invocation check to true
  onStart.calledByStartFunction = true;

  // Run the onStart function
  onStart();

  // Set the script invocation check to false
  onStart.calledByStartFunction = false;

  // Create a new time-based trigger for the start() function
  const minutes =
    typeof onStart.syncInterval === "number" ? onStart.syncInterval : 1;
  ScriptApp.newTrigger("start")
    .timeBased()
    .after(minutes * 60 * 1000)
    .create();
  Logger.log(
    `Synchronization will run again in approximately ${minutes} minute${minutes === 1 ? "" : "s"}`,
  );
}

function stop() {
  // Remove all existing triggers
  ScriptApp.getProjectTriggers().forEach((trigger) =>
    ScriptApp.deleteTrigger(trigger),
  );

  // Log script stop
  Logger.log(`The synchronization will not run again`);
  Logger.log(`If the script is currently running, it will complete`);
  Logger.log(`You might want to delete all synchronized events with clean()`);
}

function clean() {
  // Log start
  Logger.log(`Cleanup started`);
  // Get saved sync pairs
  const syncPairs =
    PropertiesService.getUserProperties()
      .getProperty("syncPairs")
      ?.split(";") || [];

  // Loop sync pairs
  let totalExistingTargetEvents = 0;
  syncPairs.forEach((syncPair) => {
    // Extract calendar ids
    [sourceCalendarId, targetCalendarId] = syncPair.split(":");

    // Get relevant target events
    const existingTargetEvents = getEvents({
      calendarId: targetCalendarId,
      sourceCalendarId: sourceCalendarId,
    });

    // Delete relevant target events
    deleteEvents(targetCalendarId, existingTargetEvents);

    // Sum-up target event count
    totalExistingTargetEvents =
      totalExistingTargetEvents + existingTargetEvents.length;
  });

  // Reset all user properties
  PropertiesService.getUserProperties().deleteAllProperties();

  // Log completion
  Logger.log(
    `${totalExistingTargetEvents} obsolete target event${totalExistingTargetEvents !== 1 ? "s" : ""} deleted`,
  );
  Logger.log("User properties reset done");
  Logger.log("Cleanup completed");
  Logger.log("You can now remove the Google Apps Script project");
}

function sync(
  sourceCalendarName,
  targetCalendarName,
  pastDays = 7,
  nextDays = 28,
  correction = (targetEvent) => targetEvent,
) {
  // Check script invocation
  if (!onStart.calledByStartFunction) {
    throw new Error(
      "Please select the Code.gs file and run the start() script.",
    );
  }

  // Check options
  if (!sourceCalendarName) throw new Error("sourceCalendarName is missing");
  if (!targetCalendarName) throw new Error("targetCalendarName is missing");

  // Log start
  Logger.log(
    `Synchronization started from "${sourceCalendarName}" to "${targetCalendarName}"`,
  );

  // Get calendar details
  const sourceCalendar = getCalendar({ calendarName: sourceCalendarName });
  const targetCalendar = getCalendar({ calendarName: targetCalendarName });

  // Remember sync pair for later cleanup
  const syncPair = `${sourceCalendar.id}:${targetCalendar.id}`;
  const syncPairs =
    PropertiesService.getUserProperties()
      .getProperty("syncPairs")
      ?.split(";") || [];
  if (!syncPairs.includes(syncPair)) syncPairs.push(syncPair);
  PropertiesService.getUserProperties().setProperty(
    "syncPairs",
    syncPairs.join(";"),
  );

  // Calculate timeframe
  const { dateMin, dateMax } = createTimeframe(pastDays, nextDays);

  // Get source events
  let sourceEvents = getEvents({
    calendarId: sourceCalendar.id,
    dateMin,
    dateMax,
  });
  Logger.log(
    `${sourceEvents.length} source event${sourceEvents.length !== 1 ? "s" : ""} found between ${createLocalDateStr(dateMin)} and ${createLocalDateStr(dateMax)}`,
  );

  // Reduce source events series to timeframe
  sourceEvents = cutEventsSeries(
    sourceEvents,
    dateMin,
    dateMax,
    sourceCalendar.id,
  );
  sourceEvents = cutSingleEvents(sourceEvents, dateMin, dateMax);

  // Get existing target events
  const existingTargetEvents = getEvents({
    calendarId: targetCalendar.id,
    sourceCalendarId: sourceCalendar.id,
  });

  // Create target events
  const targetEvents = sourceEvents
    .map((sourceEvent) => {
      let targetEvent = createTargetEvent({ sourceEvent, sourceCalendar });
      targetEvent = correction(targetEvent, sourceEvent);
      targetEvent = correctUndefinedProps(targetEvent);
      return targetEvent;
    })
    .filter((e) => e.status !== "cancelled");

  // Calculate obsolete existing target events
  const obsoleteExistingTargetEvents = [];
  existingTargetEvents.forEach((existingTargetEvent) => {
    const targetEventFound = targetEvents.filter((e) =>
      isEventEqual(e, existingTargetEvent),
    ).length;
    const duplicatedExistingTargetEventFound = existingTargetEvents.filter(
      (e) =>
        isEventEqual(e, existingTargetEvent) && e.id < existingTargetEvent.id,
    ).length;
    if (!targetEventFound || duplicatedExistingTargetEventFound)
      obsoleteExistingTargetEvents.push(existingTargetEvent);
  });

  // Calculate missing target events
  const missingTargetEvents = targetEvents.filter((targetEvent) => {
    return !existingTargetEvents.filter((e) => isEventEqual(e, targetEvent))
      .length;
  });

  // Remove obsolete existing target events
  deleteEvents(targetCalendar.id, obsoleteExistingTargetEvents);

  // Create missing target events
  missingTargetEvents.forEach((targetEvent) => {
    Calendar.Events.insert(targetEvent, targetCalendar.id);
    Logger.log(
      `Created event "${targetEvent.summary || "(no title)"}" at ${createLocalDateStr(targetEvent.start)}`,
    );
  });

  // Log completion
  Logger.log(
    `${obsoleteExistingTargetEvents.length} obsolete target event${obsoleteExistingTargetEvents.length !== 1 ? "s" : ""} deleted`,
  );
  Logger.log(
    `${missingTargetEvents.length} missing target event${missingTargetEvents.length !== 1 ? "s" : ""} created`,
  );
  Logger.log("Synchronization completed");
}

function setSyncInterval(minutes = 1) {
  // Check script invocation
  if (!onStart.calledByStartFunction) {
    throw new Error(
      "Please select the Code.gs file and run the start() script.",
    );
  }
  // Set the new sync interval
  onStart.syncInterval = minutes;
}

function correctExdates(events) {
  // Add missing exdates
  events = events.map((event) => {
    // Return any non-event-series unchanged
    if (!event.recurrence) return event;

    // Create array with exdates; keep existing ones
    const existingExdates = event.recurrence.filter(
      (r) => r.substr(0, 6) === "EXDATE",
    )[0];
    const exdates = existingExdates
      ? existingExdates.split(":")[1].split(",")
      : [];

    // Filter events for instances of this event series
    const instances = events.filter((e) => e.recurringEventId === event.id);

    // Add instances to the exdates array
    instances.forEach((instance) => {
      const instanceExdate = createRRuleDateStr(instance.originalStartTime);
      exdates.push(instanceExdate);
    });

    // Add exdates to the event
    if (exdates.length) {
      event.recurrence = event.recurrence.filter(
        (r) => r.substr(0, 6) !== "EXDATE",
      );
      event.recurrence.push("EXDATE:" + exdates.sort().join(","));
    }

    // Return the event
    return event;
  });

  // Remove cancelled instances (listed in exdates)
  events = events.filter(
    (e) => !(e.recurringEventId && e.status === "cancelled"),
  );

  // Return corrected events
  return events;
}

function isSynchronizedEvent(event) {
  return event.extendedProperties?.private?.sourceCalendarId !== undefined;
}

function isRecurringEvent(event) {
  return event.recurrence || event.recurringEventId;
}

function isOOOEvent(event) {
  return event.eventType === "outOfOffice";
}

function isAlldayEvent(event) {
  const start = new Date(event.start.dateTime || event.start.date);
  const end = new Date(event.end.dateTime || event.end.date);
  return (end - start) % (24 * 60 * 60 * 1000) === 0;
}

function isOnWeekend(event) {
  const startDate = new Date(event.start.dateTime || event.start.date);
  return startDate.getDay() === 6 || startDate.getDay() === 0;
}

function isBusyEvent(event) {
  return event.transparency !== "transparent" && !isOOOEvent(event);
}

function isOpenByMe(event) {
  return (
    event.attendees?.filter(
      (attendee) => attendee.email === Session.getEffectiveUser().getEmail(),
    )[0]?.responseStatus === "needsAction"
  );
}

function isAcceptedByMe(event) {
  return (
    event.attendees?.filter(
      (attendee) => attendee.email === Session.getEffectiveUser().getEmail(),
    )[0]?.responseStatus === "accepted"
  );
}

function isTentativeByMe(event) {
  return (
    event.attendees?.filter(
      (attendee) => attendee.email === Session.getEffectiveUser().getEmail(),
    )[0]?.responseStatus === "tentative"
  );
}

function isDeclinedByMe(event) {
  return (
    event.attendees?.filter(
      (attendee) => attendee.email === Session.getEffectiveUser().getEmail(),
    )[0]?.responseStatus === "declined"
  );
}

function correctUndefinedProps(event) {
  // Remove undefined props
  Object.keys(event).forEach((key) => {
    if (event[key] === undefined) delete event[key];
  });
  // Return event
  return event;
}

function createBareEvent(event) {
  const {
    conferenceData,
    created,
    creator,
    etag,
    eventType,
    hangoutLink,
    htmlLink,
    iCalUID,
    id,
    kind,
    organizer,
    recurringEventId,
    reminders,
    sequence,
    status,
    updated,
    ...cleanEvent
  } = event;
  return cleanEvent;
}

function createLocalDateStr(dateTime) {
  // Create the date object
  let date;
  if (dateTime instanceof Date) date = new Date(dateTime.getTime());
  else if (typeof dateTime === "string") date = new Date(dateTime);
  else date = new Date(dateTime.dateTime || dateTime.date);
  // Format the date and time components
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  // Combine the components into the desired format
  const formattedDateStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  // Return formatted date string
  return formattedDateStr;
}

function createRRuleDateStr(dateTime) {
  if (dateTime.dateTime) {
    return dateTime.dateTime.substr(0, 19).replace(/(\.000)|(:)|(-)/g, "");
  } else {
    return dateTime.date.replace(/-/g, "");
  }
}

function createSortedEvent(obj) {
  if (Array.isArray(obj)) return obj.sort();
  if (typeof obj === "object" && obj !== null) {
    const sortedObj = {};
    const sortedKeys = Object.keys(obj).sort();
    sortedKeys.forEach((key) => {
      sortedObj[key] = createSortedEvent(obj[key]);
    });
    return sortedObj;
  }
  return obj;
}

function createTargetEvent({ sourceEvent, sourceCalendar }) {
  // Create target event
  const targetEvent = {};

  // Keep only time-based properties to avoid any unwanted data exposure
  const defaultProps = ["start", "end", "recurrence"];
  defaultProps.forEach((prop) => {
    if (sourceEvent[prop] !== undefined) targetEvent[prop] = sourceEvent[prop];
  });

  // Use default summary
  const defaultSummary = "Busy";
  if (!defaultProps.includes("summary")) targetEvent.summary = defaultSummary;

  // Add source calendar id and source event id
  targetEvent.extendedProperties = {
    private: {
      sourceCalendarId: sourceCalendar.id,
      sourceEventId: sourceEvent.id,
    },
  };

  // Return target event
  return targetEvent;
}

function createTimeframe(pastDays, nextDays) {
  // Calculate timeframe
  const today = new Date();
  const todayMorning = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const dateMin = new Date(
    todayMorning.getTime() - pastDays * 24 * 60 * 60 * 1000,
  );
  const dateMax = new Date(
    todayMorning.getTime() + (nextDays + 1) * 24 * 60 * 60 * 1000,
  );
  return { dateMin, dateMax };
}

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

function deleteEvents(calendarId, events) {
  events.forEach((event) => {
    Calendar.Events.remove(calendarId, event.id);
    Logger.log(
      `Deleted event "${event.summary || "(no title)"}" at ${createLocalDateStr(event.start)}`,
    );
  });
}

// Returns calendar resource
// https://developers.google.com/calendar/api/v3/reference/calendarList#resource

function getCalendar({ calendarName }) {
  // Check input
  if (typeof calendarName !== "string")
    throw new Error("calendarName should be a string");

  // Retrieve and filter calendar list
  const calendarList = Calendar.CalendarList.list({ showHidden: true }).items;
  const filteredList = calendarList.filter((c) => c.summary === calendarName);

  // Throw error if no calendar is found
  if (filteredList.length < 1)
    throw new Error(`Calendar "${calendarName}" not found`);

  // Throw error if multiple calendar are found
  if (filteredList.length > 1)
    throw new Error(`Multiple calendar found for name "${calendarName}"`);

  // Return calendar resource
  const calendar = filteredList[0];
  return calendar;
}

// Returns array with events resources
// https://developers.google.com/calendar/api/v3/reference/events#resource

function getEvents({ calendarId, dateMin, dateMax, sourceCalendarId }) {
  // Check the input
  if (!calendarId) throw new Error("calendarId is missing");

  // Define options
  const options = {
    maxResults: 2500,
    ...(dateMin ? { timeMin: dateMin.toISOString() } : {}),
    ...(dateMax ? { timeMax: dateMax.toISOString() } : {}),
    ...(sourceCalendarId
      ? { privateExtendedProperty: `sourceCalendarId=${sourceCalendarId}` }
      : {}),
  };

  // Retrieve all events with pagination
  let events = [];
  let pageToken = null;
  while (pageToken !== undefined) {
    const { nextPageToken, items } = Calendar.Events.list(
      calendarId,
      pageToken ? { ...options, pageToken } : { ...options },
    );
    events = [...events, ...items];
    pageToken = nextPageToken;
  }

  // Correct exdates
  events = correctExdates(events);

  // Return the events array
  return events;
}

function isEventEqual(firstEvent, secondEvent) {
  firstEvent = JSON.stringify(createSortedEvent(createBareEvent(firstEvent)));
  secondEvent = JSON.stringify(createSortedEvent(createBareEvent(secondEvent)));
  return firstEvent === secondEvent;
}
