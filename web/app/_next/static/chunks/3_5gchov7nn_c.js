(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[83505,e=>{var t=e.i(91398),r=e.i(94545),n=e.i(46224),a=e.i(8524);let s=e=>({paid:(0,n.t)("Оплачено"),unpaid:(0,n.t)("К оплате"),overdue:(0,n.t)("Просрочено")})[e],l=e=>({RUB:(0,n.t)("Российский рубль"),USD:(0,n.t)("Доллар США"),EUR:(0,n.t)("Евро")})[e];e.s(["q",0,function({paid:e,total:r}){let a=r?Math.round(e/r*100):0;return(0,t.jsxs)("div",{className:"month-health","aria-live":"polite",children:[(0,t.jsxs)("svg",{className:"health-ring",viewBox:"0 0 56 56","aria-hidden":"true",children:[(0,t.jsx)("circle",{className:"health-track",cx:"28",cy:"28",r:"23",fill:"none",strokeWidth:"3"}),(0,t.jsx)("circle",{className:"health-value",cx:"28",cy:"28",r:"23",fill:"none",strokeWidth:"3",pathLength:"100",strokeDasharray:`${a} 100`,transform:"rotate(-90 28 28)"}),(0,t.jsx)("path",{className:"health-check",d:"m20 28 5 5 11-12",fill:"none",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round"})]}),(0,t.jsxs)("div",{children:[(0,t.jsxs)("strong",{children:[e,(0,t.jsxs)("span",{children:[" / ",r]})]}),(0,t.jsx)("small",{children:r?(0,n.t)("задач месяца закрыто"):(0,n.t)("периодов в месяце")})]})]})},"I",0,function({currency:e,totals:a,onClick:s}){var i;let o,c=Number(a?.total??0),d=Number(a?.paid??0),u=c?Math.min(d<c?99:100,Math.round(d/c*100)):0;return(0,t.jsxs)("article",{className:`summary-card currency-${e.toLowerCase()}`,onClick:s,style:s?{cursor:"pointer"}:void 0,children:[(0,t.jsxs)("div",{className:"summary-top",children:[(0,t.jsxs)("span",{className:"currency-label",children:[(0,t.jsx)("span",{className:"currency-symbol",children:r.F[e]}),(0,t.jsxs)("span",{children:[e,(0,t.jsx)("small",{children:l(e)})]})]}),(0,t.jsxs)("span",{className:"currency-code",title:(0,n.t)("Оплачено {n}% суммы плана",{n:u}),children:[u,"%"]})]}),(0,t.jsx)("p",{className:"summary-caption",children:(0,n.t)("Осталось оплатить")}),(0,t.jsxs)("div",{className:`summary-amount ${(i=a?.unpaid??"0",(o=(0,r.z)(i).length)>17?"amount-giant":o>15?"amount-extra-long":o>11?"amount-long":"")}`,children:[(0,r.z)(a?.unpaid??0),(0,t.jsx)("small",{children:r.F[e]})]}),(0,t.jsxs)("progress",{className:"summary-track",value:d,max:c||1,"aria-label":(0,n.t)("Оплачено {n}%",{n:u}),children:[u,"%"]}),(0,t.jsxs)("div",{className:"summary-bottom",children:[(0,t.jsxs)("span",{children:[(0,n.t)("Оплачено")," ",(0,t.jsxs)("b",{children:[(0,r.z)(a?.paid??0)," ",r.F[e]]})]}),(0,t.jsxs)("span",{children:[(0,n.t)("План")," ",(0,t.jsxs)("b",{children:[(0,r.z)(a?.total??0)," ",r.F[e]]})]})]})]})},"L",0,function({items:e,empty:l,onOpen:i}){return e.length?(0,t.jsx)(t.Fragment,{children:e.map(e=>{let l;return(0,t.jsxs)("button",{type:"button",className:"work-item",onClick:()=>i(e),children:[(0,t.jsx)("span",{className:`work-item-icon ${e.status}`,children:"paid"===e.status?a.f.check:a.f.receipt}),(0,t.jsxs)("span",{className:"work-item-copy",children:[(0,t.jsxs)("b",{children:[e.title,e.wallet?.sanctioned?" ⛔":""]}),(0,t.jsxs)("small",{children:[(l=e.frequency,({once:(0,n.t)("Разовый"),monthly:(0,n.t)("Ежемесячный"),quarterly:(0,n.t)("Ежеквартальный"),yearly:(0,n.t)("Ежегодный")})[l])," · ",e.paid_at?(0,n.t)("Оплачено {date}",{date:(0,r.c)(e.paid_at)}):(0,r.c)(e.due_date)]})]}),(0,t.jsxs)("span",{className:"work-item-money",children:[(0,r.z)(e.amount)," ",(0,t.jsx)("small",{children:r.F[e.currency]}),(0,t.jsx)("span",{className:`work-item-state ${e.status}`,children:s(e.status)})]}),(0,t.jsx)("span",{className:"work-item-arrow","aria-hidden":"true",children:"›"})]},e.id)})}):(0,t.jsx)("p",{className:"work-empty",children:l})},"b",0,(e,t)=>{let r=new Date(e+"T12:00:00Z");return r.setUTCDate(r.getUTCDate()+t),r.toISOString().slice(0,10)},"H",0,l,"a",0,function(e,t){if(e.is_late)return(0,n.t)("{n} дн. задержки",{n:e.days_overdue});if("paid"===e.status)return(0,n.t)("В срок");let r=Math.round((Date.parse(e.due_date+"T00:00:00Z")-Date.parse(t+"T00:00:00Z"))/864e5);return 0===r?(0,n.t)("Сегодня"):1===r?(0,n.t)("Завтра"):r>1?(0,n.t)("Через {n} дн.",{n:r}):""},"h",0,e=>(0,n.K)(e,["платёж","платежа","платежей"],["payment","payments"]),"U",0,e=>({once:(0,n.t)("Разовый платёж"),monthly:(0,n.t)("Ежемесячно"),quarterly:(0,n.t)("Ежеквартально"),yearly:(0,n.t)("Ежегодно")})[e],"g",0,s])},54471,(e,t,r)=>{function n(e,t,r,n){return!1}e.i(50461),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"getDomainLocale",{enumerable:!0,get:function(){return n}}),e.r(70090),("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},39149,(e,t,r)=>{e.i(50461),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return w},useLinkStatus:function(){return _}};for(var a in n)Object.defineProperty(r,a,{enumerable:!0,get:n[a]});let s=e.r(52456),l=e.r(91398),i=s._(e.r(91788)),o=e.r(60472),c=e.r(71112),d=e.r(28169),u=e.r(89129),p=e.r(14862),h=e.r(25479),m=e.r(71914),f=e.r(54471),x=e.r(44113),g=e.r(63230),b=new Set;function j(e,t,r,n){if(!("u"<typeof window)&&(0,c.isLocalURL)(t)){if(!n.bypassPrefetchedCheck){let a=t+"%"+r+"%"+(void 0!==n.locale?n.locale:"locale"in e?e.locale:void 0);if(b.has(a))return;b.add(a)}e.prefetch(t,r,n).catch(e=>{})}}function y(e){return"string"==typeof e?e:(0,d.formatUrl)(e)}let v=i.default.forwardRef(function(e,t){let r,n,{href:a,as:s,children:d,prefetch:b=null,passHref:v,replace:N,shallow:_,scroll:w,locale:C,onClick:k,onNavigate:$,onMouseEnter:M,onTouchStart:U,legacyBehavior:B=!1,transitionTypes:I,...z}=e;r=d,B&&("string"==typeof r||"number"==typeof r)&&(r=(0,l.jsx)("a",{children:r}));let P=i.default.useContext(h.RouterContext),F=!1!==b,{href:O,as:T}=i.default.useMemo(()=>{if(!P){let e=y(a);return{href:e,as:s?y(s):e}}let[e,t]=(0,o.resolveHref)(P,a,!0);return{href:e,as:s?(0,o.resolveHref)(P,s):t||e}},[P,a,s]),L=i.default.useRef(O),S=i.default.useRef(T);B&&(n=i.default.Children.only(r));let E=B?n&&"object"==typeof n&&n.ref:t,[R,D,A]=(0,m.useIntersection)({rootMargin:"200px"}),K=i.default.useCallback(e=>{(S.current!==T||L.current!==O)&&(A(),S.current=T,L.current=O),R(e)},[T,O,A,R]),q=(0,g.useMergedRef)(K,E);i.default.useEffect(()=>{!P||D&&F&&j(P,O,T,{bypassPrefetchedCheck:!1,locale:C})},[T,O,D,C,F,P?.locale,P]);let H={ref:q,onClick(e){B||"function"!=typeof k||k(e),B&&n.props&&"function"==typeof n.props.onClick&&n.props.onClick(e),!P||e.defaultPrevented||function(e,t,r,n,a,s,l,i,o){let d,{nodeName:u}=e.currentTarget;if(!("A"===u.toUpperCase()&&((d=e.currentTarget.getAttribute("target"))&&"_self"!==d||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,c.isLocalURL)(r)){a&&(e.preventDefault(),location.replace(r));return}e.preventDefault(),(()=>{if(o){let e=!1;if(o({preventDefault:()=>{e=!0}}),e)return}let e=l??!0;"beforePopState"in t?t[a?"replace":"push"](r,n,{shallow:s,locale:i,scroll:e}):t[a?"replace":"push"](n||r,{scroll:e})})()}}(e,P,O,T,N,_,w,C,$)},onMouseEnter(e){B||"function"!=typeof M||M(e),B&&n.props&&"function"==typeof n.props.onMouseEnter&&n.props.onMouseEnter(e),P&&j(P,O,T,{locale:C,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){B||"function"!=typeof U||U(e),B&&n.props&&"function"==typeof n.props.onTouchStart&&n.props.onTouchStart(e),P&&j(P,O,T,{locale:C,priority:!0,bypassPrefetchedCheck:!0})}};if((0,u.isAbsoluteUrl)(T))H.href=T;else if(!B||v||"a"===n.type&&!("href"in n.props)){let e=void 0!==C?C:P?.locale;H.href=P?.isLocaleDomain&&(0,f.getDomainLocale)(T,e,P?.locales,P?.domainLocales)||(0,x.addBasePath)((0,p.addLocale)(T,e,P?.defaultLocale))}return B?i.default.cloneElement(n,H):(0,l.jsx)("a",{...z,...H,children:r})}),N=(0,i.createContext)({pending:!1}),_=()=>(0,i.useContext)(N),w=v;("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},71914,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useIntersection",{enumerable:!0,get:function(){return o}});let n=e.r(91788),a=e.r(99604),s="function"==typeof IntersectionObserver,l=new Map,i=[];function o({rootRef:e,rootMargin:t,disabled:r}){let c=r||!s,[d,u]=(0,n.useState)(!1),p=(0,n.useRef)(null),h=(0,n.useCallback)(e=>{p.current=e},[]);return(0,n.useEffect)(()=>{if(s){if(c||d)return;let r=p.current;if(r&&r.tagName)return function(e,t,r){let{id:n,observer:a,elements:s}=function(e){let t,r={root:e.root||null,margin:e.rootMargin||""},n=i.find(e=>e.root===r.root&&e.margin===r.margin);if(n&&(t=l.get(n)))return t;let a=new Map;return t={id:r,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=a.get(e.target),r=e.isIntersecting||e.intersectionRatio>0;t&&r&&t(r)})},e),elements:a},i.push(r),l.set(r,t),t}(r);return s.set(e,t),a.observe(e),function(){if(s.delete(e),a.unobserve(e),0===s.size){a.disconnect(),l.delete(n);let e=i.findIndex(e=>e.root===n.root&&e.margin===n.margin);e>-1&&i.splice(e,1)}}}(r,e=>e&&u(e),{root:e?.current,rootMargin:t})}else if(!d){let e=(0,a.requestIdleCallback)(()=>u(!0));return()=>(0,a.cancelIdleCallback)(e)}},[c,t,e,d,p.current]),[h,d,(0,n.useCallback)(()=>{u(!1)},[])]}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},63230,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return a}});let n=e.r(91788);function a(e,t){let r=(0,n.useRef)(null),a=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=a.current;t&&(a.current=null,t())}else e&&(r.current=s(e,n)),t&&(a.current=s(t,n))},[e,t])}function s(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},71533,e=>{var t=e.i(91398),r=e.i(91788),n=e.i(3828),a=e.i(60814),s=e.i(94545),l=e.i(46224),i=e.i(14787);function o(){let e=(0,a.i)();return{paid:"dark"===e.name?e.color.accent:e.color.accentDeep,remaining:e.color.faint}}function c(){let e=o();return(0,t.jsxs)(h,{children:[(0,t.jsxs)("span",{children:[(0,t.jsx)(m,{style:{background:e.paid}}),(0,l.t)("оплачено")]}),(0,t.jsxs)("span",{children:[(0,t.jsx)(m,{style:{background:e.remaining}}),(0,l.t)("осталось")]})]})}function d({title:e,line:r,currency:n}){let a=s.F[n];return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("b",{children:e}),(0,t.jsxs)("span",{children:[(0,l.t)("план"),": ",a," ",(0,s.z)(r.planned)]}),(0,t.jsxs)("span",{children:[(0,l.t)("оплачено"),": ",a," ",(0,s.z)(r.paid)]}),(0,t.jsxs)("span",{children:[(0,l.t)("осталось"),": ",a," ",(0,s.z)(r.remaining)]})]})}function u({budget:e,currency:a}){let c=o(),p=(0,n.useRouter)(),{setMonth:h}=(0,i.U)(),[m,w]=(0,r.useState)(null),C=function(e){if(e<=0)return 1;let t=10**Math.floor(Math.log10(e));return([1,2,2.5,5,10].find(r=>r*t>=e)??10)*t}(Math.max(...e.months.map(e=>Number(e.currencies[a].planned)))),k=[1,.5,0];return(0,t.jsxs)(f,{role:"group","aria-label":(0,l.t)("План и оплата по месяцам, {c}",{c:a}),children:[(0,t.jsx)(x,{"aria-hidden":"true",children:k.map(e=>{let r;return(0,t.jsx)("span",{children:(r=C*e)>=1e6?`${+(r/1e6).toFixed(1)}M`:r>=1e3?`${+(r/1e3).toFixed(1)}k`:String(r)},e)})}),(0,t.jsxs)(g,{children:[k.map(e=>(0,t.jsx)(b,{style:{top:`${(1-e)*20}rem`}},e)),e.months.map((e,r)=>{let n=e.currencies[a],i=Number(n.paid)/C*100,o=Number(n.remaining)/C*100,u=(0,s.c)(e.month+"-01",{month:"long"});return(0,t.jsxs)(j,{type:"button","aria-label":`${u}: ${(0,l.t)("план")} ${(0,s.z)(n.planned)} ${a}, ${(0,l.t)("оплачено")} ${(0,s.z)(n.paid)}`,onMouseEnter:()=>w(r),onMouseLeave:()=>w(null),onFocus:()=>w(r),onBlur:()=>w(null),onClick:()=>{h(e.month),p.push("/calendar")},children:[(0,t.jsxs)(y,{children:[o>0&&(0,t.jsx)(v,{$top:!0,style:{height:`${o}%`,background:c.remaining}}),i>0&&(0,t.jsx)(v,{$top:0===o,style:{height:`${i}%`,background:c.paid}})]}),(0,t.jsxs)(N,{"aria-hidden":"true",children:[(0,t.jsx)("span",{children:(0,s.c)(e.month+"-01",{month:"short"}).replace(".","")}),(0,t.jsx)("span",{children:u.charAt(0).toUpperCase()})]}),m===r&&(0,t.jsx)(_,{$right:r>7,children:(0,t.jsx)(d,{title:u,line:n,currency:a})})]},e.month)})]})]})}function p({budget:e,currency:n}){let a=o(),[i,c]=(0,r.useState)(null),u=e.categories.map(e=>({name:e.category??(0,l.t)("без категории"),line:e.currencies[n]})).filter(e=>Number(e.line.planned)>0).sort((e,t)=>Number(t.line.planned)-Number(e.line.planned));if(!u.length)return null;let h=Math.max(...u.map(e=>Number(e.line.planned)));return(0,t.jsx)(w,{role:"list","aria-label":(0,l.t)("План по категориям, {c}",{c:n}),children:u.map(e=>(0,t.jsxs)(C,{role:"listitem",tabIndex:0,onMouseEnter:()=>c(e.name),onMouseLeave:()=>c(null),onFocus:()=>c(e.name),onBlur:()=>c(null),children:[(0,t.jsx)(k,{title:e.name,children:e.name}),(0,t.jsx)($,{children:(0,t.jsxs)("span",{style:{width:`${Number(e.line.planned)/h*100}%`},children:[Number(e.line.paid)>0&&(0,t.jsx)("i",{style:{flex:Number(e.line.paid),background:a.paid}}),Number(e.line.remaining)>0&&(0,t.jsx)("i",{style:{flex:Number(e.line.remaining),background:a.remaining}})]})}),(0,t.jsxs)(M,{children:[s.F[n]," ",(0,s.z)(e.line.planned)]}),i===e.name&&(0,t.jsx)(_,{$right:!1,$below:!0,children:(0,t.jsx)(d,{title:e.name,line:e.line,currency:n})})]},e.name))})}let h=a.U.div.withConfig({displayName:"BudgetCharts__LegendRow",componentId:"sc-f03d69a4-0"})`
  display: flex;
  gap: 1.6rem;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.4rem;
  span { display: inline-flex; align-items: center; gap: 0.6rem; }
`,m=a.U.i.withConfig({displayName:"BudgetCharts__Swatch",componentId:"sc-f03d69a4-1"})`
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
`,x=a.U.div.withConfig({displayName:"BudgetCharts__Axis",componentId:"sc-f03d69a4-3"})`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 20rem;
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.2rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  span { line-height: 0; }
`,g=a.U.div.withConfig({displayName:"BudgetCharts__Plot",componentId:"sc-f03d69a4-4"})`
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
`,k=a.U.span.withConfig({displayName:"BudgetCharts__BarName",componentId:"sc-f03d69a4-13"})`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({theme:e})=>e.color.text};
`,$=a.U.div.withConfig({displayName:"BudgetCharts__Track",componentId:"sc-f03d69a4-14"})`
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
`;var U=e.i(59877),B=e.i(83505),I=e.i(97289);function z({currency:e,line:r}){return(0,t.jsxs)("article",{className:"summary-card",children:[(0,t.jsxs)("div",{className:"summary-top",children:[(0,t.jsxs)("span",{className:"currency-label",children:[(0,t.jsx)("span",{className:"currency-symbol",children:s.F[e]}),e]}),(0,t.jsx)("span",{children:(0,B.H)(e)})]}),(0,t.jsxs)("div",{className:"summary-amount",children:[(0,s.z)(r.planned),(0,t.jsx)("small",{children:s.F[e]})]}),(0,t.jsx)("p",{className:"summary-caption",children:(0,l.t)("План на год")}),(0,t.jsxs)("div",{className:"budget-card-detail",children:[(0,t.jsxs)("span",{children:[(0,l.t)("Оплачено")," ",(0,t.jsxs)("b",{children:[(0,s.z)(r.paid)," ",s.F[e]]})]}),(0,t.jsxs)("span",{children:[(0,l.t)("Осталось")," ",(0,t.jsxs)("b",{children:[(0,s.z)(r.remaining)," ",s.F[e]]})]})]})]})}e.s(["default",0,function(){let{settings:e}=(0,i.U)(),[n,a]=(0,r.useState)(Number(e.today.slice(0,4))),{data:o,error:d}=(0,i.Z)(()=>(0,I.k)(`/budget?year=${n}`),[n]),h=s.E.filter(e=>o&&Number(o.currencies[e].planned)>0),m=h.length?h:s.E,[f,x]=(0,r.useState)(null),g=f&&m.includes(f)?f:m[0];return(0,t.jsxs)(U.u,{title:(0,l.t)("Бюджет"),heading:(0,l.t)("План расходов"),subtitle:(0,l.t)("Посмотрите, сколько потребуется на месяц и год — отдельно по каждой валюте."),children:[d&&(0,t.jsx)("div",{className:"notice notice-error",role:"alert",children:d}),(0,t.jsxs)("div",{className:"budget-toolbar",children:[(0,t.jsxs)("div",{className:"budget-switch",role:"group","aria-label":(0,l.t)("Год бюджета"),children:[(0,t.jsx)("button",{type:"button",className:"status-tab","aria-label":(0,l.t)("Предыдущий год"),onClick:()=>a(e=>Math.max(2e3,e-1)),children:"‹"}),(0,t.jsx)("button",{type:"button",className:"status-tab selected","aria-live":"polite",children:(0,l.t)("На {year} год",{year:n})}),(0,t.jsx)("button",{type:"button",className:"status-tab","aria-label":(0,l.t)("Следующий год"),onClick:()=>a(e=>Math.min(2100,e+1)),children:"›"})]}),(0,t.jsxs)("label",{className:"budget-year-label",children:[(0,l.t)("Год"),(0,t.jsx)("input",{type:"number",min:2e3,max:2100,value:n,"aria-label":(0,l.t)("Год бюджета"),onChange:e=>{let t=Number(e.target.value);t>=2e3&&t<=2100&&a(t)}})]})]}),o?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:"summary-grid",children:s.E.map(e=>(0,t.jsx)(z,{currency:e,line:o.currencies[e]},e))}),(0,t.jsx)("div",{className:"notice",children:(0,l.t)("Разовые платежи учтены один раз, регулярные — по своему повторению, по сроку оплаты. Будущие месяцы посчитаны по графику без создания записей в истории, паузы учтены. Конвертации валют нет.")}),h.length>0&&(0,t.jsxs)("section",{className:"work-panel chart-panel",children:[(0,t.jsxs)("div",{className:"work-panel-heading",children:[(0,t.jsx)("h2",{children:(0,l.t)("По месяцам")}),(0,t.jsx)("div",{className:"status-tabs",role:"group","aria-label":(0,l.t)("Валюта графиков"),children:h.map(e=>(0,t.jsxs)("button",{type:"button",className:`status-tab${e===g?" selected":""}`,"aria-pressed":e===g,onClick:()=>x(e),children:[s.F[e]," ",e]},e))})]}),(0,t.jsxs)("div",{className:"chart-body",children:[(0,t.jsx)(u,{budget:o,currency:g}),(0,t.jsx)(c,{})]})]}),(0,t.jsx)("h2",{className:"section-title",children:(0,l.t)("План по месяцам")}),(0,t.jsx)("div",{className:"ledger table-wrap cards",children:(0,t.jsxs)("table",{children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{children:[(0,t.jsx)("th",{children:(0,l.t)("МЕСЯЦ")}),m.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,l.t)("ПЛАН")]},e)),m.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,l.t)("ОПЛАЧЕНО")]},e+"p"))]})}),(0,t.jsx)("tbody",{children:o.months.map(e=>(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{children:(0,s.c)(e.month+"-01",{month:"long",year:"numeric"})}),m.map(r=>(0,t.jsxs)("td",{className:"amount-cell","data-label":`${r} \xb7 ${(0,l.t)("план")}`,children:[(0,s.z)(e.currencies[r].planned),(0,t.jsx)("small",{children:s.F[r]})]},r)),m.map(r=>(0,t.jsxs)("td",{className:"date-cell","data-label":`${r} \xb7 ${(0,l.t)("оплачено")}`,children:[(0,s.z)(e.currencies[r].paid)," ",s.F[r]]},r+"p"))]},e.month))})]})}),(0,t.jsx)("h2",{className:"section-title",children:(0,l.t)("По категориям")}),0===o.categories.length?(0,t.jsx)("div",{className:"ledger empty-state",children:(0,l.t)("В этом году платежей нет")}):(0,t.jsxs)(t.Fragment,{children:[h.length>0&&(0,t.jsx)("section",{className:"work-panel chart-panel",children:(0,t.jsx)("div",{className:"chart-body",children:(0,t.jsx)(p,{budget:o,currency:g})})}),(0,t.jsx)("div",{className:"ledger table-wrap cards",children:(0,t.jsxs)("table",{children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{children:[(0,t.jsx)("th",{children:(0,l.t)("КАТЕГОРИЯ")}),m.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,l.t)("ПЛАН")]},e)),m.map(e=>(0,t.jsxs)("th",{children:[e," · ",(0,l.t)("ОСТАЛОСЬ")]},e+"r"))]})}),(0,t.jsx)("tbody",{children:o.categories.map(e=>(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{children:e.category??(0,t.jsx)("span",{className:"muted",children:(0,l.t)("Без категории")})}),m.map(r=>(0,t.jsxs)("td",{className:"amount-cell","data-label":`${r} \xb7 ${(0,l.t)("план")}`,children:[(0,s.z)(e.currencies[r].planned),(0,t.jsx)("small",{children:s.F[r]})]},r)),m.map(r=>(0,t.jsxs)("td",{className:"date-cell","data-label":`${r} \xb7 ${(0,l.t)("осталось")}`,children:[(0,s.z)(e.currencies[r].remaining)," ",s.F[r]]},r+"r"))]},e.category??"-"))})]})})]})]}):(0,t.jsx)("div",{className:"ledger empty-state",children:(0,l.t)("Считаем…")})]})}],71533)}],49114,(e,t,r)=>{let n="/budget";(window.__NEXT_P=window.__NEXT_P||[]).push([n,()=>e.r(71533)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([n])})},41158,(e,t,r)=>{t.exports=e.r(39149)}]);