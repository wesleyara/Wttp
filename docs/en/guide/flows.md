# Flows

A **flow** is a scenario that strings together requests from **any folder** on a canvas: log in, grab the token from the response, use it to create a resource, wait for a job to finish, and follow one path or another depending on the result — all **without writing a script** (and, when you need free-form logic, with a **function** node in JavaScript).

Unlike the [Runner](/en/guide/runner-and-ci), which runs a folder in order and relies on `wttp.setVar` in scripts, a flow declares the data handoff and the decisions — it's visible, runnable with one click and versioned in Git.

[[toc]]

## Step by step: login → create → fetch

This example builds the classic "log in, create a user, fetch the user you created", passing the token and the id between requests.

1. **Create the flow.** In the sidebar's **+** menu, pick **New flow**. It shows up in the **Flows** section below the tree and opens in a tab with an empty canvas.
2. **Bring in the requests.** Drag **Login**, **Create user** and **Get user** from the tree onto the canvas — each one becomes a node. (Alternative: pick the request in the selector at the top and click **Add request**; the new node is connected to the end of the flow.)
3. **Connect the nodes.** Drag from the handle on the right of **Login** to **Create user**, and from **Create user** to **Get user**. The arrows define the order.
4. **Run it once** (the **Run** button). Without mappings the token doesn't reach the next requests yet, but each node lights up and keeps its response — that's what feeds the next step.
5. **Connect the data.** Tick **Data ports**. Each request node now shows, on the left, the `{{variables}}` it uses and, on the right, the fields of the last response. **Drag `data.token` from Login onto `token` on Create user.** Run again: Create user now answers 201 and exposes the `id`. **Drag `id` from Create user onto `user_id` on Get user.**
6. **Run.** All three nodes light up green and the summary says "Flow passed". Click any node to see what was sent and received.
7. **Save** with **Ctrl+S** (or the **Save** button). The flow becomes the file `flows/new-flow.flow.yaml`, ready for `git add`.

