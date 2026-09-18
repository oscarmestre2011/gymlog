# Pendientes

Ultima revision: 16 de septiembre de 2026, con la version **1.1.0** publicada.

---

## Hecho

- ✅ **Altura de las medidas.** Ya no viene puesta: cada persona pone la suya. Sin altura, la
  app NO calcula el IMC ni el indicador cintura/altura, y pide la altura donde hace falta
  (pantalla de medidas y Ajustes). Se quitaron tambien los valores de ejemplo que eran suyos.
- ✅ **Aviso de «version nueva».** Arreglado. Eran DOS causas, no una:
  1. la app pedia `index.html` para comparar, pero el service worker le devolvia su copia
     guardada, asi que se comparaba consigo misma;
  2. y la clave de cache del service worker **borraba** lo que va despues de la interrogacion,
     de modo que el parametro que se anadio para evitar la copia tampoco servia.
  Se corrigieron las dos (clave de cache con el parametro incluido, cache a la v7) y hay
  pruebas: una unitaria de la clave de cache y otra que levanta la version anterior de verdad
  (`npm run test:versiones`).
- ✅ **Registro de actualizaciones.** Fuente unica en `src/lib/changelog.ts`, con 18 versiones
  reconstruidas desde el historial de git. Se ve en la pantalla de **Novedades** (desde el
  aviso de actualizacion), en **Ajustes** y en **CHANGELOG.md**, que se genera con
  `npm run changelog`. Hay una prueba que avisa si al publicar una version se olvida anotarla.
- ✅ **Copia automatica en una carpeta** (Android). Se elige la carpeta una vez y la app guarda
  ahi sola, con el nombre del dia. En iPhone no existe esa funcion y la app lo explica.
  Limitacion conocida: que la carpeta se recuerde entre visitas solo se puede comprobar en un
  movil de verdad, porque una carpeta simulada no se puede guardar en la base de datos.

---

## Reglas aprendidas (para no repetir fallos)

- **Un `useMemo` (o cualquier hook) NUNCA despues de un `return` temprano.** Rompe la pantalla
  entera con el error 310 de React. Paso de verdad en Progresion: se caia completa al abrirla
  despues de entrenar. Hay una prueba que lo vigila: `src/screens/hooks.test.tsx`, y se comprobo
  que de verdad lo pilla.
- **Nada de nombres escritos a mano en las pruebas** (versiones, nombres de cache): caducan y dan
  fallos que parecen de la app. Ya paso con `gymlog-v6` y con el numero de version.
- **Ojo con los textos que se repiten en varios botones.** Ya ha pasado tres veces (dos "Cada mes",
  dos "Ajustes", y "←" frente a "Volver"): las pruebas tienen que acotar el selector (por ejemplo
  `.nav button`), y si dos botones hacen cosas distintas, se les pone nombre distinto.
- **Un reemplazo de texto que no encuentra su ancla FALLA EN SILENCIO.** Es el fallo que mas veces
  se ha colado: los estilos de la ayuda, los del plan de la semana, los del grafico de grupos y los
  subtitulos, todos "anadidos con exito" segun el comando, y ninguno llego al archivo. La pantalla de
  ayuda se dibujo entera con los estilos del navegador (texto subrayado y dificil de leer) y el
  usuario lo vio en su movil.
  Solucion: los bloques de CSS nuevos se anaden AL FINAL del archivo (sin ancla) y despues se
  COMPRUEBA que estan. Ademas hay una prueba automatica (`npm run check:css`) que compara las clases
  que usa el codigo con las que tienen estilo: si falta alguna, falla.
- **Comprobar que un cambio se ha aplicado, no que el comando no dio error.** Vale para el CSS, para
  el codigo y para cualquier edicion.
- **Los errores no se tiran a la basura.** Si algo falla, se dice QUE ha fallado. El fallo de la
  carpeta de copias estuvo escondido por un mensaje generico.
- **Una prueba que da por hecho el dia de la semana se rompe sola.** Paso el jueves 17-09-2026, con
  dos pruebas a la vez: la de humo exigia un boton "Empezar" en Inicio (que solo existe si hoy toca
  entrenar, y las rutinas sembradas estan en lunes, miercoles y viernes) y la de planificacion
  movia UNA rutina para dejar el dia vacio, sin acordarse de que otra ya estaba puesta ese dia.
  En los dos casos la app hacia lo correcto y el fallo era de la prueba.
  Solucion: las pruebas de "hoy" tienen que valerse de la fecha real (`new Date().getDay()`) y
  cubrir los DOS casos (toca / no toca); y para probar "no toca hoy" hay que vaciar la semana
  ENTERA, no una rutina suelta.
- **La web de presentacion no puede prometer lo que la app no hace.** La primera version decia
  "avisa con sonido" sin el limite de iPhone, y hablaba de la copia en carpeta sin decir que es
  solo de Android. Por eso los textos de la web salen de la app (`npm run web`) y hay una prueba
  (`src/lib/kairos.test.ts`) que falla si se promete sonido sin avisar del limite en iPhone.
- **Cuidado con las imagenes de las pruebas visuales.** Al capturar una pagina entera, las capturas
  con `loading="lazy"` que quedan lejos de la pantalla salen como marcos negros vacios, y con la
  cabecera fija capturada a mitad de pagina si no se vuelve arriba antes. Las dos cosas parecen
  fallos de la web y son de la captura.
