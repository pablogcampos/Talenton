import {forwardRef} from 'react';
import type {LucideProps} from 'lucide-react';
// Exact vector paths from the supplied cinthia-microfono.svg, inheriting menu color.
export const CinthiaIcon=forwardRef<SVGSVGElement,LucideProps>(({size=24,strokeWidth=1.9,...props},ref)=><svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10.5v2a6.5 6.5 0 0 0 13 0v-2M12 19v3M8 22h8"/></svg>);
CinthiaIcon.displayName='CinthiaIcon';