To wait for an async job before moving on, see [Poll until](#poll-until); to follow different paths depending on the result, see [Condition](#condition) and [Function](#function).

## The interface

A flow's tab has, from top to bottom:

- **Header**: the flow name (click to rename — the file is renamed with it), the **Unsaved changes** mark, the active environment (the same one as the app's footer), **Data ports**, **Stop at the first failure**, **Save** and **Run**/**Stop**.
- **Palette**: the **Pick a request…** selector with **Add request**, and the buttons that create control nodes: **Condition**, **Poll until**, **Delay** and **Function**.
- **Last run summary**: the result, how many requests passed, the duration and, if it stopped early, why.
- **Canvas**: where nodes and arrows live. **Drag the background** to pan, use the **mouse wheel** to zoom (30% to 180%), and the fit button to frame everything. The zoom buttons are in the bottom-left corner.
- **Node panel**: on the right, it shows the selected node — what it did in the last run and the fields to edit it.

### Resize the node panel

The panel can be widened to fit code (the function) or long conditions. **Drag its left edge** sideways. By keyboard, focus the edge (Tab) and use **←/→** (with **Shift**, bigger steps) or **Home/End** for the minimum and maximum; **double-click** restores the default size. The width you pick is remembered.

### Select, move and remove

Click a node to select it; drag it by its body to move it (positions are saved in the file and snap to a grid). **Delete** removes the selected node (or use the trash can in the panel). To remove a connection, click the arrow and press **Delete**, or use **Disconnect** in the panel. **Start here**, in the panel, sets the node where execution begins (by default, the first one you added).

### Save

Edits live in a draft: the tab and the header show the "unsaved" dot. **Ctrl+S** writes the file; closing the tab with changes asks whether to save or discard. **Run** executes what's on screen, saved or not.

## Connect the nodes

Each node has an **input** handle on the left and one or more **output** handles on the right. Drag from an output to another node — releasing on the input handle or anywhere on the node connects. Each output has **a single destination**: connecting again replaces the previous connection.

The execution order is the path the arrows draw, from the start node. A node with no output connected **ends** the flow. Only the **Condition** (two outputs) and the **Function** (up to ten) split into paths.

## Pass data between requests

A **mapping** takes a piece of a node's response and saves it in a variable that the following nodes read as `{{variable}}`.

**Through the ports** (with **Data ports** ticked): each request's left column lists the `{{variables}}` it uses; the right column lists the fields of the **last known response** — from the last flow run or the request's history (run the flow once to see them). **Drag a field from the right onto another node's variable.** Dashed green lines on the canvas show the existing mappings.

**Through the form** (no mouse): select the request node and use **Mappings** in the panel — choose where to read from (**Body path**, **Header** or **Status**) and the variable name.

| Source        | What to write                      | Example                                  |
| ------------- | ---------------------------------- | ---------------------------------------- |
| **Body path** | an access into the response's JSON | `data.token`, `items[0].id`, `["x-y"].z` |
| **Header**    | the header name (case-insensitive) | `Location`                               |
| **Status**    | nothing — the HTTP status code     | —                                        |

The value becomes text (numbers and booleans as their text, objects and lists as JSON). A mapping that **can't find its value** — missing path, a body that isn't JSON, a missing header — **fails the node** with a message instead of saving an empty variable. The exception is a node whose output goes into a **condition** or a **poll until**: there the warning shows in the result and the condition decides the path (so "if it was created go to A, otherwise B" works even when the error response lacks the field).

Variables only live **during the run**: nothing is written to your environments, collections or files.

## The nodes

### Request

Runs a workspace request exactly like a normal send: auth inherited from the folder, collection variables, pre-request and tests scripts. A node **references** the request — it doesn't copy it — so editing the request applies to every flow that uses it. The same request can appear in several nodes.

- **Output**: one. **Input**: one.
- After running, it shows the status and whether it passed. In the panel: the request sent, the response, the assertions, the variables the mappings saved and the response body.
- A 4xx/5xx response with no assertions **doesn't fail** the node (same rule as the Runner); what fails it is a failing assertion, a network error or a mapping without a value.
- If the request was removed outside the app, the node is flagged with a warning and the flow won't run until you fix it. Renaming or moving the request in the tree updates the flows that cite it.

<a id="condition"></a>

### Condition

Looks at the response of the **last request that ran** and picks one of two paths.

| Field           | Values                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| **Check**       | **Status code**, **Body field**, **Header** or **Assertions passed**                                           |
| **Path / name** | the JSON field (`job.state`) or the header name — body and header only                                         |
| **Operator**    | equals, doesn't equal, is greater than, is at least, is less than, is at most, contains, exists, doesn't exist |
| **Value**       | what to compare (as text; as a number for greater/less) — not shown for "exists"/"doesn't exist"               |

**Assertions passed** holds when the request has at least one assertion and all of them passed.

- **Outputs**: two — the **green** handle (true) and the **red** one (false). A branch with no connection ends the flow there.
- A condition with no request before it fails with a message (there's no response to evaluate).
- Conditions are **structured, never code**: operator + path + value. For free-form logic, use a [Function](#function).

<a id="poll-until"></a>

### Poll until

Re-runs the **request right before it** until a condition matches — the way to wait for an async job to finish. It needs **exactly one** request connected to its input.

| Field                     | Rule                                                   |
| ------------------------- | ------------------------------------------------------ |
| **Condition**             | the same as a Condition node                           |
| **Wait between attempts** | in milliseconds, **minimum 1000**                      |
| **Maximum attempts**      | **required**, 1 to 1000 — the node never waits forever |

The first check uses the response that already exists; if it doesn't match, it waits the interval, re-runs the request and checks again. It ends the **first** time the condition matches (not one call more) and follows its single output. When the limit is reached without a match, the node **fails** with "was not met after N attempts". In the panel, the result shows how many attempts were made.

### Delay

A fixed pause, in milliseconds (0 to 600000, i.e. up to 10 minutes). One input, one output.

<a id="function"></a>

### Function

Write **JavaScript** that decides which output the flow follows — like Node-RED's function node. You choose **how many outputs** it has (1 to 10); each one is a numbered handle on the node that you connect to a node. Reducing the number of outputs removes the connections of the ones that no longer exist.

The code is a **function body** and can see:

| Name                                | What it is                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `res`                               | the last request's response (`status`, `headers`, `body`, `json`), or `undefined` if none has run yet |
| `vars`                              | the flow's variables — what you write here becomes `{{name}}` in the next requests, with no mapping   |
| `wttp`, `test`, `expect`, `console` | as in a [request script](/en/guide/scripts) (`console.log` shows up in the node's panel)              |

```js
console.log("status", res.status);
vars.token = res.json.data.token; // becomes {{token}} further on
if (res.status === 201) return 1; // follow output 1
return 2; // ...or output 2
```

What the code **returns** picks the path:

| Return                                         | Effect                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| a number `N` (1 to the output count)           | follows output `N`                                                           |
| an array like `[null, x]`                      | Node-RED style: follows the **first** position that isn't `null`/`undefined` |
| nothing, `null` or `undefined`                 | no output — the flow **ends there**, without an error                        |
| anything else, or an output that doesn't exist | the node **fails** with a message, and the flow stops                        |

The code runs **isolated**, in a separate process with a timeout (the same as request scripts, the workspace's `scriptTimeout`): it has no access to `require`, `process` or the file system. An exception, a syntax error or a timeout fails the node, and the flow stops even without **Stop at the first failure** — no output was chosen, so there's nowhere to go. Variables written up to the point of the failure are kept. In the panel you edit the code in an editor with autocomplete (`res`, `vars`, `wttp`, `console` and shortcuts for common patterns).

The full API reference is in [Scripting API](/en/guide/scripting-api).

## Run

**Run** executes what's on screen in the **active environment** (its name shows in the header). Each node lights up as it runs: **pending** → **running** → **ok** or **failed**; the arrows taken are highlighted and the branch not taken is dimmed. The summary at the top shows the result, how many requests passed and the duration.

- **Stop** interrupts: it aborts the request in flight and runs nothing more.
- **Stop at the first failure** (on by default): the flow stops at the first failing request — the following nodes usually depend on it. Off, it keeps following the path even after a failure.
- **Click a node** to see, in the panel, the request sent, the response, the assertions, the console, the variables it saved and, for a poll until, the attempts.
- While it runs, the canvas is locked for editing.

### Before it runs

Wttp validates the flow before sending anything. A request node whose request no longer exists, or a **poll until** without a request right before it, prevents the run with a message pointing at the node.

### Limits

| What                     | Limit                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steps per run            | **100** (every node that runs counts, and so does every poll repetition). When exceeded, the flow stops with a message — it protects against infinite loops. Change it with `maxSteps` in the file (up to 1000). |
| Outputs of a function    | 1 to 10                                                                                                                                                                                                          |
| Attempts of a poll until | 1 to 1000, minimum interval of 1 s                                                                                                                                                                               |
| Delay                    | up to 600000 ms                                                                                                                                                                                                  |

A flow **can have loops** (connect a node back to an earlier one, for example in a "try again" branch); the step limit guarantees it always ends.

## Keyboard

Each node takes focus with **Tab** and becomes selected. With it focused:

| Key                        | Action                       |
| -------------------------- | ---------------------------- |
| **Shift + arrows**         | moves the node (steps of 20) |
| **Delete** / **Backspace** | removes the node             |

Conditions, poll until, delay, function and mappings have a form in the panel — **nothing requires a mouse**. The panel's edge is focusable too (see [Resize the node panel](#resize-the-node-panel)).

## The file

Flows live in `flows/<name>.flow.yaml`, versioned with the rest of the workspace, and you can edit them by hand:

```yaml
wttp: 2
name: Create or recover
nodes:
  - { id: login, type: request, request: auth/login.req.yaml, x: 0, y: 0 }
  - { id: create, type: request, request: users/create.req.yaml, x: 280, y: 0 }
  - { id: created, type: condition, when: { source: status, op: eq, value: "201" }, x: 560, y: 0 }
  - id: route
    type: function
    outputs: 2
    code: |
      if (res.status === 409) return 1;
      return 2;
    x: 840
    y: 100
edges:
  - { from: login, to: create }
  - { from: create, to: created }
  - { from: created, to: route, when: false }
mappings:
  - { from: login.res.body.data.token, to: token }
```

A **function** node is written in block style, with `code` as a `|` literal, so the diff stays readable. Flows created in earlier versions (a linear list of requests) open normally and are migrated to this format when you save. The full specification is in Wttp's file format (section 10).

## Troubleshooting

**"The flow has no nodes"** — the flow is empty. Drag a request from the tree onto the canvas (the **Run** button stays disabled while there are no nodes).

**The node has a warning triangle and the flow won't run** — the request it references was removed or is invalid. Remove the node or restore the request.

**The output ports say "run it to see fields"** — there's no known response for that request yet. Run the flow once (or send the request on its own, which records it in the history).

**A mapping failed** — see the message in the node's panel: a path missing from the response, a body that isn't JSON or a missing header.

**The flow stopped with "Stopped at the step limit"** — it probably has a loop that never exits. Check the connections, or raise `maxSteps` in the file if the loop is intentional.

**A function failed with "chose output N, but this node has M outputs"** — the code returned an output the node doesn't have. Increase the number of outputs or fix the `return`.

Parallel branches, sub-flows and `wttp run` for flows come later.
