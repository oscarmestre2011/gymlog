# Historial de versiones de Kairós

> Generado desde `src/lib/changelog.ts` con `npm run changelog`.
> No editar a mano: los cambios se hacen en ese archivo.

## 1.2.0 — Ejercicios plegables y cambio de ejercicio

_2026-09-16_

- **Nuevo:** Los ejercicios ya terminados se pliegan solos, para no tener que bajar por toda la sesión. Se pueden volver a abrir para apuntar una serie de más.
- **Nuevo:** Puedes cambiar un ejercicio por otro en mitad del entrenamiento (por ejemplo si la máquina está ocupada), con el botón ⇄ de cada ejercicio.
- **Mejorado:** Al cambiar de ejercicio NO se pierde nada: las series apuntadas se quedan y se marcan como «Cambiado desde X», para entender después por qué hay series de dos ejercicios.
- **Arreglado:** Ya no se pueden poner dos veces el mismo ejercicio en una sesión: los que ya están salen marcados como «ya en la sesión».

## 1.1.1 — Arreglada la copia en carpeta

_2026-09-16_

- **Arreglado:** La copia en carpeta no guardaba en algunos móviles: al elegir la carpeta se concedía el permiso, pero al ir a guardar ya no estaba y la app se retiraba sin pedirlo. Ahora lo pide en el momento de guardar (y al elegir la carpeta), y funciona.
- **Arreglado:** Si algo falla al guardar, la app dice QUÉ ha fallado (permiso, carpeta perdida, sin espacio) en lugar de un mensaje genérico.
- **Mejorado:** Los avisos de error duran más en pantalla: antes desaparecían antes de que diera tiempo a leerlos.

## 1.1.0 — Registro de actualizaciones y copias automaticas

_2026-09-16_

- **Nuevo:** Pantalla de Novedades: al actualizar la app te cuenta qué ha cambiado.
- **Nuevo:** Historial completo de versiones en Ajustes.
- **Nuevo:** Copia de seguridad automática en una carpeta del móvil (Android).
- **Arreglado:** El aviso de «versión nueva» ya sale cuando corresponde. Antes no aparecía nunca.
- **Arreglado:** La altura de las medidas ya no viene puesta: cada persona pone la suya, y sin ella no se calculan el IMC ni el indicador cintura/altura (antes se usaba la de otra persona y daba números falsos).
- **Mejorado:** El aviso de versión nueva deja hueco a la cabecera en lugar de taparla, y mide su propio alto para no descuadrarse.

## 1.0.16 — Medidas corporales

_2026-09-15_

- **Nuevo:** Medidas corporales: peso, abdomen, pecho y muslo, con notas.
- **Nuevo:** IMC, relación cintura/altura y aviso del perímetro abdominal, con sus umbrales de riesgo.
- **Nuevo:** Gráficas de evolución del peso y del abdomen, y diferencia desde el primer registro.
- **Nuevo:** Aviso cada dos semanas de que toca medirse.
- **Mejorado:** Las medidas entran en la copia de seguridad.

## 1.0.15 — Superseries

_2026-09-15_

- **Nuevo:** Superseries: encadena dos o más ejercicios y se apuntan alternando.
- **Nuevo:** El descanso se ajusta solo: corto entre ejercicios de la ronda y completo al acabar la ronda.
- **Nuevo:** Etiquetas A1, A2 para saber en qué punto de la superserie estás.

## 1.0.14 — Pantalla encendida y aviso más largo

_2026-09-15_

- **Nuevo:** La pantalla no se apaga mientras usas la app (desactivable en Ajustes).
- **Mejorado:** El aviso del descanso es más largo y repetido, y se elige entre corto, largo o muy largo.
- **Mejorado:** La barra del descanso parpadea mientras suena, para verlo aunque no se oiga.
- **Arreglado:** Guardar un ajuste no se aplicaba hasta recargar la app.
- **Arreglado:** El cronómetro se ponía al día al volver a la app después de apagarse la pantalla.

## 1.0.13 — Biblioteca de ejercicios

_2026-09-15_

- **Nuevo:** Pestaña Ejercicios: ver, buscar, crear, editar y borrar ejercicios.
- **Nuevo:** Al crear un ejercicio se indica su descripción, la parte del cuerpo que trabaja y el material.
- **Nuevo:** La descripción se ve al elegir el ejercicio y mientras entrenas.

## 1.0.12 — Recordatorio de copia de seguridad

_2026-09-14_

- **Nuevo:** La app recuerda hacer copia de seguridad cada cierto tiempo.
- **Nuevo:** Aviso claro de que los datos viven solo en el móvil y qué pasa si se borran.

## 1.0.11 — Formatos coherentes

_2026-09-14_

- **Mejorado:** Los totales de cardio y el volumen se muestran igual en toda la app.
- **Mejorado:** Los miles se separan con punto (1.340 kg) como es costumbre en español.

## 1.0.10 — Actualizaciones fiables

_2026-09-14_

- **Arreglado:** La app ya se actualiza en el móvil al volver a abrirla.
- **Arreglado:** Ya no se queda una copia antigua guardada por debajo.

## 1.0.9 — Totales de cardio

_2026-09-14_

- **Mejorado:** Totales de cardio exactos, con total semanal y mensual de kilómetros y tiempo.

## 1.0.8 — Sin referencias al podcast

_2026-09-14_

- **Mejorado:** La app deja de mencionar el podcast: es solo una herramienta de entrenamiento.

## 1.0.7 — Nombre e identidad: Kairós

_2026-09-14_

- **Nuevo:** La app pasa a llamarse Kairós, con su emblema en el icono y en la cabecera.

## 1.0.6 — Bienvenida

_2026-09-14_

- **Nuevo:** Pantalla de bienvenida la primera vez, explicando de qué va la app.
- **Mejorado:** Cada dispositivo guarda sus propios datos, sin mezclarse con los de nadie.

## 1.0.5 — Comprobada en Safari

_2026-09-14_

- **Mejorado:** Aviso visual al terminar el descanso, porque en iPhone no hay sonido ni vibración.
- **Mejorado:** Revisada y ajustada en Safari (iPhone).

## 1.0.4 — Decimales con coma

_2026-09-14_

- **Arreglado:** Se pueden escribir decimales con coma (42,5 kg) sin que se conviertan en otra cosa.

## 1.0.3 — Nunca una pantalla en blanco

_2026-09-14_

- **Arreglado:** Si algo falla al abrir, la app lo explica y ofrece soluciones en lugar de quedarse en negro.
- **Mejorado:** Comprobado que actualizar la app no pierde ningún entrenamiento.

## 1.0.2 — Instalación en el móvil

_2026-09-14_

- **Mejorado:** Instrucciones para añadir la app a la pantalla de inicio en Android.

## 1.0.1 — Primer aviso de versión nueva

_2026-09-14_

- **Nuevo:** Aviso cuando hay una versión nueva de la app.

## 1.0.0 — Primera versión

_2026-09-14_

- **Nuevo:** Registro de entrenamientos: series con peso, repeticiones y RIR.
- **Nuevo:** Rutinas reutilizables con el programa A/B/C.
- **Nuevo:** Progresión por ejercicio e historial.
- **Nuevo:** Cronómetro de descanso y registro de cardio.
- **Nuevo:** Funciona sin conexión y sin cuentas: los datos se quedan en tu móvil.
