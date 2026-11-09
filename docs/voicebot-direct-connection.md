# Conexión PostgreSQL del voicebot

Usuario dedicado: `voicebot_ingest`. Tabla: `public.voicebot_leads`.
Las credenciales se entregan por archivo privado fuera de Git. El proveedor no necesita la clave de Edge Functions, el usuario postgres ni una clave service_role.

Permisos: INSERT únicamente sobre las columnas de recepción. No puede consultar, actualizar, borrar, elegir responsable, modificar estado o alterar la fecha de recepción. RLS permanece habilitado. La base asigna fecha de recepción y estado Nuevo. Los reclutadores toman los leads desde la bandeja compartida.

Usar conexión TLS con verificación de certificado (`sslmode=verify-full`) y el certificado CA entregado. En el pooler compartido, el usuario lleva el sufijo `.gvwaqlvphvfzhnhlnuuv`. Las credenciales suministradas incluyen el host y puerto comprobados.

INSERT parametrizado, sin `RETURNING` ni consultas previas:

```sql
INSERT INTO public.voicebot_leads (
 external_id, occurred_at, phone, full_name, origin, source_recruiter,
 workday, district, experience, interview_availability, interest,
 ai_reason, transcript, bot_notes
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
ON CONFLICT DO NOTHING;
```

Correspondencia con las 15 columnas del Excel:

| Excel | PostgreSQL |
|---|---|
| ID | external_id (texto estable y único por lead) |
| Fecha y Hora | occurred_at (ambas juntas, ISO 8601 con `-05:00`) |
| Teléfono | phone (texto) |
| Nombre | full_name |
| Origen | origin |
| Reclutador asignado | source_recruiter (dato del bot, no asigna usuario) |
| Modalidad | workday |
| Distrito | district |
| Experiencia | experience |
| Disponibilidad para entrevista | interview_availability |
| Interés | interest |
| Por qué es interesado (IA) | ai_reason |
| Lo que dijo | transcript |
| Notas del bot | bot_notes |

ID y teléfono obligatorios. Omitir columnas opcionales sin datos o enviar texto vacío (no NULL); `occurred_at` puede ser NULL. La combinación fuente/ID evita duplicados. El INSERT devuelve una fila afectada al crear o cero si el ID ya existe. Reintentos usan el mismo ID. No usar UPDATE, UPSERT con DO UPDATE, ni RETURNING.

Revocación inmediata por un administrador:

```sql
ALTER ROLE voicebot_ingest NOLOGIN;
REVOKE INSERT (external_id,occurred_at,phone,full_name,origin,company_name,campaign_name,
 workday,district,experience,interview_availability,interest,ai_reason,transcript,
 bot_notes,source_recruiter,payload) ON public.voicebot_leads FROM voicebot_ingest;
```

La función HTTP existente se conserva independiente. Esta conexión no inserta ni modifica candidatos automáticamente.