- **Un `<a class="btn">` NO se ve como un boton.** `.btn` esta pensado para `<button>`: en un enlace
  el navegador pinta el texto azul y subrayado. Paso con los botones de donacion de Ajustes, que
  salieron azules y subrayados en medio de la pantalla. Arreglado con una regla `a.btn` y, sobre
  todo, con una comprobacion que MIDE el color y el subrayado (`scripts/test-apoyo.mjs`), porque
  las comprobaciones de "el elemento existe" y "el texto es correcto" no lo pillaron: se vio
  mirando la captura.
- **Los enlaces que se reescriben con JavaScript pueden pisarse entre ellos.** En la web, una
  funcion que ponia el enlace de donacion del pie reescribia TAMBIEN los botones de cantidad, y los
  cuatro acabaron sin importe. Lo cazo una comprobacion que mira que cada enlace lleve su cantidad.
- **La carpeta donde se compila una app NO es decorativa: los archivos la llevan dentro.** Al mudar
  la app al dominio propio se cambio `GYMLOG_BASE` de `/gymlog/` a `/app/` creyendo que era solo una
  ruta. El HTML publicado paso a pedir `/app/assets/index-x.js` mientras GitHub seguia sirviendo
  `/gymlog/`: **la app publicada se quedo en blanco** y no se noto hasta comprobar la direccion real.
  Regla: si se toca la carpeta de compilacion, hay que comprobar la direccion PUBLICADA (que el
  archivo que pide el HTML exista de verdad), no solo que el despliegue diga "success".
- **Un despliegue puede publicar un artefacto viejo si se lanzan dos seguidos.** Al publicar la web
  con la app copiada, GitHub publico el artefacto del despliegue anterior y `/app/` no aparecia
  (404) aunque los registros demostraban que los archivos SI iban dentro. Se arreglo lanzando el
  flujo otra vez. Cuando algo "deberia estar" y no esta, antes de tocar codigo: volver a lanzar.
- **`git checkout -- archivo` NO deshace tu ultimo cambio: lo restaura al ultimo commit** (que es
  donde ya estaba el cambio malo). Paso al intentar revertir la carpeta de compilacion. Para
  revertir de verdad hay que editar el archivo, o `git revert`.
- **GitHub Pages puede estar publicando DOS cosas a la vez.** El repositorio de la web tenia
  `build_type: legacy`, es decir, publicando la RAMA `main` ademas de mi flujo. Como la carpeta de
  la app se genera al publicar (y esta en el `.gitignore`), esa publicacion salia SIN la app y
  PISABA la de mi flujo: `kairosentrena.com/app` aparecia y desaparecia, y costo tres rondas de
  buscar el fallo en el sitio equivocado. Se comprueba con la API (`pages.build_type` debe ser
  `workflow`) y el flujo ahora se verifica a si mismo antes y despues de publicar.
- **Una red con filtro puede interceptar el HTTPS y hacer creer que tu web esta rota.** Desde la red
  del colegio, `kairosentrena.com` llegaba con un certificado emitido por la GVA en vez del de
  GitHub: todas las peticiones fallaban y la herramienta decia "la web no responde". La web estaba
  perfecta. Ahora el verificador mira el emisor del certificado y avisa de que el fallo es de la
  red. Regla: cuando todo falla de golpe, comprobar la RED antes que el codigo (mirar el emisor del
  certificado, o probar desde otro sitio).

## Pendiente

### 1. Revisar el historial de versiones

De la 1.0.0 a la 1.0.12 esta reconstruido desde los mensajes de commit, no de un registro que
se llevara entonces. Conviene leerlo en la app (Ajustes → Novedades) y corregir lo que no
cuadre: quien lo vivio recuerda que le molestaba, y los commits no lo dicen.

### 2. Repasar si queda algun dato personal puesto por defecto

Se corrigio la altura, que era el caso grave. Merece un repaso el resto: pesos de ejemplo en
formularios, rutinas de ejemplo, textos que den por hecho algo del usuario. La regla: la app la
usa mas gente, asi que no debe traer nada de nadie puesto.

### 3. Probar la carpeta de copias en un movil Android de verdad

El usuario la probo y encontro un fallo real: **se elegia la carpeta pero no guardaba**. Causa:
al ir a escribir, el navegador ya no tenia el permiso concedido y la app se retiraba sin pedirlo.
Arreglado: ahora pide el permiso al elegir la carpeta y otra vez al guardar, reintenta una vez si
el navegador lo retira en ese momento, y si algo falla dice QUE ha fallado (permiso, carpeta
perdida, sin espacio) en lugar de un mensaje generico.

Queda pendiente comprobar en el movil, ya con el arreglo:
- que la copia se guarde al pulsar «Comprobar y guardar ahora»;
- si el permiso se pierde al cerrar del todo el navegador (es lo normal en movil), que al pulsar
  el boton se vuelva a pedir y funcione;
- que la copia automatica se haga sola cuando toque (semanal, quincenal o mensual).

### 4. Cuatro ideas del usuario, sin decidir

- Calculadora de discos (que discos cargar para un peso).
- Editar el pasado mas a fondo: ajustar o borrar sesiones antiguas.
- Duplicar una sesion o repetir el entrenamiento de la semana pasada.
- Notas de voz en lugar de escribir la descripcion de un ejercicio.

### 5. Si se decide vender la app

Estan en `Informe - publicar en las tiendas.md`, en la carpeta de arriba: cuentas de
desarrollador, comisiones, el filtro de los 12 probadores de Google, y que para iOS hace falta
un Mac.
