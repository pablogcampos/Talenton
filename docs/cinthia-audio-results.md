# Audio y semáforo de evaluaciones libres

- Audio opcional por evaluación (`recordAudio`), consentimiento explícito antes de iniciar. Se activa para los nuevos intentos del role play existente de portabilidad Movistar; conserva enlace y un intento por DNI.
- WAV estéreo 16 kHz en R2 privado, por tramos: micrófono recibido y voz de CinthIA enviada por el servidor. No es una captura exacta de la reproducción del dispositivo. Una interrupción puede dejar el último tramo incompleto. No recupera audio histórico.
- Lectura exclusiva del administrador desde el detalle. Metadatos con RLS y funciones restringidas a service_role; autorización admin verificada en SQL.
- Semáforo global y por competencia: verde >=80, ámbar >=60, rojo <60. Resultado global con cobertura incompleta o sin puntuación: gris. Escala rúbrica 1–4 normalizada a 0–100; orientativo, sin decisión de contratación.
- Verificado: TypeScript, compilación, pruebas de PCM estéreo/interrupción/reintento de escritura, consentimiento, persistencia de metadatos y acceso admin; pruebas de umbrales y evidencia incompleta. No se ha verificado todavía una sesión humana completa con audio en producción.
