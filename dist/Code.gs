// Google Calendar Synchronization, build on 2025-01-16
// Source: https://github.com/scriptPilot/google-calendar-synchronization

function runOneWaySync(
  sourceCalendarName,
  targetCalendarName,
  previousDays = 7,
  nextDays = 21,
  correctionFunction = (targetEvent) => targetEvent,
) {
  // Get calendar details
  const sourceCalendar = getCalendarByName({
    calendarName: sourceCalendarName,
  });
  const targetCalendar = getCalendarByName({
    calendarName: targetCalendarName,
  });

  // Log start
  Logger.log(
    `Synchronization started from "${sourceCalendar.summary}" to "${targetCalendar.summary}"`,
  );

  // Calculate min and max time
  const today = new Date();
  const timeMin = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - previousDays,
    0,
    0,
    0,
  );
  const timeMax = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + nextDays,
    23,
    59,
    59,
  );

  // Get source events and cut recurring events
  let sourceEvents = getEventsByCalendar({
    calendar: sourceCalendar,
    timeMin,
    timeMax,
  });
  sourceEvents = cutRecurringEvents(
    sourceCalendar,
    sourceEvents,
    timeMin,
    timeMax,
  );

  // Get existing target events
  const existingTargetEvents = getEventsByCalendar({
    calendar: targetCalendar,
    sourceCalendarId: sourceCalendar.id,
  });

  // Calculate target events, apply correction function
  let targetEvents = sourceEvents
    .map((sourceEvent) =>
      correctionFunction(
        createTargetEvent(sourceEvent, sourceCalendar),
        sourceEvent,
      ),
    )
    .filter((e) => e.status !== "cancelled");

  // Remove undefined properties from target event
  targetEvents = targetEvents.map((event) => {
    Object.keys(event).forEach((key) => {
      if (event[key] === undefined) delete event[key];
    });
    return event;
  });

  // Calculate obsolete target events
  const obsoleteExistingTargetEvents = [];
  existingTargetEvents.forEach((existingTargetEvent) => {
    const targetEventFound = targetEvents.filter((e) =>
      eventsAreEqual(e, existingTargetEvent),
    ).length;
    const duplicatedExistingTargetEventFound = existingTargetEvents.filter(
      (e) =>
        eventsAreEqual(e, existingTargetEvent) && e.id < existingTargetEvent.id,
    ).length;
    if (!targetEventFound || duplicatedExistingTargetEventFound)
      obsoleteExistingTargetEvents.push(existingTargetEvent);
  });

  // Calculate missing target events
  const missingTargetEvents = [];
  targetEvents.forEach((targetEvent) => {
    const existingTargetEventFound = existingTargetEvents.filter(
      (existingEvent) => eventsAreEqual(targetEvent, existingEvent),
    ).length;
    if (!existingTargetEventFound) missingTargetEvents.push(targetEvent);
  });

  // Remove obsolete existing target events
  obsoleteExistingTargetEvents.forEach((existingTargetEvent) => {
    Calendar.Events.remove(targetCalendar.id, existingTargetEvent.id);
    const startStr = getUTCDateTimeStr(existingTargetEvent.start);
    Logger.log(
      `Deleted event "${existingTargetEvent.summary || "(no title)"}" at ${startStr}`,
    );
  });

  // Create missing target events
  missingTargetEvents.forEach((targetEvent) => {
    Calendar.Events.insert(targetEvent, targetCalendar.id);
    const startStr = getUTCDateTimeStr(targetEvent.start || targetEvent.start);
    Logger.log(
      `Created event "${targetEvent.summary || "(no title)"}" at ${startStr}`,
    );
  });

  // Log completion
  const timeMinStr = timeMin.toLocaleString("en-CA").substr(0, 10);
  const timeMaxStr = timeMax.toLocaleString("en-CA").substr(0, 10);
  Logger.log(
    `${sourceEvents.length} source event${sourceEvents.length !== 1 ? "s" : ""} found between ${timeMinStr} and ${timeMaxStr}`,
  );
  Logger.log(
    `${obsoleteExistingTargetEvents.length} obsolete target event${obsoleteExistingTargetEvents.length !== 1 ? "s" : ""} deleted`,
  );
  Logger.log(
    `${missingTargetEvents.length} missing target event${missingTargetEvents.length !== 1 ? "s" : ""} created`,
  );
  Logger.log("Synchronization completed");
}

// This function reset the script
// Run it after changing the onCalendarUpdate function

function resetScript() {
  PropertiesService.getUserProperties().deleteAllProperties();
  console.log("Script reset done.");
}

// Returns event array by calendar resource
// https://developers.google.com/calendar/api/v3/reference/events#resource

