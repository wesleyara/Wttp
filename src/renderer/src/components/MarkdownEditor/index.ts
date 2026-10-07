import "md-editor-v3/lib/style.css";

import "./styles/markdown-editor.css";
import MarkdownEditor from "./components/MarkdownEditor.vue";
import MarkdownEditorImageLightbox from "./components/MarkdownEditorImageLightbox.vue";
import MarkdownView from "./components/MarkdownView.vue";
import { setupMarkdownEditor } from "./utils/setup";

export { MarkdownEditor, MarkdownView, MarkdownEditorImageLightbox, setupMarkdownEditor };
export * as markdownToolbar from "./utils/markdown-toolbar";
export { defineToolbarPlugin, isToolbarMenu } from "./utils/toolbar";
export * from "./plugins";

export type * from "./models/markdown-editor.models";
export type * from "./models/markdown-view.models";
export type * from "./models/markdown-editor-image-lightbox.models";
export type * from "./models/markdown-toolbar.models";
export type * from "./models/markdown-editor-plugins.models";
