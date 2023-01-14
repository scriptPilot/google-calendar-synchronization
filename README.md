# Google Calendar Synchronization

Synchronize Google Calendar events between one or multiple calendars. Made with Google Apps Script.

## Installation

1. Open [Google Apps Script](https://script.google.com/) and create a new project `Google Calendar Synchronization`
2. Replace `Code.gs` file content with [this code](dist/Code.gs)
3. Modify the `onCalendarUpdate` function to your needs ([Google API Documentation](https://developers.google.com/calendar/api/v3/reference/events), [color IDs](https://storage.googleapis.com/support-forums-api/attachment/message-114058730-1008415079352027267.jpg))
4. Click on the `+` next to `Services`, add `Google Calendar API v3` as `Calendar`
5. Save and run the function `onCalendarUpdate` and grant permissions (calendar access)

## Usage

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

Create two triggers per `on...CalendarUpdate` function and insert the source and target calendar ID respectively.

### Multiple Target Calendars

Inside the `onCalendarUpdate` function, copy the `runOneWaySync` function call.

### Reset

After any modification to the `onCalendarUpdate` function, you should run the function `resetScript` to reset the script and allow synchronization of all events again.

## Changelog

### v1

- Initial release

## Development

### Requirements

* [Node.js](https://nodejs.org/) and NPM installed
* [Command Line Apps Script Projects](https://github.com/google/clasp) installed globally

### Installation

1. Clone this repository
2. Run `clasp login` to login to Google if not done before
3. Run `clasp create --type standalone --rootDir lib --title "Google Calendar Synchronization"` to create a new Apps Script Project

### Workflow

* Run `clasp open` to open the project in the [Cloud IDE](https://script.google.com/)
* Run `clasp push` to replace the remote files with the local ones
* Run `clasp pull` to replace the local files with the remote ones
* Run `node buildscript.js` to build the `Code.gs` file
