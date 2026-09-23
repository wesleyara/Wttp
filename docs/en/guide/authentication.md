# Authentication and inheritance

The **Auth** tab exists at three levels: **request**, **folder** and **collection**. For
folders and collections, open it from the context menu → **Edit auth**.

## Types

| Type                    | What it sends                                                             |
| ----------------------- | ------------------------------------------------------------------------- |
| **None**                | Nothing — and it **cuts inheritance**: no auth from levels above applies. |
| **Inherit from parent** | Uses the auth of the level above (the default).                           |
| **Bearer**              | `Authorization: Bearer <token>`                                           |
| **Basic**               | `Authorization: Basic <base64(user:password)>` (UTF-8)                    |
| **API Key**             | A header or query param of your choice.                                   |

Fields accept `{{variables}}` — the usual approach is to keep the token in an environment
(as a secret `{{token}}`) and reference it here. Sensitive fields are masked, with a
reveal button per field.

## How inheritance resolves

From the inside out: request → folder → parent folder → … → collection. The **first layer
that isn't `inherit`** decides. If none defines anything, the request goes out with no
auth — no error. In **Inherit from parent** mode the tab shows where the effective auth comes from,
and the request's **Auth** tab carries a badge with the effective type, with a warning if
it depends on a variable with no value.

An `Authorization` header typed by hand in the **Headers** tab takes priority over the
configured auth.
