import type { CaptureEvent } from '../services/captureApi';

/** Resolve each preference independently: a later incomplete response must not hide a recorded shift. */
export function candidateAvailability(events: CaptureEvent[], fallbackWorkday?: string) {
  const sorted = [...events].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const find = (key: string) => {
    for (const event of sorted) {
      const form=event.applicant.formSubmission;
      const value=form?.answers?.[key] ?? event.applicant.techCenterAnswers?.[key];
      const values=(Array.isArray(value)?value:[value]).filter((item):item is string=>typeof item==='string'&&!!item.trim());
      if(!values.length)continue;
      const options=form?.questions.find(question=>question.id===key)?.options;
      return values.map(item=>options?.find(option=>option.value===item)?.label||item).join(' · ');
    }
    return '';
  };
  return { workday:find('workday')||fallbackWorkday||'Sin especificar', shift:find('availability')||'No informado en el formulario' };
}
