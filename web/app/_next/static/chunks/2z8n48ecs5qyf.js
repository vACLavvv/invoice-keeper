(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[2092,e=>{var t=e.i(1398),r=e.i(814),n=e.i(4545),o=e.i(6224),l=e.i(4787),i=e.i(9835);let a=r.U.button.withConfig({displayName:"MonthSwitcher__Arrow",componentId:"sc-f5112d14-0"})`
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  color: ${({theme:e})=>e.color.muted};
  font-size: 2.6rem;
  line-height: 1;
  &:hover { color: ${({theme:e})=>e.color.strong}; background: ${({theme:e})=>e.color.tile}; }
`,u=r.U.h2.withConfig({displayName:"MonthSwitcher__Label",componentId:"sc-f5112d14-1"})`
  min-width: 16rem;
  text-align: center;
  font-size: 1.8rem;
  font-weight: 500;
  color: ${({theme:e})=>e.color.strong};
`,c=r.U.span.withConfig({displayName:"MonthSwitcher__Hint",componentId:"sc-f5112d14-2"})`color: ${({theme:e})=>e.color.muted};`;e.s(["f",0,function({hint:e}){let{month:r,setMonth:d,settings:s}=(0,l.U)(),f=s.today.slice(0,7);return(0,t.jsxs)(i.z,{$between:!0,$wrap:!0,children:[(0,t.jsxs)(i.z,{$gap:.4,children:[(0,t.jsx)(a,{type:"button","aria-label":(0,o.t)("Предыдущий месяц"),onClick:()=>d((0,n._)(r,-1)),children:"‹"}),(0,t.jsx)(u,{"aria-live":"polite",children:(0,n.n)(r)}),(0,t.jsx)(a,{type:"button","aria-label":(0,o.t)("Следующий месяц"),onClick:()=>d((0,n._)(r,1)),children:"›"})]}),r!==f?(0,t.jsx)(i.K,{type:"button",$variant:"ghost",onClick:()=>d(f),children:(0,o.t)("к текущему месяцу →")}):e&&(0,t.jsx)(c,{children:e})]})}])},4471,(e,t,r)=>{function n(e,t,r,n){return!1}e.i(461),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"getDomainLocale",{enumerable:!0,get:function(){return n}}),e.r(90),("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},9149,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return $},useLinkStatus:function(){return x}};for(var o in n)Object.defineProperty(r,o,{enumerable:!0,get:n[o]});let l=e.r(2456),i=e.r(1398),a=l._(e.r(1788)),u=e.r(472),c=e.r(1112),d=e.r(8169),s=e.r(9129),f=e.r(4862),p=e.r(5479),h=e.r(1914),m=e.r(4471),b=e.r(4113),g=e.r(3230),y=new Set;function _(e,t,r,n){if(!("u"<typeof window)&&(0,c.isLocalURL)(t)){if(!n.bypassPrefetchedCheck){let o=t+"%"+r+"%"+(void 0!==n.locale?n.locale:"locale"in e?e.locale:void 0);if(y.has(o))return;y.add(o)}e.prefetch(t,r,n).catch(e=>{})}}function v(e){return"string"==typeof e?e:(0,d.formatUrl)(e)}let j=a.default.forwardRef(function(e,t){let r,n,{href:o,as:l,children:d,prefetch:y=null,passHref:j,replace:w,shallow:x,scroll:$,locale:C,onClick:k,onNavigate:M,onMouseEnter:P,onTouchStart:O,legacyBehavior:I=!1,transitionTypes:U,...S}=e;r=d,I&&("string"==typeof r||"number"==typeof r)&&(r=(0,i.jsx)("a",{children:r}));let T=a.default.useContext(p.RouterContext),D=!1!==y,{href:N,as:R}=a.default.useMemo(()=>{if(!T){let e=v(o);return{href:e,as:l?v(l):e}}let[e,t]=(0,u.resolveHref)(T,o,!0);return{href:e,as:l?(0,u.resolveHref)(T,l):t||e}},[T,o,l]),E=a.default.useRef(N),L=a.default.useRef(R);I&&(n=a.default.Children.only(r));let A=I?n&&"object"==typeof n&&n.ref:t,[z,K,B]=(0,h.useIntersection)({rootMargin:"200px"}),H=a.default.useCallback(e=>{(L.current!==R||E.current!==N)&&(B(),L.current=R,E.current=N),z(e)},[R,N,B,z]),X=(0,g.useMergedRef)(H,A);a.default.useEffect(()=>{!T||K&&D&&_(T,N,R,{bypassPrefetchedCheck:!1,locale:C})},[R,N,K,C,D,T?.locale,T]);let W={ref:X,onClick(e){I||"function"!=typeof k||k(e),I&&n.props&&"function"==typeof n.props.onClick&&n.props.onClick(e),!T||e.defaultPrevented||function(e,t,r,n,o,l,i,a,u){let d,{nodeName:s}=e.currentTarget;if(!("A"===s.toUpperCase()&&((d=e.currentTarget.getAttribute("target"))&&"_self"!==d||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,c.isLocalURL)(r)){o&&(e.preventDefault(),location.replace(r));return}e.preventDefault(),(()=>{if(u){let e=!1;if(u({preventDefault:()=>{e=!0}}),e)return}let e=i??!0;"beforePopState"in t?t[o?"replace":"push"](r,n,{shallow:l,locale:a,scroll:e}):t[o?"replace":"push"](n||r,{scroll:e})})()}}(e,T,N,R,w,x,$,C,M)},onMouseEnter(e){I||"function"!=typeof P||P(e),I&&n.props&&"function"==typeof n.props.onMouseEnter&&n.props.onMouseEnter(e),T&&_(T,N,R,{locale:C,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){I||"function"!=typeof O||O(e),I&&n.props&&"function"==typeof n.props.onTouchStart&&n.props.onTouchStart(e),T&&_(T,N,R,{locale:C,priority:!0,bypassPrefetchedCheck:!0})}};if((0,s.isAbsoluteUrl)(R))W.href=R;else if(!I||j||"a"===n.type&&!("href"in n.props)){let e=void 0!==C?C:T?.locale;W.href=T?.isLocaleDomain&&(0,m.getDomainLocale)(R,e,T?.locales,T?.domainLocales)||(0,b.addBasePath)((0,f.addLocale)(R,e,T?.defaultLocale))}return I?a.default.cloneElement(n,W):(0,i.jsx)("a",{...S,...W,children:r})}),w=(0,a.createContext)({pending:!1}),x=()=>(0,a.useContext)(w),$=j;("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1914,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useIntersection",{enumerable:!0,get:function(){return u}});let n=e.r(1788),o=e.r(9604),l="function"==typeof IntersectionObserver,i=new Map,a=[];function u({rootRef:e,rootMargin:t,disabled:r}){let c=r||!l,[d,s]=(0,n.useState)(!1),f=(0,n.useRef)(null),p=(0,n.useCallback)(e=>{f.current=e},[]);return(0,n.useEffect)(()=>{if(l){if(c||d)return;let r=f.current;if(r&&r.tagName)return function(e,t,r){let{id:n,observer:o,elements:l}=function(e){let t,r={root:e.root||null,margin:e.rootMargin||""},n=a.find(e=>e.root===r.root&&e.margin===r.margin);if(n&&(t=i.get(n)))return t;let o=new Map;return t={id:r,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=o.get(e.target),r=e.isIntersecting||e.intersectionRatio>0;t&&r&&t(r)})},e),elements:o},a.push(r),i.set(r,t),t}(r);return l.set(e,t),o.observe(e),function(){if(l.delete(e),o.unobserve(e),0===l.size){o.disconnect(),i.delete(n);let e=a.findIndex(e=>e.root===n.root&&e.margin===n.margin);e>-1&&a.splice(e,1)}}}(r,e=>e&&s(e),{root:e?.current,rootMargin:t})}else if(!d){let e=(0,o.requestIdleCallback)(()=>s(!0));return()=>(0,o.cancelIdleCallback)(e)}},[c,t,e,d,f.current]),[p,d,(0,n.useCallback)(()=>{s(!1)},[])]}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},3230,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return o}});let n=e.r(1788);function o(e,t){let r=(0,n.useRef)(null),o=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=o.current;t&&(o.current=null,t())}else e&&(r.current=l(e,n)),t&&(o.current=l(t,n))},[e,t])}function l(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1318,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814),o=e.i(2092),l=e.i(3201),i=e.i(9877),a=e.i(9835),u=e.i(7289),c=e.i(4545),d=e.i(6224),s=e.i(4787);let f=n.U.div.withConfig({displayName:"calendar__Grid",componentId:"sc-a81dcf24-0"})`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.6rem;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; }
`,p=n.U.div.withConfig({displayName:"calendar__Weekday",componentId:"sc-a81dcf24-1"})`
  padding: 0 0.4rem 0.4rem;
  font-size: 1.3rem;
  color: ${({theme:e})=>e.color.muted};
  text-transform: lowercase;
  ${({theme:e})=>e.mobile} { display: none; }
`,h=n.U.div.withConfig({displayName:"calendar__Day",componentId:"sc-a81dcf24-2"})`
  min-height: 11.6rem;
  padding: 0.8rem;
  display: grid;
  align-content: start;
  gap: 0.6rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.tile};
  ${({$blank:e,theme:t})=>e&&n.m`background: none; border: 1px dashed ${t.color.line}; ${t.mobile} { display: none; }`}
  ${({$today:e,theme:t})=>e&&n.m`
    box-shadow: inset 0 0 0 1px ${t.color.accent};
    ${m} { background: ${t.color.accent}; color: #fff; }
  `}
  ${({theme:e})=>e.mobile} { min-height: auto; }
`,m=n.U.span.withConfig({displayName:"calendar__DayNumber",componentId:"sc-a81dcf24-3"})`
  justify-self: start;
  min-width: 2.6rem;
  padding: 0.1rem 0.7rem;
  border-radius: ${({theme:e})=>e.radius.sm};
  color: ${({theme:e})=>e.color.strong};
  text-align: center;
`,b=n.U.button.withConfig({displayName:"calendar__Item",componentId:"sc-a81dcf24-4"})`
  display: grid;
  gap: 0.2rem;
  padding: 0.6rem 0.8rem;
  border-radius: ${({theme:e})=>e.radius.sm};
  background: ${({theme:e})=>e.color.inset};
  color: ${({theme:e})=>e.color.text};
  text-align: left;
  font-size: 1.2rem;
  border-left: 0.3rem solid ${({theme:e,$status:t})=>({paid:e.color.paid,unpaid:e.color.unpaid,overdue:e.color.overdue})[t]};
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${({theme:e})=>e.color.muted}; }
  b { font-weight: 500; color: ${({theme:e})=>e.color.strong}; }
  &:hover { background: ${({theme:e})=>e.color.surface}; }
`;e.s(["default",0,function(){let{month:e,settings:n}=(0,s.U)(),[g,y]=(0,r.useState)(null),{data:_,error:v}=(0,s.Z)(()=>(0,u.k)("/payment-occurrences"),[]),[j,w]=e.split("-").map(Number),x=(new Date(j,w-1,1).getDay()+6)%7,$=new Date(j,w,0).getDate(),C=(_??[]).filter(t=>t.due_date.startsWith(e));return(0,t.jsxs)(i.u,{title:(0,d.t)("Календарь"),heading:(0,d.t)("календарь оплат"),subtitle:(0,d.t)("Как распределяются расходы в течение месяца."),children:[v&&(0,t.jsx)(a.m,{$tone:"error",role:"alert",children:v}),(0,t.jsx)(o.f,{hint:(0,d.t)("план расходов по датам")}),(0,t.jsxs)(f,{children:[Array.from({length:7},(e,t)=>new Intl.DateTimeFormat((0,d.u)(),{weekday:"short"}).format(new Date(2026,0,5+t))).map(e=>(0,t.jsx)(p,{children:e},e)),Array.from({length:x},(e,r)=>(0,t.jsx)(h,{$blank:!0,"aria-hidden":"true"},"lead"+r)),Array.from({length:$},(r,o)=>{let l=`${e}-${String(o+1).padStart(2,"0")}`;return(0,t.jsxs)(h,{$today:l===n.today,children:[(0,t.jsx)(m,{children:o+1}),C.filter(e=>e.due_date===l).map(e=>(0,t.jsxs)(b,{type:"button",$status:e.status,onClick:()=>y(e),title:`${e.title} \xb7 ${(0,c.e)(e.amount,e.currency)} \xb7 ${(0,c.U)(e.status)}`,children:[(0,t.jsx)("span",{children:e.title}),(0,t.jsx)("b",{children:(0,c.e)(e.amount,e.currency)})]},e.id))]},l)}),Array.from({length:(7-(x+$)%7)%7},(e,r)=>(0,t.jsx)(h,{$blank:!0,"aria-hidden":"true"},"tail"+r))]}),g&&(0,t.jsx)(l.p,{occurrence:g,onClose:()=>y(null)})]})}])}],4296,(e,t,r)=>{let n="/calendar";(window.__NEXT_P=window.__NEXT_P||[]).push([n,()=>e.r(1318)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([n])})},1158,(e,t,r)=>{t.exports=e.r(9149)}]);