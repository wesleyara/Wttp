import { promises as fs } from "fs";
import { join } from "path";

/**
 * Leitura/escrita de um JSON de configuração do app — estado de UI e settings (EP-02),
 * não o workspace do usuário (`storage/`, EP-04). Recebe o diretório explicitamente
 * (em vez de chamar `app.getPath` aqui) para ficar testável sem subir o Electron —
 * ver `appDataDir.ts` para o glue que resolve o diretório real.
 *
 * Arquivo ausente é o estado normal na primeira execução: devolve `fallback`, nunca
 * lança. Qualquer outro erro de leitura (JSON corrompido, permissão) também cai no
 * fallback — perder uma preferência de UI não pode impedir o app de abrir.
 */
export async function readJsonFile<T>(dir: string, fileName: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(join(dir, fileName), "utf-8");
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export async function writeJsonFile<T>(dir: string, fileName: string, data: T): Promise<void> {
  await fs.writeFile(join(dir, fileName), JSON.stringify(data, null, 2), "utf-8");
}
