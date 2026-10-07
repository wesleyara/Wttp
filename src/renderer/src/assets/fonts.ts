/**
 * Fontes empacotadas com o app.
 *
 * Nunca por `<link>` para o Google Fonts: o Wttp é desktop e precisa abrir com a rede
 * desligada. Só os pesos que a escala tipográfica do design system usa são importados —
 * cada peso extra é um arquivo woff2 a mais no bundle.
 */

// Inter — texto de UI, labels, corpo.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
// Barlow — títulos e headings.
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
// JetBrains Mono — URLs, bodies, respostas, editor.
import "@fontsource/jetbrains-mono/400.css";
// 700 só para o negrito do terminal embutido — sem ele o navegador sintetiza um.
import "@fontsource/jetbrains-mono/700.css";

// Symbols Nerd Font Mono — ícones de Powerline/Nerd Font do terminal embutido (fallback por glifo).
import "./symbols-nerd-font/symbols-nerd-font.css";
