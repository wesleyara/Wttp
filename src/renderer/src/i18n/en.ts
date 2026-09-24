import { modalsEn } from "./areas/modals.en";
import { requestEn } from "./areas/request.en";
import { responseEn } from "./areas/response.en";
import { storesEn } from "./areas/stores.en";

/**
 * Chaves em inglês (EP-08.1-T06) — fallback de qualquer chave ausente em outro locale
 * (`i18n/index.ts`, `fallbackLocale: "en"`). Agrupadas por área, no mesmo padrão que o
 * backlog descreve (`tabs.*`, `response.*`, `tree.*`, `prefs.*`, `toast.*`).
 */
export const en = {
  ...requestEn,
  ...responseEn,
  ...modalsEn,
  ...storesEn,
  common: {
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    save: "Save",
    create: "Create",
    remove: "Remove",
  },
  theme: {
    system: "System",
    dark: "Dark",
    light: "Light",
  },
  shortcutActions: {
    requestNew: "New request",
    requestSave: "Save",
    requestSend: "Send request",
    tabClose: "Close tab",
    tabNext: "Next tab",
    searchFocus: "Find",
    searchQuickOpen: "Quick open",
    preferencesOpen: "Preferences",
  },
  shell: {
    filterPlaceholder: "Filter…",
    newTooltip: "New…",
    emptyTree: {
      title: "No collections yet",
      description: "Create your first request.",
      newRequest: "New request",
    },
    emptyMain: {
      title: "Nothing open",
      description: "Select or create a request, folder or collection.",
    },
    emptyResponse: {
      title: "No response yet",
      description: "Send a request to see a response.",
    },
  },
  createMenu: {
    newCollection: "New collection",
    newFolder: "New folder",
    newRequest: "New request",
    import: "Import",
  },
  contextMenu: {
    newRequest: "New request",
    newFolder: "New folder",
    settings: "Settings",
    rename: "Rename",
    duplicate: "Duplicate",
    moveTo: "Move to…",
    copyTo: "Copy to…",
    reveal: "Reveal in file explorer",
    delete: "Delete",
  },
  dialog: {
    unsavedChanges: {
      title: "Unsaved changes",
      body: '"{title}" has unsaved changes. Save before closing?',
      discard: "Discard",
    },
    unresolvedVariable: {
      title: "Unresolved variable",
      bodyOne: '"{title}" has unresolved variable: {names}. Send anyway?',
      bodyOther: '"{title}" has unresolved variables: {names}. Send anyway?',
      sendAnyway: "Send anyway",
    },
    deleteConfirm: {
      title: "Delete",
      body: 'Delete "{name}"?',
      alsoRemovesOne: "This also removes 1 item inside it.",
      alsoRemovesOther: "This also removes {count} items inside it.",
      trash: "It moves to the system trash.",
    },
  },
  codegen: {
    copyAsCurl: "Copy as cURL",
    copyAsCurlWithSecrets: "Copy as cURL (with secrets)",
  },
  tabs: {
    closeTab: "Close tab",
    close: "Close",
    closeOthers: "Close others",
    closeAll: "Close all",
  },
  status: {
    noWorkspace: "No workspace",
    switchWorkspace: "Switch workspace",
    activeEnvironment: "Active environment",
    manageEnvironments: "Manage environments",
    manage: "Manage",
    noEnvironment: "No environment",
    responsePanelPosition: "Response panel: {position}",
    theme: "Theme: {theme}",
    documentation: "Documentation",
    jwtTool: "JWT tool",
    preferences: "Preferences",
    scriptPreRequestFailed: "Pre-request script failed",
    scriptTestsFailed: "{failed}/{total} tests failed",
    scriptTestsPassed: "{total} tests passed",
  },
  env: {
    prod: "PROD",
  },
  method: {
    ariaLabel: "HTTP method",
  },
  landing: {
    notWorkspaceTitle: "Not a workspace yet",
    notWorkspaceDescription:
      'Path "{path}" doesn\'t have a wttp.yaml. Initialize it as a new workspace?',
    workspaceNamePlaceholder: "Workspace name",
    initializeHere: "Initialize here",
    chooseDifferentFolder: "Choose a different folder",
    tagline: "Open or create a workspace to get started.",
    openWorkspace: "Open workspace",
    createWorkspace: "Create workspace",
    import: "Import",
    noRootFolder: "No workspaces root folder set",
    setIt: "Set it",
    workspaces: "Workspaces",
    recent: "Recent",
    noYamlYet: "No wttp.yaml yet",
    missing: "Missing",
    remove: "Remove",
    createWorkspaceTitle: "Create workspace",
  },
  command: {
    title: "Quick Open",
    placeholder: "Search requests by name, path or URL, or a command…",
    noMatches: "No matches.",
    commandHint: "Command",
  },
  prefs: {
    sectionsAria: "Preferences sections",
    sections: {
      general: "General",
      workspaces: "Workspaces",
      updates: "Updates",
      shortcuts: "Shortcuts",
      about: "About",
    },
    theme: {
      title: "Theme",
      description: "Applies immediately, no restart needed.",
    },
    language: {
      title: "Language",
      description: "Changes the app's UI language immediately, no restart needed.",
      system: "System",
      en: "English",
      ptBR: "Português (Brasil)",
    },
    restoreDefaults: {
      title: "Restore factory defaults",
      description:
        "Resets every app setting on this screen (theme, language, workspaces root folder, keyboard shortcuts) back to its default. Doesn't touch any workspace or its data.",
      button: "Restore factory defaults",
      confirm: "Click again to confirm",
      cannotUndo: "This can't be undone.",
    },
    workspaces: {
      title: "Workspaces root folder",
      description:
        "Workspaces created without picking a folder, and the workspace switcher on the landing screen, use this folder.",
      notSet: "Not set",
      change: "Change…",
      createdIn: "Workspaces are created in: {dir}/",
      mustSet: "Set this before creating a workspace — new workspaces can't be created without it.",
    },
    updates: {
      autoTitle: "Automatic updates",
      autoDescription:
        "Checks for a new version on startup and periodically in the background, and downloads it silently — installing still waits for you to restart the app or click Update now.",
      on: "On",
      off: "Off",
      statusTitle: "Status",
      checkNowTitle: "Check now",
      checkButton: "Check for updates",
      status: {
        idle: "Not checked yet.",
        checking: "Checking for updates…",
        available: "Version {version} found — downloading…",
        notAvailable: "You're up to date.",
        downloading: "Downloading update… {percent}%",
        downloaded: "Version {version} ready — restart to install.",
        error: "Couldn't check for updates. Will try again automatically.",
        unsupported:
          "Installed from a .deb package — updates come from your package manager (apt/dpkg), not from inside the app.",
      },
    },
    shortcuts: {
      clickToRecord: "Click a shortcut to record a new one.",
      resetAll: "Reset all to default",
      alreadyUsedBy: 'Already used by "{label}"',
    },
    about: {
      version: "Version",
      documentation: "Documentation",
      openDocumentation: "Open documentation",
      offlineDocumentation: "Offline documentation",
      openOfflineDocumentation: "Open bundled docs",
      repository: "Repository",
      openGithub: "Open on GitHub",
    },
  },
};

export type MessageSchema = typeof en;
