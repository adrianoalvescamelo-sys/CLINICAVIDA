/**
 * Download autenticado de arquivos servidos pela API.
 *
 * URLs são montadas same-origin com prefixo /api, espelhando o baseURL do
 * axios client. new URL(relativo, origin) resolve sem lançar "Invalid URL"
 * quando a base é relativa — em prod o nginx serve /api, em dev o Vite faz proxy.
 */
export function apiUrl(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

export function downloadAutenticado(
  url: string,
  token: string,
  filename: string,
): Promise<void> {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    })
    .catch((err) => {
      console.error('Falha no download:', err);
      window.alert('Falha ao gerar/baixar arquivo. Verifique suas permissoes.');
    });
}
