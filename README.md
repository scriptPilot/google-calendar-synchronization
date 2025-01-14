# Google Calendar Synchronization

Synchronize Google Calendar events between two or more calendars.

Made with Google Apps Script, related to [Google Calendar Corrections](https://github.com/scriptPilot/google-calendar-correction).

## Installation

1. Backup all Google Calendars to be able to restore them if something went wrong.
2. Open [Google Apps Script](https://script.google.com/) and create a new project `Calendar Synchronization`.
3. Replace the `Code.gs` file content with [this code](dist/Code.gs).
4. Click at the `+` next to `Services`, add `Google Calendar API` `v3` as `Calendar`.

## Usage

The following examples are based on assumed calendars `Work` and `Family`.

### Synchronization

1. Click the `+` next to `Files` to add a new script file `onCalendarUpdate`:

    ```js
    function onCalendarUpdate() {
      runOneWaySync('Work', 'Family')
    }
    ```
2. Save the changes and run the `onCalendarUpdate` function manually.

    - Allow the prompt and grant the requested calendar access.
    - At the first run, all events within the [time range](#time-range) are synchronized.
    - With any other run, only modified source events are synchronized.

3. On the left menu, select "Trigger" and add a new trigger:

    - run function `onCalendarUpdate`
    - trigger source `calendar`
    - calendar email `work-calendar-id` (to be found in the Google Calendar settings)

Now, any change to the `Work` calendar is synchronized to the `Family` calendar.

### Time Range

The synchronization time range can be specified, by default it is -7 / +21 days.

Previous and next days can be specified with third and fourth parameter:

```js
function onCalendarUpdate() {
  runOneWaySync('Work', 'Family', 7, 21)
}
```

### Correction Function

As fifth argument, the `runOneWaySync` function accepts a correction function.

#### Basic Usage

With this correction function you can modify the target events.

```js
function correctionFunction(targetEvent) {
  targetEvent.colorId = '6' // apply orange color to all target events
  return targetEvent        // do not forget to return the target event
}

function onCalendarUpdate() {
  runOneWaySync('Work', 'Family', 7, 21, correctionFunction)
}
```

Further reading for the correction function: [Google API Documentation](https://developers.google.com/calendar/api/v3/reference/events) and [color IDs](https://storage.googleapis.com/support-forums-api/attachment/message-114058730-1008415079352027267.jpg)

#### Source Event

You can also use the source event as second argument of the correction function to make use of properties which are not part of the target event by default.

```js
function correctionFunction(targetEvent, sourceEvent) {
  targetEvent.colorId = sourceEvent.attendees ? '6' : '0'
  return targetEvent
}
```

This allows you also to keep properties from the source event which are not synchronized by default.

```js
function correctionFunction(targetEvent, sourceEvent) {
  targetEvent.summary = sourceEvent.summary
  targetEvent.description = sourceEvent.description
  targetEvent.location = sourceEvent.location
  return targetEvent
}
```

To avoid any unwanted data exposure, by default, only the start date, end date, recurrence rule and `Busy` as default summary are synchronized.

#### Helper Functions

There are a couple of helper function available to support the correction function.

```js
isSynchronizedEvent(sourceEvent) // true if synchronized from any other calendar
isRecurringEvent(sourceEvent)    // true if recurring event
isOOOEvent(sourceEvent)          // true if out of office event
isAlldayEvent(sourceEvent)       // true if allday event
isOnWeekend(sourceEvent)         // true if on Saturday or Sunday
isBusyEvent(sourceEvent)         // true if status is busy
isOpenByMe(sourceEvent)          // true if needs action by me
isAcceptedByMe(sourceEvent)      // true if accepted by me
isTentativeByMe(sourceEvent)     // true if responded tentative by me
isDeclinedByMe(sourceEvent)      // true if declined by me
```

### Script Reset

By default, only updated source events are synchronized. To apply modified rules you want to reset the script to allow a full synchronization again. This can be done by running the function `resetScript` manually.

For test purpose, you can also add it to the beginning of the `onCalendarUpdate` function. Do not forget to remove it again after completing the development.

### Multiple Source Calendars

Multiple source calendars can be synchronized to the same target calendar.

```js
function onWorkCalendarUpdate() {
  runOneWaySync('Work', 'Family')
}

function onSecondWorkCalendarUpdate() {
  runOneWaySync('Second Work', 'Family')
}
```

Do not forget to configure two triggers respectively.

### Multiple Target Calendars

One source calendar can be synchronized to multiple target calendars.

```js
function onCalendarUpdate() {
  runOneWaySync('Work', 'Family')
  runOneWaySync('Work', 'Second Family')
}
```

Do not forget to configure two triggers respectively.

### Two-Way Synchronization

No yet implemented. There is already a [feature request](https://github.com/scriptPilot/google-calendar-synchronization/issues/6) created. Feel free to support.

## Update

To update the script version, replace the `Code.gs` file content with [this code](dist/Code.gs).

## Deinstallation

### Calendar Cleanup

Use the `cleanCalendar` function to remove all synchronized events from all calendars.

This will not remove any source event.

```js
function cleanup() {
  cleanCalendar('Family')
  cleanCalendar('Work')
}
```

### Remove the Project

Remove the Google Apps Script project. This will also remove all triggers.

## Support

Feel free to open an [issue](https://github.com/scriptPilot/google-calendar-synchronization/issues) for bugs, feature requests or any other question.
