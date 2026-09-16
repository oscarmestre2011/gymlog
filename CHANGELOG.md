# Historial de versiones de Kairós

> Generado desde `src/lib/changelog.ts` con `npm run changelog`.
> No editar a mano: los cambios se hacen en ese archivo.

## 1.8.0 — Series en metros o por tiempo, y plantilla de cuatro tramos

_2026-09-16_

- **Mejorado:** Los tramos se pueden apuntar por tiempo, por METROS (400 m, 200 m: lo de pista) o por kilómetros. Antes solo en minutos.
- **Mejorado:** La plantilla de un entrenamiento por series ahora son CUATRO tramos: calentamiento, serie, recuperación y vuelta a la calma. Antes proponía 14 y había que borrar la mitad antes de empezar.
- **Mejorado:** El atajo «⚡ + Serie» añade una serie más con su recuperación, en su sitio (antes de la vuelta a la calma).
- **Mejorado:** Cada tramo indica qué es cada casilla (minutos y km, o metros y minutos), y el total se muestra en la unidad elegida.

## 1.7.0 — Cardio por series y fartlek

_2026-09-16_

- **Nuevo:** El cardio se puede apuntar por TRAMOS: series (tramos fuertes con recuperaciones) y fartlek (cambios de ritmo). Antes solo había un bloque continuo.
- **Nuevo:** Cada tramo lleva sus minutos, sus kilómetros y su intensidad (recuperación, suave, medio, fuerte o a tope), con una marca de color para ver la estructura de un vistazo.
- **Nuevo:** Atajos para no empezar de cero: «+ Tramo» y «⚡ +4 series», que añade una estructura de calentamiento, series con recuperaciones y vuelta a la calma.
- **Nuevo:** Cada entrenamiento por series dice cuántos tramos fuertes hizo, y el tiempo total sale de sumar los tramos.
- **Mejorado:** El cardio continuo sigue igual: si no se elige series ni fartlek, todo funciona como antes.

## 1.6.0 — La semana en curso en Inicio, y el equilibrio muscular en barras

_2026-09-16_

- **Nuevo:** Inicio resume la semana en curso: días entrenados, kilos levantados y kilómetros de cardio, más las semanas seguidas que llevas.
- **Mejorado:** El volumen por grupo muscular se ve en un gráfico de barras: comparar alturas se lee mejor que una lista, y cada barra lleva su número exacto.

## 1.5.0 — Los entrenamientos se programan por días

_2026-09-16_

- **Nuevo:** Cada rutina tiene sus días: se eligen al prepararla (con la ✎ de su tarjeta) y pueden ser varios, por ejemplo lunes y jueves.
- **Nuevo:** En Inicio aparece el entrenamiento que toca ese día, con sus ejercicios, y se empieza con un toque. Si ese día no hay nada programado, lo dice en vez de proponer otra cosa.
- **Nuevo:** En Rutinas hay un resumen de la semana con lo que toca cada día, y avisa de los días repetidos o de las rutinas sin programar.
- **Mejorado:** La pantalla de Inicio queda solo para entrenar: los totales, las últimas sesiones y el cardio están en sus apartados, no repetidos ahí.
- **Mejorado:** El botón de compartir la copia ahora comparte de verdad. Antes comprobaba antes de intentarlo y, si la comprobación fallaba, descargaba el archivo: hacía lo mismo que el botón de guardar.
- **Mejorado:** Los totales generales y las sesiones guardadas (con la opción de borrarlas) están en Progresión.

## 1.4.0 — Ayuda, equilibrio muscular y compartir la copia

_2026-09-16_

- **Nuevo:** Ayuda e instrucciones: 22 preguntas con respuesta, agrupadas por temas y con buscador. Está en Ajustes, en la pantalla de Inicio y durante el entrenamiento (botón ？).
- **Nuevo:** Volumen por grupo muscular: series por semana de cada grupo, para ver el equilibrio. Si un grupo se queda muy por detrás, avisa.
- **Nuevo:** Fuerza y cardio juntos, semana a semana, con los días de actividad y los que hiciste las dos cosas.
- **Nuevo:** Cada serie te dice si va mejor que la última vez (▲ +2,5 kg) o igual (=), mientras entrenas.
- **Nuevo:** Compartir la copia de seguridad desde Inicio, con un toque (WhatsApp, correo, Drive). Así el archivo sale del móvil, que es lo único que protege de perderlo.
- **Arreglado:** Progresión se caía entera al abrirla después de entrenar (un fallo técnico al dibujar la pantalla). Arreglado, y con una prueba que lo vigila.

## 1.3.1 — Las copias de seguridad, en un solo apartado

_2026-09-16_

- **Mejorado:** Las copias estaban repartidas en dos apartados («Copia de seguridad» y «Carpeta de copias») que hacían lo mismo con nombres distintos. Ahora es uno solo, ordenado: primero cuándo fue la última copia, luego las dos formas de copiar (el archivo a mano y la carpeta automática) y al final el recordatorio.
- **Mejorado:** Al guardar en la carpeta, «última copia» se actualiza al momento.

## 1.3.0 — Perfil del deportista y arreglo de la carpeta de copias

_2026-09-16_

- **Nuevo:** Perfil del deportista: altura, fecha de nacimiento, sexo y cuánto te mueves al día. Con eso calcula tu edad (sola, desde la fecha), el IMC, la relación cintura/altura y una estimación de lo que gastas al día y de la proteína que te toca.
- **Mejorado:** El peso NO se pide en el perfil: se coge de tu última medición corporal, así no hay dos sitios donde apuntarlo ni pueden contradecirse.
- **Mejorado:** Si indicas tu porcentaje de grasa, la estimación pasa a usar una fórmula mejor (Katch-McArdle), que parte de tu masa magra.
- **Mejorado:** La pantalla explica de dónde sale cada número y avisa de que son estimaciones, no un diagnóstico médico.
- **Arreglado:** La carpeta de las copias automáticas no se podía recordar en el móvil («no se ha podido recordar la carpeta»). Era un fallo de la app: la carpeta se guardaba de una forma que el navegador del móvil rechaza. Ya funciona, y si vuelve a fallar el aviso dice el motivo.

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
