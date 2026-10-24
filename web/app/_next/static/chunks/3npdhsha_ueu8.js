(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[9835,e=>{var t=e.i(1398),r=e.i(814);let n=r.U.button.withConfig({displayName:"ui__Button",componentId:"sc-46979e46-0"})`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  min-height: ${({$small:e})=>e?"3.2rem":"4.4rem"};
  padding: ${({$small:e})=>e?"0.5rem 1.4rem":"1rem 2rem"};
  border-radius: ${({theme:e})=>e.radius.md};
  font-size: ${({$small:e})=>e?"1.3rem":"1.4rem"};
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
  ${({theme:e,$variant:t="primary"})=>({primary:r.m`
      background: ${e.color.accent}; color: #fff;
      &:hover:not(:disabled) { background: ${e.color.accentDeep}; }
    `,secondary:r.m`
      background: ${e.color.tile}; color: ${e.color.strong};
      &:hover:not(:disabled) { background: ${e.color.tileHover}; }
    `,danger:r.m`
      background: ${e.color.overdue}; color: #fff;
      &:hover:not(:disabled) { filter: brightness(0.92); }
    `,ghost:r.m`
      background: none; color: ${e.color.accent}; padding-inline: 0.2rem; min-height: auto;
      &:hover:not(:disabled) { text-decoration: underline; }
    `})[t]}
`,o=r.U.span.withConfig({displayName:"ui__Chevron",componentId:"sc-46979e46-1"})`
  width: 2.2rem;
  height: 2.2rem;
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  background: ${({theme:e})=>e.color.chevron};
  color: ${({theme:e})=>e.color.chevronText};
  font-size: 1.2rem;
  line-height: 1;
`,i=r.U.button.withConfig({displayName:"ui__IconButton",componentId:"sc-46979e46-2"})`
  width: 3.2rem;
  height: 3.2rem;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  color: ${({theme:e})=>e.color.muted};
  font-size: 2.2rem;
  line-height: 1;
  &:hover { color: ${({theme:e})=>e.color.strong}; background: ${({theme:e})=>e.color.tile}; }
`,a=r.U.section.withConfig({displayName:"ui__Card",componentId:"sc-46979e46-3"})`
  display: grid;
  gap: 1.2rem;
  min-width: 0;
`,l=r.U.div.withConfig({displayName:"ui__Tile",componentId:"sc-46979e46-4"})`
  position: relative;
  display: grid;
  align-content: start;
  gap: 0.4rem;
  min-width: 0;
  padding: 1.6rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  background: ${({theme:e})=>e.color.tile};
  overflow: hidden;
  transition: background 0.15s;
  ${({$interactive:e,theme:t})=>e&&r.m`cursor: pointer; &:hover { background: ${t.color.tileHover}; }`}
`,s=r.U.div.withConfig({displayName:"ui__TileTitle",componentId:"sc-46979e46-5"})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.2rem;
  color: ${({theme:e})=>e.color.strong};
  font-weight: 500;
`,c=r.U.span.withConfig({displayName:"ui__Sticker",componentId:"sc-46979e46-6"})`
  display: inline-block;
  padding: 0.4rem 1rem;
  border-radius: ${({theme:e})=>e.radius.sm};
  background: ${({theme:e})=>e.color.accent};
  color: #fff;
  font-style: italic;
  font-weight: 600;
  white-space: nowrap;
  transform: rotate(${({$tilt:e=-6})=>e}deg);
  box-shadow: 0 0 0 0.2rem ${({theme:e})=>e.color.page};
`,u=r.U.span.withConfig({displayName:"ui__Pill",componentId:"sc-46979e46-7"})`
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  white-space: nowrap;
  color: ${({theme:e})=>e.color.text};
  &::before { content: ''; flex-shrink: 0; width: 1rem; height: 1rem; border-radius: 50%; background: ${({$status:e})=>r.m`
  ${({theme:t})=>({paid:t.color.paid,active:t.color.paid,unpaid:t.color.unpaid,overdue:t.color.overdue,archived:t.color.faint})[e]}
`}; }
`,f=r.U.div.withConfig({displayName:"ui__Notice",componentId:"sc-46979e46-8"})`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.2rem;
  padding: 1.4rem 1.8rem;
  border-radius: ${({theme:e})=>e.radius.md};
  line-height: 1.5;
  ${({theme:e,$tone:t="info"})=>({info:r.m`background: ${e.color.tile}; color: ${e.color.text}; box-shadow: inset 0.3rem 0 0 ${e.color.accent};`,warning:r.m`background: ${e.color.unpaidSoft}; color: ${e.color.unpaid};`,error:r.m`background: ${e.color.overdueSoft}; color: ${e.color.overdue};`})[t]}
`,d=r.U.div.withConfig({displayName:"ui__Empty",componentId:"sc-46979e46-9"})`
  padding: 4.8rem 2.4rem;
  text-align: center;
  color: ${({theme:e})=>e.color.muted};
  display: grid;
  justify-items: center;
  gap: 0.8rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  border: 1px dashed ${({theme:e})=>e.color.line};
  b { color: ${({theme:e})=>e.color.strong}; font-size: 1.6rem; font-weight: 500; }
`,p=r.U.div.withConfig({displayName:"ui__TableWrap",componentId:"sc-46979e46-10"})`
  overflow-x: auto;
  table { width: 100%; border-collapse: collapse; min-width: 76rem; }
  th {
    text-align: left;
    font-size: 1.6rem;
    font-weight: 500;
    color: ${({theme:e})=>e.color.strong};
    padding: 1.2rem 1.4rem;
    border-bottom: 1px solid ${({theme:e})=>e.color.line};
  }
  td {
    padding: 1.1rem 1.4rem;
    font-size: 1.5rem;
    border-bottom: 1px solid ${({theme:e})=>e.color.line};
    vertical-align: middle;
  }
  tbody tr { transition: background 0.15s; }
  tbody tr:hover { background: ${({theme:e})=>e.color.hover}; }
`,m=r.U.span.withConfig({displayName:"ui__Muted",componentId:"sc-46979e46-11"})`
  color: ${({theme:e})=>e.color.muted};
`,g=r.U.span.withConfig({displayName:"ui__Amount",componentId:"sc-46979e46-12"})`
  white-space: nowrap;
  color: ${({theme:e})=>e.color.strong};
  small { margin-left: 0.4rem; color: ${({theme:e})=>e.color.muted}; font-size: inherit; }
`,h=r.U.label.withConfig({displayName:"ui__Field",componentId:"sc-46979e46-13"})`
  display: grid;
  gap: 0.6rem;
  font-size: 1.3rem;
  font-weight: 500;
  color: ${({theme:e})=>e.color.strong};
  small { font-weight: 400; color: ${({theme:e})=>e.color.muted}; }
`,y=r.m`
  width: 100%;
  min-height: 4.6rem;
  padding: 1rem 1.4rem;
  border-radius: ${({theme:e})=>e.radius.md};
  border: 1px solid ${({theme:e})=>e.color.line};
  background: ${({theme:e})=>e.color.tile};
  color: ${({theme:e})=>e.color.strong};
  font-size: 1.5rem;
  outline: none;
  transition: border-color 0.15s;
  &::placeholder { color: ${({theme:e})=>e.color.faint}; }
  &:focus { border-color: ${({theme:e})=>e.color.accent}; }
`,b=r.U.input.withConfig({displayName:"ui__Input",componentId:"sc-46979e46-14"})`${y}`,v=r.U.select.withConfig({displayName:"ui__Select",componentId:"sc-46979e46-15"})`${y}`,w=r.U.textarea.withConfig({displayName:"ui__Textarea",componentId:"sc-46979e46-16"})`
  ${y}
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
`,_=r.U.div.withConfig({displayName:"ui__Row",componentId:"sc-46979e46-17"})`
  display: flex;
  align-items: center;
  gap: ${({$gap:e=1.2})=>e}rem;
  flex-wrap: ${({$wrap:e})=>e?"wrap":"nowrap"};
  justify-content: ${({$between:e})=>e?"space-between":"flex-start"};
`,$=r.U.div.withConfig({displayName:"ui__PaymentName",componentId:"sc-46979e46-18"})`
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  flex-wrap: wrap;
  b { color: ${({theme:e})=>e.color.strong}; font-weight: 400; }
  small { color: ${({theme:e})=>e.color.muted}; font-size: inherit; }
`,x=r.U.span.withConfig({displayName:"ui__CurrencyBadge",componentId:"sc-46979e46-19"})`
  align-self: center;
  flex-shrink: 0;
  width: 2.2rem;
  height: 1.6rem;
  display: inline-grid;
  place-items: center;
  border-radius: 0.3rem;
  background: ${({theme:e})=>e.color.tile};
  color: ${({theme:e})=>e.color.accent};
  font-size: 1.1rem;
  font-weight: 600;
`,k=r.U.h2.withConfig({displayName:"ui__SectionTitle",componentId:"sc-46979e46-20"})`
  font-size: 2.2rem;
  font-weight: 600;
  color: ${({theme:e})=>e.color.strong};
  text-transform: lowercase;
`,S=r.U.div.withConfig({displayName:"ui__WireBox",componentId:"sc-46979e46-21"})`
  position: relative;
  margin-top: 1.6rem;
  border: 1px solid ${({theme:e})=>e.color.faint};
  border-bottom: 0;
  border-radius: ${({theme:e})=>e.radius.sm} ${({theme:e})=>e.radius.sm} 0 0;
  color: ${({theme:e})=>e.color.muted};
  overflow: hidden;
`;e.s(["Z",0,g,"K",0,n,"N",0,a,"T",0,o,"c",0,x,"e",0,d,"O",0,h,"_",0,i,"f",0,b,"k",0,m,"m",0,f,"S",0,$,"a",0,u,"z",0,_,"n",0,k,"d",0,v,"g",0,c,"F",0,p,"o",0,w,"B",0,l,"h",0,s,"i",0,function({children:e,height:r=14}){return(0,t.jsx)(S,{style:{height:`${r}rem`},children:e})}])},7289,e=>{var t=e.i(6224);let r="";class n extends Error{status;code;constructor(e,t,r){super(e),this.status=t,this.code=r}}async function o(e,i={}){let a,l={};r&&(l["X-CSRF-Token"]=r);let s="u">typeof FormData&&i.body instanceof FormData;s||(l["Content-Type"]="application/json");try{a=await fetch("/api/v1"+e,{method:i.method??"GET",headers:l,credentials:"same-origin",body:void 0===i.body?void 0:s?i.body:JSON.stringify(i.body)})}catch{throw new n((0,t.t)("Нет связи с сервером. Проверьте соединение и повторите действие."),0)}if(401===a.status&&"/auth/login"!==e)throw window.location.assign("/login"),new n((0,t.t)("Сессия завершена"),401);if(204===a.status)return null;let c=await a.json().catch(()=>({}));if(!a.ok){let e=c?.detail;throw new n(("string"==typeof e?e:Array.isArray(e)?e.map(e=>{let r=e.loc?.length&&e.loc.length>1?String(e.loc[e.loc.length-1]):"";return r?`${({title:(0,t.t)("Название"),amount:(0,t.t)("Сумма"),currency:(0,t.t)("Валюта"),first_due_date:(0,t.t)("Дата первого платежа"),username:(0,t.t)("Логин"),display_name:(0,t.t)("Имя"),password:(0,t.t)("Пароль"),paid_at:(0,t.t)("Дата оплаты"),current_password:(0,t.t)("Текущий пароль"),new_password:(0,t.t)("Новый пароль"),code:(0,t.t)("Код"),url:(0,t.t)("Ссылка"),file:(0,t.t)("Файл"),category:(0,t.t)("Категория"),assignee_id:(0,t.t)("Ответственный"),until:(0,t.t)("Дата окончания"),frequency:(0,t.t)("Периодичность"),payment_url:(0,t.t)("Ссылка на оплату"),payment_details:(0,t.t)("Реквизиты"),access:(0,t.t)("Доступ"),expires_in_days:(0,t.t)("Срок действия"),name:(0,t.t)("Название"),description:(0,t.t)("За что платим"),wallet_network:(0,t.t)("Сеть кошелька"),wallet_address:(0,t.t)("Адрес кошелька"),network:(0,t.t)("Сеть"),address:(0,t.t)("Адрес")})[r]??r}: ${e.msg}`:e.msg}).join(". "):"")||(0,t.t)("Не удалось выполнить действие"),a.status,c?.code)}return c}e.s(["k",0,o,"z",0,function(e){let t=new URLSearchParams;for(let[r,n]of Object.entries(e))n&&t.set(r,n);let r=t.toString();return r?"?"+r:""},"l",0,e=>{r=e}])},813,4410,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814);let o={accent:"#22b6ca",accentDeep:"#1595a8",accentSoft:"rgba(34, 182, 202, 0.14)"},i={light:{page:"#f4f5f6",panel:"#ffffff",tile:"#f2f3f4",ink:"#111214",muted:"#7b7f86",line:"#e7e9ec"},radius:{sm:"0.8rem",md:"1.2rem",lg:"1.6rem",xl:"2.4rem",sheet:"4.8rem",pill:"99rem"},font:"'Inter Variable', 'Segoe UI', system-ui, -apple-system, sans-serif",mobile:"@media (max-width: 960px)"},a={...i,name:"dark",color:{...o,page:"#000000",surface:"#161616",tile:"#232323",tileHover:"#2b2b2b",inset:"#000000",hover:"rgba(255, 255, 255, 0.025)",line:"#2c2c2c",text:"#ececec",strong:"#ffffff",muted:"#8b8b8b",faint:"#5c5c5c",ghost:"#343434",chevron:"#000000",chevronText:"#ffffff",shadow:"rgba(0, 0, 0, 0.6)",paid:"#4ed36b",unpaid:"#f2c94c",overdue:"#ff6150",overdueSoft:"rgba(255, 97, 80, 0.12)",unpaidSoft:"rgba(242, 201, 76, 0.12)"}},l={...i,name:"light",color:{...o,page:"#eef0f2",surface:"#ffffff",tile:"#f2f3f4",tileHover:"#e8eaed",inset:"#ffffff",hover:"rgba(17, 18, 20, 0.025)",line:"#e5e7ea",text:"#26282c",strong:"#111214",muted:"#70757d",faint:"#a5aab2",ghost:"#e2e4e8",chevron:"#111214",chevronText:"#ffffff",shadow:"rgba(17, 18, 20, 0.18)",paid:"#1f9d55",unpaid:"#b7791f",overdue:"#d9412b",overdueSoft:"rgba(217, 65, 43, 0.1)",unpaidSoft:"rgba(183, 121, 31, 0.12)"}},s=n.m`
  background:
    radial-gradient(circle at 42% 34%, rgba(255, 255, 255, 0.95) 0 5%, transparent 20%),
    radial-gradient(ellipse 34% 22% at 50% 52%, rgba(255, 255, 255, 0.55), transparent 70%),
    radial-gradient(circle at 58% 66%, rgba(92, 205, 226, 0.6) 0 8%, transparent 30%),
    radial-gradient(circle at 50% 62%, rgba(160, 228, 241, 0.95) 0 26%, rgba(200, 240, 248, 0.75) 38%, transparent 56%),
    linear-gradient(180deg, #f6f8f9 0%, #eef3f5 100%);
  &::before, &::after {
    content: '';
    position: absolute;
    left: 50%;
    aspect-ratio: 1;
    transform: translateX(-50%);
    border-radius: 50%;
    border: 1px solid rgba(34, 182, 202, 0.55);
    pointer-events: none;
  }
  &::before { top: 8%; width: min(110rem, 120%); }
  &::after { top: -6%; width: min(150rem, 170%); border-color: rgba(34, 182, 202, 0.35); }
`,c=n.Q`
  html { font-size: 10px; -webkit-text-size-adjust: 100%; }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ${({theme:e})=>e.font};
    font-size: 1.4rem;
    line-height: 1.5;
    color: ${({theme:e})=>e.color.text};
    background: ${({theme:e})=>e.color.page};
    font-feature-settings: 'tnum' 1, 'cv11' 1;
    -webkit-font-smoothing: antialiased;
    color-scheme: ${({theme:e})=>e.name};
    transition: background 0.2s, color 0.2s;
  }
  h1, h2, h3, p { margin: 0; }
  a { color: inherit; text-decoration: none; }
  button, input, select { font: inherit; color: inherit; }
  button { cursor: pointer; border: 0; background: none; padding: 0; }
  button:disabled { cursor: wait; opacity: 0.6; }
  :focus-visible { outline: 0.2rem solid ${({theme:e})=>e.color.accent}; outline-offset: 0.2rem; }
  [hidden] { display: none !important; }
  ::selection { background: ${({theme:e})=>e.color.accent}; color: #fff; }
`;e.s(["l",0,c,"q",0,a,"N",0,s,"i",0,l],4410);var u=e.i(6224);let f=(0,r.createContext)({mode:"system",setMode:()=>{},language:"ru",setLanguage:()=>{}});function d(e){try{return window.localStorage.getItem(e)}catch{return null}}function p(e,t){try{window.localStorage.setItem(e,t)}catch{}}e.s(["e",0,function({children:e}){let[o,i]=(0,r.useState)("system"),[s,c]=(0,r.useState)(!0),[m,g]=(0,r.useState)("ru");(0,r.useEffect)(()=>{let e=d("ik-theme");("light"===e||"dark"===e||"system"===e)&&i(e);let t=d("ik-language"),r="en"===t||"ru"===t?t:navigator.language.toLowerCase().startsWith("ru")?"ru":"en";(0,u.C)(r),g(r);let n=window.matchMedia("(prefers-color-scheme: dark)");c(n.matches);let o=e=>c(e.matches);return n.addEventListener("change",o),()=>n.removeEventListener("change",o)},[]);let h=(0,r.useCallback)(e=>{i(e),p("ik-theme",e)},[]),y=(0,r.useCallback)(e=>{(0,u.C)(e),g(e),p("ik-language",e)},[]);(0,r.useEffect)(()=>{document.documentElement.lang=m},[m]);let b="dark"===o||"system"===o&&s;return(0,t.jsx)(f.Provider,{value:{mode:o,setMode:h,language:m,setLanguage:y},children:(0,t.jsx)(n.J,{theme:b?a:l,children:(0,t.jsx)(r.Fragment,{children:e},m)})})},"T",0,()=>(0,r.useContext)(f)],813)},4787,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(7289);let o=(0,r.createContext)(null);function i(){let e=(0,r.useContext)(o);if(!e)throw Error("useSession outside SessionProvider");return e}e.s(["S",0,function({children:e,fallback:i}){let[a,l]=(0,r.useState)(null),[s,c]=(0,r.useState)(null),[u,f]=(0,r.useState)(""),[d,p]=(0,r.useState)(0),m=(0,r.useCallback)(()=>p(e=>e+1),[]);return((0,r.useEffect)(()=>{Promise.all([(0,n.k)("/auth/me"),(0,n.k)("/settings")]).then(([e,t])=>{(0,n.l)(e.csrf_token),l({user:e,settings:t}),f(t.today.slice(0,7))}).catch(e=>c(e.message))},[]),(0,r.useEffect)(()=>{a&&0!==d&&(0,n.k)("/settings").then(e=>l(t=>t?{...t,settings:e}:t)).catch(()=>{})},[d]),(0,r.useEffect)(()=>{let e=()=>{"visible"!==document.visibilityState||document.querySelector("dialog[open]")||m()},t=setInterval(e,6e4);return document.addEventListener("visibilitychange",e),()=>{clearInterval(t),document.removeEventListener("visibilitychange",e)}},[m]),a&&u)?(0,t.jsx)(o.Provider,{value:{...a,isAdmin:"admin"===a.user.role,month:u,setMonth:f,version:d,refresh:m},children:e}):(0,t.jsx)(t.Fragment,{children:i(s)})},"Z",0,function(e,t){let{version:n}=i(),[o,a]=(0,r.useState)(null),[l,s]=(0,r.useState)(null);return(0,r.useEffect)(()=>{let t=!0;return e().then(e=>{t&&(a(e),s(null))}).catch(e=>{t&&s(e.message)}),()=>{t=!1}},[...t,n]),{data:o,error:l}},"U",0,i])},3133,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814);let o=(0,r.createContext)(()=>{}),i=n.U.div.withConfig({displayName:"toast__Bubble",componentId:"sc-1abb64c-0"})`
  position: fixed;
  right: 2.4rem;
  bottom: 2.4rem;
  z-index: 50;
  max-width: min(42rem, calc(100vw - 3.2rem));
  padding: 1.4rem 1.8rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.tile};
  color: ${({theme:e})=>e.color.strong};
  font-weight: 600;
  box-shadow: 0 1.2rem 3.2rem ${({theme:e})=>e.color.shadow};
  border-left: 0.4rem solid ${({theme:e,$error:t})=>t?e.color.overdue:e.color.accent};
  transition: opacity 0.2s, transform 0.2s;
  ${({$visible:e})=>e?n.m`opacity: 1; transform: none;`:n.m`opacity: 0; transform: translateY(1rem); pointer-events: none;`}
  ${({theme:e})=>e.mobile} { right: 1.6rem; bottom: 1.6rem; }
`;e.s(["N",0,function({children:e}){let[n,a]=(0,r.useState)(null),l=(0,r.useRef)(void 0),s=(0,r.useCallback)((e,t=!1)=>{clearTimeout(l.current),a({message:e,error:t}),l.current=setTimeout(()=>a(null),4500)},[]);return(0,t.jsxs)(o.Provider,{value:s,children:[e,(0,t.jsx)(i,{role:"status","aria-live":"polite",$visible:!!n,$error:!!n?.error,children:n?.message})]})},"d",0,()=>(0,r.useContext)(o)])},1705,(e,t,r)=>{r._=function(e){return e&&e.__esModule?e:{default:e}}},2456,(e,t,r)=>{function n(e){if("function"!=typeof WeakMap)return null;var t=new WeakMap,r=new WeakMap;return(n=function(e){return e?r:t})(e)}r._=function(e,t){if(!t&&e&&e.__esModule)return e;if(null===e||"object"!=typeof e&&"function"!=typeof e)return{default:e};var r=n(t);if(r&&r.has(e))return r.get(e);var o={__proto__:null},i=Object.defineProperty&&Object.getOwnPropertyDescriptor;for(var a in e)if("default"!==a&&Object.prototype.hasOwnProperty.call(e,a)){var l=i?Object.getOwnPropertyDescriptor(e,a):null;l&&(l.get||l.set)?Object.defineProperty(o,a,l):o[a]=e[a]}return o.default=e,r&&r.set(e,o),o}},461,(e,t,r)=>{var n,o;t.exports=(null==(n=e.g.process)?void 0:n.env)&&"object"==typeof(null==(o=e.g.process)?void 0:o.env)?e.g.process:e.r(955)},3584,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"HeadManagerContext",{enumerable:!0,get:function(){return n}});let n=(e.r(1705)._(e.r(1788))).default.createContext({})},963,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return g},defaultHead:function(){return f}};for(var o in n)Object.defineProperty(r,o,{enumerable:!0,get:n[o]});let i=e.r(1705),a=e.r(2456),l=e.r(1398),s=a._(e.r(1788)),c=i._(e.r(4941)),u=e.r(3584);function f(){return[(0,l.jsx)("meta",{charSet:"utf-8"},"charset"),(0,l.jsx)("meta",{name:"viewport",content:"width=device-width"},"viewport")]}function d(e,t){return"string"==typeof t||"number"==typeof t?e:t.type===s.default.Fragment?e.concat(s.default.Children.toArray(t.props.children).reduce((e,t)=>"string"==typeof t||"number"==typeof t?e:e.concat(t),[])):e.concat(t)}let p=["name","httpEquiv","charSet","itemProp"];function m(e){let t,r,n,o;return e.reduce(d,[]).reverse().concat(f().reverse()).filter((t=new Set,r=new Set,n=new Set,o={},e=>{let i=!0,a=!1;if(e.key&&"number"!=typeof e.key&&e.key.indexOf("$")>0){a=!0;let r=e.key.slice(e.key.indexOf("$")+1);t.has(r)?i=!1:t.add(r)}switch(e.type){case"title":case"base":r.has(e.type)?i=!1:r.add(e.type);break;case"meta":for(let t=0,r=p.length;t<r;t++){let r=p[t];if(e.props.hasOwnProperty(r))if("charSet"===r)n.has(r)?i=!1:n.add(r);else{let t=e.props[r],n=o[r]||new Set;("name"!==r||!a)&&n.has(t)?i=!1:(n.add(t),o[r]=n)}}}return i})).reverse().map((e,t)=>{let r=e.key||t;return s.default.cloneElement(e,{key:r})})}let g=function({children:e}){let t=(0,s.useContext)(u.HeadManagerContext);return(0,l.jsx)(c.default,{reduceComponentsToState:m,headManager:t,children:e})};("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},4941,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"default",{enumerable:!0,get:function(){return l}});let n=e.r(1788),o="u"<typeof window,i=o?()=>{}:n.useLayoutEffect,a=o?()=>{}:n.useEffect;function l(e){let{headManager:t,reduceComponentsToState:r}=e;function l(){if(t&&t.mountedInstances){let e=n.Children.toArray(Array.from(t.mountedInstances).filter(Boolean));t.updateHead(r(e))}}return o&&(t?.mountedInstances?.add(e.children),l()),i(()=>(t?.mountedInstances?.add(e.children),()=>{t?.mountedInstances?.delete(e.children)})),i(()=>(t&&(t._pendingUpdate=l),()=>{t&&(t._pendingUpdate=l)})),a(()=>(t&&t._pendingUpdate&&(t._pendingUpdate(),t._pendingUpdate=null),()=>{t&&t._pendingUpdate&&(t._pendingUpdate(),t._pendingUpdate=null)})),null}},9129,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0});var n={DecodeError:function(){return y},MiddlewareNotFoundError:function(){return _},MissingStaticPage:function(){return w},NormalizeError:function(){return b},PageNotFoundError:function(){return v},SP:function(){return g},ST:function(){return h},WEB_VITALS:function(){return i},execOnce:function(){return a},getDisplayName:function(){return f},getLocationOrigin:function(){return c},getURL:function(){return u},isAbsoluteUrl:function(){return s},isResSent:function(){return d},loadGetInitialProps:function(){return m},normalizeRepeatedSlashes:function(){return p},stringifyError:function(){return $}};for(var o in n)Object.defineProperty(r,o,{enumerable:!0,get:n[o]});let i=["CLS","FCP","INP","LCP","TTFB"];function a(e){let t,r=!1;return(...n)=>(r||(r=!0,t=e(...n)),t)}let l=/^[a-zA-Z][a-zA-Z\d+\-.]*?:/,s=e=>{let t=e.charCodeAt(0);return!!(t>=65&&t<=90||t>=97&&t<=122)&&l.test(e)};function c(){let{protocol:e,hostname:t,port:r}=window.location;return`${e}//${t}${r?":"+r:""}`}function u(){let{href:e}=window.location,t=c();return e.substring(t.length)}function f(e){return"string"==typeof e?e:e.displayName||e.name||"Unknown"}function d(e){return e.finished||e.headersSent}function p(e){let t=e.split("?");return t[0].replace(/\\/g,"/").replace(/\/\/+/g,"/")+(t[1]?`?${t.slice(1).join("?")}`:"")}async function m(e,t){let r=t.res||t.ctx&&t.ctx.res;if(!e.getInitialProps)return t.ctx&&t.Component?{pageProps:await m(t.Component,t.ctx)}:{};let n=await e.getInitialProps(t);if(r&&d(r))return n;if(!n)throw Error(`"${f(e)}.getInitialProps()" should resolve to an object. But found "${n}" instead.`);return n}let g="u">typeof performance,h=g&&["mark","measure","getEntriesByName"].every(e=>"function"==typeof performance[e]);class y extends Error{}class b extends Error{}class v extends Error{constructor(e){super(),this.code="ENOENT",this.name="PageNotFoundError",this.message=`Cannot find module for page: ${e}`}}class w extends Error{constructor(e,t){super(),this.message=`Failed to load static file for page: ${e} ${t}`}}class _ extends Error{constructor(){super(),this.code="ENOENT",this.message="Cannot find the middleware module"}}function $(e){return JSON.stringify({message:e.message,stack:e.stack})}},8481,(e,t,r)=>{var n=Symbol.for("react.transitional.element");function o(e,t,r){var o=null;if(void 0!==r&&(o=""+r),void 0!==t.key&&(o=""+t.key),"key"in t)for(var i in r={},t)"key"!==i&&(r[i]=t[i]);else r=t;return{$$typeof:n,type:e,key:o,ref:void 0!==(t=r.ref)?t:null,props:r}}r.Fragment=Symbol.for("react.fragment"),r.jsx=o,r.jsxs=o},1556,(e,t,r)=>{var n=e.i(461),o=Symbol.for("react.transitional.element"),i=Symbol.for("react.portal"),a=Symbol.for("react.fragment"),l=Symbol.for("react.strict_mode"),s=Symbol.for("react.profiler"),c=Symbol.for("react.consumer"),u=Symbol.for("react.context"),f=Symbol.for("react.forward_ref"),d=Symbol.for("react.suspense"),p=Symbol.for("react.memo"),m=Symbol.for("react.lazy"),g=Symbol.for("react.activity"),h=Symbol.for("react.view_transition"),y=Symbol.iterator,b={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},v=Object.assign,w={};function _(e,t,r){this.props=e,this.context=t,this.refs=w,this.updater=r||b}function $(){}function x(e,t,r){this.props=e,this.context=t,this.refs=w,this.updater=r||b}_.prototype.isReactComponent={},_.prototype.setState=function(e,t){if("object"!=typeof e&&"function"!=typeof e&&null!=e)throw Error("takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")},_.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")},$.prototype=_.prototype;var k=x.prototype=new $;k.constructor=x,v(k,_.prototype),k.isPureReactComponent=!0;var S=Array.isArray;function C(){}var E={H:null,A:null,T:null,S:null},j=Object.prototype.hasOwnProperty;function T(e,t,r){var n=r.ref;return{$$typeof:o,type:e,key:t,ref:void 0!==n?n:null,props:r}}function I(e){return"object"==typeof e&&null!==e&&e.$$typeof===o}var N=/\/+/g;function O(e,t){var r,n;return"object"==typeof e&&null!==e&&null!=e.key?(r=""+e.key,n={"=":"=0",":":"=2"},"$"+r.replace(/[=:]/g,function(e){return n[e]})):t.toString(36)}function P(e,t,r){if(null==e)return e;var n=[],a=0;return!function e(t,r,n,a,l){var s,c,u,f=typeof t;("undefined"===f||"boolean"===f)&&(t=null);var d=!1;if(null===t)d=!0;else switch(f){case"bigint":case"string":case"number":d=!0;break;case"object":switch(t.$$typeof){case o:case i:d=!0;break;case m:return e((d=t._init)(t._payload),r,n,a,l)}}if(d)return l=l(t),d=""===a?"."+O(t,0):a,S(l)?(n="",null!=d&&(n=d.replace(N,"$&/")+"/"),e(l,r,n,"",function(e){return e})):null!=l&&(I(l)&&(s=l,c=n+(null==l.key||t&&t.key===l.key?"":(""+l.key).replace(N,"$&/")+"/")+d,l=T(s.type,c,s.props)),r.push(l)),1;d=0;var p=""===a?".":a+":";if(S(t))for(var g=0;g<t.length;g++)f=p+O(a=t[g],g),d+=e(a,r,n,f,l);else if("function"==typeof(g=null===(u=t)||"object"!=typeof u?null:"function"==typeof(u=y&&u[y]||u["@@iterator"])?u:null))for(t=g.call(t),g=0;!(a=t.next()).done;)f=p+O(a=a.value,g++),d+=e(a,r,n,f,l);else if("object"===f){if("function"==typeof t.then)return e(function(e){switch(e.status){case"fulfilled":return e.value;case"rejected":throw e.reason;default:switch("string"==typeof e.status?e.then(C,C):(e.status="pending",e.then(function(t){"pending"===e.status&&(e.status="fulfilled",e.value=t)},function(t){"pending"===e.status&&(e.status="rejected",e.reason=t)})),e.status){case"fulfilled":return e.value;case"rejected":throw e.reason}}throw e}(t),r,n,a,l);throw Error("Objects are not valid as a React child (found: "+("[object Object]"===(r=String(t))?"object with keys {"+Object.keys(t).join(", ")+"}":r)+"). If you meant to render a collection of children, use an array instead.")}return d}(e,n,"","",function(e){return t.call(r,e,a++)}),n}function U(e){if(-1===e._status){var t=(0,e._result)();t.then(function(r){(0===e._status||-1===e._status)&&(e._status=1,e._result=r,void 0===t.status&&(t.status="fulfilled",t.value=r))},function(r){(0===e._status||-1===e._status)&&(e._status=2,e._result=r,void 0===t.status&&(t.status="rejected",t.reason=r))}),-1===e._status&&(e._status=0,e._result=t)}if(1===e._status)return e._result.default;throw e._result}var H="function"==typeof reportError?reportError:function(e){if("object"==typeof window&&"function"==typeof window.ErrorEvent){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:"object"==typeof e&&null!==e&&"string"==typeof e.message?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if("object"==typeof n.default&&"function"==typeof n.default.emit)return void n.default.emit("uncaughtException",e);console.error(e)};function R(e){var t=E.T,r={};r.types=null!==t?t.types:null,E.T=r;try{var n=e(),o=E.S;null!==o&&o(r,n),"object"==typeof n&&null!==n&&"function"==typeof n.then&&n.then(C,H)}catch(e){H(e)}finally{null!==t&&null!==r.types&&(t.types=r.types),E.T=t}}function A(e){var t=E.T;if(null!==t){var r=t.types;null===r?t.types=[e]:-1===r.indexOf(e)&&r.push(e)}else R(A.bind(null,e))}r.Activity=g,r.Children={map:P,forEach:function(e,t,r){P(e,function(){t.apply(this,arguments)},r)},count:function(e){var t=0;return P(e,function(){t++}),t},toArray:function(e){return P(e,function(e){return e})||[]},only:function(e){if(!I(e))throw Error("React.Children.only expected to receive a single React element child.");return e}},r.Component=_,r.Fragment=a,r.Profiler=s,r.PureComponent=x,r.StrictMode=l,r.Suspense=d,r.ViewTransition=h,r.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=E,r.__COMPILER_RUNTIME={__proto__:null,c:function(e){return E.H.useMemoCache(e)}},r.addTransitionType=A,r.cache=function(e){return function(){return e.apply(null,arguments)}},r.cacheSignal=function(){return null},r.cloneElement=function(e,t,r){if(null==e)throw Error("The argument must be a React element, but you passed "+e+".");var n=v({},e.props),o=e.key;if(null!=t)for(i in void 0!==t.key&&(o=""+t.key),t)j.call(t,i)&&"key"!==i&&"__self"!==i&&"__source"!==i&&("ref"!==i||void 0!==t.ref)&&(n[i]=t[i]);var i=arguments.length-2;if(1===i)n.children=r;else if(1<i){for(var a=Array(i),l=0;l<i;l++)a[l]=arguments[l+2];n.children=a}return T(e.type,o,n)},r.createContext=function(e){return(e={$$typeof:u,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null}).Provider=e,e.Consumer={$$typeof:c,_context:e},e},r.createElement=function(e,t,r){var n,o={},i=null;if(null!=t)for(n in void 0!==t.key&&(i=""+t.key),t)j.call(t,n)&&"key"!==n&&"__self"!==n&&"__source"!==n&&(o[n]=t[n]);var a=arguments.length-2;if(1===a)o.children=r;else if(1<a){for(var l=Array(a),s=0;s<a;s++)l[s]=arguments[s+2];o.children=l}if(e&&e.defaultProps)for(n in a=e.defaultProps)void 0===o[n]&&(o[n]=a[n]);return T(e,i,o)},r.createRef=function(){return{current:null}},r.forwardRef=function(e){return{$$typeof:f,render:e}},r.isValidElement=I,r.lazy=function(e){return{$$typeof:m,_payload:{_status:-1,_result:e},_init:U}},r.memo=function(e,t){return{$$typeof:p,type:e,compare:void 0===t?null:t}},r.startTransition=R,r.unstable_useCacheRefresh=function(){return E.H.useCacheRefresh()},r.use=function(e){return E.H.use(e)},r.useActionState=function(e,t,r){return E.H.useActionState(e,t,r)},r.useCallback=function(e,t){return E.H.useCallback(e,t)},r.useContext=function(e){return E.H.useContext(e)},r.useDebugValue=function(){},r.useDeferredValue=function(e,t){return E.H.useDeferredValue(e,t)},r.useEffect=function(e,t){return E.H.useEffect(e,t)},r.useEffectEvent=function(e){return E.H.useEffectEvent(e)},r.useId=function(){return E.H.useId()},r.useImperativeHandle=function(e,t,r){return E.H.useImperativeHandle(e,t,r)},r.useInsertionEffect=function(e,t){return E.H.useInsertionEffect(e,t)},r.useLayoutEffect=function(e,t){return E.H.useLayoutEffect(e,t)},r.useMemo=function(e,t){return E.H.useMemo(e,t)},r.useOptimistic=function(e,t){return E.H.useOptimistic(e,t)},r.useReducer=function(e,t,r){return E.H.useReducer(e,t,r)},r.useRef=function(e){return E.H.useRef(e)},r.useState=function(e){return E.H.useState(e)},r.useSyncExternalStore=function(e,t,r){return E.H.useSyncExternalStore(e,t,r)},r.useTransition=function(){return E.H.useTransition()},r.version="19.3.1"},1788,(e,t,r)=>{e.i(461),t.exports=e.r(1556)},1398,(e,t,r)=>{e.i(461),t.exports=e.r(8481)}],955,(e,t,r)=>{var n={156:function(e){var t,r,n,o=e.exports={};function i(){throw Error("setTimeout has not been defined")}function a(){throw Error("clearTimeout has not been defined")}try{t="function"==typeof setTimeout?setTimeout:i}catch(e){t=i}try{r="function"==typeof clearTimeout?clearTimeout:a}catch(e){r=a}function l(e){if(t===setTimeout)return setTimeout(e,0);if((t===i||!t)&&setTimeout)return t=setTimeout,setTimeout(e,0);try{return t(e,0)}catch(r){try{return t.call(null,e,0)}catch(r){return t.call(this,e,0)}}}var s=[],c=!1,u=-1;function f(){c&&n&&(c=!1,n.length?s=n.concat(s):u=-1,s.length&&d())}function d(){if(!c){var e=l(f);c=!0;for(var t=s.length;t;){for(n=s,s=[];++u<t;)n&&n[u].run();u=-1,t=s.length}n=null,c=!1,function(e){if(r===clearTimeout)return clearTimeout(e);if((r===a||!r)&&clearTimeout)return r=clearTimeout,clearTimeout(e);try{r(e)}catch(t){try{return r.call(null,e)}catch(t){return r.call(this,e)}}}(e)}}function p(e,t){this.fun=e,this.array=t}function m(){}o.nextTick=function(e){var t=Array(arguments.length-1);if(arguments.length>1)for(var r=1;r<arguments.length;r++)t[r-1]=arguments[r];s.push(new p(e,t)),1!==s.length||c||l(d)},p.prototype.run=function(){this.fun.apply(null,this.array)},o.title="browser",o.browser=!0,o.env={},o.argv=[],o.version="",o.versions={},o.on=m,o.addListener=m,o.once=m,o.off=m,o.removeListener=m,o.removeAllListeners=m,o.emit=m,o.prependListener=m,o.prependOnceListener=m,o.listeners=function(e){return[]},o.binding=function(e){throw Error("process.binding is not supported")},o.cwd=function(){return"/"},o.chdir=function(e){throw Error("process.chdir is not supported")},o.umask=function(){return 0}}},o={};function i(e){var t=o[e];if(void 0!==t)return t.exports;var r=o[e]={exports:{}},a=!0;try{n[e](r,r.exports,i),a=!1}finally{a&&delete o[e]}return r.exports}i.ab="/ROOT/node_modules/next/dist/compiled/process/",t.exports=i(156)},3828,(e,t,r)=>{t.exports=e.r(6990)}]);