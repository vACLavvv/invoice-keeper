(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[9835,e=>{var o=e.i(1398),t=e.i(814);let r=t.U.button.withConfig({displayName:"ui__Button",componentId:"sc-46979e46-0"})`
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
  ${({theme:e,$variant:o="primary"})=>({primary:t.m`
      background: ${e.color.accent}; color: #fff;
      &:hover:not(:disabled) { background: ${e.color.accentDeep}; }
    `,secondary:t.m`
      background: ${e.color.tile}; color: ${e.color.strong};
      &:hover:not(:disabled) { background: ${e.color.tileHover}; }
    `,danger:t.m`
      background: ${e.color.overdue}; color: #fff;
      &:hover:not(:disabled) { filter: brightness(0.92); }
    `,ghost:t.m`
      background: none; color: ${e.color.accent}; padding-inline: 0.2rem; min-height: auto;
      &:hover:not(:disabled) { text-decoration: underline; }
    `})[o]}
`,i=t.U.span.withConfig({displayName:"ui__Chevron",componentId:"sc-46979e46-1"})`
  width: 2.2rem;
  height: 2.2rem;
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  background: #000;
  color: #fff;
  font-size: 1.2rem;
  line-height: 1;
`,n=t.U.button.withConfig({displayName:"ui__IconButton",componentId:"sc-46979e46-2"})`
  width: 3.2rem;
  height: 3.2rem;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  color: ${({theme:e})=>e.color.muted};
  font-size: 2.2rem;
  line-height: 1;
  &:hover { color: ${({theme:e})=>e.color.strong}; background: ${({theme:e})=>e.color.tile}; }
`,a=t.U.section.withConfig({displayName:"ui__Card",componentId:"sc-46979e46-3"})`
  display: grid;
  gap: 1.2rem;
  min-width: 0;
`,l=t.U.div.withConfig({displayName:"ui__Tile",componentId:"sc-46979e46-4"})`
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
  ${({$interactive:e,theme:o})=>e&&t.m`cursor: pointer; &:hover { background: ${o.color.tileHover}; }`}
`,c=t.U.div.withConfig({displayName:"ui__TileTitle",componentId:"sc-46979e46-5"})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.2rem;
  color: ${({theme:e})=>e.color.strong};
  font-weight: 500;
`,s=t.U.span.withConfig({displayName:"ui__Sticker",componentId:"sc-46979e46-6"})`
  display: inline-block;
  padding: 0.4rem 1rem;
  border-radius: ${({theme:e})=>e.radius.sm};
  background: ${({theme:e})=>e.color.accent};
  color: #fff;
  font-style: italic;
  font-weight: 600;
  white-space: nowrap;
  transform: rotate(${({$tilt:e=-6})=>e}deg);
  box-shadow: 0 0 0 0.2rem #000;
`,d=t.U.span.withConfig({displayName:"ui__Pill",componentId:"sc-46979e46-7"})`
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  white-space: nowrap;
  color: ${({theme:e})=>e.color.text};
  &::before { content: ''; width: 1rem; height: 1rem; border-radius: 50%; background: ${({$status:e})=>t.m`
  ${({theme:o})=>({paid:o.color.paid,active:o.color.paid,unpaid:o.color.unpaid,overdue:o.color.overdue,archived:o.color.faint})[e]}
`}; }
`,m=t.U.div.withConfig({displayName:"ui__Notice",componentId:"sc-46979e46-8"})`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.2rem;
  padding: 1.4rem 1.8rem;
  border-radius: ${({theme:e})=>e.radius.md};
  line-height: 1.5;
  ${({theme:e,$tone:o="info"})=>({info:t.m`background: ${e.color.tile}; color: ${e.color.text}; box-shadow: inset 0.3rem 0 0 ${e.color.accent};`,warning:t.m`background: ${e.color.unpaidSoft}; color: ${e.color.unpaid};`,error:t.m`background: ${e.color.overdueSoft}; color: ${e.color.overdue};`})[o]}
`,u=t.U.div.withConfig({displayName:"ui__Empty",componentId:"sc-46979e46-9"})`
  padding: 4.8rem 2.4rem;
  text-align: center;
  color: ${({theme:e})=>e.color.muted};
  display: grid;
  justify-items: center;
  gap: 0.8rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  border: 1px dashed ${({theme:e})=>e.color.line};
  b { color: ${({theme:e})=>e.color.strong}; font-size: 1.6rem; font-weight: 500; }
`,p=t.U.div.withConfig({displayName:"ui__TableWrap",componentId:"sc-46979e46-10"})`
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
  tbody tr:hover { background: rgba(255, 255, 255, 0.02); }
`,g=t.U.span.withConfig({displayName:"ui__Muted",componentId:"sc-46979e46-11"})`
  color: ${({theme:e})=>e.color.muted};
`,f=t.U.span.withConfig({displayName:"ui__Amount",componentId:"sc-46979e46-12"})`
  white-space: nowrap;
  color: ${({theme:e})=>e.color.strong};
  small { margin-left: 0.4rem; color: ${({theme:e})=>e.color.muted}; font-size: inherit; }
`,h=t.U.label.withConfig({displayName:"ui__Field",componentId:"sc-46979e46-13"})`
  display: grid;
  gap: 0.6rem;
  font-size: 1.3rem;
  font-weight: 500;
  color: ${({theme:e})=>e.color.strong};
  small { font-weight: 400; color: ${({theme:e})=>e.color.muted}; }
`,b=t.m`
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
`,w=t.U.input.withConfig({displayName:"ui__Input",componentId:"sc-46979e46-14"})`${b}`,$=t.U.select.withConfig({displayName:"ui__Select",componentId:"sc-46979e46-15"})`${b}`,y=t.U.div.withConfig({displayName:"ui__Row",componentId:"sc-46979e46-16"})`
  display: flex;
  align-items: center;
  gap: ${({$gap:e=1.2})=>e}rem;
  flex-wrap: ${({$wrap:e})=>e?"wrap":"nowrap"};
  justify-content: ${({$between:e})=>e?"space-between":"flex-start"};
`,v=t.U.div.withConfig({displayName:"ui__PaymentName",componentId:"sc-46979e46-17"})`
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  flex-wrap: wrap;
  b { color: ${({theme:e})=>e.color.strong}; font-weight: 400; }
  small { color: ${({theme:e})=>e.color.muted}; font-size: inherit; }
`,_=t.U.span.withConfig({displayName:"ui__CurrencyBadge",componentId:"sc-46979e46-18"})`
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
`,x=t.U.h2.withConfig({displayName:"ui__SectionTitle",componentId:"sc-46979e46-19"})`
  font-size: 2.2rem;
  font-weight: 600;
  color: ${({theme:e})=>e.color.strong};
  text-transform: lowercase;
`,k=t.U.div.withConfig({displayName:"ui__WireBox",componentId:"sc-46979e46-20"})`
  position: relative;
  margin-top: 1.6rem;
  border: 1px solid ${({theme:e})=>e.color.faint};
  border-bottom: 0;
  border-radius: ${({theme:e})=>e.radius.sm} ${({theme:e})=>e.radius.sm} 0 0;
  color: ${({theme:e})=>e.color.muted};
  overflow: hidden;
`;e.s(["Z",0,f,"K",0,r,"N",0,a,"T",0,i,"c",0,_,"e",0,u,"O",0,h,"_",0,n,"f",0,w,"k",0,g,"m",0,m,"S",0,v,"a",0,d,"z",0,y,"n",0,x,"d",0,$,"g",0,s,"F",0,p,"B",0,l,"h",0,c,"i",0,function({children:e,height:t=14}){return(0,o.jsx)(k,{style:{height:`${t}rem`},children:e})}])},4787,7289,e=>{var o=e.i(1398),t=e.i(1788);let r={title:"Название",amount:"Сумма",currency:"Валюта",first_due_date:"Дата первого платежа",username:"Логин",display_name:"Имя",password:"Пароль",paid_at:"Дата оплаты"},i="",n=e=>{i=e};class a extends Error{status;constructor(e,o){super(e),this.status=o}}async function l(e,o={}){let t,n={"Content-Type":"application/json"};i&&(n["X-CSRF-Token"]=i);try{t=await fetch("/api/v1"+e,{method:o.method??"GET",headers:n,credentials:"same-origin",body:void 0===o.body?void 0:JSON.stringify(o.body)})}catch{throw new a("Нет связи с сервером. Проверьте соединение и повторите действие.",0)}if(401===t.status&&"/auth/login"!==e)throw window.location.assign("/login"),new a("Сессия завершена",401);if(204===t.status)return null;let c=await t.json().catch(()=>({}));if(!t.ok){let e=c?.detail;throw new a(("string"==typeof e?e:Array.isArray(e)?e.map(e=>{let o=e.loc?.length&&e.loc.length>1?String(e.loc[e.loc.length-1]):"";return o?`${r[o]??o}: ${e.msg}`:e.msg}).join(". "):"")||"Не удалось выполнить действие",t.status)}return c}e.s(["k",0,l,"l",0,n],7289);let c=(0,t.createContext)(null);function s(){let e=(0,t.useContext)(c);if(!e)throw Error("useSession outside SessionProvider");return e}e.s(["S",0,function({children:e,fallback:r}){let[i,a]=(0,t.useState)(null),[s,d]=(0,t.useState)(null),[m,u]=(0,t.useState)(""),[p,g]=(0,t.useState)(0),f=(0,t.useCallback)(()=>g(e=>e+1),[]);return((0,t.useEffect)(()=>{Promise.all([l("/auth/me"),l("/settings")]).then(([e,o])=>{n(e.csrf_token),a({user:e,settings:o}),u(o.today.slice(0,7))}).catch(e=>d(e.message))},[]),(0,t.useEffect)(()=>{i&&0!==p&&l("/settings").then(e=>a(o=>o?{...o,settings:e}:o)).catch(()=>{})},[p]),(0,t.useEffect)(()=>{let e=()=>{"visible"!==document.visibilityState||document.querySelector("dialog[open]")||f()},o=setInterval(e,6e4);return document.addEventListener("visibilitychange",e),()=>{clearInterval(o),document.removeEventListener("visibilitychange",e)}},[f]),i&&m)?(0,o.jsx)(c.Provider,{value:{...i,isAdmin:"admin"===i.user.role,month:m,setMonth:u,version:p,refresh:f},children:e}):(0,o.jsx)(o.Fragment,{children:r(s)})},"Z",0,function(e,o){let{version:r}=s(),[i,n]=(0,t.useState)(null),[a,l]=(0,t.useState)(null);return(0,t.useEffect)(()=>{let o=!0;return e().then(e=>{o&&(n(e),l(null))}).catch(e=>{o&&l(e.message)}),()=>{o=!1}},[...o,r]),{data:i,error:a}},"U",0,s],4787)},3133,e=>{var o=e.i(1398),t=e.i(1788),r=e.i(814);let i=(0,t.createContext)(()=>{}),n=r.U.div.withConfig({displayName:"toast__Bubble",componentId:"sc-1abb64c-0"})`
  position: fixed;
  right: 2.4rem;
  bottom: 2.4rem;
  z-index: 50;
  max-width: min(42rem, calc(100vw - 3.2rem));
  padding: 1.4rem 1.8rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.tile};
  color: #fff;
  font-weight: 600;
  box-shadow: 0 1.2rem 3.2rem rgba(0, 0, 0, 0.5);
  border-left: 0.4rem solid ${({theme:e,$error:o})=>o?e.color.overdue:e.color.accent};
  transition: opacity 0.2s, transform 0.2s;
  ${({$visible:e})=>e?r.m`opacity: 1; transform: none;`:r.m`opacity: 0; transform: translateY(1rem); pointer-events: none;`}
  ${({theme:e})=>e.mobile} { right: 1.6rem; bottom: 1.6rem; }
`;e.s(["N",0,function({children:e}){let[r,a]=(0,t.useState)(null),l=(0,t.useRef)(void 0),c=(0,t.useCallback)((e,o=!1)=>{clearTimeout(l.current),a({message:e,error:o}),l.current=setTimeout(()=>a(null),4500)},[]);return(0,o.jsxs)(i.Provider,{value:c,children:[e,(0,o.jsx)(n,{role:"status","aria-live":"polite",$visible:!!r,$error:!!r?.error,children:r?.message})]})},"d",0,()=>(0,t.useContext)(i)])},3115,e=>{var o=e.i(1398),t=e.i(8678),r=e.i(3828),i=e.i(814),n=e.i(9835),a=e.i(4787),l=e.i(3133),c=e.i(4410);let s=["/login","/404"],d=i.U.div.withConfig({displayName:"_app__Loading",componentId:"sc-f5408d83-0"})`
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.6rem;
  color: ${({theme:e})=>e.color.muted};
  font-weight: 700;
`;e.s(["default",0,function({Component:e,pageProps:m}){let{pathname:u}=(0,r.useRouter)(),p=(0,o.jsx)(e,{...m});return(0,o.jsxs)(i.J,{theme:c.B,children:[(0,o.jsx)(c.l,{}),(0,o.jsx)(t.default,{children:(0,o.jsx)("meta",{name:"viewport",content:"width=device-width,initial-scale=1"})}),(0,o.jsx)(l.N,{children:s.includes(u)?p:(0,o.jsx)(a.S,{fallback:e=>(0,o.jsx)(d,{children:e?(0,o.jsx)(n.m,{$tone:"error",role:"alert",children:e}):"Загружаем панель…"}),children:p})})]})}])},4410,e=>{var o=e.i(814);let t=o.m`
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
`,r=o.Q`
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
    color-scheme: dark;
  }
  h1, h2, h3, p { margin: 0; }
  a { color: inherit; text-decoration: none; }
  button, input, select { font: inherit; color: inherit; }
  button { cursor: pointer; border: 0; background: none; padding: 0; }
  button:disabled { cursor: wait; opacity: 0.6; }
  :focus-visible { outline: 0.2rem solid ${({theme:e})=>e.color.accent}; outline-offset: 0.2rem; }
  [hidden] { display: none !important; }
  ::selection { background: ${({theme:e})=>e.color.accent}; color: #000; }
`;e.s(["l",0,r,"N",0,t,"B",0,{color:{page:"#000000",surface:"#161616",tile:"#232323",tileHover:"#2b2b2b",line:"#2c2c2c",text:"#ececec",strong:"#ffffff",muted:"#8b8b8b",faint:"#5c5c5c",ghost:"#343434",accent:"#22b6ca",accentDeep:"#1595a8",accentSoft:"rgba(34, 182, 202, 0.14)",paid:"#4ed36b",unpaid:"#f2c94c",overdue:"#ff6150",overdueSoft:"rgba(255, 97, 80, 0.12)",unpaidSoft:"rgba(242, 201, 76, 0.12)"},light:{page:"#f4f5f6",panel:"#ffffff",tile:"#f2f3f4",ink:"#111214",muted:"#7b7f86",line:"#e7e9ec"},radius:{sm:"0.8rem",md:"1.2rem",lg:"1.6rem",xl:"2.4rem",sheet:"4.8rem",pill:"99rem"},font:"'Inter Variable', 'Segoe UI', system-ui, -apple-system, sans-serif",mobile:"@media (max-width: 960px)"}])}],8146,(e,o,t)=>{let r="/_app";(window.__NEXT_P=window.__NEXT_P||[]).push([r,()=>e.r(3115)]),o.hot&&o.hot.dispose(function(){window.__NEXT_P.push([r])})},8805,e=>{e.v(o=>Promise.all(["static/chunks/2l2zj5v8ol-z8.js"].map(o=>e.l(o))).then(()=>o(9466)))},8761,e=>{e.v(o=>Promise.all(["static/chunks/0itk165g74z2l.js"].map(o=>e.l(o))).then(()=>o(3594)))},3828,(e,o,t)=>{o.exports=e.r(6990)}]);