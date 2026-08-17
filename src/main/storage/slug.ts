/**
 * Deriva o nome de arquivo/diretório de uma request ou pasta a partir do seu `name` —
 * docs/file-format.md §6, regra 6: o nome do arquivo é derivado, `name` no YAML é a
 * verdade. Colisão entre dois nomes que geram o mesmo slug é resolvida com sufixo
 * numérico, nunca sobrescrevendo o que já existe.
 */

/**
 * Nomes de dispositivo reservados do Windows (case-insensitive, com ou sem extensao) -
 * um slug igual a um destes quebraria a criacao do arquivo/pasta la, entao tratamos
 * como colisao mesmo sem nenhum outro irmao usando o nome (EP-05-T03).
 */
const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/** "Login de usuário" → "login-de-usuario". Nunca vazio — cai em "untitled". */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "untitled";
}

/**
 * Acrescenta `-2`, `-3`, ... ao slug até `exists` devolver `false` para o candidato.
 * `suffix` é a extensão fixa do nome final (`.req.yaml` para requests, `""` para o
 * diretório de uma pasta).
 */
export function uniqueSlugName(
  name: string,
  suffix: string,
  exists: (candidate: string) => boolean,
): string {
  const base = slugify(name);
  // Um slug reservado do Windows nunca é o candidato final, mesmo sem nenhum irmão
  // ocupando o nome — cai direto no mesmo caminho de sufixo numérico de uma colisão.
  let candidate = WINDOWS_RESERVED_NAMES.has(base) ? `${base}-2${suffix}` : `${base}${suffix}`;
  for (let n = WINDOWS_RESERVED_NAMES.has(base) ? 3 : 2; exists(candidate); n++) {
    candidate = `${base}-${n}${suffix}`;
  }
  return candidate;
}
