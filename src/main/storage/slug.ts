/**
 * Deriva o nome de arquivo/diretório de uma request ou pasta a partir do seu `name` —
 * docs/file-format.md §6, regra 6: o nome do arquivo é derivado, `name` no YAML é a
 * verdade. Colisão entre dois nomes que geram o mesmo slug é resolvida com sufixo
 * numérico, nunca sobrescrevendo o que já existe.
 */

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
  let candidate = `${base}${suffix}`;
  for (let n = 2; exists(candidate); n++) {
    candidate = `${base}-${n}${suffix}`;
  }
  return candidate;
}
