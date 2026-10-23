(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[9218,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814),i=e.i(9835);let o=n.U.dialog.withConfig({displayName:"Modal__Dialog",componentId:"sc-e36fe5a1-0"})`
  width: min(52rem, calc(100vw - 3.2rem));
  max-height: calc(100dvh - 3.2rem);
  padding: 2.8rem;
  border: 1px solid ${({theme:e})=>e.color.line};
  border-radius: ${({theme:e})=>e.radius.xl};
  background: ${({theme:e})=>e.color.surface};
  color: ${({theme:e})=>e.color.text};
  box-shadow: 0 2.4rem 6.4rem rgba(0, 0, 0, 0.6);
  &::backdrop { background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(0.3rem); }
  h2 { font-size: 2.4rem; font-weight: 600; text-transform: lowercase; color: ${({theme:e})=>e.color.strong}; }
  ${({theme:e})=>e.mobile} { padding: 2rem; }
`,l=n.U.div.withConfig({displayName:"Modal__Header",componentId:"sc-e36fe5a1-1"})`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.6rem;
  margin-bottom: 2.4rem;
`,a=n.U.div.withConfig({displayName:"Modal__Eyebrow",componentId:"sc-e36fe5a1-2"})`
  font-size: 1.6rem;
  font-weight: 900;
  font-style: italic;
  text-transform: uppercase;
  color: ${({theme:e})=>e.color.ghost};
  margin-bottom: 0.2rem;
`,d=n.U.form.withConfig({displayName:"Modal__Form",componentId:"sc-e36fe5a1-3"})`
  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 1.8rem; }
`,s=n.U.div.withConfig({displayName:"Modal__FormRow",componentId:"sc-e36fe5a1-4"})`
  display: grid;
  grid-template-columns: 1fr 14rem;
  gap: 1.2rem;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; }
`,c=n.U.div.withConfig({displayName:"Modal__InfoBox",componentId:"sc-e36fe5a1-5"})`
  padding: 1.4rem 1.6rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.tile};
  color: ${({theme:e})=>e.color.muted};
  line-height: 1.6;
  b { color: ${({theme:e})=>e.color.strong}; font-weight: 500; }
`;e.s(["i",0,s,"W",0,c,"n",0,function({title:e,eyebrow:n="INVOICE KEEPER",onClose:d,children:s}){let c=(0,r.useRef)(null);return(0,r.useEffect)(()=>{let e=c.current;return e&&!e.open&&e.showModal(),()=>e?.close()},[]),(0,t.jsxs)(o,{ref:c,"aria-labelledby":"modal-title",onCancel:e=>{e.preventDefault(),d()},onClick:e=>{e.target===c.current&&d()},children:[(0,t.jsxs)(l,{children:[(0,t.jsxs)("div",{children:[(0,t.jsx)(a,{children:n}),(0,t.jsx)("h2",{id:"modal-title",children:e})]}),(0,t.jsx)(i._,{type:"button","aria-label":"Закрыть",onClick:d,children:"×"})]}),s]})},"Q",0,function({onSubmit:e,actions:n,children:o}){let[l,a]=(0,r.useState)(!1),[s,c]=(0,r.useState)(null);async function u(t){t.preventDefault();let r=t.nativeEvent.submitter;a(!0),c(null);try{await e(new FormData(t.currentTarget),r)}catch(e){c(e.message),a(!1)}}return(0,t.jsx)(d,{onSubmit:u,children:(0,t.jsxs)("fieldset",{disabled:l,children:[o,s&&(0,t.jsx)(i.m,{$tone:"error",role:"alert",children:s}),(0,t.jsx)(i.z,{$gap:1,$wrap:!0,$between:!0,children:n})]})})}])},2092,e=>{var t=e.i(1398),r=e.i(814),n=e.i(4545),i=e.i(4787),o=e.i(9835);let l=r.U.button.withConfig({displayName:"MonthSwitcher__Arrow",componentId:"sc-f5112d14-0"})`
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  color: ${({theme:e})=>e.color.muted};
  font-size: 2.6rem;
  line-height: 1;
  &:hover { color: ${({theme:e})=>e.color.strong}; background: ${({theme:e})=>e.color.tile}; }
`,a=r.U.h2.withConfig({displayName:"MonthSwitcher__Label",componentId:"sc-f5112d14-1"})`
  min-width: 16rem;
  text-align: center;
  font-size: 1.8rem;
  font-weight: 500;
  color: ${({theme:e})=>e.color.strong};
`,d=r.U.span.withConfig({displayName:"MonthSwitcher__Hint",componentId:"sc-f5112d14-2"})`color: ${({theme:e})=>e.color.muted};`;e.s(["f",0,function({hint:e}){let{month:r,setMonth:s,settings:c}=(0,i.U)(),u=c.today.slice(0,7);return(0,t.jsxs)(o.z,{$between:!0,$wrap:!0,children:[(0,t.jsxs)(o.z,{$gap:.4,children:[(0,t.jsx)(l,{type:"button","aria-label":"Предыдущий месяц",onClick:()=>s((0,n._)(r,-1)),children:"‹"}),(0,t.jsx)(a,{"aria-live":"polite",children:(0,n.n)(r)}),(0,t.jsx)(l,{type:"button","aria-label":"Следующий месяц",onClick:()=>s((0,n._)(r,1)),children:"›"})]}),r!==u?(0,t.jsx)(o.K,{type:"button",$variant:"ghost",onClick:()=>s(u),children:"к текущему месяцу →"}):e&&(0,t.jsx)(d,{children:e})]})}])},3201,e=>{var t=e.i(1398),r=e.i(7289),n=e.i(4545),i=e.i(4787),o=e.i(3133),l=e.i(9218),a=e.i(9835);e.s(["O",0,function({payment:e,onClose:n}){let{refresh:d}=(0,i.U)(),s=(0,o.d)();return(0,t.jsx)(l.n,{title:"Прекратить повторение?",onClose:n,children:(0,t.jsx)(l.Q,{onSubmit:async()=>{await (0,r.k)(`/recurring-payments/${e.id}`,{method:"DELETE"}),n(),d(),s("Платёж перенесён в архив. История сохранена.")},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(a.K,{type:"button",$variant:"secondary",onClick:n,children:"Оставить"}),(0,t.jsx)(a.K,{type:"submit",$variant:"danger",children:"Прекратить платёж"})]}),children:(0,t.jsxs)(l.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),"Новые периоды и напоминания создаваться не будут. Уже созданные периоды, даты и история оплат сохранятся в архиве."]})})})},"n",0,function({onClose:e}){let{settings:d,setMonth:s,refresh:c}=(0,i.U)(),u=(0,o.d)();return(0,t.jsx)(l.n,{title:"Новый регулярный платёж",onClose:e,children:(0,t.jsxs)(l.Q,{onSubmit:async t=>{let n=await (0,r.k)("/recurring-payments",{method:"POST",body:{title:t.get("title"),amount:t.get("amount"),currency:t.get("currency"),first_due_date:t.get("first_due_date"),frequency:"monthly"}});e(),s(n.first_due_date.slice(0,7)),c(),u("Регулярный платёж добавлен")},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(a.K,{type:"button",$variant:"secondary",onClick:e,children:"Отмена"}),(0,t.jsx)(a.K,{type:"submit",children:"Добавить платёж"})]}),children:[(0,t.jsxs)(a.O,{children:["Название платежа",(0,t.jsx)(a.f,{name:"title",maxLength:120,required:!0,placeholder:"Например, аренда офиса",autoFocus:!0})]}),(0,t.jsxs)(l.i,{children:[(0,t.jsxs)(a.O,{children:["Сумма",(0,t.jsx)(a.f,{name:"amount",type:"number",step:"0.01",min:"0.01",max:"9999999999.99",required:!0,placeholder:"0,00",inputMode:"decimal"})]}),(0,t.jsxs)(a.O,{children:["Валюта",(0,t.jsx)(a.d,{name:"currency",defaultValue:"RUB",children:n.E.map(e=>(0,t.jsx)("option",{children:e},e))})]})]}),(0,t.jsxs)(a.O,{children:["Первая дата оплаты",(0,t.jsx)(a.f,{name:"first_due_date",type:"date",min:"2000-01-01",max:"2100-12-31",defaultValue:d.today,required:!0}),(0,t.jsxs)("small",{children:["Часовой пояс: ",d.timezone]})]}),(0,t.jsxs)(l.W,{children:[(0,t.jsx)("b",{children:"Повторяется каждый месяц."})," Если такого числа нет, срок — последний день месяца. Для каждого периода будет своя отметка оплаты. Если до срока меньше 3 дней, напоминание уйдёт сразу."]})]})})},"p",0,function({occurrence:e,onClose:d}){let{settings:s,refresh:c}=(0,i.U)(),u=(0,o.d)(),f=null!==e.paid_at;return(0,t.jsx)(l.n,{title:f?"Изменить оплату":"Отметить оплату",onClose:d,children:(0,t.jsxs)(l.Q,{onSubmit:async(t,n)=>{let i=n?.value==="undo";await (0,r.k)(`/payment-occurrences/${e.id}`,{method:"PATCH",body:i?{paid:!1}:{paid:!0,paid_at:t.get("paid_at")}}),d(),c(),u(i?"Оплата отменена. Дата очищена.":"Оплата сохранена")},actions:(0,t.jsxs)(t.Fragment,{children:[f?(0,t.jsx)(a.K,{type:"submit",name:"action",value:"undo",formNoValidate:!0,$variant:"secondary",children:"Отменить оплату"}):(0,t.jsx)(a.K,{type:"button",$variant:"secondary",onClick:d,children:"Назад"}),(0,t.jsx)(a.K,{type:"submit",name:"action",value:"save",children:f?"Сохранить дату":"Подтвердить оплату"})]}),children:[(0,t.jsxs)(l.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,n.e)(e.amount,e.currency)," · срок ",(0,n.H)(e.due_date),(0,t.jsx)("br",{}),"Изменение затронет только этот период."]}),(0,t.jsxs)(a.O,{children:["Фактическая дата оплаты",(0,t.jsx)(a.f,{name:"paid_at",type:"date",defaultValue:e.paid_at??s.today,max:s.today,required:!0}),(0,t.jsx)("small",{children:"Оплата в день срока — вовремя. Исправление даты пересчитает просрочку, срок не изменится."})]})]})})}])},9877,e=>{var t=e.i(1398),r=e.i(8678),n=e.i(1158),i=e.i(3828),o=e.i(1788),l=e.i(814),a=e.i(7289),d=e.i(4545),s=e.i(4787),c=e.i(3133),u=e.i(8524),f=e.i(3201),m=e.i(9835);let p=[{href:"/",label:"Платежи",icon:u.f.payments},{href:"/recurring",label:"Регулярные",icon:u.f.recurring},{href:"/calendar",label:"Календарь",icon:u.f.calendar},{href:"/team",label:"Команда",icon:u.f.team,admin:!0},{href:"/activity",label:"Журнал",icon:u.f.activity,admin:!0}];function h({dark:e=!1,size:r=36}){let[n,i]=e?["#111214","#fff"]:["#fff","#111214"];return(0,t.jsxs)("svg",{width:r,height:r,viewBox:"0 0 48 48","aria-hidden":"true",children:[(0,t.jsx)("rect",{width:"48",height:"48",rx:"11",fill:n}),(0,t.jsx)("path",{d:"M15 12h18v25l-4-3-5 3-5-3-4 3V12Z",fill:i}),(0,t.jsx)("path",{d:"m20 23 3 3 6-7",fill:"none",stroke:n,strokeWidth:"2.6",strokeLinecap:"round",strokeLinejoin:"round"})]})}let g=l.U.div.withConfig({displayName:"Shell__Layout",componentId:"sc-6e65fbbd-0"})`
  min-height: 100vh;
  display: grid;
  grid-template-columns: ${"23.6rem"} minmax(0, 1fr);
  ${({theme:e})=>e.mobile} { grid-template-columns: minmax(0, 1fr); }
`,b=l.U.aside.withConfig({displayName:"Shell__Sidebar",componentId:"sc-6e65fbbd-1"})`
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
  padding: 4.8rem 2rem 2rem;
  ${({theme:e})=>e.mobile} {
    position: static;
    height: auto;
    padding: 1.6rem 1.6rem 0;
    gap: 1.2rem;
  }
`,x=l.U.div.withConfig({displayName:"Shell__Account",componentId:"sc-6e65fbbd-2"})`
  border: 1px solid ${({theme:e})=>e.color.line};
  border-radius: ${({theme:e})=>e.radius.lg};
`,y=l.U.div.withConfig({displayName:"Shell__AccountRow",componentId:"sc-6e65fbbd-3"})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  color: ${({theme:e})=>e.color.strong};
  & + & { border-top: 1px solid ${({theme:e})=>e.color.line}; }
  > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1.6rem; }
