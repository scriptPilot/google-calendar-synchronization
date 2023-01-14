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
    0,
    // Next days
    21,
    // Correction function, event as input 
    (targetEvent, sourceEvent) => {     
      // In this example, all Work events with title "Holiday" are saved to Family as "Family Time"
      if (sourceEvent.summary === 'Holiday') targetEvent.summary = 'Family Time'
      // In this example, all Work events with title "Secret" are not synchronized to "Family"
      if (sourceEvent.summary === 'Secret') targetEvent.status = 'cancelled'
      // In this example, use allways default calendar color
      targetEvent.colorId = 0
      // Do not forget to return the target event
      return targetEvent
    }
  )
}