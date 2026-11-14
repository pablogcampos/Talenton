# CinthIA: animación facial

## Implementación
- Se conserva `src/assets/cinthia/cinthia-avatar-512.webp` sin modificar. No se transforma la fotografía completa; se retiró el pulso del avatar.
- `cinthia-facial-expressions.webp` (49 KB) aporta ojos cerrados y boca discretamente abierta. Máscaras suaves revelan exclusivamente estas zonas sobre la base aprobada. La mezcla con la boca neutral produce aperturas intermedias.
- Parpadeo independiente: pausa aleatoria 3–7 s, cierre/apertura 120–200 ms, doble parpadeo con probabilidad 12%.
- Los AudioBufferSourceNode de Gemini se conectan a un AnalyserNode y después a la salida. FFT 512, RMS temporal, silencio <=0.008, apertura normalizada con saturación, ataque 40 ms y relajación 65 ms. Silencio/interrupción devuelve neutral. No usa audio del micrófono ni el estado “hablando” como señal de apertura.
- Se lee la señal que está reproduciendo el grafo de audio, no los paquetes recibidos. No se añade cola ni retardo al audio. La actualización visual se limita aproximadamente a 30 fps mediante DOM/CSS, sin renders React por fotograma. Puede existir el desfase normal de salida del dispositivo (por ejemplo Bluetooth); no se promete sincronización fonética.
- Interrupción, pausa, cierre o pérdida de conexión detienen y descartan las fuentes pendientes; el medidor vuelve a cero. Finalización deja el avatar neutral. Se liberan conexiones, timers y requestAnimationFrame. Una pestaña oculta suspende la animación; movimiento reducido desactiva las capas animadas.

## Recursos y generación
Herramienta incorporada image_gen; original de referencia: avatar aprobado de 512 px. Fuente no destructiva: `src/assets/cinthia/cinthia-facial-expressions.png`; versión de entrega WebP de 512 px. La conversión solo reduce resolución/formato. Las capas se alinean de forma independiente con CSS; pelo, ropa, auriculares, cejas y nariz visibles siempre pertenecen al original.

Prompt utilizado:
> Precisely edit this approved avatar for animation. Deliver the exact same square canvas and identical framing, positions, size, lighting, colors, face identity, hairstyle, eyebrows, nose, headset, clothing and transparency. Only two localized changes: (1) both eyelids naturally fully closed in a brief blink, preserving eyelashes, eye positions and surrounding skin; (2) lips subtly parted for speaking with a narrow natural dark opening, at most 6 pixels high relative to original 512px canvas, no exaggerated smile or big mouth, retain original lip width and position. Do not reposition or resize anything. This will be composited as small eye and mouth patches over the original, so exact alignment is essential. No added graphics or text.

## Validación (13/11/2026)
- TypeScript y compilación de producción correctos; aviso preexistente de bundles grandes ajenos a esta animación.
- 15 pruebas unitarias/de integración: flujo y diagnóstico, interfaz, medidor, silencio, saturación, suspensión, descarte de audio al interrumpir y confirmación de guardado.
- Chrome real headless con Web Audio: silencio = 0; voz sintética suave = apertura 0.111; fuerte = 0.635; detener = 0. Se observa parpadeo en reposo dentro de 7.4 segundos.
- Viewport móvil 390x844: sin desbordamiento; prefers-reduced-motion oculta ojos/labios animados.
- Capturas inspeccionadas en reposo y máxima expresión: alineación de ojos y boca, sin transformación del resto del rostro.
- El test integrado inyecta PCM en el receptor real de CinthIA y comprueba inicio de fuente, silencio antes de señal, respuesta a señal y stop al interrumpir.
- No se realizó una entrevista nueva contra Gemini ni una prueba en teléfono físico. La latencia perceptiva en dispositivos físicos queda pendiente; el circuito no agrega buffering de audio.

No hay cambios de base de datos, preguntas, evaluación ni reglas de entrevista. Publicación autorizada por el usuario después de la validación local.

