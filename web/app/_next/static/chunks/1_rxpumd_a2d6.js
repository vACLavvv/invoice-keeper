(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[4471,(e,t,r)=>{function n(e,t,r,n){return!1}e.i(461),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"getDomainLocale",{enumerable:!0,get:function(){return n}}),e.r(90),("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},9149,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return C},useLinkStatus:function(){return w}};for(var i in n)Object.defineProperty(r,i,{enumerable:!0,get:n[i]});let o=e.r(2456),l=e.r(1398),a=o._(e.r(1788)),s=e.r(472),d=e.r(1112),c=e.r(8169),u=e.r(9129),p=e.r(4862),h=e.r(5479),f=e.r(1914),m=e.r(4471),g=e.r(4113),x=e.r(3230),b=new Set;function j(e,t,r,n){if(!("u"<typeof window)&&(0,d.isLocalURL)(t)){if(!n.bypassPrefetchedCheck){let i=t+"%"+r+"%"+(void 0!==n.locale?n.locale:"locale"in e?e.locale:void 0);if(b.has(i))return;b.add(i)}e.prefetch(t,r,n).catch(e=>{})}}function y(e){return"string"==typeof e?e:(0,c.formatUrl)(e)}let _=a.default.forwardRef(function(e,t){let r,n,{href:i,as:o,children:c,prefetch:b=null,passHref:_,replace:v,shallow:w,scroll:C,locale:$,onClick:k,onNavigate:N,onMouseEnter:M,onTouchStart:U,legacyBehavior:I=!1,transitionTypes:B,...z}=e;r=c,I&&("string"==typeof r||"number"==typeof r)&&(r=(0,l.jsx)("a",{children:r}));let P=a.default.useContext(h.RouterContext),O=!1!==b,{href:E,as:F}=a.default.useMemo(()=>{if(!P){let e=y(i);return{href:e,as:o?y(o):e}}let[e,t]=(0,s.resolveHref)(P,i,!0);return{href:e,as:o?(0,s.resolveHref)(P,o):t||e}},[P,i,o]),T=a.default.useRef(E),R=a.default.useRef(F);I&&(n=a.default.Children.only(r));let S=I?n&&"object"==typeof n&&n.ref:t,[L,A,D]=(0,f.useIntersection)({rootMargin:"200px"}),K=a.default.useCallback(e=>{(R.current!==F||T.current!==E)&&(D(),R.current=F,T.current=E),L(e)},[F,E,D,L]),X=(0,x.useMergedRef)(K,S);a.default.useEffect(()=>{!P||A&&O&&j(P,E,F,{bypassPrefetchedCheck:!1,locale:$})},[F,E,A,$,O,P?.locale,P]);let H={ref:X,onClick(e){I||"function"!=typeof k||k(e),I&&n.props&&"function"==typeof n.props.onClick&&n.props.onClick(e),!P||e.defaultPrevented||function(e,t,r,n,i,o,l,a,s){let c,{nodeName:u}=e.currentTarget;if(!("A"===u.toUpperCase()&&((c=e.currentTarget.getAttribute("target"))&&"_self"!==c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,d.isLocalURL)(r)){i&&(e.preventDefault(),location.replace(r));return}e.preventDefault(),(()=>{if(s){let e=!1;if(s({preventDefault:()=>{e=!0}}),e)return}let e=l??!0;"beforePopState"in t?t[i?"replace":"push"](r,n,{shallow:o,locale:a,scroll:e}):t[i?"replace":"push"](n||r,{scroll:e})})()}}(e,P,E,F,v,w,C,$,N)},onMouseEnter(e){I||"function"!=typeof M||M(e),I&&n.props&&"function"==typeof n.props.onMouseEnter&&n.props.onMouseEnter(e),P&&j(P,E,F,{locale:$,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){I||"function"!=typeof U||U(e),I&&n.props&&"function"==typeof n.props.onTouchStart&&n.props.onTouchStart(e),P&&j(P,E,F,{locale:$,priority:!0,bypassPrefetchedCheck:!0})}};if((0,u.isAbsoluteUrl)(F))H.href=F;else if(!I||_||"a"===n.type&&!("href"in n.props)){let e=void 0!==$?$:P?.locale;H.href=P?.isLocaleDomain&&(0,m.getDomainLocale)(F,e,P?.locales,P?.domainLocales)||(0,g.addBasePath)((0,p.addLocale)(F,e,P?.defaultLocale))}return I?a.default.cloneElement(n,H):(0,l.jsx)("a",{...z,...H,children:r})}),v=(0,a.createContext)({pending:!1}),w=()=>(0,a.useContext)(v),C=_;("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1914,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useIntersection",{enumerable:!0,get:function(){return s}});let n=e.r(1788),i=e.r(9604),o="function"==typeof IntersectionObserver,l=new Map,a=[];function s({rootRef:e,rootMargin:t,disabled:r}){let d=r||!o,[c,u]=(0,n.useState)(!1),p=(0,n.useRef)(null),h=(0,n.useCallback)(e=>{p.current=e},[]);return(0,n.useEffect)(()=>{if(o){if(d||c)return;let r=p.current;if(r&&r.tagName)return function(e,t,r){let{id:n,observer:i,elements:o}=function(e){let t,r={root:e.root||null,margin:e.rootMargin||""},n=a.find(e=>e.root===r.root&&e.margin===r.margin);if(n&&(t=l.get(n)))return t;let i=new Map;return t={id:r,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=i.get(e.target),r=e.isIntersecting||e.intersectionRatio>0;t&&r&&t(r)})},e),elements:i},a.push(r),l.set(r,t),t}(r);return o.set(e,t),i.observe(e),function(){if(o.delete(e),i.unobserve(e),0===o.size){i.disconnect(),l.delete(n);let e=a.findIndex(e=>e.root===n.root&&e.margin===n.margin);e>-1&&a.splice(e,1)}}}(r,e=>e&&u(e),{root:e?.current,rootMargin:t})}else if(!c){let e=(0,i.requestIdleCallback)(()=>u(!0));return()=>(0,i.cancelIdleCallback)(e)}},[d,t,e,c,p.current]),[h,c,(0,n.useCallback)(()=>{u(!1)},[])]}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},3230,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return i}});let n=e.r(1788);function i(e,t){let r=(0,n.useRef)(null),i=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=i.current;t&&(i.current=null,t())}else e&&(r.current=o(e,n)),t&&(i.current=o(t,n))},[e,t])}function o(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1422,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814),i=e.i(3828),o=e.i(4545),l=e.i(6224),a=e.i(4787);function s(){let e=(0,n.i)();return{paid:"dark"===e.name?e.color.accent:e.color.accentDeep,remaining:e.color.faint}}function d(){let e=s();return(0,t.jsxs)(h,{children:[(0,t.jsxs)("span",{children:[(0,t.jsx)(f,{style:{background:e.paid}}),(0,l.t)("оплачено")]}),(0,t.jsxs)("span",{children:[(0,t.jsx)(f,{style:{background:e.remaining}}),(0,l.t)("осталось")]})]})}function c({title:e,line:r,currency:n}){let i=o.F[n];return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("b",{children:e}),(0,t.jsxs)("span",{children:[(0,l.t)("план"),": ",i," ",(0,o.z)(r.planned)]}),(0,t.jsxs)("span",{children:[(0,l.t)("оплачено"),": ",i," ",(0,o.z)(r.paid)]}),(0,t.jsxs)("span",{children:[(0,l.t)("осталось"),": ",i," ",(0,o.z)(r.remaining)]})]})}function u({budget:e,currency:n}){let d=s(),p=(0,i.useRouter)(),{setMonth:h}=(0,a.U)(),[f,C]=(0,r.useState)(null),$=function(e){if(e<=0)return 1;let t=10**Math.floor(Math.log10(e));return([1,2,2.5,5,10].find(r=>r*t>=e)??10)*t}(Math.max(...e.months.map(e=>Number(e.currencies[n].planned)))),k=[1,.5,0];return(0,t.jsxs)(m,{role:"group","aria-label":(0,l.t)("План и оплата по месяцам, {c}",{c:n}),children:[(0,t.jsx)(g,{"aria-hidden":"true",children:k.map(e=>{let r;return(0,t.jsx)("span",{children:(r=$*e)>=1e6?`${+(r/1e6).toFixed(1)}M`:r>=1e3?`${+(r/1e3).toFixed(1)}k`:String(r)},e)})}),(0,t.jsxs)(x,{children:[k.map(e=>(0,t.jsx)(b,{style:{top:`${(1-e)*20}rem`}},e)),e.months.map((e,r)=>{let i=e.currencies[n],a=Number(i.paid)/$*100,s=Number(i.remaining)/$*100,u=(0,o.c)(e.month+"-01",{month:"long"});return(0,t.jsxs)(j,{type:"button","aria-label":`${u}: ${(0,l.t)("план")} ${(0,o.z)(i.planned)} ${n}, ${(0,l.t)("оплачено")} ${(0,o.z)(i.paid)}`,onMouseEnter:()=>C(r),onMouseLeave:()=>C(null),onFocus:()=>C(r),onBlur:()=>C(null),onClick:()=>{h(e.month),p.push("/calendar")},children:[(0,t.jsxs)(y,{children:[s>0&&(0,t.jsx)(_,{$top:!0,style:{height:`${s}%`,background:d.remaining}}),a>0&&(0,t.jsx)(_,{$top:0===s,style:{height:`${a}%`,background:d.paid}})]}),(0,t.jsxs)(v,{"aria-hidden":"true",children:[(0,t.jsx)("span",{children:(0,o.c)(e.month+"-01",{month:"short"}).replace(".","")}),(0,t.jsx)("span",{children:u.charAt(0).toUpperCase()})]}),f===r&&(0,t.jsx)(w,{$right:r>7,children:(0,t.jsx)(c,{title:u,line:i,currency:n})})]},e.month)})]})]})}function p({budget:e,currency:n}){let i=s(),[a,d]=(0,r.useState)(null),u=e.categories.map(e=>({name:e.category??(0,l.t)("без категории"),line:e.currencies[n]})).filter(e=>Number(e.line.planned)>0).sort((e,t)=>Number(t.line.planned)-Number(e.line.planned));if(!u.length)return null;let h=Math.max(...u.map(e=>Number(e.line.planned)));return(0,t.jsx)(C,{role:"list","aria-label":(0,l.t)("План по категориям, {c}",{c:n}),children:u.map(e=>(0,t.jsxs)($,{role:"listitem",tabIndex:0,onMouseEnter:()=>d(e.name),onMouseLeave:()=>d(null),onFocus:()=>d(e.name),onBlur:()=>d(null),children:[(0,t.jsx)(k,{title:e.name,children:e.name}),(0,t.jsx)(N,{children:(0,t.jsxs)("span",{style:{width:`${Number(e.line.planned)/h*100}%`},children:[Number(e.line.paid)>0&&(0,t.jsx)("i",{style:{flex:Number(e.line.paid),background:i.paid}}),Number(e.line.remaining)>0&&(0,t.jsx)("i",{style:{flex:Number(e.line.remaining),background:i.remaining}})]})}),(0,t.jsxs)(M,{children:[o.F[n]," ",(0,o.z)(e.line.planned)]}),a===e.name&&(0,t.jsx)(w,{$right:!1,$below:!0,children:(0,t.jsx)(c,{title:e.name,line:e.line,currency:n})})]},e.name))})}let h=n.U.div.withConfig({displayName:"BudgetCharts__LegendRow",componentId:"sc-f03d69a4-0"})`
  display: flex;
  gap: 1.6rem;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.4rem;
  span { display: inline-flex; align-items: center; gap: 0.6rem; }
`,f=n.U.i.withConfig({displayName:"BudgetCharts__Swatch",componentId:"sc-f03d69a4-1"})`
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 0.3rem;
`,m=n.U.div.withConfig({displayName:"BudgetCharts__Chart",componentId:"sc-f03d69a4-2"})`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem;
  padding: 1.6rem 1.6rem 0.8rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  background: ${({theme:e})=>e.color.surface};
`,g=n.U.div.withConfig({displayName:"BudgetCharts__Axis",componentId:"sc-f03d69a4-3"})`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 20rem;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.2rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  span { line-height: 0; }
`,x=n.U.div.withConfig({displayName:"BudgetCharts__Plot",componentId:"sc-f03d69a4-4"})`
  position: relative;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0.4rem;
`,b=n.U.div.withConfig({displayName:"BudgetCharts__Grid",componentId:"sc-f03d69a4-5"})`
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: ${({theme:e})=>e.color.line};
  pointer-events: none;
`,j=n.U.button.withConfig({displayName:"BudgetCharts__Column",componentId:"sc-f03d69a4-6"})`
  position: relative;
  display: grid;
  grid-template-rows: 20rem auto;
  justify-items: center;
  padding: 0;
  cursor: pointer;
  border-radius: ${({theme:e})=>e.radius.sm};
  &:hover, &:focus-visible { background: ${({theme:e})=>e.color.hover}; }
`,y=n.U.div.withConfig({displayName:"BudgetCharts__Stack",componentId:"sc-f03d69a4-7"})`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  width: min(70%, 3.2rem);
  height: 100%;
`,_=n.U.div.withConfig({displayName:"BudgetCharts__Segment",componentId:"sc-f03d69a4-8"})`
  min-height: 2px;
  border-radius: ${({$top:e})=>e?"4px 4px 0 0":"0"};
`,v=n.U.span.withConfig({displayName:"BudgetCharts__Label",componentId:"sc-f03d69a4-9"})`
  padding: 0.6rem 0;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.2rem;
  span + span { display: none; }
  ${({theme:e})=>e.mobile} {
    span:first-child { display: none; }
    span + span { display: inline; }
  }
`,w=n.U.div.withConfig({displayName:"BudgetCharts__Tooltip",componentId:"sc-f03d69a4-10"})`
  position: absolute;
  z-index: 5;
  ${({$below:e})=>e?"top: 100%;":"top: 2rem;"}
  ${({$right:e})=>e?"right: 50%;":"left: 50%;"}
  display: grid;
  gap: 0.2rem;
  min-width: 16rem;
  padding: 1rem 1.2rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.tile};
  box-shadow: 0 0.8rem 2.4rem ${({theme:e})=>e.color.shadow};
  color: ${({theme:e})=>e.color.text};
  font-size: 1.3rem;
  text-align: left;
  white-space: nowrap;
  pointer-events: none;
  b { color: ${({theme:e})=>e.color.strong}; font-weight: 500; text-transform: capitalize; }
`,C=n.U.div.withConfig({displayName:"BudgetCharts__Bars",componentId:"sc-f03d69a4-11"})`
  display: grid;
  gap: 0.4rem;
  padding: 1.2rem 1.6rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  background: ${({theme:e})=>e.color.surface};
`,$=n.U.div.withConfig({displayName:"BudgetCharts__BarRow",componentId:"sc-f03d69a4-12"})`
  position: relative;
  display: grid;
  grid-template-columns: minmax(8rem, 16rem) 1fr auto;
  align-items: center;
  gap: 1.2rem;
  padding: 0.6rem 0.8rem;
  border-radius: ${({theme:e})=>e.radius.sm};
  outline-offset: 2px;
  &:hover, &:focus-visible { background: ${({theme:e})=>e.color.hover}; }
  ${({theme:e})=>e.mobile} {
    grid-template-columns: 1fr auto;
    > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }
  }
`,k=n.U.span.withConfig({displayName:"BudgetCharts__BarName",componentId:"sc-f03d69a4-13"})`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({theme:e})=>e.color.text};
`,N=n.U.div.withConfig({displayName:"BudgetCharts__Track",componentId:"sc-f03d69a4-14"})`
  height: 1.2rem;
  > span { display: flex; gap: 2px; height: 100%; min-width: 2px; }
  i { display: block; height: 100%; }
  i:first-child { border-radius: 4px 0 0 4px; }
  i:last-child { border-radius: 0 4px 4px 0; }
  i:only-child { border-radius: 4px; }
