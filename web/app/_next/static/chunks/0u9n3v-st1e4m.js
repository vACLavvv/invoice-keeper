(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[3505,e=>{var t=e.i(6196),r=e.i(4545),n=e.i(6224),a=e.i(8524);let l=e=>({paid:(0,n.t)("Оплачено"),unpaid:(0,n.t)("К оплате"),overdue:(0,n.t)("Просрочено")})[e],i=e=>({once:(0,n.t)("Разовый"),monthly:(0,n.t)("Ежемесячный"),quarterly:(0,n.t)("Ежеквартальный"),yearly:(0,n.t)("Ежегодный")})[e];e.s(["L",0,function({items:e,empty:s,onOpen:o}){return e.length?(0,t.jsx)(t.Fragment,{children:e.map(e=>(0,t.jsxs)("button",{type:"button",className:"work-item",onClick:()=>o(e),children:[(0,t.jsx)("span",{className:`work-item-icon ${e.status}`,children:"paid"===e.status?a.f.check:a.f.receipt}),(0,t.jsxs)("span",{className:"work-item-copy",children:[(0,t.jsxs)("b",{children:[e.title,e.wallet?.sanctioned?" ⛔":""]}),(0,t.jsxs)("small",{children:[i(e.frequency)," · ",e.paid_at?(0,n.t)("Оплачено {date}",{date:(0,r.c)(e.paid_at)}):(0,r.c)(e.due_date)]})]}),(0,t.jsxs)("span",{className:"work-item-money",children:[(0,r.z)(e.amount)," ",(0,t.jsx)("small",{children:r.F[e.currency]}),(0,t.jsx)("span",{className:`work-item-state ${e.status}`,children:l(e.status)})]}),(0,t.jsx)("span",{className:"work-item-arrow","aria-hidden":"true",children:"›"})]},e.id))}):(0,t.jsx)("p",{className:"work-empty",children:s})},"b",0,(e,t)=>{let r=new Date(e+"T12:00:00Z");return r.setUTCDate(r.getUTCDate()+t),r.toISOString().slice(0,10)},"H",0,e=>({RUB:(0,n.t)("Российский рубль"),USD:(0,n.t)("Доллар США"),EUR:(0,n.t)("Евро")})[e],"a",0,function(e,t){if(e.is_late)return(0,n.t)("{n} дн. задержки",{n:e.days_overdue});if("paid"===e.status)return(0,n.t)("В срок");let r=Math.round((Date.parse(e.due_date+"T00:00:00Z")-Date.parse(t+"T00:00:00Z"))/864e5);return 0===r?(0,n.t)("Сегодня"):1===r?(0,n.t)("Завтра"):r>1?(0,n.t)("Через {n} дн.",{n:r}):""},"z",0,i,"h",0,e=>(0,n.K)(e,["платёж","платежа","платежей"],["payment","payments"]),"U",0,e=>({once:(0,n.t)("Разовый платёж"),monthly:(0,n.t)("Ежемесячно"),quarterly:(0,n.t)("Ежеквартально"),yearly:(0,n.t)("Ежегодно")})[e],"g",0,l])},7355,(e,t,r)=>{function n(e,t,r,n){return!1}e.i(522),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"getDomainLocale",{enumerable:!0,get:function(){return n}}),e.r(4986),("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},4304,(e,t,r)=>{e.i(522),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return w},useLinkStatus:function(){return _}};for(var a in n)Object.defineProperty(r,a,{enumerable:!0,get:n[a]});let l=e.r(375),i=e.r(6196),s=l._(e.r(3907)),o=e.r(2720),d=e.r(3268),c=e.r(2585),u=e.r(5679),p=e.r(6543),m=e.r(3319),h=e.r(5885),f=e.r(7355),g=e.r(7801),x=e.r(7616),b=new Set;function j(e,t,r,n){if(!("u"<typeof window)&&(0,d.isLocalURL)(t)){if(!n.bypassPrefetchedCheck){let a=t+"%"+r+"%"+(void 0!==n.locale?n.locale:"locale"in e?e.locale:void 0);if(b.has(a))return;b.add(a)}e.prefetch(t,r,n).catch(e=>{})}}function y(e){return"string"==typeof e?e:(0,c.formatUrl)(e)}let v=s.default.forwardRef(function(e,t){let r,n,{href:a,as:l,children:c,prefetch:b=null,passHref:v,replace:N,shallow:_,scroll:w,locale:C,onClick:$,onNavigate:k,onMouseEnter:M,onTouchStart:U,legacyBehavior:B=!1,transitionTypes:I,...P}=e;r=c,B&&("string"==typeof r||"number"==typeof r)&&(r=(0,i.jsx)("a",{children:r}));let z=s.default.useContext(m.RouterContext),O=!1!==b,{href:T,as:F}=s.default.useMemo(()=>{if(!z){let e=y(a);return{href:e,as:l?y(l):e}}let[e,t]=(0,o.resolveHref)(z,a,!0);return{href:e,as:l?(0,o.resolveHref)(z,l):t||e}},[z,a,l]),S=s.default.useRef(T),E=s.default.useRef(F);B&&(n=s.default.Children.only(r));let R=B?n&&"object"==typeof n&&n.ref:t,[L,D,A]=(0,h.useIntersection)({rootMargin:"200px"}),K=s.default.useCallback(e=>{(E.current!==F||S.current!==T)&&(A(),E.current=F,S.current=T),L(e)},[F,T,A,L]),q=(0,x.useMergedRef)(K,R);s.default.useEffect(()=>{!z||D&&O&&j(z,T,F,{bypassPrefetchedCheck:!1,locale:C})},[F,T,D,C,O,z?.locale,z]);let H={ref:q,onClick(e){B||"function"!=typeof $||$(e),B&&n.props&&"function"==typeof n.props.onClick&&n.props.onClick(e),!z||e.defaultPrevented||function(e,t,r,n,a,l,i,s,o){let c,{nodeName:u}=e.currentTarget;if(!("A"===u.toUpperCase()&&((c=e.currentTarget.getAttribute("target"))&&"_self"!==c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,d.isLocalURL)(r)){a&&(e.preventDefault(),location.replace(r));return}e.preventDefault(),(()=>{if(o){let e=!1;if(o({preventDefault:()=>{e=!0}}),e)return}let e=i??!0;"beforePopState"in t?t[a?"replace":"push"](r,n,{shallow:l,locale:s,scroll:e}):t[a?"replace":"push"](n||r,{scroll:e})})()}}(e,z,T,F,N,_,w,C,k)},onMouseEnter(e){B||"function"!=typeof M||M(e),B&&n.props&&"function"==typeof n.props.onMouseEnter&&n.props.onMouseEnter(e),z&&j(z,T,F,{locale:C,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){B||"function"!=typeof U||U(e),B&&n.props&&"function"==typeof n.props.onTouchStart&&n.props.onTouchStart(e),z&&j(z,T,F,{locale:C,priority:!0,bypassPrefetchedCheck:!0})}};if((0,u.isAbsoluteUrl)(F))H.href=F;else if(!B||v||"a"===n.type&&!("href"in n.props)){let e=void 0!==C?C:z?.locale;H.href=z?.isLocaleDomain&&(0,f.getDomainLocale)(F,e,z?.locales,z?.domainLocales)||(0,g.addBasePath)((0,p.addLocale)(F,e,z?.defaultLocale))}return B?s.default.cloneElement(n,H):(0,i.jsx)("a",{...P,...H,children:r})}),N=(0,s.createContext)({pending:!1}),_=()=>(0,s.useContext)(N),w=v;("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},5885,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useIntersection",{enumerable:!0,get:function(){return o}});let n=e.r(3907),a=e.r(6759),l="function"==typeof IntersectionObserver,i=new Map,s=[];function o({rootRef:e,rootMargin:t,disabled:r}){let d=r||!l,[c,u]=(0,n.useState)(!1),p=(0,n.useRef)(null),m=(0,n.useCallback)(e=>{p.current=e},[]);return(0,n.useEffect)(()=>{if(l){if(d||c)return;let r=p.current;if(r&&r.tagName)return function(e,t,r){let{id:n,observer:a,elements:l}=function(e){let t,r={root:e.root||null,margin:e.rootMargin||""},n=s.find(e=>e.root===r.root&&e.margin===r.margin);if(n&&(t=i.get(n)))return t;let a=new Map;return t={id:r,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=a.get(e.target),r=e.isIntersecting||e.intersectionRatio>0;t&&r&&t(r)})},e),elements:a},s.push(r),i.set(r,t),t}(r);return l.set(e,t),a.observe(e),function(){if(l.delete(e),a.unobserve(e),0===l.size){a.disconnect(),i.delete(n);let e=s.findIndex(e=>e.root===n.root&&e.margin===n.margin);e>-1&&s.splice(e,1)}}}(r,e=>e&&u(e),{root:e?.current,rootMargin:t})}else if(!c){let e=(0,a.requestIdleCallback)(()=>u(!0));return()=>(0,a.cancelIdleCallback)(e)}},[d,t,e,c,p.current]),[m,c,(0,n.useCallback)(()=>{u(!1)},[])]}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},7616,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return a}});let n=e.r(3907);function a(e,t){let r=(0,n.useRef)(null),a=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=a.current;t&&(a.current=null,t())}else e&&(r.current=l(e,n)),t&&(a.current=l(t,n))},[e,t])}function l(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},136,e=>{var t=e.i(6196),r=e.i(3907),n=e.i(2948),a=e.i(5672),l=e.i(4545),i=e.i(6224),s=e.i(4787);function o(){let e=(0,a.i)();return{paid:"dark"===e.name?e.color.accent:e.color.accentDeep,remaining:e.color.faint}}function d(){let e=o();return(0,t.jsxs)(m,{children:[(0,t.jsxs)("span",{children:[(0,t.jsx)(h,{style:{background:e.paid}}),(0,i.t)("оплачено")]}),(0,t.jsxs)("span",{children:[(0,t.jsx)(h,{style:{background:e.remaining}}),(0,i.t)("осталось")]})]})}function c({title:e,line:r,currency:n}){let a=l.F[n];return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("b",{children:e}),(0,t.jsxs)("span",{children:[(0,i.t)("план"),": ",a," ",(0,l.z)(r.planned)]}),(0,t.jsxs)("span",{children:[(0,i.t)("оплачено"),": ",a," ",(0,l.z)(r.paid)]}),(0,t.jsxs)("span",{children:[(0,i.t)("осталось"),": ",a," ",(0,l.z)(r.remaining)]})]})}function u({budget:e,currency:a}){let d=o(),p=(0,n.useRouter)(),{setMonth:m}=(0,s.U)(),[h,w]=(0,r.useState)(null),C=function(e){if(e<=0)return 1;let t=10**Math.floor(Math.log10(e));return([1,2,2.5,5,10].find(r=>r*t>=e)??10)*t}(Math.max(...e.months.map(e=>Number(e.currencies[a].planned)))),$=[1,.5,0];return(0,t.jsxs)(f,{role:"group","aria-label":(0,i.t)("План и оплата по месяцам, {c}",{c:a}),children:[(0,t.jsx)(g,{"aria-hidden":"true",children:$.map(e=>{let r;return(0,t.jsx)("span",{children:(r=C*e)>=1e6?`${+(r/1e6).toFixed(1)}M`:r>=1e3?`${+(r/1e3).toFixed(1)}k`:String(r)},e)})}),(0,t.jsxs)(x,{children:[$.map(e=>(0,t.jsx)(b,{style:{top:`${(1-e)*20}rem`}},e)),e.months.map((e,r)=>{let n=e.currencies[a],s=Number(n.paid)/C*100,o=Number(n.remaining)/C*100,u=(0,l.c)(e.month+"-01",{month:"long"});return(0,t.jsxs)(j,{type:"button","aria-label":`${u}: ${(0,i.t)("план")} ${(0,l.z)(n.planned)} ${a}, ${(0,i.t)("оплачено")} ${(0,l.z)(n.paid)}`,onMouseEnter:()=>w(r),onMouseLeave:()=>w(null),onFocus:()=>w(r),onBlur:()=>w(null),onClick:()=>{m(e.month),p.push("/calendar")},children:[(0,t.jsxs)(y,{children:[o>0&&(0,t.jsx)(v,{$top:!0,style:{height:`${o}%`,background:d.remaining}}),s>0&&(0,t.jsx)(v,{$top:0===o,style:{height:`${s}%`,background:d.paid}})]}),(0,t.jsxs)(N,{"aria-hidden":"true",children:[(0,t.jsx)("span",{children:(0,l.c)(e.month+"-01",{month:"short"}).replace(".","")}),(0,t.jsx)("span",{children:u.charAt(0).toUpperCase()})]}),h===r&&(0,t.jsx)(_,{$right:r>7,children:(0,t.jsx)(c,{title:u,line:n,currency:a})})]},e.month)})]})]})}function p({budget:e,currency:n}){let a=o(),[s,d]=(0,r.useState)(null),u=e.categories.map(e=>({name:e.category??(0,i.t)("без категории"),line:e.currencies[n]})).filter(e=>Number(e.line.planned)>0).sort((e,t)=>Number(t.line.planned)-Number(e.line.planned));if(!u.length)return null;let m=Math.max(...u.map(e=>Number(e.line.planned)));return(0,t.jsx)(w,{role:"list","aria-label":(0,i.t)("План по категориям, {c}",{c:n}),children:u.map(e=>(0,t.jsxs)(C,{role:"listitem",tabIndex:0,onMouseEnter:()=>d(e.name),onMouseLeave:()=>d(null),onFocus:()=>d(e.name),onBlur:()=>d(null),children:[(0,t.jsx)($,{title:e.name,children:e.name}),(0,t.jsx)(k,{children:(0,t.jsxs)("span",{style:{width:`${Number(e.line.planned)/m*100}%`},children:[Number(e.line.paid)>0&&(0,t.jsx)("i",{style:{flex:Number(e.line.paid),background:a.paid}}),Number(e.line.remaining)>0&&(0,t.jsx)("i",{style:{flex:Number(e.line.remaining),background:a.remaining}})]})}),(0,t.jsxs)(M,{children:[l.F[n]," ",(0,l.z)(e.line.planned)]}),s===e.name&&(0,t.jsx)(_,{$right:!1,$below:!0,children:(0,t.jsx)(c,{title:e.name,line:e.line,currency:n})})]},e.name))})}let m=a.U.div.withConfig({displayName:"BudgetCharts__LegendRow",componentId:"sc-f03d69a4-0"})`
  display: flex;
  gap: 1.6rem;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.4rem;
  span { display: inline-flex; align-items: center; gap: 0.6rem; }
`,h=a.U.i.withConfig({displayName:"BudgetCharts__Swatch",componentId:"sc-f03d69a4-1"})`
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 0.3rem;
`,f=a.U.div.withConfig({displayName:"BudgetCharts__Chart",componentId:"sc-f03d69a4-2"})`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem;
  padding: 1.6rem 1.6rem 0.8rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  background: ${({theme:e})=>e.color.surface};
`,g=a.U.div.withConfig({displayName:"BudgetCharts__Axis",componentId:"sc-f03d69a4-3"})`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 20rem;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.2rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  span { line-height: 0; }
`,x=a.U.div.withConfig({displayName:"BudgetCharts__Plot",componentId:"sc-f03d69a4-4"})`
  position: relative;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0.4rem;
`,b=a.U.div.withConfig({displayName:"BudgetCharts__Grid",componentId:"sc-f03d69a4-5"})`
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: ${({theme:e})=>e.color.line};
  pointer-events: none;
`,j=a.U.button.withConfig({displayName:"BudgetCharts__Column",componentId:"sc-f03d69a4-6"})`
  position: relative;
  display: grid;
  grid-template-rows: 20rem auto;
  justify-items: center;
  padding: 0;
  cursor: pointer;
  border-radius: ${({theme:e})=>e.radius.sm};
  &:hover, &:focus-visible { background: ${({theme:e})=>e.color.hover}; }
`,y=a.U.div.withConfig({displayName:"BudgetCharts__Stack",componentId:"sc-f03d69a4-7"})`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  width: min(70%, 3.2rem);
  height: 100%;
`,v=a.U.div.withConfig({displayName:"BudgetCharts__Segment",componentId:"sc-f03d69a4-8"})`
  min-height: 2px;
  border-radius: ${({$top:e})=>e?"4px 4px 0 0":"0"};
`,N=a.U.span.withConfig({displayName:"BudgetCharts__Label",componentId:"sc-f03d69a4-9"})`
  padding: 0.6rem 0;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.2rem;
  span + span { display: none; }
  ${({theme:e})=>e.mobile} {
    span:first-child { display: none; }
    span + span { display: inline; }
  }
`,_=a.U.div.withConfig({displayName:"BudgetCharts__Tooltip",componentId:"sc-f03d69a4-10"})`
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
`,w=a.U.div.withConfig({displayName:"BudgetCharts__Bars",componentId:"sc-f03d69a4-11"})`
  display: grid;
  gap: 0.4rem;
  padding: 1.2rem 1.6rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  background: ${({theme:e})=>e.color.surface};
`,C=a.U.div.withConfig({displayName:"BudgetCharts__BarRow",componentId:"sc-f03d69a4-12"})`
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
`,$=a.U.span.withConfig({displayName:"BudgetCharts__BarName",componentId:"sc-f03d69a4-13"})`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({theme:e})=>e.color.text};
`,k=a.U.div.withConfig({displayName:"BudgetCharts__Track",componentId:"sc-f03d69a4-14"})`
  height: 1.2rem;
  > span { display: flex; gap: 2px; height: 100%; min-width: 2px; }
  i { display: block; height: 100%; }
  i:first-child { border-radius: 4px 0 0 4px; }
  i:last-child { border-radius: 0 4px 4px 0; }
  i:only-child { border-radius: 4px; }
`,M=a.U.span.withConfig({displayName:"BudgetCharts__BarValue",componentId:"sc-f03d69a4-15"})`
  color: ${({theme:e})=>e.color.muted};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;var U=e.i(9877),B=e.i(3505),I=e.i(7289);function P({currency:e,line:r}){return(0,t.jsxs)("article",{className:"summary-card",children:[(0,t.jsxs)("div",{className:"summary-top",children:[(0,t.jsxs)("span",{className:"currency-label",children:[(0,t.jsx)("span",{className:"currency-symbol",children:l.F[e]}),e]}),(0,t.jsx)("span",{children:(0,B.H)(e)})]}),(0,t.jsxs)("div",{className:"summary-amount",children:[(0,l.z)(r.planned),(0,t.jsx)("small",{children:l.F[e]})]}),(0,t.jsx)("p",{className:"summary-caption",children:(0,i.t)("План на год")}),(0,t.jsxs)("div",{className:"budget-card-detail",children:[(0,t.jsxs)("span",{children:[(0,i.t)("Оплачено")," ",(0,t.jsxs)("b",{children:[(0,l.z)(r.paid)," ",l.F[e]]})]}),(0,t.jsxs)("span",{children:[(0,i.t)("Осталось")," ",(0,t.jsxs)("b",{children:[(0,l.z)(r.remaining)," ",l.F[e]]})]})]})]})}e.s(["default",0,function(){let{settings:e}=(0,s.U)(),[n,a]=(0,r.useState)(Number(e.today.slice(0,4))),{data:o,error:c}=(0,s.Z)(()=>(0,I.k)(`/budget?year=${n}`),[n]),m=l.E.filter(e=>o&&Number(o.currencies[e].planned)>0),h=m.length?m:l.E,[f,g]=(0,r.useState)(null),x=f&&h.includes(f)?f:h[0];return(0,t.jsxs)(U.u,{title:(0,i.t)("Бюджет"),heading:(0,i.t)("План расходов"),subtitle:(0,i.t)("Посмотрите, сколько потребуется на месяц и год — отдельно по каждой валюте."),children:[c&&(0,t.jsx)("div",{className:"notice notice-error",role:"alert",children:c}),(0,t.jsxs)("div",{className:"budget-toolbar",children:[(0,t.jsxs)("div",{className:"budget-switch",role:"group","aria-label":(0,i.t)("Год бюджета"),children:[(0,t.jsx)("button",{type:"button",className:"status-tab","aria-label":(0,i.t)("Предыдущий год"),onClick:()=>a(e=>Math.max(2e3,e-1)),children:"‹"}),(0,t.jsx)("button",{type:"button",className:"status-tab selected","aria-live":"polite",children:(0,i.t)("На {year} год",{year:n})}),(0,t.jsx)("button",{type:"button",className:"status-tab","aria-label":(0,i.t)("Следующий год"),onClick:()=>a(e=>Math.min(2100,e+1)),children:"›"})]}),(0,t.jsxs)("label",{className:"budget-year-label",children:[(0,i.t)("Год"),(0,t.jsx)("input",{type:"number",min:2e3,max:2100,value:n,"aria-label":(0,i.t)("Год бюджета"),onChange:e=>{let t=Number(e.target.value);t>=2e3&&t<=2100&&a(t)}})]})]}),o?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:"summary-grid",children:l.E.map(e=>(0,t.jsx)(P,{currency:e,line:o.currencies[e]},e))}),(0,t.jsx)("div",{className:"notice",children:(0,i.t)("Разовые платежи учтены один раз, регулярные — по своему повторению, по сроку оплаты. Будущие месяцы посчитаны по графику без создания записей в истории, паузы учтены. Конвертации валют нет.")}),m.length>0&&(0,t.jsxs)("section",{className:"work-panel chart-panel",children:[(0,t.jsxs)("div",{className:"work-panel-heading",children:[(0,t.jsx)("h2",{children:(0,i.t)("По месяцам")}),(0,t.jsx)("div",{className:"status-tabs",role:"group","aria-label":(0,i.t)("Валюта графиков"),children:m.map(e=>(0,t.jsxs)("button",{type:"button",className:`status-tab${e===x?" selected":""}`,"aria-pressed":e===x,onClick:()=>g(e),children:[l.F[e]," ",e]},e))})]}),(0,t.jsxs)("div",{className:"chart-body",children:[(0,t.jsx)(u,{budget:o,currency:x}),(0,t.jsx)(d,{})]})]}),(0,t.jsx)("h2",{className:"section-title",children:(0,i.t)("План по месяцам")}),(0,t.jsx)("div",{className:"ledger table-wrap cards",children:(0,t.jsxs)("table",{children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{children:[(0,t.jsx)("th",{children:(0,i.t)("МЕСЯЦ")}),h.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,i.t)("ПЛАН")]},e)),h.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,i.t)("ОПЛАЧЕНО")]},e+"p"))]})}),(0,t.jsx)("tbody",{children:o.months.map(e=>(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{children:(0,l.c)(e.month+"-01",{month:"long",year:"numeric"})}),h.map(r=>(0,t.jsxs)("td",{className:"amount-cell","data-label":`${r} \xb7 ${(0,i.t)("план")}`,children:[(0,l.z)(e.currencies[r].planned),(0,t.jsx)("small",{children:l.F[r]})]},r)),h.map(r=>(0,t.jsxs)("td",{className:"date-cell","data-label":`${r} \xb7 ${(0,i.t)("оплачено")}`,children:[(0,l.z)(e.currencies[r].paid)," ",l.F[r]]},r+"p"))]},e.month))})]})}),(0,t.jsx)("h2",{className:"section-title",children:(0,i.t)("По категориям")}),0===o.categories.length?(0,t.jsx)("div",{className:"ledger empty-state",children:(0,i.t)("В этом году платежей нет")}):(0,t.jsxs)(t.Fragment,{children:[m.length>0&&(0,t.jsx)("section",{className:"work-panel chart-panel",children:(0,t.jsx)("div",{className:"chart-body",children:(0,t.jsx)(p,{budget:o,currency:x})})}),(0,t.jsx)("div",{className:"ledger table-wrap cards",children:(0,t.jsxs)("table",{children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{children:[(0,t.jsx)("th",{children:(0,i.t)("КАТЕГОРИЯ")}),h.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,i.t)("ПЛАН")]},e)),h.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,i.t)("ОСТАЛОСЬ")]},e+"r"))]})}),(0,t.jsx)("tbody",{children:o.categories.map(e=>(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{children:e.category??(0,t.jsx)("span",{className:"muted",children:(0,i.t)("Без категории")})}),h.map(r=>(0,t.jsxs)("td",{className:"amount-cell","data-label":`${r} \xb7 ${(0,i.t)("план")}`,children:[(0,l.z)(e.currencies[r].planned),(0,t.jsx)("small",{children:l.F[r]})]},r)),h.map(r=>(0,t.jsxs)("td",{className:"date-cell","data-label":`${r} \xb7 ${(0,i.t)("осталось")}`,children:[(0,l.z)(e.currencies[r].remaining)," ",l.F[r]]},r+"r"))]},e.category??"-"))})]})})]})]}):(0,t.jsx)("div",{className:"ledger empty-state",children:(0,i.t)("Считаем…")})]})}],136)}],9114,(e,t,r)=>{let n="/budget";(window.__NEXT_P=window.__NEXT_P||[]).push([n,()=>e.r(136)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([n])})},9146,(e,t,r)=>{t.exports=e.r(4304)}]);