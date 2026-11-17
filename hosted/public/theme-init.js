/* Run before the page is painted. This preference contains no account data. */
(function () {
  var preference = "system";
  try {
    var saved = localStorage.getItem("career-finder:appearance:v1");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch { /* Browser storage can be unavailable; CSS follows the device. */ }
  document.documentElement.dataset.appearance = preference;
  if (preference !== "system") document.documentElement.dataset.theme = preference;
  else delete document.documentElement.dataset.theme;
})();
