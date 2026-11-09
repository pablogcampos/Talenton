# Configurar la recepción del voicebot

1. En Edge Functions crea `voicebot-leads` y reemplaza **todo** `index.ts` con `supabase/functions/voicebot-leads/index.ts` de este repositorio.
2. En Edge Functions → Secrets configura `VOICEBOT_API_KEY` con una clave aleatoria exclusiva, de al menos 32 caracteres. Puedes generar 32 bytes mediante `openssl rand -hex 32`. No uses una contraseña personal ni una clave pública de Supabase.
3. La función utiliza `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del entorno interno de Supabase. No entregues esas variables al proveedor.
4. Publica y desactiva **Verify JWT with legacy secret** para esta función. La función verifica por sí misma `x-voicebot-key` en cada solicitud antes de acceder a la tabla. El equivalente en CLI está incluido en `supabase/config.toml`.
5. Entrega al proveedor solamente la URL siguiente, `VOICEBOT_API_KEY` por un canal privado y este contrato.

URL prevista una vez desplegada:
`https://gvwaqlvphvfzhnhlnuuv.supabase.co/functions/v1/voicebot-leads`

Método: `POST`. Un lead por petición; máximo 200 KB. Cabeceras:

```text
Content-Type: application/json
x-voicebot-key: <clave exclusiva>
```

Cuerpo de ejemplo:

```json
{
  "external_id": "llamada-12345",
  "phone": "+51999111222",
  "full_name": "Persona de ejemplo",
  "occurred_at": "2026-11-09T11:00:00-05:00",
  "origin": "Base de reclutamiento",
  "company_name": "Techcenter",
  "campaign_name": "Portabilidad Movistar",
  "workday": "Part time",
  "district": "Lima",
  "experience": "Experiencia en ventas",
  "interview_availability": "Turno tarde",
  "interest": "Alto",
  "ai_reason": "Solicitó información de la vacante",
  "transcript": "Me interesa la entrevista",
  "bot_notes": "Contactar por la tarde",
  "source_recruiter": "",
  "payload": {}
}
```

Obligatorios: `external_id` estable y único por llamada/lead y `phone`, ambos texto. Los demás campos son opcionales; omitirlos si no están disponibles. Fechas ISO 8601 con zona. Datos adicionales van dentro de `payload`. No mandar `source`, estado, responsable, firma ni fechas internas; la fuente siempre es `voicebot`.

- **201**: recibido y guardado.
- **200**, `duplicate: true`: ya se recibió ese ID; no modifica el registro existente ni genera otro lead.
- **400/413/415**: corregir cuerpo, tamaño o formato; no reintentar sin corregir.
- **401**: clave incorrecta o ausente.
- **503**: reintentar con espera progresiva y el mismo `external_id`.

No se admite GET, PATCH ni DELETE. El endpoint no permite listar ni gestionar los leads. La clave del proveedor no es una clave de acceso directo a Supabase. Rotación: cambiar `VOICEBOT_API_KEY` y actualizar al proveedor; la anterior deja de funcionar.

La función conserva los datos y los envía a la bandeja existente; no crea candidatos automáticamente. No introducir el ejemplo en producción como prueba sin identificarlo claramente, pues dispararía las alertas reales.
