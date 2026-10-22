# Multimedia Astellas

Experiencia Astro 9:16 con descarga de fotografías mediante QR. Requiere un servidor Node.js y un Space privado de DigitalOcean; ya no funciona como archivo HTML portable.

## Desarrollo

Usa Node.js 22.22 o superior. Copia `.env.example` a `.env` y configura las credenciales de un Space de prueba.

```sh
npm ci
npm run dev -- --background
npm run check
npm test
npm run build
```

## Despliegue en DigitalOcean

En App Platform, despliega el repositorio como servicio web Node.js con comando de compilación `npm ci && npm run build` y comando de ejecución `node ./dist/server/entry.mjs`. Define estas variables como secretos del servicio:

| Variable        | Valor                                                           |
| --------------- | --------------------------------------------------------------- |
| `SPACES_REGION` | Región del Space, por ejemplo `nyc3`                            |
| `SPACES_BUCKET` | Nombre del Space                                                |
| `SPACES_KEY`    | Access key con permiso de lectura, escritura, listado y borrado |
| `SPACES_SECRET` | Secret key correspondiente                                      |

El Space debe permanecer **privado**. El sitio sirve las imágenes mediante `/api/fotos/[id]`; no expone las claves ni URLs públicas de Spaces. La URL del QR se construye con el dominio donde se abre la experiencia, así que ese dominio debe tener HTTPS y ser accesible desde el teléfono que escanea.

Al llegar a `/descarga/`, el navegador compone la foto final en 1080 × 1920, la codifica como WebP de alta calidad (0,94) y la sube automáticamente. El QR se muestra solo después de que Spaces confirma la subida. Si falla, aparece un botón para reintentar; la descarga directa del navegador sigue disponible. El QR abre `/foto/[id]/`, donde se puede ver y descargar la imagen.

Cada imagen queda en `photos/` con un identificador aleatorio. Las rutas dejan de servirla a las 48 horas. El servidor borra los objetos vencidos al iniciar, cada hora mientras está activo y cuando alguien intenta abrir una foto vencida. La regla de ciclo de vida del Space elimina los objetos del prefijo `photos/` después de 2 días, incluso si el servicio está apagado. La regla ya se configuró en `igloosuite`; para otro Space, ejecuta `node --env-file=.env scripts/configure-spaces-lifecycle.mjs`. El script conserva las demás reglas del Space.

Para verificar un Space y el recorrido HTTP sin dejar una imagen de prueba, ejecuta `node --env-file=.env scripts/verify-spaces.mjs` y, con el servidor en `http://localhost:4322`, `node --env-file=.env scripts/verify-photo-flow.mjs`.

## Recorrido

La experiencia tiene páginas para consentimiento, captura, cuestionario, resultados, mapa de calor y descarga. El `ClientRouter` de Astro conserva la navegación del recorrido. La foto original y las respuestas permanecen en memoria durante esa navegación; recargar una página interna vuelve al inicio. Solo se sube a Spaces la imagen final con el mapa de calor. El registro de `/admin/` sigue guardando respuestas y resultados únicamente en el navegador local, sin fotografías.

## Archivos principales

- `src/scripts/photo.js`: composición, optimización, subida, QR y descarga local.
- `src/lib/photo-store.mjs`: acceso privado a Spaces y caducidad.
- `src/pages/api/fotos/`: rutas de subida y lectura de imágenes.
- `src/pages/foto/[id].astro`: página móvil a la que apunta el QR.
