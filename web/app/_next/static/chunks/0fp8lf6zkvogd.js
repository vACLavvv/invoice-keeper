(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[4471,(e,t,n)=>{function r(e,t,n,r){return!1}e.i(461),Object.defineProperty(n,"__esModule",{value:!0}),Object.defineProperty(n,"getDomainLocale",{enumerable:!0,get:function(){return r}}),e.r(90),("function"==typeof n.default||"object"==typeof n.default&&null!==n.default)&&void 0===n.default.__esModule&&(Object.defineProperty(n.default,"__esModule",{value:!0}),Object.assign(n.default,n),t.exports=n.default)},9149,(e,t,n)=>{e.i(461),Object.defineProperty(n,"__esModule",{value:!0});var r={default:function(){return C},useLinkStatus:function(){return v}};for(var i in r)Object.defineProperty(n,i,{enumerable:!0,get:r[i]});let o=e.r(2456),a=e.r(1398),l=o._(e.r(1788)),d=e.r(472),s=e.r(1112),c=e.r(8169),u=e.r(9129),f=e.r(4862),p=e.r(5479),m=e.r(1914),g=e.r(4471),h=e.r(4113),b=e.r(3230),y=new Set;function _(e,t,n,r){if(!("u"<typeof window)&&(0,s.isLocalURL)(t)){if(!r.bypassPrefetchedCheck){let i=t+"%"+n+"%"+(void 0!==r.locale?r.locale:"locale"in e?e.locale:void 0);if(y.has(i))return;y.add(i)}e.prefetch(t,n,r).catch(e=>{})}}function x(e){return"string"==typeof e?e:(0,c.formatUrl)(e)}let j=l.default.forwardRef(function(e,t){let n,r,{href:i,as:o,children:c,prefetch:y=null,passHref:j,replace:w,shallow:v,scroll:C,locale:k,onClick:I,onNavigate:U,onMouseEnter:$,onTouchStart:P,legacyBehavior:N=!1,transitionTypes:M,...O}=e;n=c,N&&("string"==typeof n||"number"==typeof n)&&(n=(0,a.jsx)("a",{children:n}));let T=l.default.useContext(p.RouterContext),S=!1!==y,{href:L,as:R}=l.default.useMemo(()=>{if(!T){let e=x(i);return{href:e,as:o?x(o):e}}let[e,t]=(0,d.resolveHref)(T,i,!0);return{href:e,as:o?(0,d.resolveHref)(T,o):t||e}},[T,i,o]),z=l.default.useRef(L),E=l.default.useRef(R);N&&(r=l.default.Children.only(n));let D=N?r&&"object"==typeof r&&r.ref:t,[K,F,A]=(0,m.useIntersection)({rootMargin:"200px"}),B=l.default.useCallback(e=>{(E.current!==R||z.current!==L)&&(A(),E.current=R,z.current=L),K(e)},[R,L,A,K]),q=(0,b.useMergedRef)(B,D);l.default.useEffect(()=>{!T||F&&S&&_(T,L,R,{bypassPrefetchedCheck:!1,locale:k})},[R,L,F,k,S,T?.locale,T]);let H={ref:q,onClick(e){N||"function"!=typeof I||I(e),N&&r.props&&"function"==typeof r.props.onClick&&r.props.onClick(e),!T||e.defaultPrevented||function(e,t,n,r,i,o,a,l,d){let c,{nodeName:u}=e.currentTarget;if(!("A"===u.toUpperCase()&&((c=e.currentTarget.getAttribute("target"))&&"_self"!==c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,s.isLocalURL)(n)){i&&(e.preventDefault(),location.replace(n));return}e.preventDefault(),(()=>{if(d){let e=!1;if(d({preventDefault:()=>{e=!0}}),e)return}let e=a??!0;"beforePopState"in t?t[i?"replace":"push"](n,r,{shallow:o,locale:l,scroll:e}):t[i?"replace":"push"](r||n,{scroll:e})})()}}(e,T,L,R,w,v,C,k,U)},onMouseEnter(e){N||"function"!=typeof $||$(e),N&&r.props&&"function"==typeof r.props.onMouseEnter&&r.props.onMouseEnter(e),T&&_(T,L,R,{locale:k,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){N||"function"!=typeof P||P(e),N&&r.props&&"function"==typeof r.props.onTouchStart&&r.props.onTouchStart(e),T&&_(T,L,R,{locale:k,priority:!0,bypassPrefetchedCheck:!0})}};if((0,u.isAbsoluteUrl)(R))H.href=R;else if(!N||j||"a"===r.type&&!("href"in r.props)){let e=void 0!==k?k:T?.locale;H.href=T?.isLocaleDomain&&(0,g.getDomainLocale)(R,e,T?.locales,T?.domainLocales)||(0,h.addBasePath)((0,f.addLocale)(R,e,T?.defaultLocale))}return N?l.default.cloneElement(r,H):(0,a.jsx)("a",{...O,...H,children:n})}),w=(0,l.createContext)({pending:!1}),v=()=>(0,l.useContext)(w),C=j;("function"==typeof n.default||"object"==typeof n.default&&null!==n.default)&&void 0===n.default.__esModule&&(Object.defineProperty(n.default,"__esModule",{value:!0}),Object.assign(n.default,n),t.exports=n.default)},1914,(e,t,n)=>{Object.defineProperty(n,"__esModule",{value:!0}),Object.defineProperty(n,"useIntersection",{enumerable:!0,get:function(){return d}});let r=e.r(1788),i=e.r(9604),o="function"==typeof IntersectionObserver,a=new Map,l=[];function d({rootRef:e,rootMargin:t,disabled:n}){let s=n||!o,[c,u]=(0,r.useState)(!1),f=(0,r.useRef)(null),p=(0,r.useCallback)(e=>{f.current=e},[]);return(0,r.useEffect)(()=>{if(o){if(s||c)return;let n=f.current;if(n&&n.tagName)return function(e,t,n){let{id:r,observer:i,elements:o}=function(e){let t,n={root:e.root||null,margin:e.rootMargin||""},r=l.find(e=>e.root===n.root&&e.margin===n.margin);if(r&&(t=a.get(r)))return t;let i=new Map;return t={id:n,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=i.get(e.target),n=e.isIntersecting||e.intersectionRatio>0;t&&n&&t(n)})},e),elements:i},l.push(n),a.set(n,t),t}(n);return o.set(e,t),i.observe(e),function(){if(o.delete(e),i.unobserve(e),0===o.size){i.disconnect(),a.delete(r);let e=l.findIndex(e=>e.root===r.root&&e.margin===r.margin);e>-1&&l.splice(e,1)}}}(n,e=>e&&u(e),{root:e?.current,rootMargin:t})}else if(!c){let e=(0,i.requestIdleCallback)(()=>u(!0));return()=>(0,i.cancelIdleCallback)(e)}},[s,t,e,c,f.current]),[p,c,(0,r.useCallback)(()=>{u(!1)},[])]}("function"==typeof n.default||"object"==typeof n.default&&null!==n.default)&&void 0===n.default.__esModule&&(Object.defineProperty(n.default,"__esModule",{value:!0}),Object.assign(n.default,n),t.exports=n.default)},3230,(e,t,n)=>{Object.defineProperty(n,"__esModule",{value:!0}),Object.defineProperty(n,"useMergedRef",{enumerable:!0,get:function(){return i}});let r=e.r(1788);function i(e,t){let n=(0,r.useRef)(null),i=(0,r.useRef)(null);return(0,r.useCallback)(r=>{if(null===r){let e=n.current;e&&(n.current=null,e());let t=i.current;t&&(i.current=null,t())}else e&&(n.current=o(e,r)),t&&(i.current=o(t,r))},[e,t])}function o(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let n=e(t);return"function"==typeof n?n:()=>e(null)}}("function"==typeof n.default||"object"==typeof n.default&&null!==n.default)&&void 0===n.default.__esModule&&(Object.defineProperty(n.default,"__esModule",{value:!0}),Object.assign(n.default,n),t.exports=n.default)},8976,e=>{var t=e.i(1398),n=e.i(8678),r=e.i(1788),i=e.i(814),o=e.i(9877),a=e.i(9835),l=e.i(7289),d=e.i(6224),s=e.i(4410);let c=i.U.div.withConfig({displayName:"login__TopRight",componentId:"sc-ada9d95c-0"})`
  display: flex;
  align-items: center;
  gap: 1.2rem;
`,u=i.m`color: ${({theme:e})=>e.light.ink};`,f=i.U.main.withConfig({displayName:"login__Page",componentId:"sc-ada9d95c-1"})`
  min-height: 100vh;
  background: ${({theme:e})=>e.light.page};
  ${u}
  color-scheme: light;
`,p=i.U.section.withConfig({displayName:"login__Hero",componentId:"sc-ada9d95c-2"})`
  position: relative;
  overflow: hidden;
  min-height: 72rem;
  padding: 2.4rem 2.6rem 14rem;
  ${s.N}
  ${({theme:e})=>e.mobile} { min-height: 56rem; padding: 1.6rem 1.6rem 10rem; }
`,m=i.U.header.withConfig({displayName:"login__Top",componentId:"sc-ada9d95c-3"})`
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
`,g=i.U.span.withConfig({displayName:"login__Brand",componentId:"sc-ada9d95c-4"})`
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  font-size: 1.6rem;
  font-weight: 500;
`,h=i.U.a.withConfig({displayName:"login__Pill",componentId:"sc-ada9d95c-5"})`
  padding: 0.9rem 1.6rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.light.ink};
  color: #fff;
  font-weight: 600;
  &:hover { background: #2a2c30; }
`,b=i.U.div.withConfig({displayName:"login__HeroText",componentId:"sc-ada9d95c-6"})`
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 2.4rem;
  margin-top: 20rem;
  text-align: center;
  ${({theme:e})=>e.mobile} { margin-top: 14rem; gap: 1.6rem; }
`,y=i.U.div.withConfig({displayName:"login__Wordmark",componentId:"sc-ada9d95c-7"})`
  font-size: 10rem;
  line-height: 0.9;
  font-weight: 800;
  letter-spacing: -0.06em;
  ${({theme:e})=>e.mobile} { font-size: 5.2rem; }
`,_=i.U.p.withConfig({displayName:"login__Tagline",componentId:"sc-ada9d95c-8"})`
  font-size: 3.8rem;
  font-weight: 400;
  letter-spacing: 0.01em;
  ${({theme:e})=>e.mobile} { font-size: 2.2rem; }
`,x=i.U.section.withConfig({displayName:"login__Sheet",componentId:"sc-ada9d95c-9"})`
  position: relative;
  z-index: 1;
  margin-top: -8rem;
  padding: 7.2rem 2.4rem 9.6rem;
  border-radius: ${({theme:e})=>e.radius.sheet} ${({theme:e})=>e.radius.sheet} 0 0;
  background: ${({theme:e})=>e.light.panel};
  ${({theme:e})=>e.mobile} { padding: 4.8rem 1.6rem 6.4rem; border-radius: 3.2rem 3.2rem 0 0; }
`,j=i.U.div.withConfig({displayName:"login__Stats",componentId:"sc-ada9d95c-10"})`
  max-width: 96rem;
  margin: 0 auto 6.4rem;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2.4rem;
  text-align: center;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; margin-bottom: 4rem; }
`,w=i.U.div.withConfig({displayName:"login__Stat",componentId:"sc-ada9d95c-11"})`
  display: grid;
  gap: 0.4rem;
  b { font-size: 2.4rem; font-weight: 500; }
  span { color: ${({theme:e})=>e.light.muted}; }
`,v=i.U.div.withConfig({displayName:"login__Frame",componentId:"sc-ada9d95c-12"})`
  max-width: 52rem;
  margin: 0 auto;
  padding: 1.2rem;
  border-radius: 3.2rem;
  background: ${({theme:e})=>e.light.tile};
  scroll-margin-top: 4rem;
`,C=i.U.div.withConfig({displayName:"login__Card",componentId:"sc-ada9d95c-13"})`
  padding: 4rem;
  border-radius: 2.4rem;
  background: ${({theme:e})=>e.light.panel};
  h1 { font-size: 3.2rem; font-weight: 600; letter-spacing: -0.02em; }
  fieldset { border: 0; margin: 2.8rem 0 0; padding: 0; display: grid; gap: 1.6rem; }
  ${({theme:e})=>e.mobile} { padding: 2.4rem; }
`,k=i.U.p.withConfig({displayName:"login__Lead",componentId:"sc-ada9d95c-14"})`
  margin-top: 0.8rem;
  color: ${({theme:e})=>e.light.muted};
`,I=(0,i.U)(a.O).withConfig({displayName:"login__LightField",componentId:"sc-ada9d95c-15"})`${u}`,U=(0,i.U)(a.f).withConfig({displayName:"login__LightInput",componentId:"sc-ada9d95c-16"})`
  background: ${({theme:e})=>e.light.tile};
  border-color: transparent;
  ${u}
  &::placeholder { color: #a9adb3; }
  &:focus { background: ${({theme:e})=>e.light.panel}; }
`,$=i.U.div.withConfig({displayName:"login__Password",componentId:"sc-ada9d95c-17"})`
  position: relative;
  input { padding-right: 10rem; }
  button { position: absolute; right: 1.4rem; top: 50%; transform: translateY(-50%); }
`,P=(0,i.U)(a.K).withConfig({displayName:"login__Dark",componentId:"sc-ada9d95c-18"})`
  margin-top: 0.4rem;
  background: ${({theme:e})=>e.light.ink};
  &:hover:not(:disabled) { background: #2a2c30; }
`,N=i.U.p.withConfig({displayName:"login__Help",componentId:"sc-ada9d95c-19"})`
  margin-top: 2rem;
  font-size: 1.3rem;
  color: ${({theme:e})=>e.light.muted};
`,M=i.U.footer.withConfig({displayName:"login__Footer",componentId:"sc-ada9d95c-20"})`
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1.2rem;
  padding: 1.8rem 2.6rem;
  background: ${({theme:e})=>e.light.ink};
  color: #9a9ea6;
  font-size: 1.3rem;
`;e.s(["default",0,function(){let[e,i]=(0,r.useState)(!1),[s,u]=(0,r.useState)(null),[O,T]=(0,r.useState)(!1),[S,L]=(0,r.useState)(!1);async function R(e){e.preventDefault();let t=new FormData(e.currentTarget);i(!0),u(null);try{let e={username:t.get("username"),password:t.get("password")};S&&(e.code=t.get("code")),await (0,l.k)("/auth/login",{method:"POST",body:e}),window.location.assign("/")}catch(e){"two_factor_required"===e.code?(u(S?e.message:null),L(!0)):u(401===e.status?(0,d.t)("Проверьте логин и пароль"):e.message),i(!1)}}return(0,t.jsxs)(f,{children:[(0,t.jsx)(n.default,{children:(0,t.jsxs)("title",{children:[(0,d.t)("Вход")," · Invoice Keeper"]})}),(0,t.jsxs)(p,{children:[(0,t.jsxs)(m,{children:[(0,t.jsxs)(g,{children:[(0,t.jsx)(o.B,{dark:!0,size:32})," invoice keeper"]}),(0,t.jsxs)(c,{children:[(0,t.jsx)(o.T,{compact:!0}),(0,t.jsx)(h,{href:"#login",children:(0,d.t)("Войти")})]})]}),(0,t.jsxs)(b,{children:[(0,t.jsx)(y,{children:"invoice keeper"}),(0,t.jsx)(_,{children:(0,d.t)("Платежи нового поколения")}),(0,t.jsxs)(a.K,{as:"a",href:"#login",children:[(0,d.t)("Попробовать")," ",(0,t.jsx)("span",{"aria-hidden":"true",children:"→"})]})]})]}),(0,t.jsxs)(x,{children:[(0,t.jsxs)(j,{children:[(0,t.jsxs)(w,{children:[(0,t.jsx)("b",{children:(0,d.t)("3 дня")}),(0,t.jsx)("span",{children:(0,d.t)("напоминание в Telegram до срока")})]}),(0,t.jsxs)(w,{children:[(0,t.jsx)("b",{children:(0,d.t)("2 роли")}),(0,t.jsx)("span",{children:(0,d.t)("администратор и команда")})]}),(0,t.jsxs)(w,{children:[(0,t.jsx)("b",{children:(0,d.t)("3 валюты")}),(0,t.jsx)("span",{children:(0,d.t)("RUB · USD · EUR, без конвертации")})]})]}),(0,t.jsx)(v,{id:"login",children:(0,t.jsxs)(C,{children:[(0,t.jsx)("h1",{children:(0,d.t)("Вход в панель")}),(0,t.jsx)(k,{children:(0,d.t)("Все регулярные платежи команды — в одном месте.")}),(0,t.jsx)("form",{onSubmit:R,children:(0,t.jsxs)("fieldset",{disabled:e,children:[(0,t.jsxs)(I,{children:[(0,d.t)("Логин"),(0,t.jsx)(U,{name:"username",autoComplete:"username",required:!0,maxLength:64,placeholder:(0,d.t)("Ваш логин"),autoFocus:!0})]}),(0,t.jsxs)(I,{children:[(0,d.t)("Пароль"),(0,t.jsxs)($,{children:[(0,t.jsx)(U,{name:"password",type:O?"text":"password",autoComplete:"current-password",required:!0,maxLength:128,placeholder:(0,d.t)("Введите пароль")}),(0,t.jsx)(a.K,{type:"button",$variant:"ghost",onClick:()=>T(e=>!e),"aria-label":O?(0,d.t)("Скрыть пароль"):(0,d.t)("Показать пароль"),children:O?(0,d.t)("скрыть"):(0,d.t)("показать")})]})]}),S&&(0,t.jsxs)(I,{children:[(0,d.t)("Код из приложения-аутентификатора"),(0,t.jsx)(U,{name:"code",inputMode:"numeric",autoComplete:"one-time-code",pattern:"[0-9 ]{6,7}",maxLength:7,required:!0,autoFocus:!0,placeholder:"123 456"})]}),s&&(0,t.jsx)(a.m,{$tone:"error",role:"alert",children:s}),(0,t.jsx)(P,{type:"submit",children:e?(0,d.t)("Входим…"):S?(0,d.t)("Подтвердить"):(0,d.t)("Войти")})]})}),(0,t.jsx)(N,{children:(0,d.t)("Нет доступа? Попросите администратора создать для вас учётную запись.")})]})})]}),(0,t.jsxs)(M,{children:[(0,t.jsxs)("span",{children:["© ",new Date().getFullYear()," Invoice Keeper"]}),(0,t.jsx)("span",{children:(0,d.t)("Меньше рутины — больше спокойствия")})]})]})}])}],7466,(e,t,n)=>{let r="/login";(window.__NEXT_P=window.__NEXT_P||[]).push([r,()=>e.r(8976)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([r])})},1158,(e,t,n)=>{t.exports=e.r(9149)}]);