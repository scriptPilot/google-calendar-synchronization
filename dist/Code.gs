// Google Calendar Synchronization, build on 2025-01-20
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
  sourceEvents = correctExdates(sourceEvents, sourceCalendar.timeZone);
  sourceEvents = cutEventsSeries(
    sourceEvents,
    dateMin,
    dateMax,
    sourceCalendar.timeZone,
  );
  sourceEvents = cutSingleEvents(sourceEvents, dateMin, dateMax);
  Logger.log(
    `${sourceEvents.length} source event${sourceEvents.length !== 1 ? "s" : ""} found between ${createLocalDateStr(dateMin)} and ${createLocalDateStr(dateMax)}`,
  );

  // Get existing target events
  let existingTargetEvents = getEvents({
    calendarId: targetCalendar.id,
    sourceCalendarId: sourceCalendar.id,
  });
  existingTargetEvents = correctExdates(
    existingTargetEvents,
    targetCalendar.timeZone,
  );

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

// Correction for retrieved Google Calendar events
// - add cancelled instances as exdate to the main event
// - remove cancelled instances from the events array

function correctExdates(events, calendarTimeZone) {
  // Load DateTime
  const DateTime = loadDateTime();

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
      const instanceExdate = DateTime.fromISO(
        instance.originalStartTime.dateTime || instance.originalStartTime.date,
        { zone: instance.originalStartTime.timeZone || calendarTimeZone },
      );
      exdates.push(
        instance.originalStartTime.dateTime
          ? instanceExdate.toFormat("yMMdd'T'HHmmss")
          : instanceExdate.toFormat("yMMdd"),
      );
    });

    // Add exdates to the event
    if (exdates.length) {
      event.recurrence = event.recurrence.filter(
        (r) => r.substr(0, 6) !== "EXDATE",
      );
      event.recurrence.push(`EXDATE:${exdates.sort().join(",")}`);
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

function createDateFromObj(dateObj) {
  if (!dateObj.dateTime && !dateObj.date)
    throw new Error("Invalid date object");
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
    return (
      new Date(dateTime.dateTime)
        .toISOString()
        .substr(0, 19)
        .replace(/(\.000)|(:)|(-)/g, "") + "Z"
    );
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
      // Harmonize dateTime string
      if (key === "dateTime") {
        sortedObj[key] = new Date(obj[key]).toISOString();
        // Sort recurrence elements properly
      } else if (key === "recurrence") {
        sortedObj[key] = obj[key].map((el) => {
          let [elKey, elValue] = el.split(":");
          elValue = elValue.split(";").sort().join(";");
          return [elKey, elValue].join(":");
        });
        // Any other property
      } else {
        sortedObj[key] = createSortedEvent(obj[key]);
      }
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

// Cut event series according to the specified timerange

function cutEventsSeries(events, dateMin, dateMax, calendarTimeZone) {
  const DateTime = loadDateTime();
  const { rrulestr } = loadRRule();
  return events
    .map((event) => {
      if (event.recurrence) {
        // Create rule object (including DTSTART, RRULE and EXDATE)
        const eventStartTimeZone = event.start.timeZone || calendarTimeZone;
        const eventStart = DateTime.fromISO(
          event.start.dateTime || event.start.date,
          { zone: eventStartTimeZone },
        );
        const eventRule = event.recurrence.filter(
          (r) => r.substr(0, 6) === "RRULE:",
        )[0];
        const rrule = rrulestr(
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

  // Return the events array
  return events;
}

function isEventEqual(firstEvent, secondEvent) {
  firstEvent = JSON.stringify(createSortedEvent(createBareEvent(firstEvent)));
  secondEvent = JSON.stringify(createSortedEvent(createBareEvent(secondEvent)));
  return firstEvent === secondEvent;
}

// https://moment.github.io/luxon/

function loadDateTime() {
  const url = "https://moment.github.io/luxon/global/luxon.min.js";
  const response = UrlFetchApp.fetch(url);
  const script = response.getContentText();
  eval(script);
  return luxon.DateTime;
}

// https://github.com/jkbrzt/rrule

function loadRRule() {
  const url = "https://unpkg.com/rrule@2.8.1/dist/es5/rrule.min.js";
  const response = UrlFetchApp.fetch(url);
  const script = response.getContentText();
  eval(script);
  return rrule;
}