`,j=(0,l.U)(n.default).withConfig({displayName:"Shell__Bell",componentId:"sc-6e65fbbd-4"})`
  position: relative;
  display: inline-grid;
  color: ${({theme:e})=>e.color.strong};
`,_=l.U.span.withConfig({displayName:"Shell__BellBadge",componentId:"sc-6e65fbbd-5"})`
  position: absolute;
  top: -0.7rem;
  right: -0.8rem;
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 0.4rem;
  display: grid;
  place-items: center;
  border-radius: 0.4rem;
  background: ${({theme:e})=>e.color.accent};
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  transform: rotate(8deg);
`,w=l.U.span.withConfig({displayName:"Shell__Today",componentId:"sc-6e65fbbd-6"})`
  font-size: 2.4rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap;
`,$=l.U.nav.withConfig({displayName:"Shell__Nav",componentId:"sc-6e65fbbd-7"})`
  display: grid;
  gap: 0.2rem;
  ${({theme:e})=>e.mobile} { display: flex; overflow-x: auto; padding-bottom: 0.4rem; }
`,v=l.m`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.6rem;
  width: 100%;
  padding: 1rem 1rem;
  border-radius: ${({theme:e})=>e.radius.md};
  color: ${({theme:e})=>e.color.text};
  font-size: 1.5rem;
  text-align: left;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
  svg { color: ${({theme:e})=>e.color.muted}; flex-shrink: 0; }
  &:hover { background: ${({theme:e})=>e.color.surface}; color: ${({theme:e})=>e.color.strong}; }
  ${({$active:e,theme:t})=>e&&l.m`
    background: ${t.color.tile};
    color: ${t.color.strong};
    svg { color: ${t.color.accent}; }
    &:hover { background: ${t.color.tile}; }
  `}
  ${({theme:e})=>e.mobile} { width: auto; svg { display: none; } }
