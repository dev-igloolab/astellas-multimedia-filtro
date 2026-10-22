// Estado efímero compartido entre rutas mediante ClientRouter de Astro.
// La fotografía vive solo en memoria; una recarga inicia un nuevo recorrido.
export const state = {
  page: 'intro',
  sessionId: '',
  resultIndex: 0,
  consent: false,
  assetsReady: false,
  assetsError: false,
  assetsLoading: false,
  photo: '',
  thumbnail: '',
  photoReady: false,
  analyzing: false,
  trackingError: '',
  stream: null,
  age: '',
  frequency: '',
  feelings: new Set(),
  zones: new Set(),
};
