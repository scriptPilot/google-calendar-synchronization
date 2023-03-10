# Google Calendar Synchronization

Synchronize Google Calendar events between one or multiple calendars. Made with Google Apps Script.

Related to [Google Calendar Corrections](https://github.com/scriptPilot/google-calendar-correction).

## Installation

1. Backup all Google Calendars to be able to restore them if something went wrong
2. Open [Google Apps Script](https://script.google.com/) and create a new project `Google Calendar Synchronization`
3. Replace `Code.gs` file content with [this code](dist/Code.gs)
4. Click at the `+` next to `Services`, add `Google Calendar API v3` as `Calendar`

## Usage

Click at the `+` next to `Files` to add a new script file, you can name it `onCalendarUpdate`.

Now you can copy and paste the following example code:

```js
function onCalendarUpdate() {
  runOneWaySync('Work', 'Family', 7, 21, (targetEvent, sourceEvent) => {     
    if (sourceEvent.summary === 'Holiday') targetEvent.summary = 'Family Time'
    if (sourceEvent.summary === 'Secret') targetEvent.status = 'cancelled'
    targetEvent.colorId = '0'
    targetEvent.description = sourceEvent.description
    return targetEvent
  })
}
```

Or with comments:

```js
// This function is called by the trigger
// You should modify the options and correction function to your needs
function onCalendarUpdate() {
  // Run the correction with some options
  runOneWaySync(
    // The name of the source calendar
    'Work',    
    // The name of the target calendar
    'Family',
    // Previous days
    7,
    // Next days
    21,
    // Correction function, event as input 
    (targetEvent, sourceEvent) => {     
      // All Work events with title "Holiday" are saved to Family as "Family Time"
      if (sourceEvent.summary === 'Holiday') targetEvent.summary = 'Family Time'
      // All Work events with title "Secret" are not synchronized to "Family"
      if (sourceEvent.summary === 'Secret') targetEvent.status = 'cancelled'
      // All events keep the default calendar color
      targetEvent.colorId = '0'
      // Add the description to the target event
      // By default, only the start and end date and the summary
      // are synchronized to avoid any unintended data exposure
      targetEvent.description = sourceEvent.description
      // Do not forget to return the target event
      return targetEvent
    }
  )
}
```

Further reading for the correction function: [Google API Documentation](https://developers.google.com/calendar/api/v3/reference/events) and [color IDs](https://storage.googleapis.com/support-forums-api/attachment/message-114058730-1008415079352027267.jpg)

Finally, save the changes and run the `onCalendarUpdate` function manually.

On the first run, you have to grant permissions (calendar access) to the script.

### Manually

Run the function `onCalendarUpdate()` to start the synchonization.

At the first run, all events are synchronized. With any other run, only modified events are synchronized.

### Trigger

Create two triggers for the `onCalendarUpdate` function, triggered by calendar updates:
- one for the source calencar ID
- one for the target calendar ID

Now, on every calendar update in the source calendar, the changes are synchronized to the target calendar.

On every change to synchronized events in the target calendar, the changes are overwritten from the source calendar again.

### Multiple Source Calendars

Copy the `onCalendarUpdate` function, for example as `onWorkCalendarUpdate` or `onFamilyCalendarUpdate`.

```js
onWorkCalendarUpdate() {
  runOneWaySync('Work', 'Family', 7, 21, (targetEvent, sourceEvent) => {  
    // Exclude synchronized events
    if (sourceEvent.extendedProperties?.private?.sourceCalendarId) targetEvent.status = 'cancelled'
    ...    
    return targetEvent
  })
}
onFamilyCalendarUpdate() {
  runOneWaySync('Family', 'Work', 7, 21, (targetEvent, sourceEvent) => {  
    // Exclude synchronized events
    if (sourceEvent.extendedProperties?.private?.sourceCalendarId) targetEvent.status = 'cancelled'
    ...
    return targetEvent
  })
}
```

Create two triggers per `on...CalendarUpdate` function and insert the source and target calendar ID respectively.

### Multiple Target Calendars

Inside the `onCalendarUpdate` function, copy the `runOneWaySync` function call.

Change the target calendar respectively.

```js
function onCalendarUpdate() {
  runOneWaySync('Work', 'Family', 7, 21, (targetEvent, sourceEvent) => {     
    ...
    return targetEvent
  })
  runOneWaySync('Work', 'Personal', 7, 21, (targetEvent, sourceEvent) => {     
    ...
    return targetEvent
  })
}
```

Create a third trigger for the second target calendar id.

### Clean Calendar

To clean any calendar from all synchronized events, you can call the function `cleanCalendar`:

```js
function cleanup() {
  cleanCalendar('Work')
}
```

## Changelog

### v1

- Initial release

### v1.1

- `onCalendarUpdate` function removed from the `Code.gs` file
- `.clasp.json` file removed from the repository

### v1.2

- Simplified algorithm to avoid issues

### v1.3

- `cleanCalendar` function added

### v1.4

- `resetScript` function removed

### v2

- synchronize modified events only
- consider hidden calendars
- do not log skipped events
- `resetScript` function added

## Development

### Requirements

* [Node.js](https://nodejs.org/) and NPM installed
* [Command Line Apps Script Projects](https://github.com/google/clasp) installed globally

### Installation

1. Clone this repository
2. Run `clasp login` to login to Google if not done before
3. Run `clasp create --type standalone --rootDir lib --title "Google Calendar Synchronization"` to create a new Apps Script Project
4. Run `mv lib/.clasp.json .clasp.json` to move the CLASP config file to the project root

### Workflow

* Run `clasp push` to replace the remote files with the local ones
* Run `clasp open` to open the project in the [Cloud IDE](https://script.google.com/)
* Run `clasp pull` to replace the local files with the remote ones
* Run `node buildscript.js` to build the `Code.gs` file
