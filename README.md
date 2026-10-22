# Multimedia Astellas

Proyecto Astro estático para una experiencia interactiva vertical 9:16.

## Desarrollo

Usa Node.js 22.22 o superior y npm. JavaScript se utiliza para la lógica del navegador; Bun no es un requisito. TypeScript permite comprobar los componentes Astro.

```sh
npm ci
npm run dev -- --background
npm run check
npm test
npm run build
npm run build:portable
npm run preview
```

`npm run format` aplica el formato compartido. `npm run format:check` lo verifica.

## Páginas y navegación

Cada visual se construye en una página de Astro con su propio HTML y URL:

- `/`: consentimiento e inicio.
- `/instrucciones/`, `/camara/`, `/evaluando/`: preparación y fotografía.
- `/edad/`, `/frecuencia/`, `/sensaciones/`, `/zonas/`: cuestionario.
- `/resultado/sin-sintomas/`, `/resultado/leves/`, `/resultado/moderados/`, `/resultado/severos/`: resultados prerenderizados con `getStaticPaths`.
- `/mapa/`, `/descarga/`: fotografía y descarga local.
- `/admin/`: registro de partidas.

El `ClientRouter` oficial de Astro controla la navegación, historial y transiciones. No hay un router propio que reemplace pantallas desde plantillas ocultas. Los botones del cuestionario validan respuestas antes de solicitar la navegación a Astro.

La foto y las respuestas permanecen solo en memoria durante la navegación de Astro. Recargar el navegador o entrar directamente a un paso sin los datos necesarios vuelve al inicio. La cámara se detiene al abandonar su página. Los recursos se preparan al inicio y se reutilizan durante el recorrido.

## Estructura

- `src/pages/`: rutas reales y composición de cada página.
- `src/layouts/`: documento HTML y escenario compartido 9:16.
- `src/components/experience/screens/`: marcado Astro de cada visual.
- `src/components/admin/`, `src/components/ui/`: panel y elementos compartidos.
- `src/scripts/experience.js`: validaciones, respuestas e inicialización al navegar con Astro.
- `src/scripts/camera.js`: cámara, cuenta regresiva y captura.
- `src/scripts/photo.js`: renderizado de descarga y exportación de la fotografía.
- `src/scripts/admin*.js`: interacción del panel de registros.
- `src/lib/experience-state.js`: estado efímero de la sesión.
- `src/lib/experience-flow.js`: requisitos de cada paso y elección del resultado.
- `src/lib/vision/`: seguimiento corporal y filtro térmico.
- `src/lib/ui/`: sonidos y animaciones de elementos.
- `src/lib/`: registros, recursos y reglas.
- `src/data/`, `src/styles/`, `public/`: contenido, estilos y recursos.
- `test/`: pruebas de lógica, navegación, geometría y almacenamiento.

## Compilación

`npm run build` genera todas las páginas estáticas en `dist/`, listas para hosting. `npm run build:portable` (o `bun run build:portable`) ejecuta la compilación de Astro y reúne sus 15 páginas, estilos, imágenes, fuentes y modelos en `portable/index.html`. Ese archivo se abre directamente y funciona sin conexión.

La web utiliza las rutas normales de Astro, incluido `/admin/`. En el portable la dirección permanece en `index.html`, sin fragmentos `#`: la ruta se conserva en el estado del historial. Atrás y adelante siguen funcionando. Para abrir el administrador del portable usa **Ctrl + Alt + A**. Los enlaces antiguos con fragmento se aceptan y se limpian automáticamente. `scripts/portable-router.js` es un adaptador exclusivo del exportador; no se importa en la web. Conserva el historial, las transiciones y el estado durante el recorrido.

Para generar el portable se necesita el proyecto y sus dependencias. Para usarlo basta el HTML generado, un navegador compatible y permiso de cámara. Los enlaces externos y el destino del QR siguen necesitando conexión; el QR no entrega fotografías a otros teléfonos.

## Registro local

Cada partida completada guarda fecha, respuestas y resultado en el navegador. No guarda fotografías en el registro ni envía datos a un servidor. Volver al resultado actualiza la misma partida, sin duplicarla. El panel muestra totales y permite exportar un CSV; no tiene contraseña.

Los registros no se transfieren entre dispositivos ni navegadores. Exporta una copia antes de borrar el almacenamiento del navegador.
