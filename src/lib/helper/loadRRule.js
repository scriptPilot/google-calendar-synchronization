// https://github.com/jkbrzt/rrule

function loadRRule() {
  const url = "https://unpkg.com/rrule@2.8.1/dist/es5/rrule.min.js";
  const response = UrlFetchApp.fetch(url);
  const script = response.getContentText();
  eval(script);
  return rrule;
}
