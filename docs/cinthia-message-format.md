# Formato de invitación CinthIA

Diagnóstico: el bundle publicado conserva los saltos LF y los emojis Unicode; el enlace codifica una sola vez mediante encodeURIComponent. La captura del usuario muestra reemplazos U+FFFD y párrafos colapsados, pero no permite identificar qué versión o paso de WhatsApp los introduce. No se atribuye una causa exacta sin reproducción dentro del cliente afectado.

Mitigación: en escritorio se abre web.whatsapp.com/send directamente, evitando la transferencia a la aplicación instalada desde wa.me. En móviles se conserva el enlace universal. El texto proviene de una única función, se normaliza a NFC/LF y mantiene la negrita de WhatsApp. Copiar mensaje está disponible en bandeja y detalle; el detalle muestra el texto seleccionable si el portapapeles falla. Copiar no confirma envío ni modifica la invitación.

Validación: 11 pruebas de interfaz/servicio, incluidos round-trip del texto completo en desktop/móvil, emojis, 11 párrafos, enlace personalizado y copiar sin marcar enviado; TypeScript y build. Pendiente validación del pegado/envío en la instalación WhatsApp del usuario; no se enviaron mensajes a candidatos durante las pruebas.
Referencia: https://faq.whatsapp.com/5913398998672934 (formato oficial de texto prellenado codificado en URL).
