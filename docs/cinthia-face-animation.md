# CinthIA: ajuste facial

Se conserva el retrato original y el recurso fotográfico de expresiones existente.
Los párpados se revelan de arriba abajo (120–200 ms, cada 3–7 segundos), sin
mezclar por transparencia ojos abiertos y cerrados. Se mantiene el doble
parpadeo ocasional.

La boca usa una región opaca con bordes suavizados: ya no se superponen dos
labios por transparencia. Una variación vertical local de 0.88 a 1 mantiene
discreta la apertura; no se transforma el retrato ni el resto del rostro.
La histéresis evita alternancias por fluctuaciones pequeñas. El RMS se obtiene
del audio reproducido, en una ventana de 2048 muestras, con ataque y caída
suavizados. Silencio e interrupciones restablecen la expresión neutral.

No es sincronización fonética: hay dos expresiones fotográficas disponibles.
Para articulación más rica harán falta variantes alineadas de boca para
distintos fonemas, o un avatar articulado aprobado.

Validación: TypeScript; pruebas del medidor y del flujo de voz; Chrome con
audio Web Audio real; silencio, variación de amplitud, interrupción, parpadeo,
vista de 390 px sin desbordamiento y movimiento reducido. Inspección de
capturas neutral, hablando y ojos cerrados. No se probó en un teléfono físico.
