# Pendientes

Cosas anotadas para hacer cuando se retome el proyecto. Ordenadas por importancia.

---

## 1. La altura de las medidas está fijada a 174 cm ⚠️ (fallo mío)

**Qué pasa.** El ajuste de altura viene con **174 cm** puestos por defecto, que es la altura
de Óscar. La app calcula el IMC y la relación cintura/altura con ese valor para cualquiera
que la use.

**Por qué es grave.** La app la están usando otras personas (amigos, y en el futuro
clientes). Si alguien que mide 165 cm apunta sus medidas, verá un IMC y un indicador
cintura/altura **mal calculados y sin ningún aviso**: no da error, simplemente da un número
falso. Eso es peor que no calcularlo.

**Cómo arreglarlo.**
1. La altura **no debe tener valor por defecto**. Que empiece vacía.
2. Si no hay altura, **no calcular** IMC ni cintura/altura, y explicar por qué:
   «Pon tu altura en Ajustes para ver el IMC y el indicador cintura/altura».
3. Pedirla de forma natural la primera vez que se abre la pantalla de medidas, en lugar de
   esconderla en Ajustes.
4. Revisar todo lo demás que pueda venir con datos personales puestos por defecto (peso,
   alturas de ejemplo en formularios) y quitar los que sean del desarrollador.

**Sitios a tocar:** `src/types.ts` (`DEFAULT_SETTINGS.heightCm`),
`src/screens/MeasurementsScreen.tsx`, `src/screens/ProgressScreen.tsx` (resumen),
`src/screens/SettingsScreen.tsx`.

---

## 2. El aviso de «versión nueva» no se dispara

**Qué pasa.** El aviso que aparece al publicar una versión nueva **no sale nunca**, porque la
comprobación que hace la app se contesta a sí misma.

**Por qué.** La app pide `index.html` con `cache: 'no-store'` para comparar qué archivo está
publicado con el que tiene en uso (`src/main.tsx`, función `hayVersionNueva`). Pero quien
responde a esa petición es el **service worker**, y su `fetch` trata las navegaciones (y
`index.html`) con **red primero y la copia guardada como respaldo**. Resultado: la app
compara el archivo publicado contra el publicado, siempre son iguales, y nunca avisa.
`cache: 'no-store'` solo afecta a la caché del navegador, no a la del service worker.

**Por qué no es catastrófico.** Al abrir la app, la navegación sí va a la red primero (con
2,5 s de límite), así que la versión nueva **acaba entrando sola** al volver a abrirla. Lo
que falla es el aviso, no la actualización. Aun así conviene arreglarlo: el aviso existe para
que el usuario sepa que hay algo nuevo y pueda aplicarlo cuando le venga bien.

**Cómo arreglarlo.** Añadir un parámetro distinto en cada comprobación, para que no coincida
con ninguna entrada de la caché del service worker:

```js
fetch(`./index.html?comprobacion=${Date.now()}`, { cache: 'no-store' })
```

**Y verificarlo con una prueba de verdad**, que es lo que faltaba: hay un intento a medias en
`scripts/test-deteccion-version.mjs`, que levanta un servidor local que primero sirve la
versión vieja (construida desde el historial de git) y después la nueva, y comprueba el
código de detección real, tal como está y con la corrección. **Quedó a medias**: el código de
TypeScript hay que limpiarlo de anotaciones antes de ejecutarlo en el navegador, y la última
ejecución no llegó a completarse.

**Pendiente también:** que exista una prueba de regresión que instale la versión anterior de
verdad, publique la nueva y compruebe que el aviso sale y que al pulsar «Actualizar» la app
queda en la versión nueva. Ahora mismo no existe, y por eso este fallo ha pasado inadvertido
durante varias versiones.

---

## 3. Registro de actualizaciones (changelog)

Petición del usuario. Tres sitios con **una sola fuente**:
- Dentro de la app: «Novedades» en el aviso de versión nueva.
- En **Ajustes → Información**, el historial completo.
- Un `CHANGELOG.md` en el repositorio.

De las versiones 1.0.1 a 1.0.12 hay que reconstruir el historial desde los mensajes de commit
(y conviene que el usuario lo revise: él recuerda qué le molestaba). Se puede generar solo en
cada publicación, para que no dependa de que alguien se acuerde de escribirlo.

---

## 4. Copia automática a una carpeta (Android)

De la conversación sobre el guardado de datos. En Android se puede pedir una carpeta una vez
y guardar ahí cada copia automáticamente. En iPhone no existe esa API. Sigue sin proteger
contra perder el móvil, pero quita el trabajo manual.

---
