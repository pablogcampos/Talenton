export const trainingSurveyQuestions = [
 'La capacitación fue útil para realizar mi trabajo.',
 'Los contenidos se explicaron con claridad.',
 'El formador demostró dominio de los temas.',
 'Mis dudas fueron atendidas oportunamente.',
 'Las prácticas me ayudaron a aprender.',
 'Los materiales facilitaron mi aprendizaje.',
 'Me siento preparado para iniciar mis funciones.',
 'Estoy satisfecho con la capacitación recibida.',
] as const;
export const surveyRating = (score: number) => score >= 18 ? 'Excelente' : score >= 15 ? 'Bueno' : score >= 11 ? 'Regular' : 'Crítico';
export const surveyMessages: Record<string,string> = {
 SURVEY_RATE_LIMITED: 'Se realizaron varios intentos. Espera un minuto y vuelve a enviar.',
 SURVEY_DISABLED: 'La encuesta se habilitará cuando finalice la capacitación.',
 SURVEY_NOT_FOUND: 'No se encontró esta encuesta.',
 SURVEY_PARTICIPANT_NOT_FOUND: 'No encontramos ese documento entre los participantes. Verifica el tipo y número con tu formador.',
 SURVEY_ALREADY_COMPLETED: 'Tu respuesta ya fue registrada. Gracias por participar.',
 SURVEY_INVALID: 'Completa las ocho valoraciones y los dos comentarios.',
 SURVEY_FAILED: 'No se pudo cargar o guardar la encuesta. Intenta nuevamente.',
};
