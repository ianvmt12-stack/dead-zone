# DEAD ZONE

Juego 3D de supervivencia contra hordas de zombies, directamente en el navegador.
Construido con **Three.js** + **Vite**. Sin servidor, sin assets externos: el audio
se sintetiza con WebAudio y los modelos son geometría procedural.

---

## Cómo jugar

| Acción | Tecla |
| --- | --- |
| Moverse | `W` `A` `S` `D` |
| Mirar | Ratón |
| Disparar | Clic izquierdo |
| Recargar | `R` |
| Correr | `Shift` |
| Saltar | `Espacio` |
| Cambiar de arma | `1` – `5` |
| Tienda (entre oleadas) | `B` |
| Pausa | `Esc` |

En móvil aparecen automáticamente un joystick virtual y botones táctiles.

### El bucle

1. Sobrevives a una oleada. Cada baja da puntos (10 un caminante, 18 un corredor,
   45 un bruto).
2. Al superarla se abre la **tienda** durante **25 segundos**: munición y salud se
   recargan gratis, y con los puntos puedes comprar armas o mejorar la que tengas.
3. Cada arma admite **3 niveles** de mejora, y cada nivel sube **daño, cadencia
   y cargador**. El panel muestra la comparación `actual → siguiente` antes de comprar.
4. La siguiente oleada es más numerosa y sus zombies son más resistentes.

### Armas

| Arma | Precio | Daño | Cadencia | Cargador | Notas |
| --- | --- | --- | --- | --- | --- |
| Pistola | — | 26 | 3,3/s | 12 | Semiautomática |
| Escopeta | 520 | 15 ×9 perdigones | 1,3/s | 6 | Letal de cerca |
| Subfusil | 1.050 | 16 | 13,9/s | 32 | Automática |
| Fusil | 2.200 | 36 | 9,5/s | 30 | Equilibrada |
| Minigun | 4.200 | 21 | 23,8/s | 180 | Destructor |

Los disparos a la cabeza hacen **×2,1** de daño.

---

## Puesta en marcha

```bash
npm install
npm run dev        # servidor de desarrollo en http://localhost:5173
npm test           # 33 tests de la lógica de juego y de la tienda
npm run build      # genera dist/
npm run preview    # sirve dist/ para comprobar el build
```

### Parámetros de depuración

- `?shop=1` — abre la tienda con 5.000 puntos al empezar.
- `?god=1` — desactiva el daño recibido.

---

## Despliegue en Render

El juego es **100 % cliente**, así que en Render se despliega como **sitio estático**
(no hace falta un web service, y no cuesta dinero).

1. Sube el proyecto a un repositorio de GitHub.
2. En Render: **New → Static Site**.
3. Configura:
   - **Build Command**: `npm ci && npm run build`
   - **Publish Path**: `dist`
4. Render sirve por defecto en `https://tu-juego.onrender.com`.

También puedes dejar que Render lea el [`render.yaml`](./render.yaml) que ya incluye
esta configuración.

### Notas importantes para producción

- **HTTPS es obligatorio**: la Pointer Lock API (captura del ratón) solo funciona en
  contexto seguro. Render lo sirve con HTTPS automáticamente. Si pruebas en local
  por red, ve a `localhost`; si no, el juego avisa y permite jugar con el ratón libre.
- **Rutas relativas**: `vite.config.js` usa `base: './'`, así que el build funciona
  igual en la raíz del dominio o en un subdirectorio.
- **Sin WebGL**: si el navegador no lo soporta, se muestra un aviso en vez de un
  pantallazo negro.

---

## Estructura

```
src/
  main.js                  arranque, bucle de juego y máquina de estados
  config.js                TODO el balanceo: armas, zombies, oleadas, precios
  core/
    input.js               teclado + ratón + Pointer Lock (y modo alternativo)
    touch.js               joystick y botones para móvil
    audio.js               efectos sintetizados con WebAudio
    math.js                utilidades
  world/
    arena.js               suelo, muros, props, luces, niebla
    collision.js           círculo-AABB, ray-AABB, ray-cilindro
  entities/
    player.js              movimiento en primera persona, vida, regeneración
    zombieManager.js       IA de la horda + render instanciado
    weaponModel.js         modelo del arma en primera persona
    effects.js             sangre, impactos, números de daño
  systems/
    arsenal.js             inventario, puntos, mejoras, munición
    combat.js              disparo, recarga, daño
    director.js            oleadas e intervalo de 25 s
  ui/
    hud.js                 salud, puntos, oleada, munición, avisos
    shop.js                tienda de campo
    screens.js             menú, pausa, fin de partida
tests/                     tests de lógica y de la tienda (jsdom)
```

### Rendimiento

Los zombies se dibujan con 4 `InstancedMesh` (cuerpo, cabeza y dos brazos), así que
90 enemigos cuestan **4 draw calls** en lugar de 360. Los efectos usan pools de tamaño
fijo para no generar basura por frame. El arma se renderiza en una escena aparte con
`clearDepth`, por lo que nunca atraviesa las paredes.