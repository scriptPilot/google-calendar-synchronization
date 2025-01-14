// This function reset the script
// Run it after changing the onCalendarUpdate function

function resetScript() {
  PropertiesService.getUserProperties().deleteAllProperties();
  console.log("Script reset done.");
}
