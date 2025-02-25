// Google Calendar Synchronization, build on 2025-02-25
// Source: https://github.com/scriptPilot/google-calendar-synchronization

function start() {
  // Check onStart function
  if (typeof onStart !== "function") {
    throw new Error(
      "onStart() function is missing - please check the documentation",
    );
  }

  // Set the script invocation check to true
  onStart.calledByStartFunction = true;

  // Set default values
  setSyncInterval();
  setMaxExecutionTime();

  // Create a trigger based on the max execution time (fallback if script is exeeding Google Script limits)
  createTrigger("start", onStart.maxExecutionTime);

  // Create an hourly trigger (fallback as workaround for timeout on script invocation)
  createTrigger("startFallback", "hourly");

  // Remove any stop note from previous stop() call
  PropertiesService.getUserProperties().deleteProperty("stopNote");

  // Wrap the sync to catch any error and ensure the next trigger creation
  try {
    // Run the onStart function
    onStart();
  } catch (err) {
    Logger.log("An error occured during the synchronization");
    Logger.log(`Message: ${err.message}`);
  }

  // Check stop note (if stop() was called during the script run)
  if (PropertiesService.getUserProperties().getProperty("stopNote") !== null) {
    Logger.log(`Synchronization stopped.`);
    return;
  }

  // Create a trigger based on the sync interval
  createTrigger("start", onStart.syncInterval);
}