`,C=(0,l.U)(n.default).withConfig({displayName:"Shell__NavItem",componentId:"sc-6e65fbbd-8"})`${v}`,k=l.U.button.withConfig({displayName:"Shell__NavButton",componentId:"sc-6e65fbbd-9"})`${v}`,M=l.U.div.withConfig({displayName:"Shell__Bottom",componentId:"sc-6e65fbbd-10"})`
  margin-top: auto;
  display: grid;
  gap: 0.2rem;
  ${({theme:e})=>e.mobile} { display: flex; overflow-x: auto; margin-top: 0; > * { margin: 0; } }
`,U=l.U.button.withConfig({displayName:"Shell__AddButton",componentId:"sc-6e65fbbd-11"})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.6rem;
  padding: 1.1rem 1.2rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.tile};
  color: ${({theme:e})=>e.color.strong};
  font-size: 1.5rem;
  transition: background 0.15s;
  &:hover { background: ${({theme:e})=>e.color.tileHover}; }
`,I=l.U.span.withConfig({displayName:"Shell__Plus",componentId:"sc-6e65fbbd-12"})`
  color: ${({theme:e})=>e.color.accent};
  font-size: 2.2rem;
  line-height: 1;
`,S=(0,l.U)(n.default).withConfig({displayName:"Shell__LogoLink",componentId:"sc-6e65fbbd-13"})`
  margin: 2rem 0 0 1rem;
  justify-self: start;
  ${({theme:e})=>e.mobile} { display: none; }
`,N=l.U.main.withConfig({displayName:"Shell__Surface",componentId:"sc-6e65fbbd-14"})`
  min-width: 0;
  margin: 4.8rem 1.2rem 1.2rem 0;
  padding: 6.4rem 4.8rem 4.8rem;
  border-radius: ${({theme:e})=>e.radius.xl};
  background: ${({theme:e})=>e.color.surface};
  ${({theme:e})=>e.mobile} { margin: 1.6rem 0 0; padding: 3.2rem 1.6rem; border-radius: ${({theme:e})=>e.radius.xl} ${({theme:e})=>e.radius.xl} 0 0; }
`,P=l.U.header.withConfig({displayName:"Shell__Header",componentId:"sc-6e65fbbd-15"})`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 2.4rem;
  flex-wrap: wrap;
  margin-bottom: 3.2rem;
  h1 {
    font-size: 2.6rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: ${({theme:e})=>e.color.strong};
    text-transform: lowercase;
  }
`,O=l.U.div.withConfig({displayName:"Shell__Ghost",componentId:"sc-6e65fbbd-16"})`
  font-size: 5.6rem;
  line-height: 0.9;
  font-weight: 900;
  font-style: italic;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  color: ${({theme:e})=>e.color.ghost};
  user-select: none;
  ${({theme:e})=>e.mobile} { font-size: 4rem; }
`,E=l.U.p.withConfig({displayName:"Shell__Subtitle",componentId:"sc-6e65fbbd-17"})`
  margin-top: 0.6rem;
  color: ${({theme:e})=>e.color.muted};
`,D=l.U.div.withConfig({displayName:"Shell__HeaderSide",componentId:"sc-6e65fbbd-18"})`
  display: grid;
  justify-items: end;
  gap: 1.2rem;
  ${({theme:e})=>e.mobile} { justify-items: start; }
`,R=l.U.span.withConfig({displayName:"Shell__Meta",componentId:"sc-6e65fbbd-19"})`
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.3rem;
`,T=l.U.div.withConfig({displayName:"Shell__Content",componentId:"sc-6e65fbbd-20"})`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2.4rem;
  ${({theme:e})=>e.mobile} { gap: 1.6rem; }
`;e.s(["B",0,h,"u",0,function({title:e,heading:n,subtitle:l,action:v,children:z}){let L=(0,i.useRouter)(),{user:K,settings:A,isAdmin:B}=(0,s.U)(),F=(0,c.d)(),[V,H]=(0,o.useState)(!1),{data:W}=(0,s.Z)(()=>(0,a.k)("/payment-occurrences?include_archived=false"),[]),q=W?.filter(e=>"paid"!==e.status&&e.due_date<=A.today).length??0;async function Z(){try{await (0,a.k)("/auth/logout",{method:"POST"}),window.location.assign("/login")}catch(e){F(e.message,!0)}}return(0,t.jsxs)(g,{children:[(0,t.jsx)(r.default,{children:(0,t.jsx)("title",{children:`${e} \xb7 Invoice Keeper`})}),(0,t.jsxs)(b,{children:[(0,t.jsxs)(x,{children:[(0,t.jsxs)(y,{children:[(0,t.jsxs)("span",{title:K.display_name,children:["@",K.username]}),(0,t.jsxs)(j,{href:"/","aria-label":q?`${q} к оплате сегодня или просрочено`:"Нет срочных платежей",children:[u.f.bell,q>0&&(0,t.jsx)(_,{children:q})]})]}),(0,t.jsxs)(y,{children:[(0,t.jsx)(w,{children:(0,d.c)(A.today,{day:"numeric",month:"short"}).replace(".","")}),(0,t.jsx)(m.g,{$tilt:-8,title:A.telegram_enabled?"Напоминания в Telegram включены":"Telegram не подключён",children:A.telegram_enabled?"tg ✓":"tg off"})]})]}),(0,t.jsx)($,{"aria-label":"Разделы",children:p.filter(e=>!e.admin||B).map(e=>{let r=L.pathname===e.href;return(0,t.jsxs)(C,{href:e.href,$active:r,"aria-current":r?"page":void 0,children:[e.label,e.icon]},e.href)})}),(0,t.jsxs)(M,{children:[B&&(0,t.jsxs)(U,{type:"button",onClick:()=>H(!0),children:["Добавить платёж ",(0,t.jsx)(I,{"aria-hidden":"true",children:"+"})]}),(0,t.jsxs)(C,{href:"/api/v1/docs",target:"_blank",rel:"noopener",$active:!1,children:["Документация API",u.f.docs]}),(0,t.jsxs)(k,{type:"button",onClick:Z,children:["Выйти",u.f.logout]}),(0,t.jsx)(S,{href:"/","aria-label":"Invoice Keeper — на главную",children:(0,t.jsx)(h,{})})]})]}),(0,t.jsxs)(N,{children:[(0,t.jsxs)(P,{children:[(0,t.jsxs)("div",{children:[(0,t.jsx)(O,{"aria-hidden":"true",children:e}),(0,t.jsx)("h1",{children:n}),l&&(0,t.jsx)(E,{children:l})]}),(0,t.jsxs)(D,{children:[(0,t.jsxs)(R,{children:[(0,d.c)(A.today,{day:"numeric",month:"long",year:"numeric"})," · ",A.timezone]}),v]})]}),(0,t.jsx)(T,{children:z})]}),V&&(0,t.jsx)(f.n,{onClose:()=>H(!1)})]})}])},8524,e=>{var t=e.i(1398);function r({children:e}){return(0,t.jsx)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e})}let n={payments:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M3 10.5 12 4l9 6.5"}),(0,t.jsx)("path",{d:"M5 9.5V20h14V9.5"}),(0,t.jsx)("path",{d:"M10 20v-5h4v5"})]}),recurring:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M20 12a8 8 0 0 1-13.7 5.6"}),(0,t.jsx)("path",{d:"M4 12A8 8 0 0 1 17.7 6.4"}),(0,t.jsx)("path",{d:"M18 3v3.5h-3.5"}),(0,t.jsx)("path",{d:"M6 21v-3.5h3.5"})]}),calendar:(0,t.jsxs)(r,{children:[(0,t.jsx)("rect",{x:"3.5",y:"5",width:"17",height:"15",rx:"2.5"}),(0,t.jsx)("path",{d:"M3.5 10h17M8 3v4M16 3v4"})]}),team:(0,t.jsxs)(r,{children:[(0,t.jsx)("circle",{cx:"9",cy:"8.5",r:"3.5"}),(0,t.jsx)("path",{d:"M2.5 20a6.5 6.5 0 0 1 13 0"}),(0,t.jsx)("path",{d:"M16 5.5a3.5 3.5 0 0 1 0 6.5M18.5 20a6.5 6.5 0 0 0-3-5.5"})]}),activity:(0,t.jsxs)(r,{children:[(0,t.jsx)("rect",{x:"4",y:"3.5",width:"16",height:"17",rx:"2.5"}),(0,t.jsx)("path",{d:"M8 8h8M8 12h8M8 16h5"})]}),docs:(0,t.jsx)(r,{children:(0,t.jsx)("path",{d:"M6 3.5h11a1 1 0 0 1 1 1V20l-6-3.5L6 20V4.5a1 1 0 0 1 0-1Z"})}),logout:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"}),(0,t.jsx)("path",{d:"M10 16l-4-4 4-4M6 12h10"})]}),bell:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"}),(0,t.jsx)("path",{d:"M10 20.5a2.2 2.2 0 0 0 4 0"})]})};e.s(["f",0,n])},4545,e=>{let t={RUB:"₽",USD:"$",EUR:"€"};function r(e){let t=Number(e);return new Intl.NumberFormat("ru-RU",{minimumFractionDigits:t%1?2:0,maximumFractionDigits:2}).format(t)}function n(e,t={day:"numeric",month:"short"}){return e?new Intl.DateTimeFormat("ru-RU",t).format(new Date(e.slice(0,10)+"T12:00:00")):"—"}e.s(["E",0,["RUB","USD","EUR"],"c",0,n,"H",0,e=>n(e,{day:"numeric",month:"long",year:"numeric"}),"z",0,r,"e",0,function(e,n){return`${r(e)} ${t[n]}`},"n",0,function(e){let t=n(e+"-01",{month:"long",year:"numeric"}).replace(/ г\.$/,"");return t[0].toUpperCase()+t.slice(1)},"s",0,function(e){let[t,r]=e.split("-").map(Number);return{from_date:`${e}-01`,to_date:`${e}-${new Date(t,r,0).getDate()}`}},"G",0,function(e,t,r,n){return e%10==1&&e%100!=11?t:e%10>=2&&e%10<=4&&(e%100<12||e%100>14)?r:n},"_",0,function(e,t){let[r,n]=e.split("-").map(Number),i=new Date(r,n-1+t,1);return 2e3>i.getFullYear()||i.getFullYear()>2100?e:`${i.getFullYear()}-${String(i.getMonth()+1).padStart(2,"0")}`},"$",0,{paid:"Оплачено",unpaid:"К оплате",overdue:"Просрочено"},"F",0,t])},4471,(e,t,r)=>{function n(e,t,r,n){return!1}e.i(461),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"getDomainLocale",{enumerable:!0,get:function(){return n}}),e.r(90),("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},9149,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return v},useLinkStatus:function(){return $}};for(var i in n)Object.defineProperty(r,i,{enumerable:!0,get:n[i]});let o=e.r(2456),l=e.r(1398),a=o._(e.r(1788)),d=e.r(472),s=e.r(1112),c=e.r(8169),u=e.r(9129),f=e.r(4862),m=e.r(5479),p=e.r(1914),h=e.r(4471),g=e.r(4113),b=e.r(3230),x=new Set;function y(e,t,r,n){if(!("u"<typeof window)&&(0,s.isLocalURL)(t)){if(!n.bypassPrefetchedCheck){let i=t+"%"+r+"%"+(void 0!==n.locale?n.locale:"locale"in e?e.locale:void 0);if(x.has(i))return;x.add(i)}e.prefetch(t,r,n).catch(e=>{})}}function j(e){return"string"==typeof e?e:(0,c.formatUrl)(e)}let _=a.default.forwardRef(function(e,t){let r,n,{href:i,as:o,children:c,prefetch:x=null,passHref:_,replace:w,shallow:$,scroll:v,locale:C,onClick:k,onNavigate:M,onMouseEnter:U,onTouchStart:I,legacyBehavior:S=!1,transitionTypes:N,...P}=e;r=c,S&&("string"==typeof r||"number"==typeof r)&&(r=(0,l.jsx)("a",{children:r}));let O=a.default.useContext(m.RouterContext),E=!1!==x,{href:D,as:R}=a.default.useMemo(()=>{if(!O){let e=j(i);return{href:e,as:o?j(o):e}}let[e,t]=(0,d.resolveHref)(O,i,!0);return{href:e,as:o?(0,d.resolveHref)(O,o):t||e}},[O,i,o]),T=a.default.useRef(D),z=a.default.useRef(R);S&&(n=a.default.Children.only(r));let L=S?n&&"object"==typeof n&&n.ref:t,[K,A,B]=(0,p.useIntersection)({rootMargin:"200px"}),F=a.default.useCallback(e=>{(z.current!==R||T.current!==D)&&(B(),z.current=R,T.current=D),K(e)},[R,D,B,K]),V=(0,b.useMergedRef)(F,L);a.default.useEffect(()=>{!O||A&&E&&y(O,D,R,{bypassPrefetchedCheck:!1,locale:C})},[R,D,A,C,E,O?.locale,O]);let H={ref:V,onClick(e){S||"function"!=typeof k||k(e),S&&n.props&&"function"==typeof n.props.onClick&&n.props.onClick(e),!O||e.defaultPrevented||function(e,t,r,n,i,o,l,a,d){let c,{nodeName:u}=e.currentTarget;if(!("A"===u.toUpperCase()&&((c=e.currentTarget.getAttribute("target"))&&"_self"!==c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,s.isLocalURL)(r)){i&&(e.preventDefault(),location.replace(r));return}e.preventDefault(),(()=>{if(d){let e=!1;if(d({preventDefault:()=>{e=!0}}),e)return}let e=l??!0;"beforePopState"in t?t[i?"replace":"push"](r,n,{shallow:o,locale:a,scroll:e}):t[i?"replace":"push"](n||r,{scroll:e})})()}}(e,O,D,R,w,$,v,C,M)},onMouseEnter(e){S||"function"!=typeof U||U(e),S&&n.props&&"function"==typeof n.props.onMouseEnter&&n.props.onMouseEnter(e),O&&y(O,D,R,{locale:C,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){S||"function"!=typeof I||I(e),S&&n.props&&"function"==typeof n.props.onTouchStart&&n.props.onTouchStart(e),O&&y(O,D,R,{locale:C,priority:!0,bypassPrefetchedCheck:!0})}};if((0,u.isAbsoluteUrl)(R))H.href=R;else if(!S||_||"a"===n.type&&!("href"in n.props)){let e=void 0!==C?C:O?.locale;H.href=O?.isLocaleDomain&&(0,h.getDomainLocale)(R,e,O?.locales,O?.domainLocales)||(0,g.addBasePath)((0,f.addLocale)(R,e,O?.defaultLocale))}return S?a.default.cloneElement(n,H):(0,l.jsx)("a",{...P,...H,children:r})}),w=(0,a.createContext)({pending:!1}),$=()=>(0,a.useContext)(w),v=_;("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1914,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useIntersection",{enumerable:!0,get:function(){return d}});let n=e.r(1788),i=e.r(9604),o="function"==typeof IntersectionObserver,l=new Map,a=[];function d({rootRef:e,rootMargin:t,disabled:r}){let s=r||!o,[c,u]=(0,n.useState)(!1),f=(0,n.useRef)(null),m=(0,n.useCallback)(e=>{f.current=e},[]);return(0,n.useEffect)(()=>{if(o){if(s||c)return;let r=f.current;if(r&&r.tagName)return function(e,t,r){let{id:n,observer:i,elements:o}=function(e){let t,r={root:e.root||null,margin:e.rootMargin||""},n=a.find(e=>e.root===r.root&&e.margin===r.margin);if(n&&(t=l.get(n)))return t;let i=new Map;return t={id:r,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=i.get(e.target),r=e.isIntersecting||e.intersectionRatio>0;t&&r&&t(r)})},e),elements:i},a.push(r),l.set(r,t),t}(r);return o.set(e,t),i.observe(e),function(){if(o.delete(e),i.unobserve(e),0===o.size){i.disconnect(),l.delete(n);let e=a.findIndex(e=>e.root===n.root&&e.margin===n.margin);e>-1&&a.splice(e,1)}}}(r,e=>e&&u(e),{root:e?.current,rootMargin:t})}else if(!c){let e=(0,i.requestIdleCallback)(()=>u(!0));return()=>(0,i.cancelIdleCallback)(e)}},[s,t,e,c,f.current]),[m,c,(0,n.useCallback)(()=>{u(!1)},[])]}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},3230,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return i}});let n=e.r(1788);function i(e,t){let r=(0,n.useRef)(null),i=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=i.current;t&&(i.current=null,t())}else e&&(r.current=o(e,n)),t&&(i.current=o(t,n))},[e,t])}function o(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1318,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814),i=e.i(2092),o=e.i(3201),l=e.i(9877),a=e.i(9835),d=e.i(7289),s=e.i(4545),c=e.i(4787);let u=["ПН","ВТ","СР","ЧТ","ПТ","СБ","ВС"],f=n.U.div.withConfig({displayName:"calendar__Grid",componentId:"sc-a81dcf24-0"})`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.6rem;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; }
`,m=n.U.div.withConfig({displayName:"calendar__Weekday",componentId:"sc-a81dcf24-1"})`
  padding: 0 0.4rem 0.4rem;
  font-size: 1.3rem;
  color: ${({theme:e})=>e.color.muted};
  text-transform: lowercase;
  ${({theme:e})=>e.mobile} { display: none; }
`,p=n.U.div.withConfig({displayName:"calendar__Day",componentId:"sc-a81dcf24-2"})`
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
    ${h} { background: ${t.color.accent}; color: #fff; }
  `}
  ${({theme:e})=>e.mobile} { min-height: auto; }
`,h=n.U.span.withConfig({displayName:"calendar__DayNumber",componentId:"sc-a81dcf24-3"})`
  justify-self: start;
  min-width: 2.6rem;
  padding: 0.1rem 0.7rem;
  border-radius: ${({theme:e})=>e.radius.sm};
  color: ${({theme:e})=>e.color.strong};
  text-align: center;
`,g=n.U.button.withConfig({displayName:"calendar__Item",componentId:"sc-a81dcf24-4"})`
  display: grid;
  gap: 0.2rem;
  padding: 0.6rem 0.8rem;
  border-radius: ${({theme:e})=>e.radius.sm};
  background: #000;
  color: ${({theme:e})=>e.color.text};
  text-align: left;
  font-size: 1.2rem;
  border-left: 0.3rem solid ${({theme:e,$status:t})=>({paid:e.color.paid,unpaid:e.color.unpaid,overdue:e.color.overdue})[t]};
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${({theme:e})=>e.color.muted}; }
  b { font-weight: 500; color: ${({theme:e})=>e.color.strong}; }
  &:hover { background: ${({theme:e})=>e.color.surface}; }
`;e.s(["default",0,function(){let{month:e,settings:n}=(0,c.U)(),[b,x]=(0,r.useState)(null),{data:y,error:j}=(0,c.Z)(()=>(0,d.k)("/payment-occurrences"),[]),[_,w]=e.split("-").map(Number),$=(new Date(_,w-1,1).getDay()+6)%7,v=new Date(_,w,0).getDate(),C=(y??[]).filter(t=>t.due_date.startsWith(e));return(0,t.jsxs)(l.u,{title:"Календарь",heading:"календарь оплат",subtitle:"Как распределяются расходы в течение месяца.",children:[j&&(0,t.jsx)(a.m,{$tone:"error",role:"alert",children:j}),(0,t.jsx)(i.f,{hint:"план расходов по датам"}),(0,t.jsxs)(f,{children:[u.map(e=>(0,t.jsx)(m,{children:e},e)),Array.from({length:$},(e,r)=>(0,t.jsx)(p,{$blank:!0,"aria-hidden":"true"},"lead"+r)),Array.from({length:v},(r,i)=>{let o=`${e}-${String(i+1).padStart(2,"0")}`;return(0,t.jsxs)(p,{$today:o===n.today,children:[(0,t.jsx)(h,{children:i+1}),C.filter(e=>e.due_date===o).map(e=>(0,t.jsxs)(g,{type:"button",$status:e.status,onClick:()=>x(e),title:`${e.title} \xb7 ${(0,s.e)(e.amount,e.currency)} \xb7 ${s.$[e.status]}`,children:[(0,t.jsx)("span",{children:e.title}),(0,t.jsx)("b",{children:(0,s.e)(e.amount,e.currency)})]},e.id))]},o)}),Array.from({length:(7-($+v)%7)%7},(e,r)=>(0,t.jsx)(p,{$blank:!0,"aria-hidden":"true"},"tail"+r))]}),b&&(0,t.jsx)(o.p,{occurrence:b,onClose:()=>x(null)})]})}])}],4296,(e,t,r)=>{let n="/calendar";(window.__NEXT_P=window.__NEXT_P||[]).push([n,()=>e.r(1318)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([n])})},1158,(e,t,r)=>{t.exports=e.r(9149)}]);