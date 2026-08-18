import lucide from "@iconify-json/lucide/icons.json";
/**
 * Registra o conjunto de ícones Lucide localmente via `addCollection`, para que `WIcon`
 * resolva `lucide:*` sem rede — o Wttp é desktop e precisa abrir offline.
 */
import { addCollection } from "@iconify/vue";

addCollection(lucide);
