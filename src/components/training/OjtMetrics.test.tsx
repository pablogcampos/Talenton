// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
import {OjtMetricModal,OjtMetricsTable} from './OjtMetrics';
it('muestra solo los cuatro indicadores y conserva cero sin inventar valores antiguos',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const el=document.createElement('div');const root=createRoot(el);
 try{await act(async()=>root.render(<OjtMetricModal onSave={vi.fn()} onClose={vi.fn()}/>));expect(el.querySelectorAll('input')).toHaveLength(4);expect(el.textContent).not.toContain('Horas');expect(el.textContent).toContain('Venta neta');
 await act(async()=>root.render(<OjtMetricsTable metrics={[{date:'2026-11-10',dayNumber:2,grossSales:0,netSales:0,ojtDays:2,qaScore:0},{date:'2026-11-09',dayNumber:1,sales:3}]}/>));expect(el.textContent).toContain('0%');expect(el.textContent).not.toContain('90%');expect(el.textContent).toContain('—');
 }finally{await act(async()=>root.unmount());}
});
