export const responseEn = {
  response: {
    tabs: {
      error: "Error",
      body: "Response",
      headers: "Headers",
      cookies: "Cookies",
      history: "History",
      tests: "Tests",
    },
    view: { pretty: "Pretty", raw: "Raw", preview: "Preview" },
    filter: {
      open: "Filter with JSONPath (Ctrl+F)",
      jsonOnly: "JSONPath filtering works on JSON responses only",
      placeholder: "$.data.items[*].id",
      clear: "Clear filter",
      matchesOne: "1 match",
      matchesOther: "{count} matches",
      syntaxError: "Invalid JSONPath at position {position}: {message}",
      invalidJson:
        "The response body isn't valid JSON (it may be truncated), so it can't be filtered",
    },
    preRequestFailed: "Pre-request script failed ({source}) — request not sent",
    empty: {
      title: "No response yet",
      description: "Send a request to see the response here.",
    },
    sending: { title: "Sending request…", description: "Waiting for a response." },
    historyFallback: "No response sent this session yet — showing the last one from history.",
    truncated: "Showing the first {shown} of {total} — use Save to get the full response.",
    previewAlt: "Response preview",
    htmlPreviewTitle: "Response HTML preview",
    binary: {
      title: "Binary content",
      description: "This response isn't text — use Save to write it to a file.",
    },
    noCookies: { title: "No cookies", description: "This response set no cookies." },
    timing: {
      dns: "DNS: {value}",
      connect: "Connect: {value}",
      tls: "TLS: {value}",
      ttfb: "TTFB: {value}",
      download: "Download: {value}",
      total: "Total: {value}",
    },
    copyBody: "Copy body",
    saveToFile: "Save response to file",
    errorBadge: "error",
    errors: {
      DNS_ERROR: "Could not resolve the host. Check the URL and your network connection.",
      TLS_ERROR:
        "The TLS/SSL handshake failed. The certificate may be invalid or self-signed — check the workspace's validateTls setting.",
      TIMEOUT:
        "The request timed out. The server may be slow or unreachable — try increasing the timeout in the request settings.",
      CANCELLED: "The request was cancelled.",
      CONNECTION_REFUSED:
        "The connection was refused. Check that the host and port are correct and the server is running.",
      REQUEST_FAILED: "The request failed. See the detail below for more information.",
      UNKNOWN: "An unexpected error occurred while sending the request.",
    },
  },
  history: {
    empty: {
      title: "No history yet",
      description: "Send this request to start building its history.",
    },
    clear: "Clear history",
    back: "Back",
    bodyTruncated: "This entry's body was truncated before being saved to history.",
    binary: {
      title: "Binary content",
      description: "This response isn't text — not shown in history.",
    },
  },
  scriptResults: {
    preRequestFailed: "Pre-request script failed ({source})",
    notSent: "The request was not sent.",
    empty: {
      title: "No test scripts",
      description: "This request has no test scripts defined.",
    },
    assertions: "Assertions — {passed}/{total} passed",
    console: "Console",
  },
};
