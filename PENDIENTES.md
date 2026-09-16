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