function getEventsByCalendar({ calendar, timeMin, timeMax, sourceCalendarId }) {
  // Check input
  if (!calendar || typeof calendar.id !== "string")
    throw new Error("calendar.id should be a string");

  // Define options
  const options = {};
  if (timeMin) options.timeMin = timeMin.toISOString();
  if (timeMax) options.timeMax = timeMax.toISOString();
  if (sourceCalendarId)
    options.privateExtendedProperty = `sourceCalendarId=${sourceCalendarId}`;

  // Retrieve events with pagination
  let events = [];
  let pageToken = null;
  while (pageToken !== undefined) {
    const { nextPageToken, items } = Calendar.Events.list(
      calendar.id,
      pageToken ? { ...options, pageToken } : { ...options },
    );
    events = [...events, ...items];
    pageToken = nextPageToken;
  }

  // Correct returned exdate prefix
  // - source events are not containing any exdate property
  // - target events are returning different format compared to the required input
  // - without correction, existing target events with exdate will be replaced on each sync run
  const exdateReturnedPrefix = "EXDATE;VALUE=DATE-TIME:";
  const exdateNewPrefix = `EXDATE;TZID=UTC:`;
  events = events.map((e) => ({
    ...e,
    ...(e.recurrence
      ? {
          recurrence: e.recurrence.map((r) =>
            r.replace(exdateReturnedPrefix, exdateNewPrefix),
          ),
        }
      : {}),
  }));

  // Add exdates to the event series
  // - source events are not containing any exdate property
  // - to create proper target events, the exdates are required in event series
  events = events.map((event) => {
    // Return any non-event-series unchanged
    if (!event.recurrence) return event;

    // Create array with exdates
    const exdates = [];

    // Filter events for instances of this event series
    const instances = events.filter((e) => e.recurringEventId === event.id);

    // Add instances to exdates array
    instances.forEach((instance) => {
      const instanceExdate = getRecurrenceRuleDateStr(
        instance.originalStartTime || instance.start,
      );
      exdates.push(instanceExdate);
    });

    // Add exdates to event
    if (exdates.length)
      event.recurrence.push(exdateNewPrefix + exdates.sort().join(","));

    // Retuen event
    return event;
  });

  // Sort recurrence array
  events = events.map((event) => ({
    ...event,
    ...(event.recurrence
      ? { recurrence: sortRecurrence(event.recurrence) }
      : {}),
  }));

  // Remove events with status cancelled
  // - cancelled events might not have all properties
  // - exdates added before to the event series
  events = events.filter((e) => e.status !== "cancelled");

  // Return events array
  return events;
}

// Returns calendar resource by calendar name
// https://developers.google.com/calendar/api/v3/reference/calendarList#resource

function getCalendarByName({ calendarName }) {
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

// This function deletes all synchronized events from a calendar
// Run this after the removal of calendars or other issues

function cleanCalendar(calendarName) {
  // Get calendar by name
  const calendar = getCalendarByName({ calendarName });
  if (!calendar) throw new Error(`Calendar "${calendarName}" not found`);

  // Get events
  const events = getEventsByCalendar({ calendar });

  // Loop events
  events.forEach((event) => {
    // Event is synchronized from another calendar
    if (isSynchronizedEvent(event)) {
      try {
        // Delete the event
        Calendar.Events.remove(calendar.id, event.id);

        // Log deletion
        console.info(`Deleted event "${event.summary}"`);
      } catch (error) {
        // Log error
        console.error(`Failed to delete event "${event.summary}"`);
        console.error(error);
      }
    }
  });
}

function sortRecurrence(recArr) {
  return recArr
    .map((recItem) => {
      [recKey, recValue] = recItem.split(":");
      recValue = recValue.split(";").sort().join(";");
      return [recKey, recValue].join(":");
    })
    .sort();
}

function sortObject(obj) {
  if (Array.isArray(obj)) return obj.sort();
  if (typeof obj === "object" && obj !== null) {
    const sortedObj = {};
    const sortedKeys = Object.keys(obj).sort();
    sortedKeys.forEach((key) => {
      sortedObj[key] = sortObject(obj[key]);
    });
    return sortedObj;
  }
  return obj;
}

function removeMetaPropsFromEvent(event) {
  const {
    iCalUID,
    recurringEventId,
    sequence,
    id,
    updated,
    organizer,
    htmlLink,
    conferenceData,
    hangoutLink,
    reminders,
    etag,
    eventType,
    created,
    creator,
    kind,
    status,
    ...cleanEvent
  } = event;
  return cleanEvent;
}

function getUTCDateTimeStr(dateTimeObject) {
  if (dateTimeObject.dateTime) {
    return new Date(dateTimeObject.dateTime).toISOString();
  } else {
    const date = new Date(dateTimeObject.date);
    date.setTime(date.getTime() + date.getTimezoneOffset() * 60 * 1000);
    return date.toISOString();
  }
}

function getRecurrenceRuleDateStr(dateTimeObj) {
  return getUTCDateTimeStr(dateTimeObj).replace(/(\.000)|(:)|(-)/g, "");
}

function eventsAreEqual(firstEvent, secondEvent) {
  firstEvent = removeMetaPropsFromEvent(firstEvent);
  firstEvent = JSON.stringify(sortObject(firstEvent));
  secondEvent = removeMetaPropsFromEvent(secondEvent);
  secondEvent = JSON.stringify(sortObject(secondEvent));
  return firstEvent === secondEvent;
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

function createTargetEvent(sourceEvent, sourceCalendar) {
  // Create target event
  const targetEvent = {};

  // Keep only time-based properties to avoid any unwanted data exposure
  const defaultProps = ["start", "end", "recurrence"];
  defaultProps.forEach((prop) => {
    if (sourceEvent[prop] !== undefined) targetEvent[prop] = sourceEvent[prop];
  });

  // Add missing timezone to event start and end date
  targetEvent.start.timeZone =
    targetEvent.start.timeZone || sourceCalendar.timeZone;
  targetEvent.end.timeZone =
    targetEvent.end.timeZone || sourceCalendar.timeZone;

  // Use default summary
  const defaultSummary = "Busy";
  if (!defaultProps.includes("summary")) targetEvent.summary = defaultSummary;

  // Add source calendar id
  targetEvent.extendedProperties = {
    private: {
      sourceCalendarId: sourceCalendar.id,
    },
  };

  // Return target event
  return targetEvent;
}
