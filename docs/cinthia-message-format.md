# Formato de invitación CinthIA

Diagnóstico: el bundle publicado conserva los saltos LF y los emojis Unicode; el enlace codifica una sola vez mediante encodeURIComponent. La captura del usuario muestra reemplazos U+FFFD y párrafos colapsados, pero no permite identificar qué versión o paso de WhatsApp los introduce. No se atribuye una causa exacta sin reproducción dentro del cliente afectado.

Mitigación: en escritorio se abre web.whatsapp.com/send directamente, evitando la transferencia a la aplicación instalada desde wa.me. En móviles se conserva el enlace universal. El texto proviene de una única función, se normaliza a NFC/LF y mantiene la negrita de WhatsApp. Copiar mensaje está disponible en bandeja y detalle; el detalle muestra el texto seleccionable si el portapapeles falla. Copiar no confirma envío ni modifica la invitación.

Validación: 11 pruebas de interfaz/servicio, incluidos round-trip del texto completo en desktop/móvil, emojis, 11 párrafos, enlace personalizado y copiar sin marcar enviado; TypeScript y build. Pendiente validación del pegado/envío en la instalación WhatsApp del usuario; no se enviaron mensajes a candidatos durante las pruebas.
Referencia: https://faq.whatsapp.com/5913398998672934 (formato oficial de texto prellenado codificado en URL).

## Corrección posterior: 14/11/2026
El usuario confirmó que WhatsApp Web también alteraba el formato prellenado. La apertura ya no transmite texto por URL. Ahora se presenta un diálogo con el mensaje íntegro y acciones explícitas de copiar y abrir el chat sin parámetro text. El usuario pega el texto y revisa antes de enviarlo. Si falla el portapapeles, el textarea permite copia manual. Este cambio evita la ruta problemática, sin atribuir el fallo a un componente no observado. No se confirmó el pegado en el cliente WhatsApp afectado.
Validación actual: 10 pruebas, TypeScript y compilación. La preparación no registra apertura ni envío; abrir el chat registra solo apertura, y confirmar envío sigue siendo manual.

## Persistencia del diálogo
La ventana de compartir estaba alojada en CinthiaRowActions. Preparar provoca recarga; si una fila deja de cumplir el filtro o sale de la página, React desmonta la fila y su ventana. Ahora el estado vive en CinthiaView, fuera de la tabla; la ventana conserva teléfono, mensaje e invitación hasta cerrar explícitamente. Hay un acceso directo «Abrir WhatsApp» en la fila y «Abrir WhatsApp directamente» en la ventana, ambos sin texto en URL.
Prueba de regresión: preparar, retirar la fila durante la recarga, disparar focus/actualización y comprobar que el diálogo persiste; Cerrar lo elimina. 10 pruebas pasan.

## Mensaje precargado solicitado
Ambos accesos a WhatsApp vuelven a incluir phone y text: la ventana usa exactamente el texto visible, y la fila obtiene la invitación vigente antes de abrir el chat. Se mantiene copiar como alternativa por las alteraciones observadas en WhatsApp. Abrir no envía automáticamente ni marca como enviada. Prueba específica verifica teléfono normalizado, nombre, enlace personalizado y evento de apertura; la prueba de permanencia del diálogo se conserva.

## Aplicación de escritorio
Por solicitud del usuario, escritorio utiliza whatsapp://send?phone=...&text=...; móviles conservan wa.me. No redirige a WhatsApp Web. El navegador puede pedir permiso para abrir la aplicación instalada. Pruebas verifican protocolo, teléfono y texto completo. No se verificó el renderizado dentro del WhatsApp de escritorio del usuario; Copiar mensaje sigue disponible si ese cliente altera el formato.
