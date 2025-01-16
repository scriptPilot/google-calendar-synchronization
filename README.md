# Google Calendar Synchronization

Synchronize Google Calendar events between two or more calendars.

Made with Google Apps Script, related to [Google Calendar Corrections](https://github.com/scriptPilot/google-calendar-correction).

## Installation

1. Backup all Google Calendars to be able to restore them if something went wrong.
2. Open [Google Apps Script](https://script.google.com/) and create a new project `Calendar Synchronization`.
3. Click at the `+` next to `Services`, add `Google Calendar API` `v3` as `Calendar`.
4. Replace the `Code.gs` file content with [this code](dist/Code.gs) and save.

## Usage

The following examples are based on assumed calendars `Work` and `Family`.

### Synchronization

1. Click the `+` next to `Files` to add a new script file `onStart`:

    ```js
    function onStart() {
      sync('Work', 'Family')
    }
    ```

2. Select file `Code.gs`, run the function `start()` and grant the requested rights.

   Now, any change to the `Work` calendar is synchronized to the `Family` calendar.

3. To stop the synchronization, select file `Code.gs` and run `stop()`.

4. To remove all synchronized events, select file `Code.gs` and run `clean()`.

### Multiple Source Calendars

Multiple source calendars can be synchronized to the same target calendar.

```js
function onStart() {
  sync('Work', 'Family')
  sync('Second Work', 'Family')
}
```

### Multiple Target Calendars

One source calendar can be synchronized to multiple target calendars.

```js
function onStart() {
  sync('Work', 'Family')
  sync('Work', 'Second Family')
}
```

### Time Range

The synchronization time range can be specified.

By default, the past `7` and next `28` days are synchronized.

```js
sync('Work', 'Family', 7, 28)
```

### Correction Function

To avoid any unwanted data exposure, by default, only the start date, end date, recurrence rule and `Busy` as default summary are synchronized.

The correction function can be specified to modify or filter target events.

```js
function correctionFunction(targetEvent, sourceEvent) {
  // correction of the target event ...
  return targetEvent
}

sync('Work', 'Family', 7, 28, correctionFunction)
```

#### Use Cases

```js
function correctionFunction(targetEvent, sourceEvent) {

  // Keep properties
  targetEvent.summary = sourceEvent.summary
  targetEvent.location = sourceEvent.location

  // Modify properties
  if (sourceEvent.attendees) targetEvent.colorId = '6'

  // Exclude events
  if (sourceEvent.transparency === 'transparent') targetEvent.status = 'cancelled'

  // Do not forget to return the target event
  return targetEvent

}
```

Read more about [event properties](https://developers.google.com/calendar/api/v3/reference/events) and [colors](https://storage.googleapis.com/support-forums-api/attachment/message-114058730-1008415079352027267.jpg).

#### Helper Functions

There are a couple of helper function available to support the correction function.

```js
isSynchronizedEvent(sourceEvent) // true if synchronized from another calendar
isRecurringEvent(sourceEvent)    // true if recurring event series or instance
isOOOEvent(sourceEvent)          // true if out of office event
isAlldayEvent(sourceEvent)       // true if allday event
isOnWeekend(sourceEvent)         // true if on Saturday or Sunday
isBusyEvent(sourceEvent)         // true if status is busy
isOpenByMe(sourceEvent)          // true if needs action by me
isAcceptedByMe(sourceEvent)      // true if accepted by me
isTentativeByMe(sourceEvent)     // true if responded tentative by me
isDeclinedByMe(sourceEvent)      // true if declined by me
```

#### Exclude synchronized events

By default, all source events are synchronized - also the ones which are synchronized from another calendar. You might want to exclude these events from your synchronization.

Example - this will result in a growing number of events:

```js
function onStart() {
  sync('Work', 'Family')
  sync('Family', 'Work')
}
```

Solution - exclude synchronized events:

```js
function correctionFunction(targetEvent, sourceEvent) {
  if (isSynchronizedEvent(sourceEvent)) targetEvent.status = 'cancelled'
  return targetEvent
}

function onStart() {
  sync('Work', 'Family', 7, 28, correctionFunction)
  sync('Family', 'Work', 7, 28, correctionFunction)
}
```

### Sync Interval

The synchronization interval can be specified.

By default, the next synchronization is triggered after `1` minute.

This value can be increased if the Google Apps Script quota is an issue.

```js
function onStart() {
  sync('Work', 'Family')
  setSyncInterval(1)
} 
```

## Update

To update the script version, replace the `Code.gs` file content with [this code](dist/Code.gs).

## Deinstallation

1. To stop the synchronization, select file `Code.gs` and run `stop()`.
2. To remove all synchronized events, select file `Code.gs` and run `clean()`.
3. Remove the Google Apps Script project.

## Support

Feel free to open an [issue](https://github.com/scriptPilot/google-calendar-synchronization/issues) for bugs, feature requests or any other question.
