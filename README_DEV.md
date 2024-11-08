# Development

This is about the development of this repository.

Feel free to open an [issue](https://github.com/scriptPilot/google-calendar-synchronization/issues) for bugs, feature requests or any other question.

## Requirements

* [Node.js](https://nodejs.org/) and NPM installed
* [Command Line Apps Script Projects](https://github.com/google/clasp) installed globally

## Installation

1. Clone this repository:

   ```
   git clone https://github.com/scriptPilot/google-calendar-synchronization.git
   ```

2. Login to Google Apps Script CLI:

    ```
    clasp login
    ```
3. Create a new Google Apps Script project:

    ```
    clasp create --type standalone --rootDir lib --title "Google Calendar Synchronization"
    ```

4. Move the hidden `.clasp.json` file to the project root:

    ```
    mv lib/.clasp.json .clasp.json
    ```

## Workflow

1. Apply changes to the code and documentation.
2. Push the changes to the [Cloud IDE](https://script.google.com/) and open the project:

    ```
    clasp push && clasp open
    ````
3. Test the changes in the Cloud IDE according to the [documentation](#documentation).
4. Build the `dist/Code.gs` file:

    ```
    node buildscript.js
    ```

5. Update the changelog.
6. Commit and push the changes to GitHub.

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

### v3

- lock script to prevent parallel execution
- limit requests to avoid to exceed the quota
- added many helper functions
- use default arguments for previous days, next days, correction function
- improved documentation