function stop() {
  // Remove all existing triggers
  deleteTrigger("start");
  deleteTrigger("startFallback");

  // Set a stop note (to stop any running script to create a new trigger)
  PropertiesService.getUserProperties().setProperty("stopNote", true);

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

  // Reset sync pairs property
  // - not all properties are deleted to keep script stop notice
  PropertiesService.getUserProperties().deleteProperty("syncPairs");

  // Log completion
  Logger.log(
    `${totalExistingTargetEvents} obsolete target event${totalExistingTargetEvents !== 1 ? "s" : ""} deleted`,
  );
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

function pastDays(dateTime) {
  const duration = DateTimeInterval.fromDateTimes(dateTime, DateTime.now());
  return Math.floor(duration.length("days"));
}

function nextDays(dateTime) {
  const duration = DateTimeInterval.fromDateTimes(DateTime.now(), dateTime);
  return Math.floor(duration.length("days"));
}

function startOfWeek(offset = 0) {
  return pastDays(DateTime.now().startOf("week").minus({ weeks: offset }));
}

function endOfWeek(offset = 0) {
  return nextDays(DateTime.now().endOf("week").plus({ weeks: offset }));
}

function startOfMonth(offset = 0) {
  return pastDays(DateTime.now().startOf("month").minus({ months: offset }));
}

function endOfMonth(offset = 0) {
  return nextDays(
    DateTime.now().startOf("month").plus({ months: offset }).endOf("month"),
  );
}

function startOfQuarter(offset = 0) {
  const now = DateTime.now();
  const monthsToStartOfQuarter = (now.month - 1) % 3;
  return pastDays(
    now
      .startOf("month")
      .minus({ months: monthsToStartOfQuarter })
      .minus({ months: offset * 3 }),
  );
}

function endOfQuarter(offset = 0) {
  const now = DateTime.now();
  const monthsToEndOfQuarter = Math.ceil(now.month / 3) * 3 - now.month;
  return nextDays(
    now
      .startOf("month")
      .plus({ months: monthsToEndOfQuarter })
      .plus({ months: offset * 3 })
      .endOf("month"),
  );
}

function startOfHalfyear(offset = 0) {
  const now = DateTime.now();
  const monthsToStartOfHalfyear = (now.month - 1) % 6;
  return pastDays(
    now
      .startOf("month")
      .minus({ months: monthsToStartOfHalfyear })
      .minus({ months: offset * 6 }),
  );
}

function endOfHalfyear(offset = 0) {
  const now = DateTime.now();
  const monthsToEndOfHalfyear = Math.ceil(now.month / 6) * 6 - now.month;
  return nextDays(
    now
      .startOf("month")
      .plus({ months: monthsToEndOfHalfyear })
      .plus({ months: offset * 6 })
      .endOf("month"),
  );
}

function startOfYear(offset = 0) {
  return nextDays(DateTime.now().startOf("year").plus({ years: offset }));
}

function endOfYear(offset = 0) {
  return nextDays(
    DateTime.now().startOf("year").plus({ years: offset }).endOf("year"),
  );
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

function setMaxExecutionTime(minutes = 6) {
  // Check script invocation
  if (!onStart.calledByStartFunction) {
    throw new Error(
      "Please select the Code.gs file and run the start() script.",
    );
  }
  // Set the new max execution time
  onStart.maxExecutionTime = minutes;
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

function createTrigger(functionName, minutes) {
  deleteTrigger(functionName);
  if (typeof minutes === "number") {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .after(minutes * 60 * 1000)
      .create();
    Logger.log(
      `Trigger created for the ${functionName}() function in ${minutes} minute${minutes !== 1 ? "s" : ""}`,
    );
  } else if (minutes === "hourly") {
    ScriptApp.newTrigger(functionName).timeBased().everyHours(1).create();
    Logger.log(`Trigger created for the ${functionName}() function every hour`);
  } else {
    throw new Error("Minutes argument not valid");
  }
}

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

// Cut single events according to the specified timeframe

function cutSingleEvents(events, dateMin, dateMax) {
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

function deleteTrigger(functionName) {
  let triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`Existing trigger deleted for the ${functionName}() function`);
    }
  }
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

// Dedicated function to be called by a fallback trigger
// Workaround for timeout on script invocation

function startFallback() {
  // Run the start function
  start();
}

// https://moment.github.io/luxon/

eval(`
    var luxon=function(e){"use strict";function L(e,t){for(var n=0;n<t.length;n++){var r=t[n];r.enumerable=r.enumerable||!1,r.configurable=!0,"value"in r&&(r.writable=!0),Object.defineProperty(e,function(e){e=function(e,t){if("object"!=typeof e||null===e)return e;var n=e[Symbol.toPrimitive];if(void 0===n)return("string"===t?String:Number)(e);n=n.call(e,t||"default");if("object"!=typeof n)return n;throw new TypeError("@@toPrimitive must return a primitive value.")}(e,"string");return"symbol"==typeof e?e:String(e)}(r.key),r)}}function i(e,t,n){t&&L(e.prototype,t),n&&L(e,n),Object.defineProperty(e,"prototype",{writable:!1})}function l(){return(l=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n,r=arguments[t];for(n in r)Object.prototype.hasOwnProperty.call(r,n)&&(e[n]=r[n])}return e}).apply(this,arguments)}function o(e,t){e.prototype=Object.create(t.prototype),z(e.prototype.constructor=e,t)}function j(e){return(j=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(e){return e.__proto__||Object.getPrototypeOf(e)})(e)}function z(e,t){return(z=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(e,t){return e.__proto__=t,e})(e,t)}function A(e,t,n){return(A=function(){if("undefined"!=typeof Reflect&&Reflect.construct&&!Reflect.construct.sham){if("function"==typeof Proxy)return 1;try{return Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){})),1}catch(e){}}}()?Reflect.construct.bind():function(e,t,n){var r=[null];r.push.apply(r,t);t=new(Function.bind.apply(e,r));return n&&z(t,n.prototype),t}).apply(null,arguments)}function q(e){var n="function"==typeof Map?new Map:void 0;return function(e){if(null===e||-1===Function.toString.call(e).indexOf("[native code]"))return e;if("function"!=typeof e)throw new TypeError("Super expression must either be null or a function");if(void 0!==n){if(n.has(e))return n.get(e);n.set(e,t)}function t(){return A(e,arguments,j(this).constructor)}return t.prototype=Object.create(e.prototype,{constructor:{value:t,enumerable:!1,writable:!0,configurable:!0}}),z(t,e)}(e)}function _(e,t){if(null==e)return{};for(var n,r={},i=Object.keys(e),o=0;o<i.length;o++)n=i[o],0<=t.indexOf(n)||(r[n]=e[n]);return r}function U(e,t){(null==t||t>e.length)&&(t=e.length);for(var n=0,r=new Array(t);n<t;n++)r[n]=e[n];return r}function R(e,t){var n,r="undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(r)return(r=r.call(e)).next.bind(r);if(Array.isArray(e)||(r=function(e,t){var n;if(e)return"string"==typeof e?U(e,t):"Map"===(n="Object"===(n=Object.prototype.toString.call(e).slice(8,-1))&&e.constructor?e.constructor.name:n)||"Set"===n?Array.from(e):"Arguments"===n||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?U(e,t):void 0}(e))||t&&e&&"number"==typeof e.length)return r&&(e=r),n=0,function(){return n>=e.length?{done:!0}:{done:!1,value:e[n++]}};throw new TypeError("Invalid attempt to iterate non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}var t=function(e){function t(){return e.apply(this,arguments)||this}return o(t,e),t}(q(Error)),P=function(t){function e(e){return t.call(this,"Invalid DateTime: "+e.toMessage())||this}return o(e,t),e}(t),Y=function(t){function e(e){return t.call(this,"Invalid Interval: "+e.toMessage())||this}return o(e,t),e}(t),H=function(t){function e(e){return t.call(this,"Invalid Duration: "+e.toMessage())||this}return o(e,t),e}(t),w=function(e){function t(){return e.apply(this,arguments)||this}return o(t,e),t}(t),J=function(t){function e(e){return t.call(this,"Invalid unit "+e)||this}return o(e,t),e}(t),u=function(e){function t(){return e.apply(this,arguments)||this}return o(t,e),t}(t),n=function(e){function t(){return e.call(this,"Zone is an abstract class")||this}return o(t,e),t}(t),t="numeric",r="short",a="long",G={year:t,month:t,day:t},$={year:t,month:r,day:t},B={year:t,month:r,day:t,weekday:r},Q={year:t,month:a,day:t},K={year:t,month:a,day:t,weekday:a},X={hour:t,minute:t},ee={hour:t,minute:t,second:t},te={hour:t,minute:t,second:t,timeZoneName:r},ne={hour:t,minute:t,second:t,timeZoneName:a},re={hour:t,minute:t,hourCycle:"h23"},ie={hour:t,minute:t,second:t,hourCycle:"h23"},oe={hour:t,minute:t,second:t,hourCycle:"h23",timeZoneName:r},ae={hour:t,minute:t,second:t,hourCycle:"h23",timeZoneName:a},se={year:t,month:t,day:t,hour:t,minute:t},ue={year:t,month:t,day:t,hour:t,minute:t,second:t},le={year:t,month:r,day:t,hour:t,minute:t},ce={year:t,month:r,day:t,hour:t,minute:t,second:t},fe={year:t,month:r,day:t,weekday:r,hour:t,minute:t},de={year:t,month:a,day:t,hour:t,minute:t,timeZoneName:r},he={year:t,month:a,day:t,hour:t,minute:t,second:t,timeZoneName:r},me={year:t,month:a,day:t,weekday:a,hour:t,minute:t,timeZoneName:a},ye={year:t,month:a,day:t,weekday:a,hour:t,minute:t,second:t,timeZoneName:a},s=function(){function e(){}var t=e.prototype;return t.offsetName=function(e,t){throw new n},t.formatOffset=function(e,t){throw new n},t.offset=function(e){throw new n},t.equals=function(e){throw new n},i(e,[{key:"type",get:function(){throw new n}},{key:"name",get:function(){throw new n}},{key:"ianaName",get:function(){return this.name}},{key:"isUniversal",get:function(){throw new n}},{key:"isValid",get:function(){throw new n}}]),e}(),ve=null,ge=function(e){function t(){return e.apply(this,arguments)||this}o(t,e);var n=t.prototype;return n.offsetName=function(e,t){return bt(e,t.format,t.locale)},n.formatOffset=function(e,t){return Nt(this.offset(e),t)},n.offset=function(e){return-new Date(e).getTimezoneOffset()},n.equals=function(e){return"system"===e.type},i(t,[{key:"type",get:function(){return"system"}},{key:"name",get:function(){return(new Intl.DateTimeFormat).resolvedOptions().timeZone}},{key:"isUniversal",get:function(){return!1}},{key:"isValid",get:function(){return!0}}],[{key:"instance",get:function(){return ve=null===ve?new t:ve}}]),t}(s),pe={};var ke={year:0,month:1,day:2,era:3,hour:4,minute:5,second:6};var we={},c=function(n){function r(e){var t=n.call(this)||this;return t.zoneName=e,t.valid=r.isValidZone(e),t}o(r,n),r.create=function(e){return we[e]||(we[e]=new r(e)),we[e]},r.resetCache=function(){we={},pe={}},r.isValidSpecifier=function(e){return this.isValidZone(e)},r.isValidZone=function(e){if(!e)return!1;try{return new Intl.DateTimeFormat("en-US",{timeZone:e}).format(),!0}catch(e){return!1}};var e=r.prototype;return e.offsetName=function(e,t){return bt(e,t.format,t.locale,this.name)},e.formatOffset=function(e,t){return Nt(this.offset(e),t)},e.offset=function(e){var t,n,r,i,o,a,s,u,e=new Date(e);return isNaN(e)?NaN:(i=this.name,pe[i]||(pe[i]=new Intl.DateTimeFormat("en-US",{hour12:!1,timeZone:i,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",era:"short"})),a=(i=(i=pe[i]).formatToParts?function(e,t){for(var n=e.formatToParts(t),r=[],i=0;i<n.length;i++){var o=n[i],a=o.type,o=o.value,s=ke[a];"era"===a?r[s]=o:N(s)||(r[s]=parseInt(o,10))}return r}(i,e):(o=e,i=(i=i).format(o).replace(/\\u200E/g,""),i=(o=/(\\d+)\\/(\\d+)\\/(\\d+) (AD|BC),? (\\d+):(\\d+):(\\d+)/.exec(i))[1],a=o[2],[o[3],i,a,o[4],o[5],o[6],o[7]]))[0],o=i[1],t=i[2],n=i[3],s=i[4],r=i[5],i=i[6],s=24===s?0:s,u=(e=+e)%1e3,(gt({year:a="BC"===n?1-Math.abs(a):a,month:o,day:t,hour:s,minute:r,second:i,millisecond:0})-(e-=0<=u?u:1e3+u))/6e4)},e.equals=function(e){return"iana"===e.type&&e.name===this.name},i(r,[{key:"type",get:function(){return"iana"}},{key:"name",get:function(){return this.zoneName}},{key:"isUniversal",get:function(){return!1}},{key:"isValid",get:function(){return this.valid}}]),r}(s),be=["base"],Se=["padTo","floor"],Oe={};var Te={};function Ne(e,t){void 0===t&&(t={});var n=JSON.stringify([e,t]),r=Te[n];return r||(r=new Intl.DateTimeFormat(e,t),Te[n]=r),r}var De={};var Me={};var Ie=null;var Ve={};function Ee(e,t,n,r){e=e.listingMode();return"error"===e?null:("en"===e?n:r)(t)}var xe=function(){function e(e,t,n){this.padTo=n.padTo||0,this.floor=n.floor||!1,n.padTo,n.floor;var r=_(n,Se);(!t||0<Object.keys(r).length)&&(t=l({useGrouping:!1},n),0<n.padTo&&(t.minimumIntegerDigits=n.padTo),this.inf=(r=e,void 0===(n=t)&&(n={}),e=JSON.stringify([r,n]),(t=De[e])||(t=new Intl.NumberFormat(r,n),De[e]=t),t))}return e.prototype.format=function(e){var t;return this.inf?(t=this.floor?Math.floor(e):e,this.inf.format(t)):m(this.floor?Math.floor(e):ht(e,3),this.padTo)},e}(),Fe=function(){function e(e,t,n){this.opts=n;var n=this.originalZone=void 0,r=(this.opts.timeZone?this.dt=e:"fixed"===e.zone.type?(r=0<=(r=e.offset/60*-1)?"Etc/GMT+"+r:"Etc/GMT"+r,0!==e.offset&&c.create(r).valid?(n=r,this.dt=e):(n="UTC",this.dt=0===e.offset?e:e.setZone("UTC").plus({minutes:e.offset}),this.originalZone=e.zone)):"system"===e.zone.type?this.dt=e:"iana"===e.zone.type?n=(this.dt=e).zone.name:(this.dt=e.setZone(n="UTC").plus({minutes:e.offset}),this.originalZone=e.zone),l({},this.opts));r.timeZone=r.timeZone||n,this.dtf=Ne(t,r)}var t=e.prototype;return t.format=function(){return this.originalZone?this.formatToParts().map(function(e){return e.value}).join(""):this.dtf.format(this.dt.toJSDate())},t.formatToParts=function(){var t=this,e=this.dtf.formatToParts(this.dt.toJSDate());return this.originalZone?e.map(function(e){return"timeZoneName"===e.type?l({},e,{value:t.originalZone.offsetName(t.dt.ts,{locale:t.dt.locale,format:t.opts.timeZoneName})}):e}):e},t.resolvedOptions=function(){return this.dtf.resolvedOptions()},e}(),Ce=function(){function e(e,t,n){var r;this.opts=l({style:"long"},n),!t&&ut()&&(this.rtf=(t=e,(n=e=void 0===(e=n)?{}:e).base,n=_(n=e,be),n=JSON.stringify([t,n]),(r=Me[n])||(r=new Intl.RelativeTimeFormat(t,e),Me[n]=r),r))}var t=e.prototype;return t.format=function(e,t){if(this.rtf)return this.rtf.format(e,t);var n=t,t=e,e=this.opts.numeric,r="long"!==this.opts.style,i=(void 0===e&&(e="always"),void 0===r&&(r=!1),{years:["year","yr."],quarters:["quarter","qtr."],months:["month","mo."],weeks:["week","wk."],days:["day","day","days"],hours:["hour","hr."],minutes:["minute","min."],seconds:["second","sec."]}),o=-1===["hours","minutes","seconds"].indexOf(n);if("auto"===e&&o){var a="days"===n;switch(t){case 1:return a?"tomorrow":"next "+i[n][0];case-1:return a?"yesterday":"last "+i[n][0];case 0:return a?"today":"this "+i[n][0]}}var e=Object.is(t,-0)||t<0,t=1===(o=Math.abs(t)),s=i[n],r=r?!t&&s[2]||s[1]:t?i[n][0]:n;return e?o+" "+r+" ago":"in "+o+" "+r},t.formatToParts=function(e,t){return this.rtf?this.rtf.formatToParts(e,t):[]},e}(),Ze={firstDay:1,minimalDays:4,weekend:[6,7]},b=function(){function o(e,t,n,r,i){var e=function(t){var n=t.indexOf("-x-");if(-1===(n=(t=-1!==n?t.substring(0,n):t).indexOf("-u-")))return[t];try{r=Ne(t).resolvedOptions(),i=t}catch(e){var t=t.substring(0,n),r=Ne(t).resolvedOptions(),i=t}return[i,(n=r).numberingSystem,n.calendar]}(e),o=e[0],a=e[1],e=e[2];this.locale=o,this.numberingSystem=t||a||null,this.outputCalendar=n||e||null,this.weekSettings=r,this.intl=(o=this.locale,t=this.numberingSystem,((a=this.outputCalendar)||t)&&(o.includes("-u-")||(o+="-u"),a&&(o+="-ca-"+a),t)&&(o+="-nu-"+t),o),this.weekdaysCache={format:{},standalone:{}},this.monthsCache={format:{},standalone:{}},this.meridiemCache=null,this.eraCache={},this.specifiedLocale=i,this.fastNumbersCached=null}o.fromOpts=function(e){return o.create(e.locale,e.numberingSystem,e.outputCalendar,e.weekSettings,e.defaultToEN)},o.create=function(e,t,n,r,i){void 0===i&&(i=!1);e=e||O.defaultLocale;return new o(e||(i?"en-US":Ie=Ie||(new Intl.DateTimeFormat).resolvedOptions().locale),t||O.defaultNumberingSystem,n||O.defaultOutputCalendar,ft(r)||O.defaultWeekSettings,e)},o.resetCache=function(){Ie=null,Te={},De={},Me={}},o.fromObject=function(e){var e=void 0===e?{}:e,t=e.locale,n=e.numberingSystem,r=e.outputCalendar,e=e.weekSettings;return o.create(t,n,r,e)};var e=o.prototype;return e.listingMode=function(){var e=this.isEnglish(),t=!(null!==this.numberingSystem&&"latn"!==this.numberingSystem||null!==this.outputCalendar&&"gregory"!==this.outputCalendar);return e&&t?"en":"intl"},e.clone=function(e){return e&&0!==Object.getOwnPropertyNames(e).length?o.create(e.locale||this.specifiedLocale,e.numberingSystem||this.numberingSystem,e.outputCalendar||this.outputCalendar,ft(e.weekSettings)||this.weekSettings,e.defaultToEN||!1):this},e.redefaultToEN=function(e){return this.clone(l({},e=void 0===e?{}:e,{defaultToEN:!0}))},e.redefaultToSystem=function(e){return this.clone(l({},e=void 0===e?{}:e,{defaultToEN:!1}))},e.months=function(n,r){var i=this;return void 0===r&&(r=!1),Ee(this,n,Et,function(){var t=r?{month:n,day:"numeric"}:{month:n},e=r?"format":"standalone";return i.monthsCache[e][n]||(i.monthsCache[e][n]=function(e){for(var t=[],n=1;n<=12;n++){var r=W.utc(2009,n,1);t.push(e(r))}return t}(function(e){return i.extract(e,t,"month")})),i.monthsCache[e][n]})},e.weekdays=function(n,r){var i=this;return void 0===r&&(r=!1),Ee(this,n,Zt,function(){var t=r?{weekday:n,year:"numeric",month:"long",day:"numeric"}:{weekday:n},e=r?"format":"standalone";return i.weekdaysCache[e][n]||(i.weekdaysCache[e][n]=function(e){for(var t=[],n=1;n<=7;n++){var r=W.utc(2016,11,13+n);t.push(e(r))}return t}(function(e){return i.extract(e,t,"weekday")})),i.weekdaysCache[e][n]})},e.meridiems=function(){var n=this;return Ee(this,void 0,function(){return Wt},function(){var t;return n.meridiemCache||(t={hour:"numeric",hourCycle:"h12"},n.meridiemCache=[W.utc(2016,11,13,9),W.utc(2016,11,13,19)].map(function(e){return n.extract(e,t,"dayperiod")})),n.meridiemCache})},e.eras=function(e){var n=this;return Ee(this,e,At,function(){var t={era:e};return n.eraCache[e]||(n.eraCache[e]=[W.utc(-40,1,1),W.utc(2017,1,1)].map(function(e){return n.extract(e,t,"era")})),n.eraCache[e]})},e.extract=function(e,t,n){e=this.dtFormatter(e,t).formatToParts().find(function(e){return e.type.toLowerCase()===n});return e?e.value:null},e.numberFormatter=function(e){return new xe(this.intl,(e=void 0===e?{}:e).forceSimple||this.fastNumbers,e)},e.dtFormatter=function(e,t){return new Fe(e,this.intl,t=void 0===t?{}:t)},e.relFormatter=function(e){return void 0===e&&(e={}),new Ce(this.intl,this.isEnglish(),e)},e.listFormatter=function(e){return void 0===e&&(e={}),t=this.intl,void 0===(e=e)&&(e={}),n=JSON.stringify([t,e]),(r=Oe[n])||(r=new Intl.ListFormat(t,e),Oe[n]=r),r;var t,n,r},e.isEnglish=function(){return"en"===this.locale||"en-us"===this.locale.toLowerCase()||new Intl.DateTimeFormat(this.intl).resolvedOptions().locale.startsWith("en-us")},e.getWeekSettings=function(){return this.weekSettings||(lt()?(e=this.locale,(n=Ve[e])||(n="getWeekInfo"in(t=new Intl.Locale(e))?t.getWeekInfo():t.weekInfo,Ve[e]=n),n):Ze);var e,t,n},e.getStartOfWeek=function(){return this.getWeekSettings().firstDay},e.getMinDaysInFirstWeek=function(){return this.getWeekSettings().minimalDays},e.getWeekendDays=function(){return this.getWeekSettings().weekend},e.equals=function(e){return this.locale===e.locale&&this.numberingSystem===e.numberingSystem&&this.outputCalendar===e.outputCalendar},e.toString=function(){return"Locale("+this.locale+", "+this.numberingSystem+", "+this.outputCalendar+")"},i(o,[{key:"fastNumbers",get:function(){var e;return null==this.fastNumbersCached&&(this.fastNumbersCached=(!(e=this).numberingSystem||"latn"===e.numberingSystem)&&("latn"===e.numberingSystem||!e.locale||e.locale.startsWith("en")||"latn"===new Intl.DateTimeFormat(e.intl).resolvedOptions().numberingSystem)),this.fastNumbersCached}}]),o}(),We=null,f=function(n){function t(e){var t=n.call(this)||this;return t.fixed=e,t}o(t,n),t.instance=function(e){return 0===e?t.utcInstance:new t(e)},t.parseSpecifier=function(e){if(e){e=e.match(/^utc(?:([+-]\\d{1,2})(?::(\\d{2}))?)?$/i);if(e)return new t(St(e[1],e[2]))}return null};var e=t.prototype;return e.offsetName=function(){return this.name},e.formatOffset=function(e,t){return Nt(this.fixed,t)},e.offset=function(){return this.fixed},e.equals=function(e){return"fixed"===e.type&&e.fixed===this.fixed},i(t,[{key:"type",get:function(){return"fixed"}},{key:"name",get:function(){return 0===this.fixed?"UTC":"UTC"+Nt(this.fixed,"narrow")}},{key:"ianaName",get:function(){return 0===this.fixed?"Etc/UTC":"Etc/GMT"+Nt(-this.fixed,"narrow")}},{key:"isUniversal",get:function(){return!0}},{key:"isValid",get:function(){return!0}}],[{key:"utcInstance",get:function(){return We=null===We?new t(0):We}}]),t}(s),Le=function(n){function e(e){var t=n.call(this)||this;return t.zoneName=e,t}o(e,n);var t=e.prototype;return t.offsetName=function(){return null},t.formatOffset=function(){return""},t.offset=function(){return NaN},t.equals=function(){return!1},i(e,[{key:"type",get:function(){return"invalid"}},{key:"name",get:function(){return this.zoneName}},{key:"isUniversal",get:function(){return!1}},{key:"isValid",get:function(){return!1}}]),e}(s);function S(e,t){var n;return N(e)||null===e?t:e instanceof s?e:"string"==typeof e?"default"===(n=e.toLowerCase())?t:"local"===n||"system"===n?ge.instance:"utc"===n||"gmt"===n?f.utcInstance:f.parseSpecifier(n)||c.create(e):v(e)?f.instance(e):"object"==typeof e&&"offset"in e&&"function"==typeof e.offset?e:new Le(e)}var je={arab:"[٠-٩]",arabext:"[۰-۹]",bali:"[᭐-᭙]",beng:"[০-৯]",deva:"[०-९]",fullwide:"[０-９]",gujr:"[૦-૯]",hanidec:"[〇|一|二|三|四|五|六|七|八|九]",khmr:"[០-៩]",knda:"[೦-೯]",laoo:"[໐-໙]",limb:"[᥆-᥏]",mlym:"[൦-൯]",mong:"[᠐-᠙]",mymr:"[၀-၉]",orya:"[୦-୯]",tamldec:"[௦-௯]",telu:"[౦-౯]",thai:"[๐-๙]",tibt:"[༠-༩]",latn:"\\\\d"},ze={arab:[1632,1641],arabext:[1776,1785],bali:[6992,7001],beng:[2534,2543],deva:[2406,2415],fullwide:[65296,65303],gujr:[2790,2799],khmr:[6112,6121],knda:[3302,3311],laoo:[3792,3801],limb:[6470,6479],mlym:[3430,3439],mong:[6160,6169],mymr:[4160,4169],orya:[2918,2927],tamldec:[3046,3055],telu:[3174,3183],thai:[3664,3673],tibt:[3872,3881]},Ae=je.hanidec.replace(/[\\[|\\]]/g,"").split("");var d={};function y(e,t){void 0===t&&(t="");e=e.numberingSystem||"latn";return d[e]||(d[e]={}),d[e][t]||(d[e][t]=new RegExp(""+je[e]+t)),d[e][t]}var qe,_e=function(){return Date.now()},Ue="system",Re=null,Pe=null,Ye=null,He=60,Je=null,O=function(){function e(){}return e.resetCaches=function(){b.resetCache(),c.resetCache(),W.resetCache(),d={}},i(e,null,[{key:"now",get:function(){return _e},set:function(e){_e=e}},{key:"defaultZone",get:function(){return S(Ue,ge.instance)},set:function(e){Ue=e}},{key:"defaultLocale",get:function(){return Re},set:function(e){Re=e}},{key:"defaultNumberingSystem",get:function(){return Pe},set:function(e){Pe=e}},{key:"defaultOutputCalendar",get:function(){return Ye},set:function(e){Ye=e}},{key:"defaultWeekSettings",get:function(){return Je},set:function(e){Je=ft(e)}},{key:"twoDigitCutoffYear",get:function(){return He},set:function(e){He=e%100}},{key:"throwOnInvalid",get:function(){return qe},set:function(e){qe=e}}]),e}(),h=function(){function e(e,t){this.reason=e,this.explanation=t}return e.prototype.toMessage=function(){return this.explanation?this.reason+": "+this.explanation:this.reason},e}(),Ge=[0,31,59,90,120,151,181,212,243,273,304,334],$e=[0,31,60,91,121,152,182,213,244,274,305,335];function T(e,t){return new h("unit out of range","you specified "+t+" (of type "+typeof t+") as a "+e+", which is invalid")}function Be(e,t,n){t=new Date(Date.UTC(e,t-1,n)),e<100&&0<=e&&t.setUTCFullYear(t.getUTCFullYear()-1900),n=t.getUTCDay();return 0===n?7:n}function Qe(e,t,n){return n+(mt(e)?$e:Ge)[t-1]}function Ke(e,t){var e=mt(e)?$e:Ge,n=e.findIndex(function(e){return e<t});return{month:n+1,day:t-e[n]}}function Xe(e,t){return(e-t+7)%7+1}function et(e,t,n){void 0===t&&(t=4),void 0===n&&(n=1);var r,i=e.year,o=e.month,a=e.day,s=Qe(i,o,a),o=Xe(Be(i,o,a),n),a=Math.floor((s-o+14-t)/7);return a<1?a=kt(r=i-1,t,n):a>kt(i,t,n)?(r=i+1,a=1):r=i,l({weekYear:r,weekNumber:a,weekday:o},Dt(e))}function tt(e,t,n){void 0===n&&(n=1);var r,i=e.weekYear,o=e.weekNumber,a=e.weekday,n=Xe(Be(i,1,t=void 0===t?4:t),n),s=yt(i),o=7*o+a-n-7+t,a=(o<1?o+=yt(r=i-1):s<o?(r=i+1,o-=yt(i)):r=i,Ke(r,o));return l({year:r,month:a.month,day:a.day},Dt(e))}function nt(e){var t=e.year;return l({year:t,ordinal:Qe(t,e.month,e.day)},Dt(e))}function rt(e){var t=e.year,n=Ke(t,e.ordinal);return l({year:t,month:n.month,day:n.day},Dt(e))}function it(e,t){if(N(e.localWeekday)&&N(e.localWeekNumber)&&N(e.localWeekYear))return{minDaysInFirstWeek:4,startOfWeek:1};if(N(e.weekday)&&N(e.weekNumber)&&N(e.weekYear))return N(e.localWeekday)||(e.weekday=e.localWeekday),N(e.localWeekNumber)||(e.weekNumber=e.localWeekNumber),N(e.localWeekYear)||(e.weekYear=e.localWeekYear),delete e.localWeekday,delete e.localWeekNumber,delete e.localWeekYear,{minDaysInFirstWeek:t.getMinDaysInFirstWeek(),startOfWeek:t.getStartOfWeek()};throw new w("Cannot mix locale-based week fields with ISO-based week fields")}function ot(e){var t=st(e.year),n=D(e.month,1,12),r=D(e.day,1,vt(e.year,e.month));return t?n?!r&&T("day",e.day):T("month",e.month):T("year",e.year)}function at(e){var t=e.hour,n=e.minute,r=e.second,e=e.millisecond,i=D(t,0,23)||24===t&&0===n&&0===r&&0===e,o=D(n,0,59),a=D(r,0,59),s=D(e,0,999);return i?o?a?!s&&T("millisecond",e):T("second",r):T("minute",n):T("hour",t)}function N(e){return void 0===e}function v(e){return"number"==typeof e}function st(e){return"number"==typeof e&&e%1==0}function ut(){try{return"undefined"!=typeof Intl&&!!Intl.RelativeTimeFormat}catch(e){return!1}}function lt(){try{return"undefined"!=typeof Intl&&!!Intl.Locale&&("weekInfo"in Intl.Locale.prototype||"getWeekInfo"in Intl.Locale.prototype)}catch(e){return!1}}function ct(e,n,r){if(0!==e.length)return e.reduce(function(e,t){t=[n(t),t];return e&&r(e[0],t[0])===e[0]?e:t},null)[1]}function g(e,t){return Object.prototype.hasOwnProperty.call(e,t)}function ft(e){if(null==e)return null;if("object"!=typeof e)throw new u("Week settings must be an object");if(D(e.firstDay,1,7)&&D(e.minimalDays,1,7)&&Array.isArray(e.weekend)&&!e.weekend.some(function(e){return!D(e,1,7)}))return{firstDay:e.firstDay,minimalDays:e.minimalDays,weekend:Array.from(e.weekend)};throw new u("Invalid week settings")}function D(e,t,n){return st(e)&&t<=e&&e<=n}function m(e,t){void 0===t&&(t=2);e=e<0?"-"+(""+-e).padStart(t,"0"):(""+e).padStart(t,"0");return e}function p(e){if(!N(e)&&null!==e&&""!==e)return parseInt(e,10)}function k(e){if(!N(e)&&null!==e&&""!==e)return parseFloat(e)}function dt(e){if(!N(e)&&null!==e&&""!==e)return e=1e3*parseFloat("0."+e),Math.floor(e)}function ht(e,t,n){void 0===n&&(n=!1);t=Math.pow(10,t);return(n?Math.trunc:Math.round)(e*t)/t}function mt(e){return e%4==0&&(e%100!=0||e%400==0)}function yt(e){return mt(e)?366:365}function vt(e,t){var n,r=(r=t-1)-(n=12)*Math.floor(r/n)+1;return 2==r?mt(e+(t-r)/12)?29:28:[31,null,31,30,31,30,31,31,30,31,30,31][r-1]}function gt(e){var t=Date.UTC(e.year,e.month-1,e.day,e.hour,e.minute,e.second,e.millisecond);return e.year<100&&0<=e.year&&(t=new Date(t)).setUTCFullYear(e.year,e.month-1,e.day),+t}function pt(e,t,n){return-Xe(Be(e,1,t),n)+t-1}function kt(e,t,n){var r=pt(e,t=void 0===t?4:t,n=void 0===n?1:n),t=pt(e+1,t,n);return(yt(e)-r+t)/7}function wt(e){return 99<e?e:e>O.twoDigitCutoffYear?1900+e:2e3+e}function bt(e,t,n,r){void 0===r&&(r=null);var e=new Date(e),i={hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"},r=(r&&(i.timeZone=r),l({timeZoneName:t},i)),t=new Intl.DateTimeFormat(n,r).formatToParts(e).find(function(e){return"timezonename"===e.type.toLowerCase()});return t?t.value:null}function St(e,t){e=parseInt(e,10),Number.isNaN(e)&&(e=0),t=parseInt(t,10)||0;return 60*e+(e<0||Object.is(e,-0)?-t:t)}function Ot(e){var t=Number(e);if("boolean"==typeof e||""===e||Number.isNaN(t))throw new u("Invalid unit value "+e);return t}function Tt(e,t){var n,r,i={};for(n in e)g(e,n)&&null!=(r=e[n])&&(i[t(n)]=Ot(r));return i}function Nt(e,t){var n=Math.trunc(Math.abs(e/60)),r=Math.trunc(Math.abs(e%60)),i=0<=e?"+":"-";switch(t){case"short":return i+m(n,2)+":"+m(r,2);case"narrow":return i+n+(0<r?":"+r:"");case"techie":return i+m(n,2)+m(r,2);default:throw new RangeError("Value format "+t+" is out of range for property format")}}function Dt(e){return n=e,["hour","minute","second","millisecond"].reduce(function(e,t){return e[t]=n[t],e},{});var n}var Mt=["January","February","March","April","May","June","July","August","September","October","November","December"],It=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],Vt=["J","F","M","A","M","J","J","A","S","O","N","D"];function Et(e){switch(e){case"narrow":return[].concat(Vt);case"short":return[].concat(It);case"long":return[].concat(Mt);case"numeric":return["1","2","3","4","5","6","7","8","9","10","11","12"];case"2-digit":return["01","02","03","04","05","06","07","08","09","10","11","12"];default:return null}}var xt=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],Ft=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],Ct=["M","T","W","T","F","S","S"];function Zt(e){switch(e){case"narrow":return[].concat(Ct);case"short":return[].concat(Ft);case"long":return[].concat(xt);case"numeric":return["1","2","3","4","5","6","7"];default:return null}}var Wt=["AM","PM"],Lt=["Before Christ","Anno Domini"],jt=["BC","AD"],zt=["B","A"];function At(e){switch(e){case"narrow":return[].concat(zt);case"short":return[].concat(jt);case"long":return[].concat(Lt);default:return null}}function qt(e,t){for(var n="",r=R(e);!(i=r()).done;){var i=i.value;i.literal?n+=i.val:n+=t(i.val)}return n}var _t={D:G,DD:$,DDD:Q,DDDD:K,t:X,tt:ee,ttt:te,tttt:ne,T:re,TT:ie,TTT:oe,TTTT:ae,f:se,ff:le,fff:de,ffff:me,F:ue,FF:ce,FFF:he,FFFF:ye},M=function(){function d(e,t){this.opts=t,this.loc=e,this.systemLoc=null}d.create=function(e,t){return new d(e,t=void 0===t?{}:t)},d.parseFormat=function(e){for(var t=null,n="",r=!1,i=[],o=0;o<e.length;o++){var a=e.charAt(o);"'"===a?(0<n.length&&i.push({literal:r||/^\\s+$/.test(n),val:n}),t=null,n="",r=!r):r||a===t?n+=a:(0<n.length&&i.push({literal:/^\\s+$/.test(n),val:n}),t=n=a)}return 0<n.length&&i.push({literal:r||/^\\s+$/.test(n),val:n}),i},d.macroTokenToFormatOpts=function(e){return _t[e]};var e=d.prototype;return e.formatWithSystemDefault=function(e,t){return null===this.systemLoc&&(this.systemLoc=this.loc.redefaultToSystem()),this.systemLoc.dtFormatter(e,l({},this.opts,t)).format()},e.dtFormatter=function(e,t){return this.loc.dtFormatter(e,l({},this.opts,t=void 0===t?{}:t))},e.formatDateTime=function(e,t){return this.dtFormatter(e,t).format()},e.formatDateTimeParts=function(e,t){return this.dtFormatter(e,t).formatToParts()},e.formatInterval=function(e,t){return this.dtFormatter(e.start,t).dtf.formatRange(e.start.toJSDate(),e.end.toJSDate())},e.resolvedOptions=function(e,t){return this.dtFormatter(e,t).resolvedOptions()},e.num=function(e,t){var n;return void 0===t&&(t=0),this.opts.forceSimple?m(e,t):(n=l({},this.opts),0<t&&(n.padTo=t),this.loc.numberFormatter(n).format(e))},e.formatDateTimeFromString=function(r,e){var n=this,i="en"===this.loc.listingMode(),t=this.loc.outputCalendar&&"gregory"!==this.loc.outputCalendar,o=function(e,t){return n.loc.extract(r,e,t)},a=function(e){return r.isOffsetFixed&&0===r.offset&&e.allowZ?"Z":r.isValid?r.zone.formatOffset(r.ts,e.format):""},s=function(){return i?Wt[r.hour<12?0:1]:o({hour:"numeric",hourCycle:"h12"},"dayperiod")},u=function(e,t){return i?(n=r,Et(e)[n.month-1]):o(t?{month:e}:{month:e,day:"numeric"},"month");var n},l=function(e,t){return i?(n=r,Zt(e)[n.weekday-1]):o(t?{weekday:e}:{weekday:e,month:"long",day:"numeric"},"weekday");var n},c=function(e){var t=d.macroTokenToFormatOpts(e);return t?n.formatWithSystemDefault(r,t):e},f=function(e){return i?(t=r,At(e)[t.year<0?0:1]):o({era:e},"era");var t};return qt(d.parseFormat(e),function(e){switch(e){case"S":return n.num(r.millisecond);case"u":case"SSS":return n.num(r.millisecond,3);case"s":return n.num(r.second);case"ss":return n.num(r.second,2);case"uu":return n.num(Math.floor(r.millisecond/10),2);case"uuu":return n.num(Math.floor(r.millisecond/100));case"m":return n.num(r.minute);case"mm":return n.num(r.minute,2);case"h":return n.num(r.hour%12==0?12:r.hour%12);case"hh":return n.num(r.hour%12==0?12:r.hour%12,2);case"H":return n.num(r.hour);case"HH":return n.num(r.hour,2);case"Z":return a({format:"narrow",allowZ:n.opts.allowZ});case"ZZ":return a({format:"short",allowZ:n.opts.allowZ});case"ZZZ":return a({format:"techie",allowZ:n.opts.allowZ});case"ZZZZ":return r.zone.offsetName(r.ts,{format:"short",locale:n.loc.locale});case"ZZZZZ":return r.zone.offsetName(r.ts,{format:"long",locale:n.loc.locale});case"z":return r.zoneName;case"a":return s();case"d":return t?o({day:"numeric"},"day"):n.num(r.day);case"dd":return t?o({day:"2-digit"},"day"):n.num(r.day,2);case"c":return n.num(r.weekday);case"ccc":return l("short",!0);case"cccc":return l("long",!0);case"ccccc":return l("narrow",!0);case"E":return n.num(r.weekday);case"EEE":return l("short",!1);case"EEEE":return l("long",!1);case"EEEEE":return l("narrow",!1);case"L":return t?o({month:"numeric",day:"numeric"},"month"):n.num(r.month);case"LL":return t?o({month:"2-digit",day:"numeric"},"month"):n.num(r.month,2);case"LLL":return u("short",!0);case"LLLL":return u("long",!0);case"LLLLL":return u("narrow",!0);case"M":return t?o({month:"numeric"},"month"):n.num(r.month);case"MM":return t?o({month:"2-digit"},"month"):n.num(r.month,2);case"MMM":return u("short",!1);case"MMMM":return u("long",!1);case"MMMMM":return u("narrow",!1);case"y":return t?o({year:"numeric"},"year"):n.num(r.year);case"yy":return t?o({year:"2-digit"},"year"):n.num(r.year.toString().slice(-2),2);case"yyyy":return t?o({year:"numeric"},"year"):n.num(r.year,4);case"yyyyyy":return t?o({year:"numeric"},"year"):n.num(r.year,6);case"G":return f("short");case"GG":return f("long");case"GGGGG":return f("narrow");case"kk":return n.num(r.weekYear.toString().slice(-2),2);case"kkkk":return n.num(r.weekYear,4);case"W":return n.num(r.weekNumber);case"WW":return n.num(r.weekNumber,2);case"n":return n.num(r.localWeekNumber);case"nn":return n.num(r.localWeekNumber,2);case"ii":return n.num(r.localWeekYear.toString().slice(-2),2);case"iiii":return n.num(r.localWeekYear,4);case"o":return n.num(r.ordinal);case"ooo":return n.num(r.ordinal,3);case"q":return n.num(r.quarter);case"qq":return n.num(r.quarter,2);case"X":return n.num(Math.floor(r.ts/1e3));case"x":return n.num(r.ts);default:return c(e)}})},e.formatDurationFromString=function(e,t){var n,r=this,i=function(e){switch(e[0]){case"S":return"millisecond";case"s":return"second";case"m":return"minute";case"h":return"hour";case"d":return"day";case"w":return"week";case"M":return"month";case"y":return"year";default:return null}},t=d.parseFormat(t),o=t.reduce(function(e,t){var n=t.literal,t=t.val;return n?e:e.concat(t)},[]),e=e.shiftTo.apply(e,o.map(i).filter(function(e){return e}));return qt(t,(n=e,function(e){var t=i(e);return t?r.num(n.get(t),e.length):e}))},d}(),r=/[A-Za-z_+-]{1,256}(?::?\\/[A-Za-z0-9_+-]{1,256}(?:\\/[A-Za-z0-9_+-]{1,256})?)?/;function Ut(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];var r=t.reduce(function(e,t){return e+t.source},"");return RegExp("^"+r+"$")}function Rt(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return function(o){return t.reduce(function(e,t){var n=e[0],r=e[1],e=e[2],t=t(o,e),e=t[0],i=t[1],t=t[2];return[l({},n,e),i||r,t]},[{},null,1]).slice(0,2)}}function Pt(e){if(null!=e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];for(var i=0,o=n;i<o.length;i++){var a=o[i],s=a[0],a=a[1],s=s.exec(e);if(s)return a(s)}}return[null,null]}function Yt(){for(var e=arguments.length,i=new Array(e),t=0;t<e;t++)i[t]=arguments[t];return function(e,t){for(var n={},r=0;r<i.length;r++)n[i[r]]=p(e[t+r]);return[n,null,t+r]}}var t=/(?:(Z)|([+-]\\d\\d)(?::?(\\d\\d))?)/,a=/(\\d\\d)(?::?(\\d\\d)(?::?(\\d\\d)(?:[.,](\\d{1,30}))?)?)?/,Ht=RegExp(a.source+("(?:"+t.source+"?(?:\\\\[("+r.source+")\\\\])?)?")),I=RegExp("(?:T"+Ht.source+")?"),Jt=Yt("weekYear","weekNumber","weekDay"),Gt=Yt("year","ordinal"),t=RegExp(a.source+" ?(?:"+t.source+"|("+r.source+"))?"),r=RegExp("(?: "+t.source+")?");function $t(e,t,n){e=e[t];return N(e)?n:p(e)}function Bt(e,t){return[{hours:$t(e,t,0),minutes:$t(e,t+1,0),seconds:$t(e,t+2,0),milliseconds:dt(e[t+3])},null,t+4]}function Qt(e,t){var n=!e[t]&&!e[t+1],e=St(e[t+1],e[t+2]);return[{},n?null:f.instance(e),t+3]}function Kt(e,t){return[{},e[t]?c.create(e[t]):null,t+1]}var Xt=RegExp("^T?"+a.source+"$"),en=/^-?P(?:(?:(-?\\d{1,20}(?:\\.\\d{1,20})?)Y)?(?:(-?\\d{1,20}(?:\\.\\d{1,20})?)M)?(?:(-?\\d{1,20}(?:\\.\\d{1,20})?)W)?(?:(-?\\d{1,20}(?:\\.\\d{1,20})?)D)?(?:T(?:(-?\\d{1,20}(?:\\.\\d{1,20})?)H)?(?:(-?\\d{1,20}(?:\\.\\d{1,20})?)M)?(?:(-?\\d{1,20})(?:[.,](-?\\d{1,20}))?S)?)?)$/;function tn(e){function t(e,t){return void 0===t&&(t=!1),void 0!==e&&(t||e&&c)?-e:e}var n=e[0],r=e[1],i=e[2],o=e[3],a=e[4],s=e[5],u=e[6],l=e[7],e=e[8],c="-"===n[0],n=l&&"-"===l[0];return[{years:t(k(r)),months:t(k(i)),weeks:t(k(o)),days:t(k(a)),hours:t(k(s)),minutes:t(k(u)),seconds:t(k(l),"-0"===l),milliseconds:t(dt(e),n)}]}var nn={GMT:0,EDT:-240,EST:-300,CDT:-300,CST:-360,MDT:-360,MST:-420,PDT:-420,PST:-480};function rn(e,t,n,r,i,o,a){t={year:2===t.length?wt(p(t)):p(t),month:It.indexOf(n)+1,day:p(r),hour:p(i),minute:p(o)};return a&&(t.second=p(a)),e&&(t.weekday=3<e.length?xt.indexOf(e)+1:Ft.indexOf(e)+1),t}var on=/^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\\s)?(\\d{1,2})\\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s(\\d{2,4})\\s(\\d\\d):(\\d\\d)(?::(\\d\\d))?\\s(?:(UT|GMT|[ECMP][SD]T)|([Zz])|(?:([+-]\\d\\d)(\\d\\d)))$/;function an(e){var t=e[1],n=e[2],r=e[3],i=e[4],o=e[5],a=e[6],s=e[7],u=e[8],l=e[9],c=e[10],e=e[11],t=rn(t,i,r,n,o,a,s),i=u?nn[u]:l?0:St(c,e);return[t,new f(i)]}var sn=/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\\d\\d) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\\d{4}) (\\d\\d):(\\d\\d):(\\d\\d) GMT$/,un=/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\\d\\d)-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\\d\\d) (\\d\\d):(\\d\\d):(\\d\\d) GMT$/,ln=/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( \\d|\\d\\d) (\\d\\d):(\\d\\d):(\\d\\d) (\\d{4})$/;function cn(e){var t=e[1],n=e[2],r=e[3];return[rn(t,e[4],r,n,e[5],e[6],e[7]),f.utcInstance]}function fn(e){var t=e[1],n=e[2],r=e[3],i=e[4],o=e[5],a=e[6];return[rn(t,e[7],n,r,i,o,a),f.utcInstance]}var dn=Ut(/([+-]\\d{6}|\\d{4})(?:-?(\\d\\d)(?:-?(\\d\\d))?)?/,I),hn=Ut(/(\\d{4})-?W(\\d\\d)(?:-?(\\d))?/,I),mn=Ut(/(\\d{4})-?(\\d{3})/,I),yn=Ut(Ht),vn=Rt(function(e,t){return[{year:$t(e,t),month:$t(e,t+1,1),day:$t(e,t+2,1)},null,t+3]},Bt,Qt,Kt),gn=Rt(Jt,Bt,Qt,Kt),pn=Rt(Gt,Bt,Qt,Kt),kn=Rt(Bt,Qt,Kt);var wn=Rt(Bt);var bn=Ut(/(\\d{4})-(\\d\\d)-(\\d\\d)/,r),Sn=Ut(t),On=Rt(Bt,Qt,Kt);var Tn="Invalid Duration",a={weeks:{days:7,hours:168,minutes:10080,seconds:604800,milliseconds:6048e5},days:{hours:24,minutes:1440,seconds:86400,milliseconds:864e5},hours:{minutes:60,seconds:3600,milliseconds:36e5},minutes:{seconds:60,milliseconds:6e4},seconds:{milliseconds:1e3}},Nn=l({years:{quarters:4,months:12,weeks:52,days:365,hours:8760,minutes:525600,seconds:31536e3,milliseconds:31536e6},quarters:{months:3,weeks:13,days:91,hours:2184,minutes:131040,seconds:7862400,milliseconds:78624e5},months:{weeks:4,days:30,hours:720,minutes:43200,seconds:2592e3,milliseconds:2592e6}},a),I=365.2425,Ht=30.436875,Dn=l({years:{quarters:4,months:12,weeks:I/7,days:I,hours:24*I,minutes:525949.2,seconds:525949.2*60,milliseconds:525949.2*60*1e3},quarters:{months:3,weeks:I/28,days:I/4,hours:24*I/4,minutes:131487.3,seconds:525949.2*60/4,milliseconds:7889237999.999999},months:{weeks:Ht/7,days:Ht,hours:24*Ht,minutes:43829.1,seconds:2629746,milliseconds:2629746e3}},a),V=["years","quarters","months","weeks","days","hours","minutes","seconds","milliseconds"],Mn=V.slice(0).reverse();function E(e,t,n){n={values:(n=void 0===n?!1:n)?t.values:l({},e.values,t.values||{}),loc:e.loc.clone(t.loc),conversionAccuracy:t.conversionAccuracy||e.conversionAccuracy,matrix:t.matrix||e.matrix};return new x(n)}function In(e,t){for(var n,r=null!=(n=t.milliseconds)?n:0,i=R(Mn.slice(1));!(o=i()).done;){var o=o.value;t[o]&&(r+=t[o]*e[o].milliseconds)}return r}function Vn(i,o){var a=In(i,o)<0?-1:1;V.reduceRight(function(e,t){var n,r;return N(o[t])?e:(e&&(r=o[e]*a,n=i[t][e],r=Math.floor(r/n),o[t]+=r*a,o[e]-=r*n*a),t)},null),V.reduce(function(e,t){var n;return N(o[t])?e:(e&&(n=o[e]%1,o[e]-=n,o[t]+=n*i[e][t]),t)},null)}var x=function(e){function m(e){var t="longterm"===e.conversionAccuracy||!1,n=t?Dn:Nn;e.matrix&&(n=e.matrix),this.values=e.values,this.loc=e.loc||b.create(),this.conversionAccuracy=t?"longterm":"casual",this.invalid=e.invalid||null,this.matrix=n,this.isLuxonDuration=!0}m.fromMillis=function(e,t){return m.fromObject({milliseconds:e},t)},m.fromObject=function(e,t){if(void 0===t&&(t={}),null==e||"object"!=typeof e)throw new u("Duration.fromObject: argument expected to be an object, got "+(null===e?"null":typeof e));return new m({values:Tt(e,m.normalizeUnit),loc:b.fromObject(t),conversionAccuracy:t.conversionAccuracy,matrix:t.matrix})},m.fromDurationLike=function(e){if(v(e))return m.fromMillis(e);if(m.isDuration(e))return e;if("object"==typeof e)return m.fromObject(e);throw new u("Unknown duration argument "+e+" of type "+typeof e)},m.fromISO=function(e,t){var n=Pt(e,[en,tn])[0];return n?m.fromObject(n,t):m.invalid("unparsable",'the input "'+e+"\\" can't be parsed as ISO 8601")},m.fromISOTime=function(e,t){var n=Pt(e,[Xt,wn])[0];return n?m.fromObject(n,t):m.invalid("unparsable",'the input "'+e+"\\" can't be parsed as ISO 8601")},m.invalid=function(e,t){if(void 0===t&&(t=null),!e)throw new u("need to specify a reason the Duration is invalid");e=e instanceof h?e:new h(e,t);if(O.throwOnInvalid)throw new H(e);return new m({invalid:e})},m.normalizeUnit=function(e){var t={year:"years",years:"years",quarter:"quarters",quarters:"quarters",month:"months",months:"months",week:"weeks",weeks:"weeks",day:"days",days:"days",hour:"hours",hours:"hours",minute:"minutes",minutes:"minutes",second:"seconds",seconds:"seconds",millisecond:"milliseconds",milliseconds:"milliseconds"}[e&&e.toLowerCase()];if(t)return t;throw new J(e)},m.isDuration=function(e){return e&&e.isLuxonDuration||!1};var t=m.prototype;return t.toFormat=function(e,t){t=l({},t=void 0===t?{}:t,{floor:!1!==t.round&&!1!==t.floor});return this.isValid?M.create(this.loc,t).formatDurationFromString(this,e):Tn},t.toHuman=function(n){var e,r=this;return void 0===n&&(n={}),this.isValid?(e=V.map(function(e){var t=r.values[e];return N(t)?null:r.loc.numberFormatter(l({style:"unit",unitDisplay:"long"},n,{unit:e.slice(0,-1)})).format(t)}).filter(function(e){return e}),this.loc.listFormatter(l({type:"conjunction",style:n.listStyle||"narrow"},n)).format(e)):Tn},t.toObject=function(){return this.isValid?l({},this.values):{}},t.toISO=function(){var e;return this.isValid?(e="P",0!==this.years&&(e+=this.years+"Y"),0===this.months&&0===this.quarters||(e+=this.months+3*this.quarters+"M"),0!==this.weeks&&(e+=this.weeks+"W"),0!==this.days&&(e+=this.days+"D"),0===this.hours&&0===this.minutes&&0===this.seconds&&0===this.milliseconds||(e+="T"),0!==this.hours&&(e+=this.hours+"H"),0!==this.minutes&&(e+=this.minutes+"M"),0===this.seconds&&0===this.milliseconds||(e+=ht(this.seconds+this.milliseconds/1e3,3)+"S"),"P"===e&&(e+="T0S"),e):null},t.toISOTime=function(e){var t;return void 0===e&&(e={}),!this.isValid||(t=this.toMillis())<0||864e5<=t?null:(e=l({suppressMilliseconds:!1,suppressSeconds:!1,includePrefix:!1,format:"extended"},e,{includeOffset:!1}),W.fromMillis(t,{zone:"UTC"}).toISOTime(e))},t.toJSON=function(){return this.toISO()},t.toString=function(){return this.toISO()},t[e]=function(){return this.isValid?"Duration { values: "+JSON.stringify(this.values)+" }":"Duration { Invalid, reason: "+this.invalidReason+" }"},t.toMillis=function(){return this.isValid?In(this.matrix,this.values):NaN},t.valueOf=function(){return this.toMillis()},t.plus=function(e){if(!this.isValid)return this;for(var t=m.fromDurationLike(e),n={},r=0,i=V;r<i.length;r++){var o=i[r];(g(t.values,o)||g(this.values,o))&&(n[o]=t.get(o)+this.get(o))}return E(this,{values:n},!0)},t.minus=function(e){return this.isValid?(e=m.fromDurationLike(e),this.plus(e.negate())):this},t.mapUnits=function(e){if(!this.isValid)return this;for(var t={},n=0,r=Object.keys(this.values);n<r.length;n++){var i=r[n];t[i]=Ot(e(this.values[i],i))}return E(this,{values:t},!0)},t.get=function(e){return this[m.normalizeUnit(e)]},t.set=function(e){return this.isValid?E(this,{values:l({},this.values,Tt(e,m.normalizeUnit))}):this},t.reconfigure=function(e){var e=void 0===e?{}:e,t=e.locale,n=e.numberingSystem,r=e.conversionAccuracy,e=e.matrix,t=this.loc.clone({locale:t,numberingSystem:n});return E(this,{loc:t,matrix:e,conversionAccuracy:r})},t.as=function(e){return this.isValid?this.shiftTo(e).get(e):NaN},t.normalize=function(){var e;return this.isValid?(e=this.toObject(),Vn(this.matrix,e),E(this,{values:e},!0)):this},t.rescale=function(){var e;return this.isValid?(e=function(e){for(var t={},n=0,r=Object.entries(e);n<r.length;n++){var i=r[n],o=i[0],i=i[1];0!==i&&(t[o]=i)}return t}(this.normalize().shiftToAll().toObject()),E(this,{values:e},!0)):this},t.shiftTo=function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];if(!this.isValid)return this;if(0===t.length)return this;for(var r,t=t.map(function(e){return m.normalizeUnit(e)}),i={},o={},a=this.toObject(),s=0,u=V;s<u.length;s++){var l=u[s];if(0<=t.indexOf(l)){var c,f=l,d=0;for(c in o)d+=this.matrix[c][l]*o[c],o[c]=0;v(a[l])&&(d+=a[l]);var h=Math.trunc(d);o[l]=(1e3*d-1e3*(i[l]=h))/1e3}else v(a[l])&&(o[l]=a[l])}for(r in o)0!==o[r]&&(i[f]+=r===f?o[r]:o[r]/this.matrix[f][r]);return Vn(this.matrix,i),E(this,{values:i},!0)},t.shiftToAll=function(){return this.isValid?this.shiftTo("years","months","weeks","days","hours","minutes","seconds","milliseconds"):this},t.negate=function(){if(!this.isValid)return this;for(var e={},t=0,n=Object.keys(this.values);t<n.length;t++){var r=n[t];e[r]=0===this.values[r]?0:-this.values[r]}return E(this,{values:e},!0)},t.equals=function(e){if(!this.isValid||!e.isValid)return!1;if(!this.loc.equals(e.loc))return!1;for(var t,n=0,r=V;n<r.length;n++){var i=r[n];if(t=this.values[i],i=e.values[i],!(void 0===t||0===t?void 0===i||0===i:t===i))return!1}return!0},i(m,[{key:"locale",get:function(){return this.isValid?this.loc.locale:null}},{key:"numberingSystem",get:function(){return this.isValid?this.loc.numberingSystem:null}},{key:"years",get:function(){return this.isValid?this.values.years||0:NaN}},{key:"quarters",get:function(){return this.isValid?this.values.quarters||0:NaN}},{key:"months",get:function(){return this.isValid?this.values.months||0:NaN}},{key:"weeks",get:function(){return this.isValid?this.values.weeks||0:NaN}},{key:"days",get:function(){return this.isValid?this.values.days||0:NaN}},{key:"hours",get:function(){return this.isValid?this.values.hours||0:NaN}},{key:"minutes",get:function(){return this.isValid?this.values.minutes||0:NaN}},{key:"seconds",get:function(){return this.isValid?this.values.seconds||0:NaN}},{key:"milliseconds",get:function(){return this.isValid?this.values.milliseconds||0:NaN}},{key:"isValid",get:function(){return null===this.invalid}},{key:"invalidReason",get:function(){return this.invalid?this.invalid.reason:null}},{key:"invalidExplanation",get:function(){return this.invalid?this.invalid.explanation:null}}]),m}(Symbol.for("nodejs.util.inspect.custom")),En="Invalid Interval";var xn=function(e){function l(e){this.s=e.start,this.e=e.end,this.invalid=e.invalid||null,this.isLuxonInterval=!0}l.invalid=function(e,t){if(void 0===t&&(t=null),!e)throw new u("need to specify a reason the Interval is invalid");e=e instanceof h?e:new h(e,t);if(O.throwOnInvalid)throw new Y(e);return new l({invalid:e})},l.fromDateTimes=function(e,t){var n,e=kr(e),t=kr(t),r=(n=t,(r=e)&&r.isValid?n&&n.isValid?n<r?xn.invalid("end before start","The end of an interval must be after its start, but you had start="+r.toISO()+" and end="+n.toISO()):null:xn.invalid("missing or invalid end"):xn.invalid("missing or invalid start"));return null==r?new l({start:e,end:t}):r},l.after=function(e,t){t=x.fromDurationLike(t),e=kr(e);return l.fromDateTimes(e,e.plus(t))},l.before=function(e,t){t=x.fromDurationLike(t),e=kr(e);return l.fromDateTimes(e.minus(t),e)},l.fromISO=function(e,t){var n,r,i,o=(e||"").split("/",2),a=o[0],s=o[1];if(a&&s){try{u=(n=W.fromISO(a,t)).isValid}catch(s){u=!1}try{i=(r=W.fromISO(s,t)).isValid}catch(s){i=!1}if(u&&i)return l.fromDateTimes(n,r);if(u){o=x.fromISO(s,t);if(o.isValid)return l.after(n,o)}else if(i){var u=x.fromISO(a,t);if(u.isValid)return l.before(r,u)}}return l.invalid("unparsable",'the input "'+e+"\\" can't be parsed as ISO 8601")},l.isInterval=function(e){return e&&e.isLuxonInterval||!1};var t=l.prototype;return t.length=function(e){return void 0===e&&(e="milliseconds"),this.isValid?this.toDuration.apply(this,[e]).get(e):NaN},t.count=function(e,t){var n,r;return this.isValid?(n=this.start.startOf(e=void 0===e?"milliseconds":e,t),r=(r=null!=t&&t.useLocaleWeeks?this.end.reconfigure({locale:n.locale}):this.end).startOf(e,t),Math.floor(r.diff(n,e).get(e))+(r.valueOf()!==this.end.valueOf())):NaN},t.hasSame=function(e){return!!this.isValid&&(this.isEmpty()||this.e.minus(1).hasSame(this.s,e))},t.isEmpty=function(){return this.s.valueOf()===this.e.valueOf()},t.isAfter=function(e){return!!this.isValid&&this.s>e},t.isBefore=function(e){return!!this.isValid&&this.e<=e},t.contains=function(e){return!!this.isValid&&this.s<=e&&this.e>e},t.set=function(e){var e=void 0===e?{}:e,t=e.start,e=e.end;return this.isValid?l.fromDateTimes(t||this.s,e||this.e):this},t.splitAt=function(){var t=this;if(!this.isValid)return[];for(var e=arguments.length,n=new Array(e),r=0;r<e;r++)n[r]=arguments[r];for(var i=n.map(kr).filter(function(e){return t.contains(e)}).sort(function(e,t){return e.toMillis()-t.toMillis()}),o=[],a=this.s,s=0;a<this.e;){var u=i[s]||this.e,u=+u>+this.e?this.e:u;o.push(l.fromDateTimes(a,u)),a=u,s+=1}return o},t.splitBy=function(e){var t=x.fromDurationLike(e);if(!this.isValid||!t.isValid||0===t.as("milliseconds"))return[];for(var n=this.s,r=1,i=[];n<this.e;){var o=this.start.plus(t.mapUnits(function(e){return e*r})),o=+o>+this.e?this.e:o;i.push(l.fromDateTimes(n,o)),n=o,r+=1}return i},t.divideEqually=function(e){return this.isValid?this.splitBy(this.length()/e).slice(0,e):[]},t.overlaps=function(e){return this.e>e.s&&this.s<e.e},t.abutsStart=function(e){return!!this.isValid&&+this.e==+e.s},t.abutsEnd=function(e){return!!this.isValid&&+e.e==+this.s},t.engulfs=function(e){return!!this.isValid&&this.s<=e.s&&this.e>=e.e},t.equals=function(e){return!(!this.isValid||!e.isValid)&&this.s.equals(e.s)&&this.e.equals(e.e)},t.intersection=function(e){var t;return this.isValid?(t=(this.s>e.s?this:e).s,(e=(this.e<e.e?this:e).e)<=t?null:l.fromDateTimes(t,e)):this},t.union=function(e){var t;return this.isValid?(t=(this.s<e.s?this:e).s,e=(this.e>e.e?this:e).e,l.fromDateTimes(t,e)):this},l.merge=function(e){var e=e.sort(function(e,t){return e.s-t.s}).reduce(function(e,t){var n=e[0],e=e[1];return e?e.overlaps(t)||e.abutsStart(t)?[n,e.union(t)]:[n.concat([e]),t]:[n,t]},[[],null]),t=e[0],e=e[1];return e&&t.push(e),t},l.xor=function(e){for(var t,n=null,r=0,i=[],e=e.map(function(e){return[{time:e.s,type:"s"},{time:e.e,type:"e"}]}),o=R((t=Array.prototype).concat.apply(t,e).sort(function(e,t){return e.time-t.time}));!(a=o()).done;)var a=a.value,n=1===(r+="s"===a.type?1:-1)?a.time:(n&&+n!=+a.time&&i.push(l.fromDateTimes(n,a.time)),null);return l.merge(i)},t.difference=function(){for(var t=this,e=arguments.length,n=new Array(e),r=0;r<e;r++)n[r]=arguments[r];return l.xor([this].concat(n)).map(function(e){return t.intersection(e)}).filter(function(e){return e&&!e.isEmpty()})},t.toString=function(){return this.isValid?"["+this.s.toISO()+" – "+this.e.toISO()+")":En},t[e]=function(){return this.isValid?"Interval { start: "+this.s.toISO()+", end: "+this.e.toISO()+" }":"Interval { Invalid, reason: "+this.invalidReason+" }"},t.toLocaleString=function(e,t){return void 0===e&&(e=G),void 0===t&&(t={}),this.isValid?M.create(this.s.loc.clone(t),e).formatInterval(this):En},t.toISO=function(e){return this.isValid?this.s.toISO(e)+"/"+this.e.toISO(e):En},t.toISODate=function(){return this.isValid?this.s.toISODate()+"/"+this.e.toISODate():En},t.toISOTime=function(e){return this.isValid?this.s.toISOTime(e)+"/"+this.e.toISOTime(e):En},t.toFormat=function(e,t){t=(void 0===t?{}:t).separator,t=void 0===t?" – ":t;return this.isValid?""+this.s.toFormat(e)+t+this.e.toFormat(e):En},t.toDuration=function(e,t){return this.isValid?this.e.diff(this.s,e,t):x.invalid(this.invalidReason)},t.mapEndpoints=function(e){return l.fromDateTimes(e(this.s),e(this.e))},i(l,[{key:"start",get:function(){return this.isValid?this.s:null}},{key:"end",get:function(){return this.isValid?this.e:null}},{key:"isValid",get:function(){return null===this.invalidReason}},{key:"invalidReason",get:function(){return this.invalid?this.invalid.reason:null}},{key:"invalidExplanation",get:function(){return this.invalid?this.invalid.explanation:null}}]),l}(Symbol.for("nodejs.util.inspect.custom")),Fn=function(){function e(){}return e.hasDST=function(e){void 0===e&&(e=O.defaultZone);var t=W.now().setZone(e).set({month:12});return!e.isUniversal&&t.offset!==t.set({month:6}).offset},e.isValidIANAZone=function(e){return c.isValidZone(e)},e.normalizeZone=function(e){return S(e,O.defaultZone)},e.getStartOfWeek=function(e){var e=void 0===e?{}:e,t=e.locale,e=e.locObj;return((void 0===e?null:e)||b.create(void 0===t?null:t)).getStartOfWeek()},e.getMinimumDaysInFirstWeek=function(e){var e=void 0===e?{}:e,t=e.locale,e=e.locObj;return((void 0===e?null:e)||b.create(void 0===t?null:t)).getMinDaysInFirstWeek()},e.getWeekendWeekdays=function(e){var e=void 0===e?{}:e,t=e.locale,e=e.locObj;return((void 0===e?null:e)||b.create(void 0===t?null:t)).getWeekendDays().slice()},e.months=function(e,t){void 0===e&&(e="long");var t=void 0===t?{}:t,n=t.locale,r=t.numberingSystem,i=t.locObj,i=void 0===i?null:i,t=t.outputCalendar;return(i||b.create(void 0===n?null:n,void 0===r?null:r,void 0===t?"gregory":t)).months(e)},e.monthsFormat=function(e,t){void 0===e&&(e="long");var t=void 0===t?{}:t,n=t.locale,r=t.numberingSystem,i=t.locObj,i=void 0===i?null:i,t=t.outputCalendar;return(i||b.create(void 0===n?null:n,void 0===r?null:r,void 0===t?"gregory":t)).months(e,!0)},e.weekdays=function(e,t){void 0===e&&(e="long");var t=void 0===t?{}:t,n=t.locale,r=t.numberingSystem,t=t.locObj;return((void 0===t?null:t)||b.create(void 0===n?null:n,void 0===r?null:r,null)).weekdays(e)},e.weekdaysFormat=function(e,t){void 0===e&&(e="long");var t=void 0===t?{}:t,n=t.locale,r=t.numberingSystem,t=t.locObj;return((void 0===t?null:t)||b.create(void 0===n?null:n,void 0===r?null:r,null)).weekdays(e,!0)},e.meridiems=function(e){e=(void 0===e?{}:e).locale;return b.create(void 0===e?null:e).meridiems()},e.eras=function(e,t){void 0===e&&(e="short");t=(void 0===t?{}:t).locale;return b.create(void 0===t?null:t,null,"gregory").eras(e)},e.features=function(){return{relative:ut(),localeWeek:lt()}},e}();function Cn(e,t){function n(e){return e.toUTC(0,{keepLocalTime:!0}).startOf("day").valueOf()}t=n(t)-n(e);return Math.floor(x.fromMillis(t).as("days"))}function Zn(e,t,n,r){var e=function(e,t,n){for(var r,i,o={},a=e,s=0,u=[["years",function(e,t){return t.year-e.year}],["quarters",function(e,t){return t.quarter-e.quarter+4*(t.year-e.year)}],["months",function(e,t){return t.month-e.month+12*(t.year-e.year)}],["weeks",function(e,t){e=Cn(e,t);return(e-e%7)/7}],["days",Cn]];s<u.length;s++){var l=u[s],c=l[0],l=l[1];0<=n.indexOf(c)&&(o[r=c]=l(e,t),t<(i=a.plus(o))?(o[c]--,t<(e=a.plus(o))&&(i=e,o[c]--,e=a.plus(o))):e=i)}return[e,o,i,r]}(e,t,n),i=e[0],o=e[1],a=e[2],e=e[3],s=t-i,n=n.filter(function(e){return 0<=["hours","minutes","seconds","milliseconds"].indexOf(e)}),t=(0===n.length&&(a=a<t?i.plus(((t={})[e]=1,t)):a)!==i&&(o[e]=(o[e]||0)+s/(a-i)),x.fromObject(o,r));return 0<n.length?(e=x.fromMillis(s,r)).shiftTo.apply(e,n).plus(t):t}var Wn="missing Intl.DateTimeFormat.formatToParts support";function F(e,t){return void 0===t&&(t=function(e){return e}),{regex:e,deser:function(e){e=e[0];return t(function(e){var t=parseInt(e,10);if(isNaN(t)){for(var t="",n=0;n<e.length;n++){var r=e.charCodeAt(n);if(-1!==e[n].search(je.hanidec))t+=Ae.indexOf(e[n]);else for(var i in ze){var i=ze[i],o=i[0],i=i[1];o<=r&&r<=i&&(t+=r-o)}}return parseInt(t,10)}return t}(e))}}}var Ln="[ "+String.fromCharCode(160)+"]",jn=new RegExp(Ln,"g");function zn(e){return e.replace(/\\./g,"\\\\.?").replace(jn,Ln)}function An(e){return e.replace(/\\./g,"").replace(jn," ").toLowerCase()}function C(n,r){return null===n?null:{regex:RegExp(n.map(zn).join("|")),deser:function(e){var t=e[0];return n.findIndex(function(e){return An(t)===An(e)})+r}}}function qn(e,t){return{regex:e,deser:function(e){return St(e[1],e[2])},groups:t}}function _n(e){return{regex:e,deser:function(e){return e[0]}}}function Un(t,n){function r(e){return{regex:RegExp(e.val.replace(/[\\-\\[\\]{}()*+?.,\\\\\\^$|#\\s]/g,"\\\\$&")),deser:function(e){return e[0]},literal:!0}}var i=y(n),o=y(n,"{2}"),a=y(n,"{3}"),s=y(n,"{4}"),u=y(n,"{6}"),l=y(n,"{1,2}"),c=y(n,"{1,3}"),f=y(n,"{1,6}"),d=y(n,"{1,9}"),h=y(n,"{2,4}"),m=y(n,"{4,6}"),e=function(e){if(t.literal)return r(e);switch(e.val){case"G":return C(n.eras("short"),0);case"GG":return C(n.eras("long"),0);case"y":return F(f);case"yy":return F(h,wt);case"yyyy":return F(s);case"yyyyy":return F(m);case"yyyyyy":return F(u);case"M":return F(l);case"MM":return F(o);case"MMM":return C(n.months("short",!0),1);case"MMMM":return C(n.months("long",!0),1);case"L":return F(l);case"LL":return F(o);case"LLL":return C(n.months("short",!1),1);case"LLLL":return C(n.months("long",!1),1);case"d":return F(l);case"dd":return F(o);case"o":return F(c);case"ooo":return F(a);case"HH":return F(o);case"H":return F(l);case"hh":return F(o);case"h":return F(l);case"mm":return F(o);case"m":case"q":return F(l);case"qq":return F(o);case"s":return F(l);case"ss":return F(o);case"S":return F(c);case"SSS":return F(a);case"u":return _n(d);case"uu":return _n(l);case"uuu":return F(i);case"a":return C(n.meridiems(),0);case"kkkk":return F(s);case"kk":return F(h,wt);case"W":return F(l);case"WW":return F(o);case"E":case"c":return F(i);case"EEE":return C(n.weekdays("short",!1),1);case"EEEE":return C(n.weekdays("long",!1),1);case"ccc":return C(n.weekdays("short",!0),1);case"cccc":return C(n.weekdays("long",!0),1);case"Z":case"ZZ":return qn(new RegExp("([+-]"+l.source+")(?::("+o.source+"))?"),2);case"ZZZ":return qn(new RegExp("([+-]"+l.source+")("+o.source+")?"),2);case"z":return _n(/[a-z_+-/]{1,256}?/i);case" ":return _n(/[^\\S\\n\\r]/);default:return r(e)}}(t)||{invalidReason:Wn};return e.token=t,e}var Rn={year:{"2-digit":"yy",numeric:"yyyyy"},month:{numeric:"M","2-digit":"MM",short:"MMM",long:"MMMM"},day:{numeric:"d","2-digit":"dd"},weekday:{short:"EEE",long:"EEEE"},dayperiod:"a",dayPeriod:"a",hour12:{numeric:"h","2-digit":"hh"},hour24:{numeric:"H","2-digit":"HH"},minute:{numeric:"m","2-digit":"mm"},second:{numeric:"s","2-digit":"ss"},timeZoneName:{long:"ZZZZZ",short:"ZZZ"}};var Pn=null;function Yn(e,n){var t;return(t=Array.prototype).concat.apply(t,e.map(function(e){return t=n,(e=e).literal||null==(t=Gn(M.macroTokenToFormatOpts(e.val),t))||t.includes(void 0)?e:t;var t}))}var Hn=function(){function e(t,e){var n;this.locale=t,this.format=e,this.tokens=Yn(M.parseFormat(e),t),this.units=this.tokens.map(function(e){return Un(e,t)}),this.disqualifyingUnit=this.units.find(function(e){return e.invalidReason}),this.disqualifyingUnit||(n=(e=["^"+(e=this.units).map(function(e){return e.regex}).reduce(function(e,t){return e+"("+t.source+")"},"")+"$",e])[1],this.regex=RegExp(e[0],"i"),this.handlers=n)}return e.prototype.explainFromTokens=function(e){if(this.isValid){var t=function(e,t,n){var r=e.match(t);if(r){var i,o,a,s={},u=1;for(i in n)g(n,i)&&(a=(o=n[i]).groups?o.groups+1:1,!o.literal&&o.token&&(s[o.token.val[0]]=o.deser(r.slice(u,u+a))),u+=a);return[r,s]}return[r,{}]}(e,this.regex,this.handlers),n=t[0],t=t[1],r=t?(r=null,N((s=t).z)||(r=c.create(s.z)),N(s.Z)||(r=r||new f(s.Z),i=s.Z),N(s.q)||(s.M=3*(s.q-1)+1),N(s.h)||(s.h<12&&1===s.a?s.h+=12:12===s.h&&0===s.a&&(s.h=0)),0===s.G&&s.y&&(s.y=-s.y),N(s.u)||(s.S=dt(s.u)),[Object.keys(s).reduce(function(e,t){var n=function(e){switch(e){case"S":return"millisecond";case"s":return"second";case"m":return"minute";case"h":case"H":return"hour";case"d":return"day";case"o":return"ordinal";case"L":case"M":return"month";case"y":return"year";case"E":case"c":return"weekday";case"W":return"weekNumber";case"k":return"weekYear";case"q":return"quarter";default:return null}}(t);return n&&(e[n]=s[t]),e},{}),r,i]):[null,null,void 0],i=r[0],o=r[1],a=r[2];if(g(t,"a")&&g(t,"H"))throw new w("Can't include meridiem when specifying 24-hour format");return{input:e,tokens:this.tokens,regex:this.regex,rawMatches:n,matches:t,result:i,zone:o,specificOffset:a}}return{input:e,tokens:this.tokens,invalidReason:this.invalidReason};var s,i,r},i(e,[{key:"isValid",get:function(){return!this.disqualifyingUnit}},{key:"invalidReason",get:function(){return this.disqualifyingUnit?this.disqualifyingUnit.invalidReason:null}}]),e}();function Jn(e,t,n){return new Hn(e,n).explainFromTokens(t)}function Gn(o,e){var t,a;return o?(t=(e=M.create(e,o).dtFormatter(Pn=Pn||W.fromMillis(1555555555555))).formatToParts(),a=e.resolvedOptions(),t.map(function(e){return t=o,n=a,i=(e=e).type,e=e.value,"literal"===i?{literal:!(r=/^\\s+$/.test(e)),val:r?" ":e}:(r=t[i],"hour"===(e=i)&&(e=null!=t.hour12?t.hour12?"hour12":"hour24":null!=t.hourCycle?"h11"===t.hourCycle||"h12"===t.hourCycle?"hour12":"hour24":n.hour12?"hour12":"hour24"),(i="object"==typeof(i=Rn[e])?i[r]:i)?{literal:!1,val:i}:void 0);var t,n,r,i})):null}var $n="Invalid DateTime";function Bn(e){return new h("unsupported zone",'the zone "'+e.name+'" is not supported')}function Qn(e){return null===e.weekData&&(e.weekData=et(e.c)),e.weekData}function Kn(e){return null===e.localWeekData&&(e.localWeekData=et(e.c,e.loc.getMinDaysInFirstWeek(),e.loc.getStartOfWeek())),e.localWeekData}function Z(e,t){e={ts:e.ts,zone:e.zone,c:e.c,o:e.o,loc:e.loc,invalid:e.invalid};return new W(l({},e,t,{old:e}))}function Xn(e,t,n){var r=e-60*t*1e3,i=n.offset(r);return t===i?[r,t]:i===(n=n.offset(r-=60*(i-t)*1e3))?[r,i]:[e-60*Math.min(i,n)*1e3,Math.max(i,n)]}function er(e,t){e+=60*t*1e3;t=new Date(e);return{year:t.getUTCFullYear(),month:t.getUTCMonth()+1,day:t.getUTCDate(),hour:t.getUTCHours(),minute:t.getUTCMinutes(),second:t.getUTCSeconds(),millisecond:t.getUTCMilliseconds()}}function tr(e,t,n){return Xn(gt(e),t,n)}function nr(e,t){var n=e.o,r=e.c.year+Math.trunc(t.years),i=e.c.month+Math.trunc(t.months)+3*Math.trunc(t.quarters),r=l({},e.c,{year:r,month:i,day:Math.min(e.c.day,vt(r,i))+Math.trunc(t.days)+7*Math.trunc(t.weeks)}),i=x.fromObject({years:t.years-Math.trunc(t.years),quarters:t.quarters-Math.trunc(t.quarters),months:t.months-Math.trunc(t.months),weeks:t.weeks-Math.trunc(t.weeks),days:t.days-Math.trunc(t.days),hours:t.hours,minutes:t.minutes,seconds:t.seconds,milliseconds:t.milliseconds}).as("milliseconds"),t=Xn(gt(r),n,e.zone),r=t[0],n=t[1];return 0!==i&&(n=e.zone.offset(r+=i)),{ts:r,o:n}}function rr(e,t,n,r,i,o){var a=n.setZone,s=n.zone;return e&&0!==Object.keys(e).length||t?(e=W.fromObject(e,l({},n,{zone:t||s,specificOffset:o})),a?e:e.setZone(s)):W.invalid(new h("unparsable",'the input "'+i+"\\" can't be parsed as "+r))}function ir(e,t,n){return void 0===n&&(n=!0),e.isValid?M.create(b.create("en-US"),{allowZ:n,forceSimple:!0}).formatDateTimeFromString(e,t):null}function or(e,t){var n=9999<e.c.year||e.c.year<0,r="";return n&&0<=e.c.year&&(r+="+"),r+=m(e.c.year,n?6:4),r=t?(r=(r+="-")+m(e.c.month)+"-")+m(e.c.day):(r+=m(e.c.month))+m(e.c.day)}function ar(e,t,n,r,i,o){var a=m(e.c.hour);return t?(a=(a+=":")+m(e.c.minute),0===e.c.millisecond&&0===e.c.second&&n||(a+=":")):a+=m(e.c.minute),0===e.c.millisecond&&0===e.c.second&&n||(a+=m(e.c.second),0===e.c.millisecond&&r)||(a=(a+=".")+m(e.c.millisecond,3)),i&&(e.isOffsetFixed&&0===e.offset&&!o?a+="Z":a=e.o<0?(a=(a+="-")+m(Math.trunc(-e.o/60))+":")+m(Math.trunc(-e.o%60)):(a=(a+="+")+m(Math.trunc(e.o/60))+":")+m(Math.trunc(e.o%60))),o&&(a+="["+e.zone.ianaName+"]"),a}var sr,ur={month:1,day:1,hour:0,minute:0,second:0,millisecond:0},lr={weekNumber:1,weekday:1,hour:0,minute:0,second:0,millisecond:0},cr={ordinal:1,hour:0,minute:0,second:0,millisecond:0},fr=["year","month","day","hour","minute","second","millisecond"],dr=["weekYear","weekNumber","weekday","hour","minute","second","millisecond"],hr=["year","ordinal","hour","minute","second","millisecond"];function mr(e){switch(e.toLowerCase()){case"localweekday":case"localweekdays":return"localWeekday";case"localweeknumber":case"localweeknumbers":return"localWeekNumber";case"localweekyear":case"localweekyears":return"localWeekYear";default:var t=e,n={year:"year",years:"year",month:"month",months:"month",day:"day",days:"day",hour:"hour",hours:"hour",minute:"minute",minutes:"minute",quarter:"quarter",quarters:"quarter",second:"second",seconds:"second",millisecond:"millisecond",milliseconds:"millisecond",weekday:"weekday",weekdays:"weekday",weeknumber:"weekNumber",weeksnumber:"weekNumber",weeknumbers:"weekNumber",weekyear:"weekYear",weekyears:"weekYear",ordinal:"ordinal"}[t.toLowerCase()];if(n)return n;throw new J(t)}}function yr(e,t){var n=S(t.zone,O.defaultZone);if(!n.isValid)return W.invalid(Bn(n));t=b.fromObject(t);if(N(e.year))s=O.now();else{for(var r=0,i=fr;r<i.length;r++){var o=i[r];N(e[o])&&(e[o]=ur[o])}var a=ot(e)||at(e);if(a)return W.invalid(a);pr[a=n]||(void 0===sr&&(sr=O.now()),pr[a]=a.offset(sr));var a=tr(e,pr[a],n),s=a[0],a=a[1]}return new W({ts:s,zone:n,loc:t,o:a})}function vr(t,n,r){function e(e,t){return e=ht(e,o||r.calendary?0:2,!0),n.loc.clone(r).relFormatter(r).format(e,t)}function i(e){return r.calendary?n.hasSame(t,e)?0:n.startOf(e).diff(t.startOf(e),e).get(e):n.diff(t,e).get(e)}var o=!!N(r.round)||r.round;if(r.unit)return e(i(r.unit),r.unit);for(var a=R(r.units);!(s=a()).done;){var s=s.value,u=i(s);if(1<=Math.abs(u))return e(u,s)}return e(n<t?-0:0,r.units[r.units.length-1])}function gr(e){var t={},e=0<e.length&&"object"==typeof e[e.length-1]?(t=e[e.length-1],Array.from(e).slice(0,e.length-1)):Array.from(e);return[t,e]}var pr={},W=function(e){function k(e){var t,n=e.zone||O.defaultZone,r=e.invalid||(Number.isNaN(e.ts)?new h("invalid input"):null)||(n.isValid?null:Bn(n)),i=(this.ts=N(e.ts)?O.now():e.ts,null),o=null;r||(o=e.old&&e.old.ts===this.ts&&e.old.zone.equals(n)?(i=(t=[e.old.c,e.old.o])[0],t[1]):(t=v(e.o)&&!e.old?e.o:n.offset(this.ts),i=er(this.ts,t),i=(r=Number.isNaN(i.year)?new h("invalid input"):null)?null:i,r?null:t)),this._zone=n,this.loc=e.loc||b.create(),this.invalid=r,this.weekData=null,this.localWeekData=null,this.c=i,this.o=o,this.isLuxonDateTime=!0}k.now=function(){return new k({})},k.local=function(){var e=gr(arguments),t=e[0],e=e[1];return yr({year:e[0],month:e[1],day:e[2],hour:e[3],minute:e[4],second:e[5],millisecond:e[6]},t)},k.utc=function(){var e=gr(arguments),t=e[0],e=e[1],n=e[0],r=e[1],i=e[2],o=e[3],a=e[4],s=e[5],e=e[6];return t.zone=f.utcInstance,yr({year:n,month:r,day:i,hour:o,minute:a,second:s,millisecond:e},t)},k.fromJSDate=function(e,t){void 0===t&&(t={});var n,e="[object Date]"===Object.prototype.toString.call(e)?e.valueOf():NaN;return Number.isNaN(e)?k.invalid("invalid input"):(n=S(t.zone,O.defaultZone)).isValid?new k({ts:e,zone:n,loc:b.fromObject(t)}):k.invalid(Bn(n))},k.fromMillis=function(e,t){if(void 0===t&&(t={}),v(e))return e<-864e13||864e13<e?k.invalid("Timestamp out of range"):new k({ts:e,zone:S(t.zone,O.defaultZone),loc:b.fromObject(t)});throw new u("fromMillis requires a numerical input, but received a "+typeof e+" with value "+e)},k.fromSeconds=function(e,t){if(void 0===t&&(t={}),v(e))return new k({ts:1e3*e,zone:S(t.zone,O.defaultZone),loc:b.fromObject(t)});throw new u("fromSeconds requires a numerical input")},k.fromObject=function(e,t){e=e||{};var n=S((t=void 0===t?{}:t).zone,O.defaultZone);if(!n.isValid)return k.invalid(Bn(n));var r=b.fromObject(t),i=Tt(e,mr),o=it(i,r),a=o.minDaysInFirstWeek,o=o.startOfWeek,s=O.now(),t=N(t.specificOffset)?n.offset(s):t.specificOffset,u=!N(i.ordinal),l=!N(i.year),c=!N(i.month)||!N(i.day),l=l||c,f=i.weekYear||i.weekNumber;if((l||u)&&f)throw new w("Can't mix weekYear/weekNumber units with year/month/day or ordinals");if(c&&u)throw new w("Can't mix ordinal dates with month/day");for(var d,c=f||i.weekday&&!l,h=er(s,t),m=(c?(p=dr,d=lr,h=et(h,a,o)):u?(p=hr,d=cr,h=nt(h)):(p=fr,d=ur),!1),y=R(p);!(v=y()).done;){var v=v.value;N(i[v])?i[v]=(m?d:h)[v]:m=!0}var g,p=(c?(f=a,s=o,g=st((p=i).weekYear),f=D(p.weekNumber,1,kt(p.weekYear,f=void 0===f?4:f,s=void 0===s?1:s)),s=D(p.weekday,1,7),g?f?!s&&T("weekday",p.weekday):T("week",p.weekNumber):T("weekYear",p.weekYear)):u?(f=st((g=i).year),s=D(g.ordinal,1,yt(g.year)),f?!s&&T("ordinal",g.ordinal):T("year",g.year)):ot(i))||at(i);return p?k.invalid(p):(s=new k({ts:(f=tr(c?tt(i,a,o):u?rt(i):i,t,n))[0],zone:n,o:f[1],loc:r}),i.weekday&&l&&e.weekday!==s.weekday?k.invalid("mismatched weekday","you can't specify both a weekday of "+i.weekday+" and a date of "+s.toISO()):s.isValid?s:k.invalid(s.invalid))},k.fromISO=function(e,t){void 0===t&&(t={});var n=Pt(e,[dn,vn],[hn,gn],[mn,pn],[yn,kn]);return rr(n[0],n[1],t,"ISO 8601",e)},k.fromRFC2822=function(e,t){void 0===t&&(t={});var n=Pt(e.replace(/\\([^()]*\\)|[\\n\\t]/g," ").replace(/(\\s\\s+)/g," ").trim(),[on,an]);return rr(n[0],n[1],t,"RFC 2822",e)},k.fromHTTP=function(e,t){void 0===t&&(t={});e=Pt(e,[sn,cn],[un,cn],[ln,fn]);return rr(e[0],e[1],t,"HTTP",t)},k.fromFormat=function(e,t,n){if(void 0===n&&(n={}),N(e)||N(t))throw new u("fromFormat requires an input string and a format");var r=n,i=r.locale,r=r.numberingSystem,i=b.fromOpts({locale:void 0===i?null:i,numberingSystem:void 0===r?null:r,defaultToEN:!0}),i=[(r=Jn(r=i,e,t)).result,r.zone,r.specificOffset,r.invalidReason],r=i[0],o=i[1],a=i[2],i=i[3];return i?k.invalid(i):rr(r,o,n,"format "+t,e,a)},k.fromString=function(e,t,n){return k.fromFormat(e,t,n=void 0===n?{}:n)},k.fromSQL=function(e,t){void 0===t&&(t={});var n=Pt(e,[bn,vn],[Sn,On]);return rr(n[0],n[1],t,"SQL",e)},k.invalid=function(e,t){if(void 0===t&&(t=null),!e)throw new u("need to specify a reason the DateTime is invalid");e=e instanceof h?e:new h(e,t);if(O.throwOnInvalid)throw new P(e);return new k({invalid:e})},k.isDateTime=function(e){return e&&e.isLuxonDateTime||!1},k.parseFormatForOpts=function(e,t){e=Gn(e,b.fromObject(t=void 0===t?{}:t));return e?e.map(function(e){return e?e.val:null}).join(""):null},k.expandFormat=function(e,t){return void 0===t&&(t={}),Yn(M.parseFormat(e),b.fromObject(t)).map(function(e){return e.val}).join("")},k.resetCache=function(){sr=void 0,pr={}};var t=k.prototype;return t.get=function(e){return this[e]},t.getPossibleOffsets=function(){var e,t,n,r;return this.isValid&&!this.isOffsetFixed&&(e=gt(this.c),n=this.zone.offset(e-864e5),r=this.zone.offset(e+864e5),(n=this.zone.offset(e-6e4*n))!==(r=this.zone.offset(e-6e4*r)))&&(t=e-6e4*r,n=er(e=e-6e4*n,n),r=er(t,r),n.hour===r.hour)&&n.minute===r.minute&&n.second===r.second&&n.millisecond===r.millisecond?[Z(this,{ts:e}),Z(this,{ts:t})]:[this]},t.resolvedLocaleOptions=function(e){e=M.create(this.loc.clone(e=void 0===e?{}:e),e).resolvedOptions(this);return{locale:e.locale,numberingSystem:e.numberingSystem,outputCalendar:e.calendar}},t.toUTC=function(e,t){return void 0===t&&(t={}),this.setZone(f.instance(e=void 0===e?0:e),t)},t.toLocal=function(){return this.setZone(O.defaultZone)},t.setZone=function(e,t){var n,t=void 0===t?{}:t,r=t.keepLocalTime,r=void 0!==r&&r,t=t.keepCalendarTime,t=void 0!==t&&t;return(e=S(e,O.defaultZone)).equals(this.zone)?this:e.isValid?(n=this.ts,(r||t)&&(r=e.offset(this.ts),n=tr(this.toObject(),r,e)[0]),Z(this,{ts:n,zone:e})):k.invalid(Bn(e))},t.reconfigure=function(e){var e=void 0===e?{}:e,t=e.locale,n=e.numberingSystem,e=e.outputCalendar,t=this.loc.clone({locale:t,numberingSystem:n,outputCalendar:e});return Z(this,{loc:t})},t.setLocale=function(e){return this.reconfigure({locale:e})},t.set=function(e){if(!this.isValid)return this;var t,e=Tt(e,mr),n=it(e,this.loc),r=n.minDaysInFirstWeek,n=n.startOfWeek,i=!N(e.weekYear)||!N(e.weekNumber)||!N(e.weekday),o=!N(e.ordinal),a=!N(e.year),s=!N(e.month)||!N(e.day),u=e.weekYear||e.weekNumber;if((a||s||o)&&u)throw new w("Can't mix weekYear/weekNumber units with year/month/day or ordinals");if(s&&o)throw new w("Can't mix ordinal dates with month/day");i?t=tt(l({},et(this.c,r,n),e),r,n):N(e.ordinal)?(t=l({},this.toObject(),e),N(e.day)&&(t.day=Math.min(vt(t.year,t.month),t.day))):t=rt(l({},nt(this.c),e));a=tr(t,this.o,this.zone);return Z(this,{ts:a[0],o:a[1]})},t.plus=function(e){return this.isValid?Z(this,nr(this,x.fromDurationLike(e))):this},t.minus=function(e){return this.isValid?Z(this,nr(this,x.fromDurationLike(e).negate())):this},t.startOf=function(e,t){t=(void 0===t?{}:t).useLocaleWeeks,t=void 0!==t&&t;if(!this.isValid)return this;var n={},e=x.normalizeUnit(e);switch(e){case"years":n.month=1;case"quarters":case"months":n.day=1;case"weeks":case"days":n.hour=0;case"hours":n.minute=0;case"minutes":n.second=0;case"seconds":n.millisecond=0}return"weeks"===e&&(t?(t=this.loc.getStartOfWeek(),this.weekday<t&&(n.weekNumber=this.weekNumber-1),n.weekday=t):n.weekday=1),"quarters"===e&&(t=Math.ceil(this.month/3),n.month=3*(t-1)+1),this.set(n)},t.endOf=function(e,t){var n;return this.isValid?this.plus(((n={})[e]=1,n)).startOf(e,t).minus(1):this},t.toFormat=function(e,t){return void 0===t&&(t={}),this.isValid?M.create(this.loc.redefaultToEN(t)).formatDateTimeFromString(this,e):$n},t.toLocaleString=function(e,t){return void 0===e&&(e=G),void 0===t&&(t={}),this.isValid?M.create(this.loc.clone(t),e).formatDateTime(this):$n},t.toLocaleParts=function(e){return void 0===e&&(e={}),this.isValid?M.create(this.loc.clone(e),e).formatDateTimeParts(this):[]},t.toISO=function(e){var t,e=void 0===e?{}:e,n=e.format,r=e.suppressSeconds,r=void 0!==r&&r,i=e.suppressMilliseconds,i=void 0!==i&&i,o=e.includeOffset,o=void 0===o||o,e=e.extendedZone,e=void 0!==e&&e;return this.isValid?(t=or(this,n="extended"===(void 0===n?"extended":n)),(t+="T")+ar(this,n,r,i,o,e)):null},t.toISODate=function(e){e=(void 0===e?{}:e).format;return this.isValid?or(this,"extended"===(void 0===e?"extended":e)):null},t.toISOWeekDate=function(){return ir(this,"kkkk-'W'WW-c")},t.toISOTime=function(e){var e=void 0===e?{}:e,t=e.suppressMilliseconds,n=e.suppressSeconds,r=e.includeOffset,i=e.includePrefix,o=e.extendedZone,e=e.format;return this.isValid?(void 0!==i&&i?"T":"")+ar(this,"extended"===(void 0===e?"extended":e),void 0!==n&&n,void 0!==t&&t,void 0===r||r,void 0!==o&&o):null},t.toRFC2822=function(){return ir(this,"EEE, dd LLL yyyy HH:mm:ss ZZZ",!1)},t.toHTTP=function(){return ir(this.toUTC(),"EEE, dd LLL yyyy HH:mm:ss 'GMT'")},t.toSQLDate=function(){return this.isValid?or(this,!0):null},t.toSQLTime=function(e){var e=void 0===e?{}:e,t=e.includeOffset,t=void 0===t||t,n=e.includeZone,n=void 0!==n&&n,e=e.includeOffsetSpace,r="HH:mm:ss.SSS";return(n||t)&&((void 0===e||e)&&(r+=" "),n?r+="z":t&&(r+="ZZ")),ir(this,r,!0)},t.toSQL=function(e){return void 0===e&&(e={}),this.isValid?this.toSQLDate()+" "+this.toSQLTime(e):null},t.toString=function(){return this.isValid?this.toISO():$n},t[e]=function(){return this.isValid?"DateTime { ts: "+this.toISO()+", zone: "+this.zone.name+", locale: "+this.locale+" }":"DateTime { Invalid, reason: "+this.invalidReason+" }"},t.valueOf=function(){return this.toMillis()},t.toMillis=function(){return this.isValid?this.ts:NaN},t.toSeconds=function(){return this.isValid?this.ts/1e3:NaN},t.toUnixInteger=function(){return this.isValid?Math.floor(this.ts/1e3):NaN},t.toJSON=function(){return this.toISO()},t.toBSON=function(){return this.toJSDate()},t.toObject=function(e){var t;return void 0===e&&(e={}),this.isValid?(t=l({},this.c),e.includeConfig&&(t.outputCalendar=this.outputCalendar,t.numberingSystem=this.loc.numberingSystem,t.locale=this.loc.locale),t):{}},t.toJSDate=function(){return new Date(this.isValid?this.ts:NaN)},t.diff=function(e,t,n){var r;return void 0===t&&(t="milliseconds"),void 0===n&&(n={}),this.isValid&&e.isValid?(n=l({locale:this.locale,numberingSystem:this.numberingSystem},n),t=t,t=(Array.isArray(t)?t:[t]).map(x.normalizeUnit),e=Zn((r=e.valueOf()>this.valueOf())?this:e,r?e:this,t,n),r?e.negate():e):x.invalid("created by diffing an invalid DateTime")},t.diffNow=function(e,t){return void 0===e&&(e="milliseconds"),void 0===t&&(t={}),this.diff(k.now(),e,t)},t.until=function(e){return this.isValid?xn.fromDateTimes(this,e):this},t.hasSame=function(e,t,n){var r;return!!this.isValid&&(r=e.valueOf(),(e=this.setZone(e.zone,{keepLocalTime:!0})).startOf(t,n)<=r)&&r<=e.endOf(t,n)},t.equals=function(e){return this.isValid&&e.isValid&&this.valueOf()===e.valueOf()&&this.zone.equals(e.zone)&&this.loc.equals(e.loc)},t.toRelative=function(e){var t,n,r,i;return this.isValid?(t=(e=void 0===e?{}:e).base||k.fromObject({},{zone:this.zone}),n=e.padding?this<t?-e.padding:e.padding:0,r=["years","months","days","hours","minutes","seconds"],i=e.unit,Array.isArray(e.unit)&&(r=e.unit,i=void 0),vr(t,this.plus(n),l({},e,{numeric:"always",units:r,unit:i}))):null},t.toRelativeCalendar=function(e){return void 0===e&&(e={}),this.isValid?vr(e.base||k.fromObject({},{zone:this.zone}),this,l({},e,{numeric:"auto",units:["years","months","days"],calendary:!0})):null},k.min=function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];if(t.every(k.isDateTime))return ct(t,function(e){return e.valueOf()},Math.min);throw new u("min requires all arguments be DateTimes")},k.max=function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];if(t.every(k.isDateTime))return ct(t,function(e){return e.valueOf()},Math.max);throw new u("max requires all arguments be DateTimes")},k.fromFormatExplain=function(e,t,n){var n=n=void 0===n?{}:n,r=n.locale,n=n.numberingSystem;return Jn(b.fromOpts({locale:void 0===r?null:r,numberingSystem:void 0===n?null:n,defaultToEN:!0}),e,t)},k.fromStringExplain=function(e,t,n){return k.fromFormatExplain(e,t,n=void 0===n?{}:n)},k.buildFormatParser=function(e,t){var t=t=void 0===t?{}:t,n=t.locale,t=t.numberingSystem,n=b.fromOpts({locale:void 0===n?null:n,numberingSystem:void 0===t?null:t,defaultToEN:!0});return new Hn(n,e)},k.fromFormatParser=function(e,t,n){if(void 0===n&&(n={}),N(e)||N(t))throw new u("fromFormatParser requires an input string and a format parser");var r,i,o,a=n,s=a.locale,a=a.numberingSystem,s=b.fromOpts({locale:void 0===s?null:s,numberingSystem:void 0===a?null:a,defaultToEN:!0});if(s.equals(t.locale))return r=(a=t.explainFromTokens(e)).result,i=a.zone,o=a.specificOffset,(a=a.invalidReason)?k.invalid(a):rr(r,i,n,"format "+t.format,e,o);throw new u("fromFormatParser called with a locale of "+s+", but the format parser was created for "+t.locale)},i(k,[{key:"isValid",get:function(){return null===this.invalid}},{key:"invalidReason",get:function(){return this.invalid?this.invalid.reason:null}},{key:"invalidExplanation",get:function(){return this.invalid?this.invalid.explanation:null}},{key:"locale",get:function(){return this.isValid?this.loc.locale:null}},{key:"numberingSystem",get:function(){return this.isValid?this.loc.numberingSystem:null}},{key:"outputCalendar",get:function(){return this.isValid?this.loc.outputCalendar:null}},{key:"zone",get:function(){return this._zone}},{key:"zoneName",get:function(){return this.isValid?this.zone.name:null}},{key:"year",get:function(){return this.isValid?this.c.year:NaN}},{key:"quarter",get:function(){return this.isValid?Math.ceil(this.c.month/3):NaN}},{key:"month",get:function(){return this.isValid?this.c.month:NaN}},{key:"day",get:function(){return this.isValid?this.c.day:NaN}},{key:"hour",get:function(){return this.isValid?this.c.hour:NaN}},{key:"minute",get:function(){return this.isValid?this.c.minute:NaN}},{key:"second",get:function(){return this.isValid?this.c.second:NaN}},{key:"millisecond",get:function(){return this.isValid?this.c.millisecond:NaN}},{key:"weekYear",get:function(){return this.isValid?Qn(this).weekYear:NaN}},{key:"weekNumber",get:function(){return this.isValid?Qn(this).weekNumber:NaN}},{key:"weekday",get:function(){return this.isValid?Qn(this).weekday:NaN}},{key:"isWeekend",get:function(){return this.isValid&&this.loc.getWeekendDays().includes(this.weekday)}},{key:"localWeekday",get:function(){return this.isValid?Kn(this).weekday:NaN}},{key:"localWeekNumber",get:function(){return this.isValid?Kn(this).weekNumber:NaN}},{key:"localWeekYear",get:function(){return this.isValid?Kn(this).weekYear:NaN}},{key:"ordinal",get:function(){return this.isValid?nt(this.c).ordinal:NaN}},{key:"monthShort",get:function(){return this.isValid?Fn.months("short",{locObj:this.loc})[this.month-1]:null}},{key:"monthLong",get:function(){return this.isValid?Fn.months("long",{locObj:this.loc})[this.month-1]:null}},{key:"weekdayShort",get:function(){return this.isValid?Fn.weekdays("short",{locObj:this.loc})[this.weekday-1]:null}},{key:"weekdayLong",get:function(){return this.isValid?Fn.weekdays("long",{locObj:this.loc})[this.weekday-1]:null}},{key:"offset",get:function(){return this.isValid?+this.o:NaN}},{key:"offsetNameShort",get:function(){return this.isValid?this.zone.offsetName(this.ts,{format:"short",locale:this.locale}):null}},{key:"offsetNameLong",get:function(){return this.isValid?this.zone.offsetName(this.ts,{format:"long",locale:this.locale}):null}},{key:"isOffsetFixed",get:function(){return this.isValid?this.zone.isUniversal:null}},{key:"isInDST",get:function(){return!this.isOffsetFixed&&(this.offset>this.set({month:1,day:1}).offset||this.offset>this.set({month:5}).offset)}},{key:"isInLeapYear",get:function(){return mt(this.year)}},{key:"daysInMonth",get:function(){return vt(this.year,this.month)}},{key:"daysInYear",get:function(){return this.isValid?yt(this.year):NaN}},{key:"weeksInWeekYear",get:function(){return this.isValid?kt(this.weekYear):NaN}},{key:"weeksInLocalWeekYear",get:function(){return this.isValid?kt(this.localWeekYear,this.loc.getMinDaysInFirstWeek(),this.loc.getStartOfWeek()):NaN}}],[{key:"DATE_SHORT",get:function(){return G}},{key:"DATE_MED",get:function(){return $}},{key:"DATE_MED_WITH_WEEKDAY",get:function(){return B}},{key:"DATE_FULL",get:function(){return Q}},{key:"DATE_HUGE",get:function(){return K}},{key:"TIME_SIMPLE",get:function(){return X}},{key:"TIME_WITH_SECONDS",get:function(){return ee}},{key:"TIME_WITH_SHORT_OFFSET",get:function(){return te}},{key:"TIME_WITH_LONG_OFFSET",get:function(){return ne}},{key:"TIME_24_SIMPLE",get:function(){return re}},{key:"TIME_24_WITH_SECONDS",get:function(){return ie}},{key:"TIME_24_WITH_SHORT_OFFSET",get:function(){return oe}},{key:"TIME_24_WITH_LONG_OFFSET",get:function(){return ae}},{key:"DATETIME_SHORT",get:function(){return se}},{key:"DATETIME_SHORT_WITH_SECONDS",get:function(){return ue}},{key:"DATETIME_MED",get:function(){return le}},{key:"DATETIME_MED_WITH_SECONDS",get:function(){return ce}},{key:"DATETIME_MED_WITH_WEEKDAY",get:function(){return fe}},{key:"DATETIME_FULL",get:function(){return de}},{key:"DATETIME_FULL_WITH_SECONDS",get:function(){return he}},{key:"DATETIME_HUGE",get:function(){return me}},{key:"DATETIME_HUGE_WITH_SECONDS",get:function(){return ye}}]),k}(Symbol.for("nodejs.util.inspect.custom"));function kr(e){if(W.isDateTime(e))return e;if(e&&e.valueOf&&v(e.valueOf()))return W.fromJSDate(e);if(e&&"object"==typeof e)return W.fromObject(e);throw new u("Unknown datetime argument: "+e+", of type "+typeof e)}return e.DateTime=W,e.Duration=x,e.FixedOffsetZone=f,e.IANAZone=c,e.Info=Fn,e.Interval=xn,e.InvalidZone=Le,e.Settings=O,e.SystemZone=ge,e.VERSION="3.5.0",e.Zone=s,Object.defineProperty(e,"__esModule",{value:!0}),e}({});
`);

const DateTime = luxon.DateTime;
const DateTimeInterval = luxon.Interval;

// https://github.com/jkbrzt/rrule

eval(`
    !function(t,e){"object"==typeof exports&&"object"==typeof module?module.exports=e():"function"==typeof define&&define.amd?define([],e):"object"==typeof exports?exports.rrule=e():t.rrule=e()}("undefined"!=typeof self?self:this,(()=>(()=>{"use strict";var t={d:(e,n)=>{for(var r in n)t.o(n,r)&&!t.o(e,r)&&Object.defineProperty(e,r,{enumerable:!0,get:n[r]})},o:(t,e)=>Object.prototype.hasOwnProperty.call(t,e),r:t=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})}},e={};t.r(e),t.d(e,{ALL_WEEKDAYS:()=>n,Frequency:()=>Z,RRule:()=>Pt,RRuleSet:()=>Gt,Weekday:()=>r,datetime:()=>b,rrulestr:()=>Kt});var n=["MO","TU","WE","TH","FR","SA","SU"],r=function(){function t(t,e){if(0===e)throw new Error("Can't create weekday with n == 0");this.weekday=t,this.n=e}return t.fromStr=function(e){return new t(n.indexOf(e))},t.prototype.nth=function(e){return this.n===e?this:new t(this.weekday,e)},t.prototype.equals=function(t){return this.weekday===t.weekday&&this.n===t.n},t.prototype.toString=function(){var t=n[this.weekday];return this.n&&(t=(this.n>0?"+":"")+String(this.n)+t),t},t.prototype.getJsWeekday=function(){return 6===this.weekday?0:this.weekday+1},t}(),i=function(t){return null!=t},o=function(t){return"number"==typeof t},a=function(t){return"string"==typeof t&&n.includes(t)},s=Array.isArray,u=function(t,e){void 0===e&&(e=t),1===arguments.length&&(e=t,t=0);for(var n=[],r=t;r<e;r++)n.push(r);return n},h=function(t,e){var n=0,r=[];if(s(t))for(;n<e;n++)r[n]=[].concat(t);else for(;n<e;n++)r[n]=t;return r};function y(t,e,n){void 0===n&&(n=" ");var r=String(t);return e>>=0,r.length>e?String(r):((e-=r.length)>n.length&&(n+=h(n,e/n.length)),n.slice(0,e)+String(r))}var c=function(t,e){var n=t%e;return n*e<0?n+e:n},d=function(t,e){return{div:Math.floor(t/e),mod:c(t,e)}},l=function(t){return!i(t)||0===t.length},f=function(t){return!l(t)},p=function(t,e){return f(t)&&-1!==t.indexOf(e)},b=function(t,e,n,r,i,o){return void 0===r&&(r=0),void 0===i&&(i=0),void 0===o&&(o=0),new Date(Date.UTC(t,e-1,n,r,i,o))},m=[31,28,31,30,31,30,31,31,30,31,30,31],w=864e5,v=b(1970,1,1),g=[6,0,1,2,3,4,5],k=function(t){return t%4==0&&t%100!=0||t%400==0},E=function(t){return t instanceof Date},T=function(t){return E(t)&&!isNaN(t.getTime())},x=function(t){return e=v,n=t.getTime()-e.getTime(),Math.round(n/w);var e,n},D=function(t){return new Date(v.getTime()+t*w)},O=function(t){var e=t.getUTCMonth();return 1===e&&k(t.getUTCFullYear())?29:m[e]},S=function(t){return g[t.getUTCDay()]},U=function(t,e){var n=b(t,e+1,1);return[S(n),O(n)]},Y=function(t,e){return e=e||t,new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate(),e.getHours(),e.getMinutes(),e.getSeconds(),e.getMilliseconds()))},L=function(t){return new Date(t.getTime())},M=function(t){for(var e=[],n=0;n<t.length;n++)e.push(L(t[n]));return e},_=function(t){t.sort((function(t,e){return t.getTime()-e.getTime()}))},R=function(t,e){void 0===e&&(e=!0);var n=new Date(t);return[y(n.getUTCFullYear().toString(),4,"0"),y(n.getUTCMonth()+1,2,"0"),y(n.getUTCDate(),2,"0"),"T",y(n.getUTCHours(),2,"0"),y(n.getUTCMinutes(),2,"0"),y(n.getUTCSeconds(),2,"0"),e?"Z":""].join("")},N=function(t){var e=/^(\\d{4})(\\d{2})(\\d{2})(T(\\d{2})(\\d{2})(\\d{2})Z?)?$/.exec(t);if(!e)throw new Error("Invalid UNTIL value: ".concat(t));return new Date(Date.UTC(parseInt(e[1],10),parseInt(e[2],10)-1,parseInt(e[3],10),parseInt(e[5],10)||0,parseInt(e[6],10)||0,parseInt(e[7],10)||0))},A=function(t,e){return t.toLocaleString("sv-SE",{timeZone:e}).replace(" ","T")+"Z"};const C=function(){function t(t,e){this.minDate=null,this.maxDate=null,this._result=[],this.total=0,this.method=t,this.args=e,"between"===t?(this.maxDate=e.inc?e.before:new Date(e.before.getTime()-1),this.minDate=e.inc?e.after:new Date(e.after.getTime()+1)):"before"===t?this.maxDate=e.inc?e.dt:new Date(e.dt.getTime()-1):"after"===t&&(this.minDate=e.inc?e.dt:new Date(e.dt.getTime()+1))}return t.prototype.accept=function(t){++this.total;var e=this.minDate&&t<this.minDate,n=this.maxDate&&t>this.maxDate;if("between"===this.method){if(e)return!0;if(n)return!1}else if("before"===this.method){if(n)return!1}else if("after"===this.method)return!!e||(this.add(t),!1);return this.add(t)},t.prototype.add=function(t){return this._result.push(t),!0},t.prototype.getValue=function(){var t=this._result;switch(this.method){case"all":case"between":return t;default:return t.length?t[t.length-1]:null}},t.prototype.clone=function(){return new t(this.method,this.args)},t}();var I=function(t,e){return I=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e}||function(t,e){for(var n in e)Object.prototype.hasOwnProperty.call(e,n)&&(t[n]=e[n])},I(t,e)};function j(t,e){if("function"!=typeof e&&null!==e)throw new TypeError("Class extends value "+String(e)+" is not a constructor or null");function n(){this.constructor=t}I(t,e),t.prototype=null===e?Object.create(e):(n.prototype=e.prototype,new n)}var W=function(){return W=Object.assign||function(t){for(var e,n=1,r=arguments.length;n<r;n++)for(var i in e=arguments[n])Object.prototype.hasOwnProperty.call(e,i)&&(t[i]=e[i]);return t},W.apply(this,arguments)};Object.create;function H(t,e,n){if(n||2===arguments.length)for(var r,i=0,o=e.length;i<o;i++)!r&&i in e||(r||(r=Array.prototype.slice.call(e,0,i)),r[i]=e[i]);return t.concat(r||Array.prototype.slice.call(e))}Object.create;const q=function(t){function e(e,n,r){var i=t.call(this,e,n)||this;return i.iterator=r,i}return j(e,t),e.prototype.add=function(t){return!!this.iterator(t,this._result.length)&&(this._result.push(t),!0)},e}(C);const P={dayNames:["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],monthNames:["January","February","March","April","May","June","July","August","September","October","November","December"],tokens:{SKIP:/^[ \\r\\n\\t]+|^\\.$/,number:/^[1-9][0-9]*/,numberAsText:/^(one|two|three)/i,every:/^every/i,"day(s)":/^days?/i,"weekday(s)":/^weekdays?/i,"week(s)":/^weeks?/i,"hour(s)":/^hours?/i,"minute(s)":/^minutes?/i,"month(s)":/^months?/i,"year(s)":/^years?/i,on:/^(on|in)/i,at:/^(at)/i,the:/^the/i,first:/^first/i,second:/^second/i,third:/^third/i,nth:/^([1-9][0-9]*)(\\.|th|nd|rd|st)/i,last:/^last/i,for:/^for/i,"time(s)":/^times?/i,until:/^(un)?til/i,monday:/^mo(n(day)?)?/i,tuesday:/^tu(e(s(day)?)?)?/i,wednesday:/^we(d(n(esday)?)?)?/i,thursday:/^th(u(r(sday)?)?)?/i,friday:/^fr(i(day)?)?/i,saturday:/^sa(t(urday)?)?/i,sunday:/^su(n(day)?)?/i,january:/^jan(uary)?/i,february:/^feb(ruary)?/i,march:/^mar(ch)?/i,april:/^apr(il)?/i,may:/^may/i,june:/^june?/i,july:/^july?/i,august:/^aug(ust)?/i,september:/^sep(t(ember)?)?/i,october:/^oct(ober)?/i,november:/^nov(ember)?/i,december:/^dec(ember)?/i,comma:/^(,\\s*|(and|or)\\s*)+/i}};var F=function(t,e){return-1!==t.indexOf(e)},z=function(t){return t.toString()},K=function(t,e,n){return"".concat(e," ").concat(n,", ").concat(t)};const B=function(){function t(t,e,n,r){if(void 0===e&&(e=z),void 0===n&&(n=P),void 0===r&&(r=K),this.text=[],this.language=n||P,this.gettext=e,this.dateFormatter=r,this.rrule=t,this.options=t.options,this.origOptions=t.origOptions,this.origOptions.bymonthday){var o=[].concat(this.options.bymonthday),a=[].concat(this.options.bynmonthday);o.sort((function(t,e){return t-e})),a.sort((function(t,e){return e-t})),this.bymonthday=o.concat(a),this.bymonthday.length||(this.bymonthday=null)}if(i(this.origOptions.byweekday)){var u=s(this.origOptions.byweekday)?this.origOptions.byweekday:[this.origOptions.byweekday],h=String(u);this.byweekday={allWeeks:u.filter((function(t){return!t.n})),someWeeks:u.filter((function(t){return Boolean(t.n)})),isWeekdays:-1!==h.indexOf("MO")&&-1!==h.indexOf("TU")&&-1!==h.indexOf("WE")&&-1!==h.indexOf("TH")&&-1!==h.indexOf("FR")&&-1===h.indexOf("SA")&&-1===h.indexOf("SU"),isEveryDay:-1!==h.indexOf("MO")&&-1!==h.indexOf("TU")&&-1!==h.indexOf("WE")&&-1!==h.indexOf("TH")&&-1!==h.indexOf("FR")&&-1!==h.indexOf("SA")&&-1!==h.indexOf("SU")};var y=function(t,e){return t.weekday-e.weekday};this.byweekday.allWeeks.sort(y),this.byweekday.someWeeks.sort(y),this.byweekday.allWeeks.length||(this.byweekday.allWeeks=null),this.byweekday.someWeeks.length||(this.byweekday.someWeeks=null)}else this.byweekday=null}return t.isFullyConvertible=function(e){if(!(e.options.freq in t.IMPLEMENTED))return!1;if(e.origOptions.until&&e.origOptions.count)return!1;for(var n in e.origOptions){if(F(["dtstart","tzid","wkst","freq"],n))return!0;if(!F(t.IMPLEMENTED[e.options.freq],n))return!1}return!0},t.prototype.isFullyConvertible=function(){return t.isFullyConvertible(this.rrule)},t.prototype.toString=function(){var e=this.gettext;if(!(this.options.freq in t.IMPLEMENTED))return e("RRule error: Unable to fully convert this rrule to text");if(this.text=[e("every")],this[Pt.FREQUENCIES[this.options.freq]](),this.options.until){this.add(e("until"));var n=this.options.until;this.add(this.dateFormatter(n.getUTCFullYear(),this.language.monthNames[n.getUTCMonth()],n.getUTCDate()))}else this.options.count&&this.add(e("for")).add(this.options.count.toString()).add(this.plural(this.options.count)?e("times"):e("time"));return this.isFullyConvertible()||this.add(e("(~ approximate)")),this.text.join("")},t.prototype.HOURLY=function(){var t=this.gettext;1!==this.options.interval&&this.add(this.options.interval.toString()),this.add(this.plural(this.options.interval)?t("hours"):t("hour"))},t.prototype.MINUTELY=function(){var t=this.gettext;1!==this.options.interval&&this.add(this.options.interval.toString()),this.add(this.plural(this.options.interval)?t("minutes"):t("minute"))},t.prototype.DAILY=function(){var t=this.gettext;1!==this.options.interval&&this.add(this.options.interval.toString()),this.byweekday&&this.byweekday.isWeekdays?this.add(this.plural(this.options.interval)?t("weekdays"):t("weekday")):this.add(this.plural(this.options.interval)?t("days"):t("day")),this.origOptions.bymonth&&(this.add(t("in")),this._bymonth()),this.bymonthday?this._bymonthday():this.byweekday?this._byweekday():this.origOptions.byhour&&this._byhour()},t.prototype.WEEKLY=function(){var t=this.gettext;1!==this.options.interval&&this.add(this.options.interval.toString()).add(this.plural(this.options.interval)?t("weeks"):t("week")),this.byweekday&&this.byweekday.isWeekdays?1===this.options.interval?this.add(this.plural(this.options.interval)?t("weekdays"):t("weekday")):this.add(t("on")).add(t("weekdays")):this.byweekday&&this.byweekday.isEveryDay?this.add(this.plural(this.options.interval)?t("days"):t("day")):(1===this.options.interval&&this.add(t("week")),this.origOptions.bymonth&&(this.add(t("in")),this._bymonth()),this.bymonthday?this._bymonthday():this.byweekday&&this._byweekday(),this.origOptions.byhour&&this._byhour())},t.prototype.MONTHLY=function(){var t=this.gettext;this.origOptions.bymonth?(1!==this.options.interval&&(this.add(this.options.interval.toString()).add(t("months")),this.plural(this.options.interval)&&this.add(t("in"))),this._bymonth()):(1!==this.options.interval&&this.add(this.options.interval.toString()),this.add(this.plural(this.options.interval)?t("months"):t("month"))),this.bymonthday?this._bymonthday():this.byweekday&&this.byweekday.isWeekdays?this.add(t("on")).add(t("weekdays")):this.byweekday&&this._byweekday()},t.prototype.YEARLY=function(){var t=this.gettext;this.origOptions.bymonth?(1!==this.options.interval&&(this.add(this.options.interval.toString()),this.add(t("years"))),this._bymonth()):(1!==this.options.interval&&this.add(this.options.interval.toString()),this.add(this.plural(this.options.interval)?t("years"):t("year"))),this.bymonthday?this._bymonthday():this.byweekday&&this._byweekday(),this.options.byyearday&&this.add(t("on the")).add(this.list(this.options.byyearday,this.nth,t("and"))).add(t("day")),this.options.byweekno&&this.add(t("in")).add(this.plural(this.options.byweekno.length)?t("weeks"):t("week")).add(this.list(this.options.byweekno,void 0,t("and")))},t.prototype._bymonthday=function(){var t=this.gettext;this.byweekday&&this.byweekday.allWeeks?this.add(t("on")).add(this.list(this.byweekday.allWeeks,this.weekdaytext,t("or"))).add(t("the")).add(this.list(this.bymonthday,this.nth,t("or"))):this.add(t("on the")).add(this.list(this.bymonthday,this.nth,t("and")))},t.prototype._byweekday=function(){var t=this.gettext;this.byweekday.allWeeks&&!this.byweekday.isWeekdays&&this.add(t("on")).add(this.list(this.byweekday.allWeeks,this.weekdaytext)),this.byweekday.someWeeks&&(this.byweekday.allWeeks&&this.add(t("and")),this.add(t("on the")).add(this.list(this.byweekday.someWeeks,this.weekdaytext,t("and"))))},t.prototype._byhour=function(){var t=this.gettext;this.add(t("at")).add(this.list(this.origOptions.byhour,void 0,t("and")))},t.prototype._bymonth=function(){this.add(this.list(this.options.bymonth,this.monthtext,this.gettext("and")))},t.prototype.nth=function(t){var e;t=parseInt(t.toString(),10);var n=this.gettext;if(-1===t)return n("last");var r=Math.abs(t);switch(r){case 1:case 21:case 31:e=r+n("st");break;case 2:case 22:e=r+n("nd");break;case 3:case 23:e=r+n("rd");break;default:e=r+n("th")}return t<0?e+" "+n("last"):e},t.prototype.monthtext=function(t){return this.language.monthNames[t-1]},t.prototype.weekdaytext=function(t){var e=o(t)?(t+1)%7:t.getJsWeekday();return(t.n?this.nth(t.n)+" ":"")+this.language.dayNames[e]},t.prototype.plural=function(t){return t%100!=1},t.prototype.add=function(t){return this.text.push(" "),this.text.push(t),this},t.prototype.list=function(t,e,n,r){var i=this;void 0===r&&(r=","),s(t)||(t=[t]);e=e||function(t){return t.toString()};var o=function(t){return e&&e.call(i,t)};return n?function(t,e,n){for(var r="",i=0;i<t.length;i++)0!==i&&(i===t.length-1?r+=" "+n+" ":r+=e+" "),r+=t[i];return r}(t.map(o),r,n):t.map(o).join(r+" ")},t}();var Z,X=function(){function t(t){this.done=!0,this.rules=t}return t.prototype.start=function(t){return this.text=t,this.done=!1,this.nextSymbol()},t.prototype.isDone=function(){return this.done&&null===this.symbol},t.prototype.nextSymbol=function(){var t,e;this.symbol=null,this.value=null;do{if(this.done)return!1;for(var n in t=null,this.rules){var r=this.rules[n].exec(this.text);r&&(null===t||r[0].length>t[0].length)&&(t=r,e=n)}if(null!=t&&(this.text=this.text.substr(t[0].length),""===this.text&&(this.done=!0)),null==t)return this.done=!0,this.symbol=null,void(this.value=null)}while("SKIP"===e);return this.symbol=e,this.value=t,!0},t.prototype.accept=function(t){if(this.symbol===t){if(this.value){var e=this.value;return this.nextSymbol(),e}return this.nextSymbol(),!0}return!1},t.prototype.acceptNumber=function(){return this.accept("number")},t.prototype.expect=function(t){if(this.accept(t))return!0;throw new Error("expected "+t+" but found "+this.symbol)},t}();function G(t,e){void 0===e&&(e=P);var n={},r=new X(e.tokens);return r.start(t)?(function(){r.expect("every");var t=r.acceptNumber();t&&(n.interval=parseInt(t[0],10));if(r.isDone())throw new Error("Unexpected end");switch(r.symbol){case"day(s)":n.freq=Pt.DAILY,r.nextSymbol()&&(o(),h());break;case"weekday(s)":n.freq=Pt.WEEKLY,n.byweekday=[Pt.MO,Pt.TU,Pt.WE,Pt.TH,Pt.FR],r.nextSymbol(),o(),h();break;case"week(s)":n.freq=Pt.WEEKLY,r.nextSymbol()&&(i(),o(),h());break;case"hour(s)":n.freq=Pt.HOURLY,r.nextSymbol()&&(i(),h());break;case"minute(s)":n.freq=Pt.MINUTELY,r.nextSymbol()&&(i(),h());break;case"month(s)":n.freq=Pt.MONTHLY,r.nextSymbol()&&(i(),h());break;case"year(s)":n.freq=Pt.YEARLY,r.nextSymbol()&&(i(),h());break;case"monday":case"tuesday":case"wednesday":case"thursday":case"friday":case"saturday":case"sunday":n.freq=Pt.WEEKLY;var e=r.symbol.substr(0,2).toUpperCase();if(n.byweekday=[Pt[e]],!r.nextSymbol())return;for(;r.accept("comma");){if(r.isDone())throw new Error("Unexpected end");var y=s();if(!y)throw new Error("Unexpected symbol "+r.symbol+", expected weekday");n.byweekday.push(Pt[y]),r.nextSymbol()}o(),function(){r.accept("on"),r.accept("the");var t=u();if(!t)return;n.bymonthday=[t],r.nextSymbol();for(;r.accept("comma");){if(!(t=u()))throw new Error("Unexpected symbol "+r.symbol+"; expected monthday");n.bymonthday.push(t),r.nextSymbol()}}(),h();break;case"january":case"february":case"march":case"april":case"may":case"june":case"july":case"august":case"september":case"october":case"november":case"december":if(n.freq=Pt.YEARLY,n.bymonth=[a()],!r.nextSymbol())return;for(;r.accept("comma");){if(r.isDone())throw new Error("Unexpected end");var c=a();if(!c)throw new Error("Unexpected symbol "+r.symbol+", expected month");n.bymonth.push(c),r.nextSymbol()}i(),h();break;default:throw new Error("Unknown symbol")}}(),n):null;function i(){var t=r.accept("on"),e=r.accept("the");if(t||e)do{var i=u(),o=s(),h=a();if(i)o?(r.nextSymbol(),n.byweekday||(n.byweekday=[]),n.byweekday.push(Pt[o].nth(i))):(n.bymonthday||(n.bymonthday=[]),n.bymonthday.push(i),r.accept("day(s)"));else if(o)r.nextSymbol(),n.byweekday||(n.byweekday=[]),n.byweekday.push(Pt[o]);else if("weekday(s)"===r.symbol)r.nextSymbol(),n.byweekday||(n.byweekday=[Pt.MO,Pt.TU,Pt.WE,Pt.TH,Pt.FR]);else if("week(s)"===r.symbol){r.nextSymbol();var y=r.acceptNumber();if(!y)throw new Error("Unexpected symbol "+r.symbol+", expected week number");for(n.byweekno=[parseInt(y[0],10)];r.accept("comma");){if(!(y=r.acceptNumber()))throw new Error("Unexpected symbol "+r.symbol+"; expected monthday");n.byweekno.push(parseInt(y[0],10))}}else{if(!h)return;r.nextSymbol(),n.bymonth||(n.bymonth=[]),n.bymonth.push(h)}}while(r.accept("comma")||r.accept("the")||r.accept("on"))}function o(){if(r.accept("at"))do{var t=r.acceptNumber();if(!t)throw new Error("Unexpected symbol "+r.symbol+", expected hour");for(n.byhour=[parseInt(t[0],10)];r.accept("comma");){if(!(t=r.acceptNumber()))throw new Error("Unexpected symbol "+r.symbol+"; expected hour");n.byhour.push(parseInt(t[0],10))}}while(r.accept("comma")||r.accept("at"))}function a(){switch(r.symbol){case"january":return 1;case"february":return 2;case"march":return 3;case"april":return 4;case"may":return 5;case"june":return 6;case"july":return 7;case"august":return 8;case"september":return 9;case"october":return 10;case"november":return 11;case"december":return 12;default:return!1}}function s(){switch(r.symbol){case"monday":case"tuesday":case"wednesday":case"thursday":case"friday":case"saturday":case"sunday":return r.symbol.substr(0,2).toUpperCase();default:return!1}}function u(){switch(r.symbol){case"last":return r.nextSymbol(),-1;case"first":return r.nextSymbol(),1;case"second":return r.nextSymbol(),r.accept("last")?-2:2;case"third":return r.nextSymbol(),r.accept("last")?-3:3;case"nth":var t=parseInt(r.value[1],10);if(t<-366||t>366)throw new Error("Nth out of range: "+t);return r.nextSymbol(),r.accept("last")?-t:t;default:return!1}}function h(){if("until"===r.symbol){var t=Date.parse(r.text);if(!t)throw new Error("Cannot parse until date:"+r.text);n.until=new Date(t)}else r.accept("for")&&(n.count=parseInt(r.value[0],10),r.expect("number"))}}function Q(t){return t<Z.HOURLY}!function(t){t[t.YEARLY=0]="YEARLY",t[t.MONTHLY=1]="MONTHLY",t[t.WEEKLY=2]="WEEKLY",t[t.DAILY=3]="DAILY",t[t.HOURLY=4]="HOURLY",t[t.MINUTELY=5]="MINUTELY",t[t.SECONDLY=6]="SECONDLY"}(Z||(Z={}));var $=function(t,e){return void 0===e&&(e=P),new Pt(G(t,e)||void 0)},J=["count","until","interval","byweekday","bymonthday","bymonth"];B.IMPLEMENTED=[],B.IMPLEMENTED[Z.HOURLY]=J,B.IMPLEMENTED[Z.MINUTELY]=J,B.IMPLEMENTED[Z.DAILY]=["byhour"].concat(J),B.IMPLEMENTED[Z.WEEKLY]=J,B.IMPLEMENTED[Z.MONTHLY]=J,B.IMPLEMENTED[Z.YEARLY]=["byweekno","byyearday"].concat(J);var V=B.isFullyConvertible,tt=function(){function t(t,e,n,r){this.hour=t,this.minute=e,this.second=n,this.millisecond=r||0}return t.prototype.getHours=function(){return this.hour},t.prototype.getMinutes=function(){return this.minute},t.prototype.getSeconds=function(){return this.second},t.prototype.getMilliseconds=function(){return this.millisecond},t.prototype.getTime=function(){return 1e3*(60*this.hour*60+60*this.minute+this.second)+this.millisecond},t}(),et=function(t){function e(e,n,r,i,o,a,s){var u=t.call(this,i,o,a,s)||this;return u.year=e,u.month=n,u.day=r,u}return j(e,t),e.fromDate=function(t){return new this(t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate(),t.getUTCHours(),t.getUTCMinutes(),t.getUTCSeconds(),t.valueOf()%1e3)},e.prototype.getWeekday=function(){return S(new Date(this.getTime()))},e.prototype.getTime=function(){return new Date(Date.UTC(this.year,this.month-1,this.day,this.hour,this.minute,this.second,this.millisecond)).getTime()},e.prototype.getDay=function(){return this.day},e.prototype.getMonth=function(){return this.month},e.prototype.getYear=function(){return this.year},e.prototype.addYears=function(t){this.year+=t},e.prototype.addMonths=function(t){if(this.month+=t,this.month>12){var e=Math.floor(this.month/12),n=c(this.month,12);this.month=n,this.year+=e,0===this.month&&(this.month=12,--this.year)}},e.prototype.addWeekly=function(t,e){e>this.getWeekday()?this.day+=-(this.getWeekday()+1+(6-e))+7*t:this.day+=-(this.getWeekday()-e)+7*t,this.fixDay()},e.prototype.addDaily=function(t){this.day+=t,this.fixDay()},e.prototype.addHours=function(t,e,n){for(e&&(this.hour+=Math.floor((23-this.hour)/t)*t);;){this.hour+=t;var r=d(this.hour,24),i=r.div,o=r.mod;if(i&&(this.hour=o,this.addDaily(i)),l(n)||p(n,this.hour))break}},e.prototype.addMinutes=function(t,e,n,r){for(e&&(this.minute+=Math.floor((1439-(60*this.hour+this.minute))/t)*t);;){this.minute+=t;var i=d(this.minute,60),o=i.div,a=i.mod;if(o&&(this.minute=a,this.addHours(o,!1,n)),(l(n)||p(n,this.hour))&&(l(r)||p(r,this.minute)))break}},e.prototype.addSeconds=function(t,e,n,r,i){for(e&&(this.second+=Math.floor((86399-(3600*this.hour+60*this.minute+this.second))/t)*t);;){this.second+=t;var o=d(this.second,60),a=o.div,s=o.mod;if(a&&(this.second=s,this.addMinutes(a,!1,n,r)),(l(n)||p(n,this.hour))&&(l(r)||p(r,this.minute))&&(l(i)||p(i,this.second)))break}},e.prototype.fixDay=function(){if(!(this.day<=28)){var t=U(this.year,this.month-1)[1];if(!(this.day<=t))for(;this.day>t;){if(this.day-=t,++this.month,13===this.month&&(this.month=1,++this.year,this.year>9999))return;t=U(this.year,this.month-1)[1]}}},e.prototype.add=function(t,e){var n=t.freq,r=t.interval,i=t.wkst,o=t.byhour,a=t.byminute,s=t.bysecond;switch(n){case Z.YEARLY:return this.addYears(r);case Z.MONTHLY:return this.addMonths(r);case Z.WEEKLY:return this.addWeekly(r,i);case Z.DAILY:return this.addDaily(r);case Z.HOURLY:return this.addHours(r,e,o);case Z.MINUTELY:return this.addMinutes(r,e,o,a);case Z.SECONDLY:return this.addSeconds(r,e,o,a,s)}},e}(tt);function nt(t){for(var e=[],n=0,r=Object.keys(t);n<r.length;n++){var i=r[n];p(qt,i)||e.push(i),E(t[i])&&!T(t[i])&&e.push(i)}if(e.length)throw new Error("Invalid options: "+e.join(", "));return W({},t)}function rt(t){var e=W(W({},Ht),nt(t));if(i(e.byeaster)&&(e.freq=Pt.YEARLY),!i(e.freq)||!Pt.FREQUENCIES[e.freq])throw new Error("Invalid frequency: ".concat(e.freq," ").concat(t.freq));if(e.dtstart||(e.dtstart=new Date((new Date).setMilliseconds(0))),i(e.wkst)?o(e.wkst)||(e.wkst=e.wkst.weekday):e.wkst=Pt.MO.weekday,i(e.bysetpos)){o(e.bysetpos)&&(e.bysetpos=[e.bysetpos]);for(var n=0;n<e.bysetpos.length;n++){if(0===(y=e.bysetpos[n])||!(y>=-366&&y<=366))throw new Error("bysetpos must be between 1 and 366, or between -366 and -1")}}if(!(Boolean(e.byweekno)||f(e.byweekno)||f(e.byyearday)||Boolean(e.bymonthday)||f(e.bymonthday)||i(e.byweekday)||i(e.byeaster)))switch(e.freq){case Pt.YEARLY:e.bymonth||(e.bymonth=e.dtstart.getUTCMonth()+1),e.bymonthday=e.dtstart.getUTCDate();break;case Pt.MONTHLY:e.bymonthday=e.dtstart.getUTCDate();break;case Pt.WEEKLY:e.byweekday=[S(e.dtstart)]}if(i(e.bymonth)&&!s(e.bymonth)&&(e.bymonth=[e.bymonth]),i(e.byyearday)&&!s(e.byyearday)&&o(e.byyearday)&&(e.byyearday=[e.byyearday]),i(e.bymonthday))if(s(e.bymonthday)){var u=[],h=[];for(n=0;n<e.bymonthday.length;n++){var y;(y=e.bymonthday[n])>0?u.push(y):y<0&&h.push(y)}e.bymonthday=u,e.bynmonthday=h}else e.bymonthday<0?(e.bynmonthday=[e.bymonthday],e.bymonthday=[]):(e.bynmonthday=[],e.bymonthday=[e.bymonthday]);else e.bymonthday=[],e.bynmonthday=[];if(i(e.byweekno)&&!s(e.byweekno)&&(e.byweekno=[e.byweekno]),i(e.byweekday))if(o(e.byweekday))e.byweekday=[e.byweekday],e.bynweekday=null;else if(a(e.byweekday))e.byweekday=[r.fromStr(e.byweekday).weekday],e.bynweekday=null;else if(e.byweekday instanceof r)!e.byweekday.n||e.freq>Pt.MONTHLY?(e.byweekday=[e.byweekday.weekday],e.bynweekday=null):(e.bynweekday=[[e.byweekday.weekday,e.byweekday.n]],e.byweekday=null);else{var c=[],d=[];for(n=0;n<e.byweekday.length;n++){var l=e.byweekday[n];o(l)?c.push(l):a(l)?c.push(r.fromStr(l).weekday):!l.n||e.freq>Pt.MONTHLY?c.push(l.weekday):d.push([l.weekday,l.n])}e.byweekday=f(c)?c:null,e.bynweekday=f(d)?d:null}else e.bynweekday=null;return i(e.byhour)?o(e.byhour)&&(e.byhour=[e.byhour]):e.byhour=e.freq<Pt.HOURLY?[e.dtstart.getUTCHours()]:null,i(e.byminute)?o(e.byminute)&&(e.byminute=[e.byminute]):e.byminute=e.freq<Pt.MINUTELY?[e.dtstart.getUTCMinutes()]:null,i(e.bysecond)?o(e.bysecond)&&(e.bysecond=[e.bysecond]):e.bysecond=e.freq<Pt.SECONDLY?[e.dtstart.getUTCSeconds()]:null,{parsedOptions:e}}function it(t){var e=t.split("\\n").map(at).filter((function(t){return null!==t}));return W(W({},e[0]),e[1])}function ot(t){var e={},n=/DTSTART(?:;TZID=([^:=]+?))?(?::|=)([^;\\s]+)/i.exec(t);if(!n)return e;var r=n[1],i=n[2];return r&&(e.tzid=r),e.dtstart=N(i),e}function at(t){if(!(t=t.replace(/^\\s+|\\s+$/,"")).length)return null;var e=/^([A-Z]+?)[:;]/.exec(t.toUpperCase());if(!e)return st(t);var n=e[1];switch(n.toUpperCase()){case"RRULE":case"EXRULE":return st(t);case"DTSTART":return ot(t);default:throw new Error("Unsupported RFC prop ".concat(n," in ").concat(t))}}function st(t){var e=ot(t.replace(/^RRULE:/i,""));return t.replace(/^(?:RRULE|EXRULE):/i,"").split(";").forEach((function(n){var i=n.split("="),o=i[0],a=i[1];switch(o.toUpperCase()){case"FREQ":e.freq=Z[a.toUpperCase()];break;case"WKST":e.wkst=Wt[a.toUpperCase()];break;case"COUNT":case"INTERVAL":case"BYSETPOS":case"BYMONTH":case"BYMONTHDAY":case"BYYEARDAY":case"BYWEEKNO":case"BYHOUR":case"BYMINUTE":case"BYSECOND":var s=function(t){if(-1!==t.indexOf(",")){return t.split(",").map(ut)}return ut(t)}(a),u=o.toLowerCase();e[u]=s;break;case"BYWEEKDAY":case"BYDAY":e.byweekday=function(t){return t.split(",").map((function(t){if(2===t.length)return Wt[t];var e=t.match(/^([+-]?\\d{1,2})([A-Z]{2})$/);if(!e||e.length<3)throw new SyntaxError("Invalid weekday string: ".concat(t));var n=Number(e[1]),i=e[2],o=Wt[i].weekday;return new r(o,n)}))}(a);break;case"DTSTART":case"TZID":var h=ot(t);e.tzid=h.tzid,e.dtstart=h.dtstart;break;case"UNTIL":e.until=N(a);break;case"BYEASTER":e.byeaster=Number(a);break;default:throw new Error("Unknown RRULE property '"+o+"'")}})),e}function ut(t){return/^[+-]?\\d+$/.test(t)?Number(t):t}var ht=function(){function t(t,e){if(isNaN(t.getTime()))throw new RangeError("Invalid date passed to DateWithZone");this.date=t,this.tzid=e}return Object.defineProperty(t.prototype,"isUTC",{get:function(){return!this.tzid||"UTC"===this.tzid.toUpperCase()},enumerable:!1,configurable:!0}),t.prototype.toString=function(){var t=R(this.date.getTime(),this.isUTC);return this.isUTC?":".concat(t):";TZID=".concat(this.tzid,":").concat(t)},t.prototype.getTime=function(){return this.date.getTime()},t.prototype.rezonedDate=function(){return this.isUTC?this.date:function(t,e){var n=Intl.DateTimeFormat().resolvedOptions().timeZone,r=new Date(A(t,n)),i=new Date(A(t,null!=e?e:"UTC")).getTime()-r.getTime();return new Date(t.getTime()-i)}(this.date,this.tzid)},t}();function yt(t){for(var e,n=[],a="",u=Object.keys(t),h=Object.keys(Ht),y=0;y<u.length;y++)if("tzid"!==u[y]&&p(h,u[y])){var c=u[y].toUpperCase(),d=t[u[y]],l="";if(i(d)&&(!s(d)||d.length)){switch(c){case"FREQ":l=Pt.FREQUENCIES[t.freq];break;case"WKST":l=o(d)?new r(d).toString():d.toString();break;case"BYWEEKDAY":c="BYDAY",l=(e=d,s(e)?e:[e]).map((function(t){return t instanceof r?t:s(t)?new r(t[0],t[1]):new r(t)})).toString();break;case"DTSTART":a=ct(d,t.tzid);break;case"UNTIL":l=R(d,!t.tzid);break;default:if(s(d)){for(var f=[],b=0;b<d.length;b++)f[b]=String(d[b]);l=f.toString()}else l=String(d)}l&&n.push([c,l])}}var m=n.map((function(t){var e=t[0],n=t[1];return"".concat(e,"=").concat(n.toString())})).join(";"),w="";return""!==m&&(w="RRULE:".concat(m)),[a,w].filter((function(t){return!!t})).join("\\n")}function ct(t,e){return t?"DTSTART"+new ht(new Date(t),e).toString():""}function dt(t,e){return Array.isArray(t)?!!Array.isArray(e)&&(t.length===e.length&&t.every((function(t,n){return t.getTime()===e[n].getTime()}))):t instanceof Date?e instanceof Date&&t.getTime()===e.getTime():t===e}var lt=function(){function t(){this.all=!1,this.before=[],this.after=[],this.between=[]}return t.prototype._cacheAdd=function(t,e,n){e&&(e=e instanceof Date?L(e):M(e)),"all"===t?this.all=e:(n._value=e,this[t].push(n))},t.prototype._cacheGet=function(t,e){var n=!1,r=e?Object.keys(e):[],i=function(t){for(var n=0;n<r.length;n++){var i=r[n];if(!dt(e[i],t[i]))return!0}return!1},o=this[t];if("all"===t)n=this.all;else if(s(o))for(var a=0;a<o.length;a++){var u=o[a];if(!r.length||!i(u)){n=u._value;break}}if(!n&&this.all){var h=new C(t,e);for(a=0;a<this.all.length&&h.accept(this.all[a]);a++);n=h.getValue(),this._cacheAdd(t,n,e)}return s(n)?M(n):n instanceof Date?L(n):n},t}(),ft=H(H(H(H(H(H(H(H(H(H(H(H(H([],h(1,31),!0),h(2,28),!0),h(3,31),!0),h(4,30),!0),h(5,31),!0),h(6,30),!0),h(7,31),!0),h(8,31),!0),h(9,30),!0),h(10,31),!0),h(11,30),!0),h(12,31),!0),h(1,7),!0),pt=H(H(H(H(H(H(H(H(H(H(H(H(H([],h(1,31),!0),h(2,29),!0),h(3,31),!0),h(4,30),!0),h(5,31),!0),h(6,30),!0),h(7,31),!0),h(8,31),!0),h(9,30),!0),h(10,31),!0),h(11,30),!0),h(12,31),!0),h(1,7),!0),bt=u(1,29),mt=u(1,30),wt=u(1,31),vt=u(1,32),gt=H(H(H(H(H(H(H(H(H(H(H(H(H([],vt,!0),mt,!0),vt,!0),wt,!0),vt,!0),wt,!0),vt,!0),vt,!0),wt,!0),vt,!0),wt,!0),vt,!0),vt.slice(0,7),!0),kt=H(H(H(H(H(H(H(H(H(H(H(H(H([],vt,!0),bt,!0),vt,!0),wt,!0),vt,!0),wt,!0),vt,!0),vt,!0),wt,!0),vt,!0),wt,!0),vt,!0),vt.slice(0,7),!0),Et=u(-28,0),Tt=u(-29,0),xt=u(-30,0),Dt=u(-31,0),Ot=H(H(H(H(H(H(H(H(H(H(H(H(H([],Dt,!0),Tt,!0),Dt,!0),xt,!0),Dt,!0),xt,!0),Dt,!0),Dt,!0),xt,!0),Dt,!0),xt,!0),Dt,!0),Dt.slice(0,7),!0),St=H(H(H(H(H(H(H(H(H(H(H(H(H([],Dt,!0),Et,!0),Dt,!0),xt,!0),Dt,!0),xt,!0),Dt,!0),Dt,!0),xt,!0),Dt,!0),xt,!0),Dt,!0),Dt.slice(0,7),!0),Ut=[0,31,60,91,121,152,182,213,244,274,305,335,366],Yt=[0,31,59,90,120,151,181,212,243,273,304,334,365],Lt=function(){for(var t=[],e=0;e<55;e++)t=t.concat(u(7));return t}();function Mt(t,e){var n,r,i=b(t,1,1),o=k(t)?366:365,a=k(t+1)?366:365,s=x(i),u=S(i),y=W(W({yearlen:o,nextyearlen:a,yearordinal:s,yearweekday:u},function(t){var e=k(t)?366:365,n=b(t,1,1),r=S(n);if(365===e)return{mmask:ft,mdaymask:kt,nmdaymask:St,wdaymask:Lt.slice(r),mrange:Yt};return{mmask:pt,mdaymask:gt,nmdaymask:Ot,wdaymask:Lt.slice(r),mrange:Ut}}(t)),{wnomask:null});if(l(e.byweekno))return y;y.wnomask=h(0,o+7);var d=n=c(7-u+e.wkst,7);d>=4?(d=0,r=y.yearlen+c(u-e.wkst,7)):r=o-d;for(var f=Math.floor(r/7),m=c(r,7),w=Math.floor(f+m/4),v=0;v<e.byweekno.length;v++){var g=e.byweekno[v];if(g<0&&(g+=w+1),g>0&&g<=w){var E=void 0;g>1?(E=d+7*(g-1),d!==n&&(E-=7-n)):E=d;for(var T=0;T<7&&(y.wnomask[E]=1,E++,y.wdaymask[E]!==e.wkst);T++);}}if(p(e.byweekno,1)){E=d+7*w;if(d!==n&&(E-=7-n),E<o)for(v=0;v<7&&(y.wnomask[E]=1,E+=1,y.wdaymask[E]!==e.wkst);v++);}if(d){var D=void 0;if(p(e.byweekno,-1))D=-1;else{var O=S(b(t-1,1,1)),U=c(7-O.valueOf()+e.wkst,7),Y=k(t-1)?366:365,L=void 0;U>=4?(U=0,L=Y+c(O-e.wkst,7)):L=o-d,D=Math.floor(52+c(L,7)/4)}if(p(e.byweekno,D))for(E=0;E<d;E++)y.wnomask[E]=1}return y}const _t=function(){function t(t){this.options=t}return t.prototype.rebuild=function(t,e){var n=this.options;if(t!==this.lastyear&&(this.yearinfo=Mt(t,n)),f(n.bynweekday)&&(e!==this.lastmonth||t!==this.lastyear)){var r=this.yearinfo,o=r.yearlen,a=r.mrange,s=r.wdaymask;this.monthinfo=function(t,e,n,r,i,o){var a={lastyear:t,lastmonth:e,nwdaymask:[]},s=[];if(o.freq===Pt.YEARLY)if(l(o.bymonth))s=[[0,n]];else for(var u=0;u<o.bymonth.length;u++)e=o.bymonth[u],s.push(r.slice(e-1,e+1));else o.freq===Pt.MONTHLY&&(s=[r.slice(e-1,e+1)]);if(l(s))return a;for(a.nwdaymask=h(0,n),u=0;u<s.length;u++)for(var y=s[u],d=y[0],f=y[1]-1,p=0;p<o.bynweekday.length;p++){var b=void 0,m=o.bynweekday[p],w=m[0],v=m[1];v<0?(b=f+7*(v+1),b-=c(i[b]-w,7)):(b=d+7*(v-1),b+=c(7-i[b]+w,7)),d<=b&&b<=f&&(a.nwdaymask[b]=1)}return a}(t,e,o,a,s,n)}i(n.byeaster)&&(this.eastermask=function(t,e){void 0===e&&(e=0);var n=t%19,r=Math.floor(t/100),i=t%100,o=Math.floor(r/4),a=r%4,s=Math.floor((r+8)/25),u=Math.floor((r-s+1)/3),h=Math.floor(19*n+r-o-u+15)%30,y=Math.floor(i/4),c=i%4,d=Math.floor(32+2*a+2*y-h-c)%7,l=Math.floor((n+11*h+22*d)/451),f=Math.floor((h+d-7*l+114)/31),p=(h+d-7*l+114)%31+1,b=Date.UTC(t,f-1,p+e),m=Date.UTC(t,0,1);return[Math.ceil((b-m)/864e5)]}(t,n.byeaster))},Object.defineProperty(t.prototype,"lastyear",{get:function(){return this.monthinfo?this.monthinfo.lastyear:null},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"lastmonth",{get:function(){return this.monthinfo?this.monthinfo.lastmonth:null},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"yearlen",{get:function(){return this.yearinfo.yearlen},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"yearordinal",{get:function(){return this.yearinfo.yearordinal},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"mrange",{get:function(){return this.yearinfo.mrange},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"wdaymask",{get:function(){return this.yearinfo.wdaymask},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"mmask",{get:function(){return this.yearinfo.mmask},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"wnomask",{get:function(){return this.yearinfo.wnomask},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"nwdaymask",{get:function(){return this.monthinfo?this.monthinfo.nwdaymask:[]},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"nextyearlen",{get:function(){return this.yearinfo.nextyearlen},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"mdaymask",{get:function(){return this.yearinfo.mdaymask},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"nmdaymask",{get:function(){return this.yearinfo.nmdaymask},enumerable:!1,configurable:!0}),t.prototype.ydayset=function(){return[u(this.yearlen),0,this.yearlen]},t.prototype.mdayset=function(t,e){for(var n=this.mrange[e-1],r=this.mrange[e],i=h(null,this.yearlen),o=n;o<r;o++)i[o]=o;return[i,n,r]},t.prototype.wdayset=function(t,e,n){for(var r=h(null,this.yearlen+7),i=x(b(t,e,n))-this.yearordinal,o=i,a=0;a<7&&(r[i]=i,++i,this.wdaymask[i]!==this.options.wkst);a++);return[r,o,i]},t.prototype.ddayset=function(t,e,n){var r=h(null,this.yearlen),i=x(b(t,e,n))-this.yearordinal;return r[i]=i,[r,i,i+1]},t.prototype.htimeset=function(t,e,n,r){var i=this,o=[];return this.options.byminute.forEach((function(e){o=o.concat(i.mtimeset(t,e,n,r))})),_(o),o},t.prototype.mtimeset=function(t,e,n,r){var i=this.options.bysecond.map((function(n){return new tt(t,e,n,r)}));return _(i),i},t.prototype.stimeset=function(t,e,n,r){return[new tt(t,e,n,r)]},t.prototype.getdayset=function(t){switch(t){case Z.YEARLY:return this.ydayset.bind(this);case Z.MONTHLY:return this.mdayset.bind(this);case Z.WEEKLY:return this.wdayset.bind(this);case Z.DAILY:default:return this.ddayset.bind(this)}},t.prototype.gettimeset=function(t){switch(t){case Z.HOURLY:return this.htimeset.bind(this);case Z.MINUTELY:return this.mtimeset.bind(this);case Z.SECONDLY:return this.stimeset.bind(this)}},t}();function Rt(t,e,n,r,o,a){for(var s=[],u=0;u<t.length;u++){var h=void 0,y=void 0,d=t[u];d<0?(h=Math.floor(d/e.length),y=c(d,e.length)):(h=Math.floor((d-1)/e.length),y=c(d-1,e.length));for(var l=[],f=n;f<r;f++){var b=a[f];i(b)&&l.push(b)}var m=void 0;m=h<0?l.slice(h)[0]:l[h];var w=e[y],v=D(o.yearordinal+m),g=Y(v,w);p(s,g)||s.push(g)}return _(s),s}function Nt(t,e){var n=e.dtstart,r=e.freq,o=e.interval,a=e.until,s=e.bysetpos,u=e.count;if(0===u||0===o)return It(t);var h=et.fromDate(n),y=new _t(e);y.rebuild(h.year,h.month);for(var c=function(t,e,n){var r=n.freq,i=n.byhour,o=n.byminute,a=n.bysecond;if(Q(r))return function(t){var e=t.dtstart.getTime()%1e3;if(!Q(t.freq))return[];var n=[];return t.byhour.forEach((function(r){t.byminute.forEach((function(i){t.bysecond.forEach((function(t){n.push(new tt(r,i,t,e))}))}))})),n}(n);if(r>=Pt.HOURLY&&f(i)&&!p(i,e.hour)||r>=Pt.MINUTELY&&f(o)&&!p(o,e.minute)||r>=Pt.SECONDLY&&f(a)&&!p(a,e.second))return[];return t.gettimeset(r)(e.hour,e.minute,e.second,e.millisecond)}(y,h,e);;){var d=y.getdayset(r)(h.year,h.month,h.day),l=d[0],b=d[1],m=d[2],w=jt(l,b,m,y,e);if(f(s))for(var v=Rt(s,c,b,m,y,l),g=0;g<v.length;g++){var k=v[g];if(a&&k>a)return It(t);if(k>=n){var E=Ct(k,e);if(!t.accept(E))return It(t);if(u&&!--u)return It(t)}}else for(g=b;g<m;g++){var T=l[g];if(i(T))for(var x=D(y.yearordinal+T),O=0;O<c.length;O++){var S=c[O];k=Y(x,S);if(a&&k>a)return It(t);if(k>=n){E=Ct(k,e);if(!t.accept(E))return It(t);if(u&&!--u)return It(t)}}}if(0===e.interval)return It(t);if(h.add(e,w),h.year>9999)return It(t);Q(r)||(c=y.gettimeset(r)(h.hour,h.minute,h.second,0)),y.rebuild(h.year,h.month)}}function At(t,e,n){var r=n.bymonth,i=n.byweekno,o=n.byweekday,a=n.byeaster,s=n.bymonthday,u=n.bynmonthday,h=n.byyearday;return f(r)&&!p(r,t.mmask[e])||f(i)&&!t.wnomask[e]||f(o)&&!p(o,t.wdaymask[e])||f(t.nwdaymask)&&!t.nwdaymask[e]||null!==a&&!p(t.eastermask,e)||(f(s)||f(u))&&!p(s,t.mdaymask[e])&&!p(u,t.nmdaymask[e])||f(h)&&(e<t.yearlen&&!p(h,e+1)&&!p(h,-t.yearlen+e)||e>=t.yearlen&&!p(h,e+1-t.yearlen)&&!p(h,-t.nextyearlen+e-t.yearlen))}function Ct(t,e){return new ht(t,e.tzid).rezonedDate()}function It(t){return t.getValue()}function jt(t,e,n,r,i){for(var o=!1,a=e;a<n;a++){var s=t[a];(o=At(r,s,i))&&(t[s]=null)}return o}var Wt={MO:new r(0),TU:new r(1),WE:new r(2),TH:new r(3),FR:new r(4),SA:new r(5),SU:new r(6)},Ht={freq:Z.YEARLY,dtstart:null,interval:1,wkst:Wt.MO,count:null,until:null,tzid:null,bysetpos:null,bymonth:null,bymonthday:null,bynmonthday:null,byyearday:null,byweekno:null,byweekday:null,bynweekday:null,byhour:null,byminute:null,bysecond:null,byeaster:null},qt=Object.keys(Ht),Pt=function(){function t(t,e){void 0===t&&(t={}),void 0===e&&(e=!1),this._cache=e?null:new lt,this.origOptions=nt(t);var n=rt(t).parsedOptions;this.options=n}return t.parseText=function(t,e){return G(t,e)},t.fromText=function(t,e){return $(t,e)},t.fromString=function(e){return new t(t.parseString(e)||void 0)},t.prototype._iter=function(t){return Nt(t,this.options)},t.prototype._cacheGet=function(t,e){return!!this._cache&&this._cache._cacheGet(t,e)},t.prototype._cacheAdd=function(t,e,n){if(this._cache)return this._cache._cacheAdd(t,e,n)},t.prototype.all=function(t){if(t)return this._iter(new q("all",{},t));var e=this._cacheGet("all");return!1===e&&(e=this._iter(new C("all",{})),this._cacheAdd("all",e)),e},t.prototype.between=function(t,e,n,r){if(void 0===n&&(n=!1),!T(t)||!T(e))throw new Error("Invalid date passed in to RRule.between");var i={before:e,after:t,inc:n};if(r)return this._iter(new q("between",i,r));var o=this._cacheGet("between",i);return!1===o&&(o=this._iter(new C("between",i)),this._cacheAdd("between",o,i)),o},t.prototype.before=function(t,e){if(void 0===e&&(e=!1),!T(t))throw new Error("Invalid date passed in to RRule.before");var n={dt:t,inc:e},r=this._cacheGet("before",n);return!1===r&&(r=this._iter(new C("before",n)),this._cacheAdd("before",r,n)),r},t.prototype.after=function(t,e){if(void 0===e&&(e=!1),!T(t))throw new Error("Invalid date passed in to RRule.after");var n={dt:t,inc:e},r=this._cacheGet("after",n);return!1===r&&(r=this._iter(new C("after",n)),this._cacheAdd("after",r,n)),r},t.prototype.count=function(){return this.all().length},t.prototype.toString=function(){return yt(this.origOptions)},t.prototype.toText=function(t,e,n){return function(t,e,n,r){return new B(t,e,n,r).toString()}(this,t,e,n)},t.prototype.isFullyConvertibleToText=function(){return V(this)},t.prototype.clone=function(){return new t(this.origOptions)},t.FREQUENCIES=["YEARLY","MONTHLY","WEEKLY","DAILY","HOURLY","MINUTELY","SECONDLY"],t.YEARLY=Z.YEARLY,t.MONTHLY=Z.MONTHLY,t.WEEKLY=Z.WEEKLY,t.DAILY=Z.DAILY,t.HOURLY=Z.HOURLY,t.MINUTELY=Z.MINUTELY,t.SECONDLY=Z.SECONDLY,t.MO=Wt.MO,t.TU=Wt.TU,t.WE=Wt.WE,t.TH=Wt.TH,t.FR=Wt.FR,t.SA=Wt.SA,t.SU=Wt.SU,t.parseString=it,t.optionsToString=yt,t}();var Ft={dtstart:null,cache:!1,unfold:!1,forceset:!1,compatible:!1,tzid:null};function zt(t,e){var n=[],r=[],i=[],o=[],a=ot(t),s=a.dtstart,u=a.tzid,h=function(t,e){void 0===e&&(e=!1);if(!(t=t&&t.trim()))throw new Error("Invalid empty string");if(!e)return t.split(/\\s/);var n=t.split("\\n"),r=0;for(;r<n.length;){var i=n[r]=n[r].replace(/\\s+$/g,"");i?r>0&&" "===i[0]?(n[r-1]+=i.slice(1),n.splice(r,1)):r+=1:n.splice(r,1)}return n}(t,e.unfold);return h.forEach((function(t){var e;if(t){var a=function(t){var e=function(t){if(-1===t.indexOf(":"))return{name:"RRULE",value:t};var e=(i=t,o=":",a=1,s=i.split(o),a?s.slice(0,a).concat([s.slice(a).join(o)]):s),n=e[0],r=e[1];var i,o,a,s;return{name:n,value:r}}(t),n=e.name,r=e.value,i=n.split(";");if(!i)throw new Error("empty property name");return{name:i[0].toUpperCase(),parms:i.slice(1),value:r}}(t),s=a.name,h=a.parms,y=a.value;switch(s.toUpperCase()){case"RRULE":if(h.length)throw new Error("unsupported RRULE parm: ".concat(h.join(",")));n.push(it(t));break;case"RDATE":var c=(null!==(e=/RDATE(?:;TZID=([^:=]+))?/i.exec(t))&&void 0!==e?e:[])[1];c&&!u&&(u=c),r=r.concat(Zt(y,h));break;case"EXRULE":if(h.length)throw new Error("unsupported EXRULE parm: ".concat(h.join(",")));i.push(it(y));break;case"EXDATE":o=o.concat(Zt(y,h));break;case"DTSTART":break;default:throw new Error("unsupported property: "+s)}}})),{dtstart:s,tzid:u,rrulevals:n,rdatevals:r,exrulevals:i,exdatevals:o}}function Kt(t,e){return void 0===e&&(e={}),function(t,e){var n=zt(t,e),r=n.rrulevals,i=n.rdatevals,o=n.exrulevals,a=n.exdatevals,s=n.dtstart,u=n.tzid,h=!1===e.cache;if(e.compatible&&(e.forceset=!0,e.unfold=!0),e.forceset||r.length>1||i.length||o.length||a.length){var y=new Gt(h);return y.dtstart(s),y.tzid(u||void 0),r.forEach((function(t){y.rrule(new Pt(Bt(t,s,u),h))})),i.forEach((function(t){y.rdate(t)})),o.forEach((function(t){y.exrule(new Pt(Bt(t,s,u),h))})),a.forEach((function(t){y.exdate(t)})),e.compatible&&e.dtstart&&y.rdate(s),y}var c=r[0]||{};return new Pt(Bt(c,c.dtstart||e.dtstart||s,c.tzid||e.tzid||u),h)}(t,function(t){var e=[],n=Object.keys(t),r=Object.keys(Ft);if(n.forEach((function(t){p(r,t)||e.push(t)})),e.length)throw new Error("Invalid options: "+e.join(", "));return W(W({},Ft),t)}(e))}function Bt(t,e,n){return W(W({},t),{dtstart:e,tzid:n})}function Zt(t,e){return function(t){t.forEach((function(t){if(!/(VALUE=DATE(-TIME)?)|(TZID=)/.test(t))throw new Error("unsupported RDATE/EXDATE parm: "+t)}))}(e),t.split(",").map((function(t){return N(t)}))}function Xt(t){var e=this;return function(n){if(void 0!==n&&(e["_".concat(t)]=n),void 0!==e["_".concat(t)])return e["_".concat(t)];for(var r=0;r<e._rrule.length;r++){var i=e._rrule[r].origOptions[t];if(i)return i}}}var Gt=function(t){function e(e){void 0===e&&(e=!1);var n=t.call(this,{},e)||this;return n.dtstart=Xt.apply(n,["dtstart"]),n.tzid=Xt.apply(n,["tzid"]),n._rrule=[],n._rdate=[],n._exrule=[],n._exdate=[],n}return j(e,t),e.prototype._iter=function(t){return function(t,e,n,r,i,o){var a={},s=t.accept;function u(t,e){n.forEach((function(n){n.between(t,e,!0).forEach((function(t){a[Number(t)]=!0}))}))}i.forEach((function(t){var e=new ht(t,o).rezonedDate();a[Number(e)]=!0})),t.accept=function(t){var e=Number(t);return isNaN(e)?s.call(this,t):!(!a[e]&&(u(new Date(e-1),new Date(e+1)),!a[e]))||(a[e]=!0,s.call(this,t))},"between"===t.method&&(u(t.args.after,t.args.before),t.accept=function(t){var e=Number(t);return!!a[e]||(a[e]=!0,s.call(this,t))});for(var h=0;h<r.length;h++){var y=new ht(r[h],o).rezonedDate();if(!t.accept(new Date(y.getTime())))break}e.forEach((function(e){Nt(t,e.options)}));var c=t._result;switch(_(c),t.method){case"all":case"between":return c;case"before":return c.length&&c[c.length-1]||null;default:return c.length&&c[0]||null}}(t,this._rrule,this._exrule,this._rdate,this._exdate,this.tzid())},e.prototype.rrule=function(t){Qt(t,this._rrule)},e.prototype.exrule=function(t){Qt(t,this._exrule)},e.prototype.rdate=function(t){$t(t,this._rdate)},e.prototype.exdate=function(t){$t(t,this._exdate)},e.prototype.rrules=function(){return this._rrule.map((function(t){return Kt(t.toString())}))},e.prototype.exrules=function(){return this._exrule.map((function(t){return Kt(t.toString())}))},e.prototype.rdates=function(){return this._rdate.map((function(t){return new Date(t.getTime())}))},e.prototype.exdates=function(){return this._exdate.map((function(t){return new Date(t.getTime())}))},e.prototype.valueOf=function(){var t=[];return!this._rrule.length&&this._dtstart&&(t=t.concat(yt({dtstart:this._dtstart}))),this._rrule.forEach((function(e){t=t.concat(e.toString().split("\\n"))})),this._exrule.forEach((function(e){t=t.concat(e.toString().split("\\n").map((function(t){return t.replace(/^RRULE:/,"EXRULE:")})).filter((function(t){return!/^DTSTART/.test(t)})))})),this._rdate.length&&t.push(Jt("RDATE",this._rdate,this.tzid())),this._exdate.length&&t.push(Jt("EXDATE",this._exdate,this.tzid())),t},e.prototype.toString=function(){return this.valueOf().join("\\n")},e.prototype.clone=function(){var t=new e(!!this._cache);return this._rrule.forEach((function(e){return t.rrule(e.clone())})),this._exrule.forEach((function(e){return t.exrule(e.clone())})),this._rdate.forEach((function(e){return t.rdate(new Date(e.getTime()))})),this._exdate.forEach((function(e){return t.exdate(new Date(e.getTime()))})),t},e}(Pt);function Qt(t,e){if(!(t instanceof Pt))throw new TypeError(String(t)+" is not RRule instance");p(e.map(String),String(t))||e.push(t)}function $t(t,e){if(!(t instanceof Date))throw new TypeError(String(t)+" is not Date instance");p(e.map(Number),Number(t))||(e.push(t),_(e))}function Jt(t,e,n){var r=!n||"UTC"===n.toUpperCase(),i=r?"".concat(t,":"):"".concat(t,";TZID=").concat(n,":"),o=e.map((function(t){return R(t.valueOf(),r)})).join(",");return"".concat(i).concat(o)}return e})()));
`);

const RRule = new rrule.RRule();
const RRuleStr = rrule.rrulestr;
