// Retry an API call with exponential backoff in case of rate limit errors
// https://developers.google.com/calendar/api/guides/handle-errors

function retryOnRateLimit(action) {
  const maxAttempts = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      return action();
    } catch (err) {
      const isRateLimitError =
        /rate limit|rateLimitExceeded|quota|backend error/i.test(
          err.message || "",
        );
      if (!isRateLimitError || attempt >= maxAttempts) throw err;
      Utilities.sleep(2 ** (attempt - 1) * 1000);
    }
  }
}