`,M=n.U.span.withConfig({displayName:"BudgetCharts__BarValue",componentId:"sc-f03d69a4-15"})`
  color: ${({theme:e})=>e.color.muted};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;var U=e.i(9877),I=e.i(9835),B=e.i(7289);function z({value:e,currency:r,muted:n=!1}){return 0===Number(e)?(0,t.jsx)(I.k,{children:"—"}):n?(0,t.jsxs)(I.k,{children:[o.F[r]," ",(0,o.z)(e)]}):(0,t.jsxs)(I.Z,{children:[o.F[r]," ",(0,o.z)(e)]})}function P({currency:e,line:r}){let n=Number(r.planned),i=n?Math.round(Number(r.paid)/n*100):0;return(0,t.jsxs)(I.B,{children:[(0,t.jsxs)(I.h,{children:[(0,o.i)(e)," · ",e]}),(0,t.jsx)(I.k,{children:(0,l.t)("план на год")}),(0,t.jsxs)(F,{children:[o.F[e]," ",(0,o.z)(r.planned)]}),(0,t.jsx)(T,{children:(0,t.jsx)("span",{style:{width:`${i}%`}})}),(0,t.jsxs)(I.z,{$between:!0,$wrap:!0,children:[(0,t.jsx)(I.k,{children:(0,l.t)("оплачено {sum}",{sum:`${(0,o.z)(r.paid)} ${o.F[e]}`})}),(0,t.jsx)(I.k,{children:(0,l.t)("осталось {sum}",{sum:`${(0,o.z)(r.remaining)} ${o.F[e]}`})})]})]})}let O=n.U.button.withConfig({displayName:"budget__CurrencyButton",componentId:"sc-ac1b6190-0"})`
  padding: 0.6rem 1.2rem;
  border-radius: ${({theme:e})=>e.radius.md};
  color: ${({theme:e,$selected:t})=>t?e.color.strong:e.color.muted};
  background: ${({theme:e,$selected:t})=>t?e.color.tile:"transparent"};
  &:hover { color: ${({theme:e})=>e.color.strong}; }
`,E=n.U.div.withConfig({displayName:"budget__Tiles",componentId:"sc-ac1b6190-1"})`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.6rem;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; }
`,F=n.U.div.withConfig({displayName:"budget__Big",componentId:"sc-ac1b6190-2"})`
  margin: 0.8rem 0;
  font-size: 3.2rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: ${({theme:e})=>e.color.strong};
`,T=n.U.div.withConfig({displayName:"budget__Track",componentId:"sc-ac1b6190-3"})`
  height: 0.6rem;
  margin-bottom: 0.8rem;
  border-radius: 99rem;
  background: ${({theme:e})=>e.color.line};
  overflow: hidden;
  span { display: block; height: 100%; background: ${({theme:e})=>e.color.accent}; }
`,R=n.U.button.withConfig({displayName:"budget__Arrow",componentId:"sc-ac1b6190-4"})`
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  color: ${({theme:e})=>e.color.muted};
  font-size: 2.6rem;
  line-height: 1;
  &:hover { color: ${({theme:e})=>e.color.strong}; background: ${({theme:e})=>e.color.tile}; }
`,S=n.U.h2.withConfig({displayName:"budget__Year",componentId:"sc-ac1b6190-5"})`
  min-width: 8rem;
  text-align: center;
  font-size: 2rem;
  font-weight: 500;
  color: ${({theme:e})=>e.color.strong};
`;e.s(["default",0,function(){let{settings:e}=(0,a.U)(),[n,i]=(0,r.useState)(Number(e.today.slice(0,4))),{data:s,error:c}=(0,a.Z)(()=>(0,B.k)(`/budget?year=${n}`),[n]),h=o.E.filter(e=>s&&Number(s.currencies[e].planned)>0),f=h.length?h:o.E,[m,g]=(0,r.useState)(null),x=m&&f.includes(m)?m:f[0];return(0,t.jsxs)(U.u,{title:(0,l.t)("Бюджет"),heading:(0,l.t)("бюджет на год"),subtitle:(0,l.t)("Плановые расходы по месяцам и категориям, отдельно по каждой валюте."),children:[c&&(0,t.jsx)(I.m,{$tone:"error",role:"alert",children:c}),(0,t.jsxs)(I.z,{$gap:.4,children:[(0,t.jsx)(R,{type:"button","aria-label":(0,l.t)("Предыдущий год"),onClick:()=>i(e=>Math.max(2e3,e-1)),children:"‹"}),(0,t.jsx)(S,{"aria-live":"polite",children:n}),(0,t.jsx)(R,{type:"button","aria-label":(0,l.t)("Следующий год"),onClick:()=>i(e=>Math.min(2100,e+1)),children:"›"})]}),s?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(E,{children:o.E.map(e=>(0,t.jsx)(P,{currency:e,line:s.currencies[e]},e))}),(0,t.jsx)(I.m,{children:(0,t.jsx)("span",{children:(0,l.t)("Будущие месяцы посчитаны по правилу повторения каждого платежа, паузы учтены. «Оплачено» — по отмеченным периодам.")})}),(0,t.jsx)(I.n,{children:(0,l.t)("по месяцам")}),h.length>0&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)(I.z,{$between:!0,$wrap:!0,children:[(0,t.jsx)(I.z,{$gap:.4,role:"group","aria-label":(0,l.t)("Валюта графиков"),children:h.map(e=>(0,t.jsxs)(O,{type:"button",$selected:e===x,"aria-pressed":e===x,onClick:()=>g(e),children:[o.F[e]," ",e]},e))}),(0,t.jsx)(d,{})]}),(0,t.jsx)(u,{budget:s,currency:x}),(0,t.jsx)(I.k,{children:(0,l.t)("Нажмите на месяц, чтобы открыть его в календаре. Валюты не складываются: графики — по одной выбранной.")})]}),(0,t.jsx)(I.F,{children:(0,t.jsxs)("table",{children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{children:[(0,t.jsx)("th",{children:(0,l.t)("Месяц")}),f.map(e=>(0,t.jsx)("th",{children:(0,l.t)("План, {c}",{c:e})},e)),f.map(e=>(0,t.jsx)("th",{children:(0,l.t)("Оплачено, {c}",{c:e})},e+"p"))]})}),(0,t.jsx)("tbody",{children:s.months.map(e=>{let r;return(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{children:(r=(0,o.c)(e.month+"-01",{month:"long"})).charAt(0).toUpperCase()+r.slice(1)}),f.map(r=>(0,t.jsx)("td",{children:(0,t.jsx)(z,{value:e.currencies[r].planned,currency:r})},r)),f.map(r=>(0,t.jsx)("td",{children:(0,t.jsx)(z,{value:e.currencies[r].paid,currency:r,muted:!0})},r+"p"))]},e.month)})})]})}),(0,t.jsx)(I.n,{children:(0,l.t)("по категориям")}),0===s.categories.length?(0,t.jsx)(I.e,{children:(0,l.t)("В этом году платежей нет")}):(0,t.jsxs)(t.Fragment,{children:[h.length>0&&(0,t.jsx)(p,{budget:s,currency:x}),(0,t.jsx)(I.F,{children:(0,t.jsxs)("table",{children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{children:[(0,t.jsx)("th",{children:(0,l.t)("Категория")}),f.map(e=>(0,t.jsx)("th",{children:(0,l.t)("План, {c}",{c:e})},e)),f.map(e=>(0,t.jsx)("th",{children:(0,l.t)("Осталось, {c}",{c:e})},e+"r"))]})}),(0,t.jsx)("tbody",{children:s.categories.map(e=>(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{children:e.category??(0,t.jsx)(I.k,{children:(0,l.t)("без категории")})}),f.map(r=>(0,t.jsx)("td",{children:(0,t.jsx)(z,{value:e.currencies[r].planned,currency:r})},r)),f.map(r=>(0,t.jsx)("td",{children:(0,t.jsx)(z,{value:e.currencies[r].remaining,currency:r,muted:!0})},r+"r"))]},e.category??"-"))})]})})]})]}):(0,t.jsx)(I.e,{children:(0,l.t)("Считаем…")})]})}],1422)}],9114,(e,t,r)=>{let n="/budget";(window.__NEXT_P=window.__NEXT_P||[]).push([n,()=>e.r(1422)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([n])})},1158,(e,t,r)=>{t.exports=e.r(9149)}]);