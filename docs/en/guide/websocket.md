# WebSocket connections

A WebSocket request keeps a connection open with the server: send messages whenever you want
and see everything that arrives, live. Use it to debug chat, notifications, price feeds and any
API that speaks `ws://` or `wss://`.

## Create and connect

In the tree's **+** menu (or a folder's context menu) choose **New WebSocket**. The request
shows up in the tree with a **WS** label in place of the HTTP method.

1. Type the URL (`wss://example.com/socket`). `{{variables}}` work as in an HTTP request.
2. Click **Connect** (or `Ctrl+Enter` in the URL bar). The indicator next to it reads
   *Connecting…*, *Connected*, *Reconnecting…* or *Disconnected*.
3. Type a message in the box below and click **Send** (`Ctrl+Enter`).

Closing the tab ends the connection.

## What you can configure

- **Params, Headers and Auth** work as in an HTTP request and go in the connection handshake.
  Bearer, Basic and API key (header or query) are applied the same way, including folder and
  collection inheritance. A hand-written `Authorization` header wins over the Auth tab.
- **Connection**:
  - **Subprotocols**: comma-separated, in order of preference (`Sec-WebSocket-Protocol`). The one
    the server picked appears in the history.
  - **Reconnect automatically**, with **max attempts** (`0` = no limit) and the **delay between
    attempts**.

::: tip Reconnect is for unexpected drops only
If the network drops or the server closes the connection, Wttp tries again as configured.
**Disconnect** never reconnects. A connection that comes back resets the attempt count.
:::

An unresolved variable blocks the connection and the warning names them, as with an HTTP send.

## Messages

The right-hand panel is the session history: sent (↗) and received (↙) messages, plus
connection events (connected, dropped, reconnecting, error). Each line shows the time, the size in
bytes and a copy button; click a line to expand long messages.

- **Filters**: *All*, *Sent* or *Received*, plus a text search. Connection events always show.
- **Format**: *Text* sends as is. *JSON* validates before sending (red field when invalid) and
  sends it compact.
- Received binary messages show as text when they are valid UTF-8, or as a hex dump.
- The history keeps the last 5000 lines. **Clear** empties it.

## What goes to the file

The request is a `.req.yaml` with `protocol: websocket`: URL, query, headers, auth,
subprotocols, reconnect settings and the message draft (the composer's text and format).
**The message history is not saved**; it only exists during the session. The file is readable
text and versions in Git like any other request ([versioning](/en/guide/versioning)).

## Limits

- WebSocket requests are **left out of the Runner and the CLI** (`wttp run`): a persistent
  connection isn't a request/response pair that can be repeated and tested in batch.
- There are no scripts or body in a WebSocket request.
- TLS certificate verification follows the system's (the "validate TLS" option of HTTP requests
  doesn't apply).
