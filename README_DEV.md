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
    clasp create --type standalone --rootDir src --title "Google Calendar Synchronization"
    ```

4. Move the hidden `.clasp.json` file to the project root:

    ```
    mv src/.clasp.json .clasp.json
    ```

5. Create a file `src/onStart.js`:

    ```js
    function onStart() {
      sync('Work', 'Family')
    }
    ```

6. Create two Google Calendar `Work` and `Family`.

## Workflow

1. Apply changes to the code and documentation.
2. Push the changes to the [Cloud IDE](https://script.google.com/) and open the project:

    ```
    clasp push && clasp open
    ````
3. Test the changes in the Cloud IDE according to the documentation.
4. Build the `dist/Code.gs` file:

    ```
    npm run build
    ```

5. Update the changelog.
6. Set a new version tag in GitHub Desktop.
7. Commit and push the changes to GitHub.

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

### v3.1

- forgot the Code.gs update in v3

### v3.2

- add date and source to build file

### v3.3

- highly improved performance for event series

### v4

- simplified installation and configuration
- new functions `sync()`, `stop()` and `clean()`
- time-based synchronization to overcome race conditions