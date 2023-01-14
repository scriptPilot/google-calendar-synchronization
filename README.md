# Google Calendar Synchronization

Synchronize Google Calendar events between one or multiple calendars. Made with Google Apps Script.

Related to [Google Calendar Corrections](https://github.com/scriptPilot/google-calendar-correction).

## Installation

1. Open [Google Apps Script](https://script.google.com/) and create a new project `Google Calendar Synchronization`
2. Replace `Code.gs` file content with [this code](dist/Code.gs)
3. Click at the `+` next to `Services`, add `Google Calendar API v3` as `Calendar`

## Usage

Click at the `+` next to `Files` to add a new script file, you can name it `onCalendarUpdate`.

Now you can copy and paste the following example code:

```js
function onCalendarUpdate() {
  runOneWaySync('Work', 'Family', 7, 21, (targetEvent, sourceEvent) => {     
    if (sourceEvent.summary === 'Holiday') targetEvent.summary = 'Family Time'
    if (sourceEvent.summary === 'Secret') targetEvent.status = 'cancelled'
    targetEvent.colorId = 0
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
      // In this example, all Work events with title "Holiday" are saved to Family as "Family Time"
      if (sourceEvent.summary === 'Holiday') targetEvent.summary = 'Family Time'
      // In this example, all Work events with title "Secret" are not synchronized to "Family"
      if (sourceEvent.summary === 'Secret') targetEvent.status = 'cancelled'
      // In this example, all events keep the default calendar color
      targetEvent.colorId = 0
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

Now, on every calendar update in the source or target calendar, the events are synchronized automatically.

### Multiple Source Calendars

Copy the `onCalendarUpdate` function, for example as `onWorkCalendarUpdate` or `onFamilyCalendarUpdate`.

```js
onWorkCalendarUpdate() {
  runOneWaySync('Work', 'Family', 0, 21, (targetEvent, sourceEvent) => {  
    ...
    return targetEvent
  })
}
onFamilyCalendarUpdate() {
  runOneWaySync('Family', 'Work', 0, 21, (targetEvent, sourceEvent) => {  
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
  runOneWaySync('Work', 'Family', 0, 21, (targetEvent, sourceEvent) => {     
    ...
    return targetEvent
  })
  runOneWaySync('Work', 'Personal', 0, 21, (targetEvent, sourceEvent) => {     
    ...
    return targetEvent
  })
}
```

Create a third trigger for the second target calendar id.

### Reset

After any modification to the `onCalendarUpdate` function, you should run the function `resetScript` to reset the script and allow synchronization of all events again.

## Changelog

### v1

- Initial release

### v1.1

- `onCalendarUpdate` function removed from the `Code.gs` file
- `.clasp.json` file removed from the repository

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
