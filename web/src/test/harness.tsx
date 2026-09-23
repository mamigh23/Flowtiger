  // mock.calls[i][1] üzerinden gönderilen gövdeyi tipli okuyabilir.
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const [path] = url.split('?');

    // En uzun eşleşen kalıbı seç: ör. /profile/sessions/12,
    // /profile/sessions kalıbından önce eşleşmelidir. Böylece daha genel
    // bir mock endpoint, daha spesifik endpointi gölgelemez.
    const match = Object.entries(routes)
      .filter(([pattern]) => path?.endsWith(pattern))
      .sort(([left], [right]) => right.length - left.length)[0];

    if (match) return match[1](init, url);

    return jsonResponse(404, { message: `Taklit edilmemiş uç: ${url}` });
  });
}

/** Bir isteğin JSON gövdesini tipli okur. */
export function bodyOf(init: RequestInit | undefined): unknown {
  const body = init?.body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

/**
 * Uygulamayı belirli bir yolda, isteğe bağlı token ve router state'i ile açar.
 *
 * `state`: React Router'ın konum state'i. Gerçek uygulamada oraya
 * `ProtectedRoute` yazıyor ("giriş sonrası buraya dön"); testte de aynı
 * şekilde kurulabilmesi gerekiyor, aksi halde giriş sonrası yönlendirme