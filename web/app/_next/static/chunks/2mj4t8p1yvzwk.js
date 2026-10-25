(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[3505,e=>{var t=e.i(1398),r=e.i(4545),n=e.i(6224),a=e.i(8524);let i=e=>({paid:(0,n.t)("Оплачено"),unpaid:(0,n.t)("К оплате"),overdue:(0,n.t)("Просрочено")})[e],l=e=>({once:(0,n.t)("Разовый"),monthly:(0,n.t)("Ежемесячный"),quarterly:(0,n.t)("Ежеквартальный"),yearly:(0,n.t)("Ежегодный")})[e];e.s(["L",0,function({items:e,empty:s,onOpen:o}){return e.length?(0,t.jsx)(t.Fragment,{children:e.map(e=>(0,t.jsxs)("button",{type:"button",className:"work-item",onClick:()=>o(e),children:[(0,t.jsx)("span",{className:`work-item-icon ${e.status}`,children:"paid"===e.status?a.f.check:a.f.receipt}),(0,t.jsxs)("span",{className:"work-item-copy",children:[(0,t.jsxs)("b",{children:[e.title,e.wallet?.sanctioned?" ⛔":""]}),(0,t.jsxs)("small",{children:[l(e.frequency)," · ",e.paid_at?(0,n.t)("Оплачено {date}",{date:(0,r.c)(e.paid_at)}):(0,r.c)(e.due_date)]})]}),(0,t.jsxs)("span",{className:"work-item-money",children:[(0,r.z)(e.amount)," ",(0,t.jsx)("small",{children:r.F[e.currency]}),(0,t.jsx)("span",{className:`work-item-state ${e.status}`,children:i(e.status)})]}),(0,t.jsx)("span",{className:"work-item-arrow","aria-hidden":"true",children:"›"})]},e.id))}):(0,t.jsx)("p",{className:"work-empty",children:s})},"b",0,(e,t)=>{let r=new Date(e+"T12:00:00Z");return r.setUTCDate(r.getUTCDate()+t),r.toISOString().slice(0,10)},"H",0,e=>({RUB:(0,n.t)("Российский рубль"),USD:(0,n.t)("Доллар США"),EUR:(0,n.t)("Евро")})[e],"a",0,function(e,t){if(e.is_late)return(0,n.t)("{n} дн. задержки",{n:e.days_overdue});if("paid"===e.status)return(0,n.t)("В срок");let r=Math.round((Date.parse(e.due_date+"T00:00:00Z")-Date.parse(t+"T00:00:00Z"))/864e5);return 0===r?(0,n.t)("Сегодня"):1===r?(0,n.t)("Завтра"):r>1?(0,n.t)("Через {n} дн.",{n:r}):""},"z",0,l,"h",0,e=>(0,n.K)(e,["платёж","платежа","платежей"],["payment","payments"]),"U",0,e=>({once:(0,n.t)("Разовый платёж"),monthly:(0,n.t)("Ежемесячно"),quarterly:(0,n.t)("Ежеквартально"),yearly:(0,n.t)("Ежегодно")})[e],"g",0,i])},4471,(e,t,r)=>{function n(e,t,r,n){return!1}e.i(461),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"getDomainLocale",{enumerable:!0,get:function(){return n}}),e.r(90),("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},9149,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return _},useLinkStatus:function(){return N}};for(var a in n)Object.defineProperty(r,a,{enumerable:!0,get:n[a]});let i=e.r(2456),l=e.r(1398),s=i._(e.r(1788)),o=e.r(472),d=e.r(1112),c=e.r(8169),u=e.r(9129),p=e.r(4862),h=e.r(5479),m=e.r(1914),f=e.r(4471),g=e.r(4113),x=e.r(3230),b=new Set;function y(e,t,r,n){if(!("u"<typeof window)&&(0,d.isLocalURL)(t)){if(!n.bypassPrefetchedCheck){let a=t+"%"+r+"%"+(void 0!==n.locale?n.locale:"locale"in e?e.locale:void 0);if(b.has(a))return;b.add(a)}e.prefetch(t,r,n).catch(e=>{})}}function j(e){return"string"==typeof e?e:(0,c.formatUrl)(e)}let v=s.default.forwardRef(function(e,t){let r,n,{href:a,as:i,children:c,prefetch:b=null,passHref:v,replace:w,shallow:N,scroll:_,locale:C,onClick:k,onNavigate:$,onMouseEnter:M,onTouchStart:U,legacyBehavior:z=!1,transitionTypes:I,...B}=e;r=c,z&&("string"==typeof r||"number"==typeof r)&&(r=(0,l.jsx)("a",{children:r}));let P=s.default.useContext(h.RouterContext),F=!1!==b,{href:O,as:T}=s.default.useMemo(()=>{if(!P){let e=j(a);return{href:e,as:i?j(i):e}}let[e,t]=(0,o.resolveHref)(P,a,!0);return{href:e,as:i?(0,o.resolveHref)(P,i):t||e}},[P,a,i]),S=s.default.useRef(O),E=s.default.useRef(T);z&&(n=s.default.Children.only(r));let R=z?n&&"object"==typeof n&&n.ref:t,[L,D,A]=(0,m.useIntersection)({rootMargin:"200px"}),K=s.default.useCallback(e=>{(E.current!==T||S.current!==O)&&(A(),E.current=T,S.current=O),L(e)},[T,O,A,L]),q=(0,x.useMergedRef)(K,R);s.default.useEffect(()=>{!P||D&&F&&y(P,O,T,{bypassPrefetchedCheck:!1,locale:C})},[T,O,D,C,F,P?.locale,P]);let H={ref:q,onClick(e){z||"function"!=typeof k||k(e),z&&n.props&&"function"==typeof n.props.onClick&&n.props.onClick(e),!P||e.defaultPrevented||function(e,t,r,n,a,i,l,s,o){let c,{nodeName:u}=e.currentTarget;if(!("A"===u.toUpperCase()&&((c=e.currentTarget.getAttribute("target"))&&"_self"!==c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,d.isLocalURL)(r)){a&&(e.preventDefault(),location.replace(r));return}e.preventDefault(),(()=>{if(o){let e=!1;if(o({preventDefault:()=>{e=!0}}),e)return}let e=l??!0;"beforePopState"in t?t[a?"replace":"push"](r,n,{shallow:i,locale:s,scroll:e}):t[a?"replace":"push"](n||r,{scroll:e})})()}}(e,P,O,T,w,N,_,C,$)},onMouseEnter(e){z||"function"!=typeof M||M(e),z&&n.props&&"function"==typeof n.props.onMouseEnter&&n.props.onMouseEnter(e),P&&y(P,O,T,{locale:C,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){z||"function"!=typeof U||U(e),z&&n.props&&"function"==typeof n.props.onTouchStart&&n.props.onTouchStart(e),P&&y(P,O,T,{locale:C,priority:!0,bypassPrefetchedCheck:!0})}};if((0,u.isAbsoluteUrl)(T))H.href=T;else if(!z||v||"a"===n.type&&!("href"in n.props)){let e=void 0!==C?C:P?.locale;H.href=P?.isLocaleDomain&&(0,f.getDomainLocale)(T,e,P?.locales,P?.domainLocales)||(0,g.addBasePath)((0,p.addLocale)(T,e,P?.defaultLocale))}return z?s.default.cloneElement(n,H):(0,l.jsx)("a",{...B,...H,children:r})}),w=(0,s.createContext)({pending:!1}),N=()=>(0,s.useContext)(w),_=v;("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1914,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useIntersection",{enumerable:!0,get:function(){return o}});let n=e.r(1788),a=e.r(9604),i="function"==typeof IntersectionObserver,l=new Map,s=[];function o({rootRef:e,rootMargin:t,disabled:r}){let d=r||!i,[c,u]=(0,n.useState)(!1),p=(0,n.useRef)(null),h=(0,n.useCallback)(e=>{p.current=e},[]);return(0,n.useEffect)(()=>{if(i){if(d||c)return;let r=p.current;if(r&&r.tagName)return function(e,t,r){let{id:n,observer:a,elements:i}=function(e){let t,r={root:e.root||null,margin:e.rootMargin||""},n=s.find(e=>e.root===r.root&&e.margin===r.margin);if(n&&(t=l.get(n)))return t;let a=new Map;return t={id:r,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=a.get(e.target),r=e.isIntersecting||e.intersectionRatio>0;t&&r&&t(r)})},e),elements:a},s.push(r),l.set(r,t),t}(r);return i.set(e,t),a.observe(e),function(){if(i.delete(e),a.unobserve(e),0===i.size){a.disconnect(),l.delete(n);let e=s.findIndex(e=>e.root===n.root&&e.margin===n.margin);e>-1&&s.splice(e,1)}}}(r,e=>e&&u(e),{root:e?.current,rootMargin:t})}else if(!c){let e=(0,a.requestIdleCallback)(()=>u(!0));return()=>(0,a.cancelIdleCallback)(e)}},[d,t,e,c,p.current]),[h,c,(0,n.useCallback)(()=>{u(!1)},[])]}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},3230,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return a}});let n=e.r(1788);function a(e,t){let r=(0,n.useRef)(null),a=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=a.current;t&&(a.current=null,t())}else e&&(r.current=i(e,n)),t&&(a.current=i(t,n))},[e,t])}function i(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1422,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814),a=e.i(3828),i=e.i(4545),l=e.i(6224),s=e.i(4787);function o(){let e=(0,n.i)();return{paid:"dark"===e.name?e.color.accent:e.color.accentDeep,remaining:e.color.faint}}function d(){let e=o();return(0,t.jsxs)(h,{children:[(0,t.jsxs)("span",{children:[(0,t.jsx)(m,{style:{background:e.paid}}),(0,l.t)("оплачено")]}),(0,t.jsxs)("span",{children:[(0,t.jsx)(m,{style:{background:e.remaining}}),(0,l.t)("Осталось оплатить")]})]})}function c({title:e,line:r,currency:n}){let a=i.F[n];return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("b",{children:e}),(0,t.jsxs)("span",{children:[(0,l.t)("план"),": ",a," ",(0,i.z)(r.planned)]}),(0,t.jsxs)("span",{children:[(0,l.t)("оплачено"),": ",a," ",(0,i.z)(r.paid)]}),(0,t.jsxs)("span",{children:[(0,l.t)("Осталось оплатить"),": ",a," ",(0,i.z)(r.remaining)]})]})}function u({budget:e,currency:n}){let d=o(),p=(0,a.useRouter)(),{setMonth:h}=(0,s.U)(),[m,C]=(0,r.useState)(null),k=function(e){if(e<=0)return 1;let t=10**Math.floor(Math.log10(e));return([1,2,2.5,5,10].find(r=>r*t>=e)??10)*t}(Math.max(...e.months.map(e=>Number(e.currencies[n].planned)))),$=[1,.5,0];return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)(f,{role:"group","aria-label":(0,l.t)("План и оплата по месяцам, {c}",{c:n}),children:[(0,t.jsx)(x,{"aria-hidden":"true",children:$.map(e=>{let r;return(0,t.jsx)("span",{children:(r=k*e)>=1e6?`${+(r/1e6).toFixed(1)}M`:r>=1e3?`${+(r/1e3).toFixed(1)}k`:String(r)},e)})}),(0,t.jsxs)(b,{children:[$.map(e=>(0,t.jsx)(y,{style:{top:`${(1-e)*20}rem`}},e)),e.months.map((e,r)=>{let a=e.currencies[n],s=Number(a.paid)/k*100,o=Number(a.remaining)/k*100,u=(0,i.c)(e.month+"-01",{month:"long"});return(0,t.jsxs)(j,{type:"button","aria-label":`${u}: ${(0,l.t)("план")} ${(0,i.z)(a.planned)} ${n}, ${(0,l.t)("оплачено")} ${(0,i.z)(a.paid)}`,onMouseEnter:()=>C(r),onMouseLeave:()=>C(null),onFocus:()=>C(r),onBlur:()=>C(null),onClick:()=>{h(e.month),p.push("/calendar")},children:[(0,t.jsxs)(v,{children:[o>0&&(0,t.jsx)(w,{$top:!0,style:{height:`${o}%`,background:d.remaining}}),s>0&&(0,t.jsx)(w,{$top:0===o,style:{height:`${s}%`,background:d.paid}})]}),(0,t.jsxs)(N,{"aria-hidden":"true",children:[(0,t.jsx)("span",{children:(0,i.c)(e.month+"-01",{month:"short"}).replace(".","")}),(0,t.jsx)("span",{children:u.charAt(0).toUpperCase()})]}),m===r&&(0,t.jsx)(_,{$right:r>7,children:(0,t.jsx)(c,{title:u,line:a,currency:n})})]},e.month)})]})]}),(0,t.jsx)(g,{"aria-label":(0,l.t)("План и оплата по месяцам, {c}",{c:n}),children:e.months.map(e=>{let r=e.currencies[n],a=Number(r.planned);return(0,t.jsxs)("button",{type:"button",onClick:()=>{h(e.month),p.push("/calendar")},children:[(0,t.jsx)("span",{children:(0,i.c)(e.month+"-01",{month:"long"})}),(0,t.jsxs)("b",{children:[(0,i.z)(r.planned)," ",i.F[n]]}),(0,t.jsx)("span",{className:"month-chart-track","aria-hidden":"true",children:(0,t.jsx)("i",{style:{width:`${a/k*100}%`,background:d.remaining},children:(0,t.jsx)("i",{style:{width:`${a>0?Math.min(100,Number(r.paid)/a*100):0}%`,background:d.paid}})})}),(0,t.jsxs)("small",{children:[(0,l.t)("Оплачено")," ",(0,i.z)(r.paid)," ",i.F[n]]})]},e.month)})})]})}function p({budget:e,currency:n}){let a=o(),[s,d]=(0,r.useState)(null),u=e.categories.map(e=>({name:e.category??(0,l.t)("без категории"),line:e.currencies[n]})).filter(e=>Number(e.line.planned)>0).sort((e,t)=>Number(t.line.planned)-Number(e.line.planned));if(!u.length)return null;let h=Math.max(...u.map(e=>Number(e.line.planned)));return(0,t.jsx)(C,{role:"list","aria-label":(0,l.t)("План по категориям, {c}",{c:n}),children:u.map(e=>(0,t.jsxs)(k,{role:"listitem",tabIndex:0,onMouseEnter:()=>d(e.name),onMouseLeave:()=>d(null),onFocus:()=>d(e.name),onBlur:()=>d(null),children:[(0,t.jsx)($,{title:e.name,children:e.name}),(0,t.jsx)(M,{children:(0,t.jsxs)("span",{style:{width:`${Number(e.line.planned)/h*100}%`},children:[Number(e.line.paid)>0&&(0,t.jsx)("i",{style:{flex:Number(e.line.paid),background:a.paid}}),Number(e.line.remaining)>0&&(0,t.jsx)("i",{style:{flex:Number(e.line.remaining),background:a.remaining}})]})}),(0,t.jsxs)(U,{children:[i.F[n]," ",(0,i.z)(e.line.planned)]}),s===e.name&&(0,t.jsx)(_,{$right:!1,$below:!0,children:(0,t.jsx)(c,{title:e.name,line:e.line,currency:n})})]},e.name))})}let h=n.U.div.withConfig({displayName:"BudgetCharts__LegendRow",componentId:"sc-f03d69a4-0"})`
  display: flex;
  flex-wrap: wrap;
  gap: 1.6rem;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.4rem;
  span { display: inline-flex; align-items: center; gap: 0.6rem; }
`,m=n.U.i.withConfig({displayName:"BudgetCharts__Swatch",componentId:"sc-f03d69a4-1"})`
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 0.3rem;
`,f=n.U.div.withConfig({displayName:"BudgetCharts__Chart",componentId:"sc-f03d69a4-2"})`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem;
  padding: 1.6rem 1.6rem 0.8rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  background: ${({theme:e})=>e.color.surface};
  @media (max-width: 720px) { display: none; }
`,g=n.U.div.withConfig({displayName:"BudgetCharts__MobileMonths",componentId:"sc-f03d69a4-3"})`
  display: none;
  @media (max-width: 720px) { display: grid; gap: 4px; }
  button { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px 12px; text-align: left; padding: 12px 0; background: transparent; color: var(--desk-ink); border-bottom: 1px solid var(--desk-rule); }
  button > span:first-child { font-size: 15px; text-transform: capitalize; }
  b { text-align: right; font-size: 15px; font-weight: 550; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  small { grid-column: 1 / -1; font-size: 13px; color: var(--desk-muted); }
  .month-chart-track { grid-column: 1 / -1; height: 7px; background: var(--desk-raised); border-radius: 4px; overflow: hidden; }
  i { display: block; height: 100%; border-radius: inherit; }
`,x=n.U.div.withConfig({displayName:"BudgetCharts__Axis",componentId:"sc-f03d69a4-4"})`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 20rem;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.2rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  span { line-height: 0; }
`,b=n.U.div.withConfig({displayName:"BudgetCharts__Plot",componentId:"sc-f03d69a4-5"})`
  position: relative;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0.4rem;
`,y=n.U.div.withConfig({displayName:"BudgetCharts__Grid",componentId:"sc-f03d69a4-6"})`
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: ${({theme:e})=>e.color.line};
  pointer-events: none;
`,j=n.U.button.withConfig({displayName:"BudgetCharts__Column",componentId:"sc-f03d69a4-7"})`
  position: relative;
  display: grid;
  grid-template-rows: 20rem auto;
  justify-items: center;
  padding: 0;
  cursor: pointer;
  border-radius: ${({theme:e})=>e.radius.sm};
  &:hover, &:focus-visible { background: ${({theme:e})=>e.color.hover}; }
`,v=n.U.div.withConfig({displayName:"BudgetCharts__Stack",componentId:"sc-f03d69a4-8"})`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  width: min(70%, 3.2rem);
  height: 100%;
`,w=n.U.div.withConfig({displayName:"BudgetCharts__Segment",componentId:"sc-f03d69a4-9"})`
  min-height: 2px;
  border-radius: ${({$top:e})=>e?"4px 4px 0 0":"0"};
`,N=n.U.span.withConfig({displayName:"BudgetCharts__Label",componentId:"sc-f03d69a4-10"})`
  padding: 0.6rem 0;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.2rem;
  span + span { display: none; }
  ${({theme:e})=>e.mobile} {
    span:first-child { display: none; }
    span + span { display: inline; }
  }
`,_=n.U.div.withConfig({displayName:"BudgetCharts__Tooltip",componentId:"sc-f03d69a4-11"})`
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
`,C=n.U.div.withConfig({displayName:"BudgetCharts__Bars",componentId:"sc-f03d69a4-12"})`
  display: grid;
  gap: 0.4rem;
  padding: 1.2rem 1.6rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  background: ${({theme:e})=>e.color.surface};
`,k=n.U.div.withConfig({displayName:"BudgetCharts__BarRow",componentId:"sc-f03d69a4-13"})`
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
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }
    ${_} { left: 0; right: 0; min-width: 0; white-space: normal; overflow-wrap: anywhere; }
  }
`,$=n.U.span.withConfig({displayName:"BudgetCharts__BarName",componentId:"sc-f03d69a4-14"})`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({theme:e})=>e.color.text};
`,M=n.U.div.withConfig({displayName:"BudgetCharts__Track",componentId:"sc-f03d69a4-15"})`
  height: 1.2rem;
  > span { display: flex; gap: 2px; height: 100%; min-width: 2px; }
  i { display: block; height: 100%; }
  i:first-child { border-radius: 4px 0 0 4px; }
  i:last-child { border-radius: 0 4px 4px 0; }
  i:only-child { border-radius: 4px; }
`,U=n.U.span.withConfig({displayName:"BudgetCharts__BarValue",componentId:"sc-f03d69a4-16"})`
  color: ${({theme:e})=>e.color.muted};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${({theme:e})=>e.mobile} { white-space: normal; overflow-wrap: anywhere; text-align: right; }
`;var z=e.i(9877),I=e.i(3505),B=e.i(7289);function P({currency:e,line:r}){return(0,t.jsxs)("article",{className:"summary-card",children:[(0,t.jsxs)("div",{className:"summary-top",children:[(0,t.jsxs)("span",{className:"currency-label",children:[(0,t.jsx)("span",{className:"currency-symbol",children:i.F[e]}),e]}),(0,t.jsx)("span",{children:(0,I.H)(e)})]}),(0,t.jsxs)("div",{className:"summary-amount",children:[(0,i.z)(r.planned),(0,t.jsx)("small",{children:i.F[e]})]}),(0,t.jsx)("p",{className:"summary-caption",children:(0,l.t)("План на год")}),(0,t.jsxs)("div",{className:"budget-card-detail",children:[(0,t.jsxs)("span",{children:[(0,l.t)("Оплачено")," ",(0,t.jsxs)("b",{children:[(0,i.z)(r.paid)," ",i.F[e]]})]}),(0,t.jsxs)("span",{children:[(0,l.t)("Осталось оплатить")," ",(0,t.jsxs)("b",{children:[(0,i.z)(r.remaining)," ",i.F[e]]})]})]})]})}let F=n.U.div.withConfig({displayName:"budget__PlanNote",componentId:"sc-ac1b6190-0"})`
  display: grid;
  gap: 8px;
  p { margin: 0; line-height: 1.5; }
`;e.s(["default",0,function(){let{settings:e}=(0,s.U)(),[n,a]=(0,r.useState)(Number(e.today.slice(0,4))),{data:o,error:c}=(0,s.Z)(()=>(0,B.k)(`/budget?year=${n}`),[n]),h=i.E.filter(e=>o&&Number(o.currencies[e].planned)>0),m=h.length?h:i.E,[f,g]=(0,r.useState)(null),x=f&&m.includes(f)?f:m[0];return(0,t.jsxs)(z.u,{title:(0,l.t)("Бюджет"),heading:(0,l.t)("План расходов"),subtitle:(0,l.t)("Посмотрите, сколько потребуется на месяц и год — отдельно по каждой валюте."),children:[c&&(0,t.jsx)("div",{className:"notice notice-error",role:"alert",children:c}),(0,t.jsx)("div",{className:"budget-toolbar",children:(0,t.jsxs)("div",{className:"budget-switch",role:"group","aria-label":(0,l.t)("Год бюджета"),children:[(0,t.jsx)("button",{type:"button",className:"status-tab","aria-label":(0,l.t)("Предыдущий год"),onClick:()=>a(e=>Math.max(2e3,e-1)),children:"‹"}),(0,t.jsx)("button",{type:"button",className:"status-tab selected","aria-live":"polite",children:(0,l.t)("На {year} год",{year:n})}),(0,t.jsx)("button",{type:"button",className:"status-tab","aria-label":(0,l.t)("Следующий год"),onClick:()=>a(e=>Math.min(2100,e+1)),children:"›"})]})}),o?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:"summary-grid",children:i.E.map(e=>(0,t.jsx)(P,{currency:e,line:o.currencies[e]},e))}),(0,t.jsxs)(F,{className:"notice",children:[(0,t.jsx)("p",{children:(0,l.t)("План считается по срокам оплаты: разовые платежи — один раз, регулярные — по графику с учётом пауз. Валюты считаем отдельно.")}),(0,t.jsx)("p",{children:(0,l.t)("«Осталось оплатить» — план минус отмеченное как оплаченное.")}),(0,t.jsx)("p",{children:(0,l.t)("Оплату отмечает команда. Баланс и списания в банке не проверяются.")})]}),h.length>0&&(0,t.jsxs)("section",{className:"work-panel chart-panel",children:[(0,t.jsxs)("div",{className:"work-panel-heading",children:[(0,t.jsx)("h2",{children:(0,l.t)("По месяцам")}),(0,t.jsx)("div",{className:"status-tabs",role:"group","aria-label":(0,l.t)("Валюта графиков"),children:h.map(e=>(0,t.jsxs)("button",{type:"button",className:`status-tab${e===x?" selected":""}`,"aria-pressed":e===x,onClick:()=>g(e),children:[i.F[e]," ",e]},e))})]}),(0,t.jsxs)("div",{className:"chart-body",children:[(0,t.jsx)(u,{budget:o,currency:x}),(0,t.jsx)(d,{})]})]}),(0,t.jsx)("h2",{className:"section-title",children:(0,l.t)("План по месяцам")}),(0,t.jsx)("div",{className:"ledger table-wrap cards",children:(0,t.jsxs)("table",{children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{children:[(0,t.jsx)("th",{children:(0,l.t)("МЕСЯЦ")}),m.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,l.t)("ПЛАН")]},e)),m.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,l.t)("ОПЛАЧЕНО")]},e+"p"))]})}),(0,t.jsx)("tbody",{children:o.months.map(e=>(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{children:(0,i.c)(e.month+"-01",{month:"long",year:"numeric"})}),m.map(r=>(0,t.jsxs)("td",{className:"amount-cell","data-label":`${r} \xb7 ${(0,l.t)("план")}`,children:[(0,i.z)(e.currencies[r].planned),(0,t.jsx)("small",{children:i.F[r]})]},r)),m.map(r=>(0,t.jsxs)("td",{className:"date-cell","data-label":`${r} \xb7 ${(0,l.t)("оплачено")}`,children:[(0,i.z)(e.currencies[r].paid)," ",i.F[r]]},r+"p"))]},e.month))})]})}),(0,t.jsx)("h2",{className:"section-title",children:(0,l.t)("По категориям")}),0===o.categories.length?(0,t.jsx)("div",{className:"ledger empty-state",children:(0,l.t)("В этом году платежей нет")}):(0,t.jsxs)(t.Fragment,{children:[h.length>0&&(0,t.jsx)("section",{className:"work-panel chart-panel",children:(0,t.jsx)("div",{className:"chart-body",children:(0,t.jsx)(p,{budget:o,currency:x})})}),(0,t.jsx)("div",{className:"ledger table-wrap cards",children:(0,t.jsxs)("table",{children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{children:[(0,t.jsx)("th",{children:(0,l.t)("КАТЕГОРИЯ")}),m.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,l.t)("ПЛАН")]},e)),m.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,l.t)("Осталось оплатить")]},e+"r"))]})}),(0,t.jsx)("tbody",{children:o.categories.map(e=>(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{children:e.category??(0,t.jsx)("span",{className:"muted",children:(0,l.t)("Без категории")})}),m.map(r=>(0,t.jsxs)("td",{className:"amount-cell","data-label":`${r} \xb7 ${(0,l.t)("план")}`,children:[(0,i.z)(e.currencies[r].planned),(0,t.jsx)("small",{children:i.F[r]})]},r)),m.map(r=>(0,t.jsxs)("td",{className:"date-cell","data-label":`${r} \xb7 ${(0,l.t)("Осталось оплатить")}`,children:[(0,i.z)(e.currencies[r].remaining)," ",i.F[r]]},r+"r"))]},e.category??"-"))})]})})]})]}):(0,t.jsx)("div",{className:"ledger empty-state",children:(0,l.t)("Считаем…")})]})}],1422)}],9114,(e,t,r)=>{let n="/budget";(window.__NEXT_P=window.__NEXT_P||[]).push([n,()=>e.r(1422)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([n])})},1158,(e,t,r)=>{t.exports=e.r(9149)}]);