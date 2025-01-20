// https://moment.github.io/luxon/

function loadDateTime() {
  const url = "https://moment.github.io/luxon/global/luxon.min.js";
  const response = UrlFetchApp.fetch(url);
  const script = response.getContentText();
  eval(script);
  return luxon.DateTime;
}
