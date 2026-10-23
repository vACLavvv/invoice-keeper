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
`;e.s(["i",0,s,"W",0,c,"n",0,function({title:e,eyebrow:n="INVOICE KEEPER",onClose:d,children:s}){let c=(0,r.useRef)(null);return(0,r.useEffect)(()=>{let e=c.current;return e&&!e.open&&e.showModal(),()=>e?.close()},[]),(0,t.jsxs)(o,{ref:c,"aria-labelledby":"modal-title",onCancel:e=>{e.preventDefault(),d()},onClick:e=>{e.target===c.current&&d()},children:[(0,t.jsxs)(l,{children:[(0,t.jsxs)("div",{children:[(0,t.jsx)(a,{children:n}),(0,t.jsx)("h2",{id:"modal-title",children:e})]}),(0,t.jsx)(i._,{type:"button","aria-label":"Закрыть",onClick:d,children:"×"})]}),s]})},"Q",0,function({onSubmit:e,actions:n,children:o}){let[l,a]=(0,r.useState)(!1),[s,c]=(0,r.useState)(null);async function u(t){t.preventDefault();let r=t.nativeEvent.submitter;a(!0),c(null);try{await e(new FormData(t.currentTarget),r)}catch(e){c(e.message),a(!1)}}return(0,t.jsx)(d,{onSubmit:u,children:(0,t.jsxs)("fieldset",{disabled:l,children:[o,s&&(0,t.jsx)(i.m,{$tone:"error",role:"alert",children:s}),(0,t.jsx)(i.z,{$gap:1,$wrap:!0,$between:!0,children:n})]})})}])},3201,e=>{var t=e.i(1398),r=e.i(7289),n=e.i(4545),i=e.i(4787),o=e.i(3133),l=e.i(9218),a=e.i(9835);e.s(["O",0,function({payment:e,onClose:n}){let{refresh:d}=(0,i.U)(),s=(0,o.d)();return(0,t.jsx)(l.n,{title:"Прекратить повторение?",onClose:n,children:(0,t.jsx)(l.Q,{onSubmit:async()=>{await (0,r.k)(`/recurring-payments/${e.id}`,{method:"DELETE"}),n(),d(),s("Платёж перенесён в архив. История сохранена.")},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(a.K,{type:"button",$variant:"secondary",onClick:n,children:"Оставить"}),(0,t.jsx)(a.K,{type:"submit",$variant:"danger",children:"Прекратить платёж"})]}),children:(0,t.jsxs)(l.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),"Новые периоды и напоминания создаваться не будут. Уже созданные периоды, даты и история оплат сохранятся в архиве."]})})})},"n",0,function({onClose:e}){let{settings:d,setMonth:s,refresh:c}=(0,i.U)(),u=(0,o.d)();return(0,t.jsx)(l.n,{title:"Новый регулярный платёж",onClose:e,children:(0,t.jsxs)(l.Q,{onSubmit:async t=>{let n=await (0,r.k)("/recurring-payments",{method:"POST",body:{title:t.get("title"),amount:t.get("amount"),currency:t.get("currency"),first_due_date:t.get("first_due_date"),frequency:"monthly"}});e(),s(n.first_due_date.slice(0,7)),c(),u("Регулярный платёж добавлен")},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(a.K,{type:"button",$variant:"secondary",onClick:e,children:"Отмена"}),(0,t.jsx)(a.K,{type:"submit",children:"Добавить платёж"})]}),children:[(0,t.jsxs)(a.O,{children:["Название платежа",(0,t.jsx)(a.f,{name:"title",maxLength:120,required:!0,placeholder:"Например, аренда офиса",autoFocus:!0})]}),(0,t.jsxs)(l.i,{children:[(0,t.jsxs)(a.O,{children:["Сумма",(0,t.jsx)(a.f,{name:"amount",type:"number",step:"0.01",min:"0.01",max:"9999999999.99",required:!0,placeholder:"0,00",inputMode:"decimal"})]}),(0,t.jsxs)(a.O,{children:["Валюта",(0,t.jsx)(a.d,{name:"currency",defaultValue:"RUB",children:n.E.map(e=>(0,t.jsx)("option",{children:e},e))})]})]}),(0,t.jsxs)(a.O,{children:["Первая дата оплаты",(0,t.jsx)(a.f,{name:"first_due_date",type:"date",min:"2000-01-01",max:"2100-12-31",defaultValue:d.today,required:!0}),(0,t.jsxs)("small",{children:["Часовой пояс: ",d.timezone]})]}),(0,t.jsxs)(l.W,{children:[(0,t.jsx)("b",{children:"Повторяется каждый месяц."})," Если такого числа нет, срок — последний день месяца. Для каждого периода будет своя отметка оплаты. Если до срока меньше 3 дней, напоминание уйдёт сразу."]})]})})},"p",0,function({occurrence:e,onClose:d}){let{settings:s,refresh:c}=(0,i.U)(),u=(0,o.d)(),f=null!==e.paid_at;return(0,t.jsx)(l.n,{title:f?"Изменить оплату":"Отметить оплату",onClose:d,children:(0,t.jsxs)(l.Q,{onSubmit:async(t,n)=>{let i=n?.value==="undo";await (0,r.k)(`/payment-occurrences/${e.id}`,{method:"PATCH",body:i?{paid:!1}:{paid:!0,paid_at:t.get("paid_at")}}),d(),c(),u(i?"Оплата отменена. Дата очищена.":"Оплата сохранена")},actions:(0,t.jsxs)(t.Fragment,{children:[f?(0,t.jsx)(a.K,{type:"submit",name:"action",value:"undo",formNoValidate:!0,$variant:"secondary",children:"Отменить оплату"}):(0,t.jsx)(a.K,{type:"button",$variant:"secondary",onClick:d,children:"Назад"}),(0,t.jsx)(a.K,{type:"submit",name:"action",value:"save",children:f?"Сохранить дату":"Подтвердить оплату"})]}),children:[(0,t.jsxs)(l.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,n.e)(e.amount,e.currency)," · срок ",(0,n.H)(e.due_date),(0,t.jsx)("br",{}),"Изменение затронет только этот период."]}),(0,t.jsxs)(a.O,{children:["Фактическая дата оплаты",(0,t.jsx)(a.f,{name:"paid_at",type:"date",defaultValue:e.paid_at??s.today,max:s.today,required:!0}),(0,t.jsx)("small",{children:"Оплата в день срока — вовремя. Исправление даты пересчитает просрочку, срок не изменится."})]})]})})}])},9877,e=>{var t=e.i(1398),r=e.i(8678),n=e.i(1158),i=e.i(3828),o=e.i(1788),l=e.i(814),a=e.i(7289),d=e.i(4545),s=e.i(4787),c=e.i(3133),u=e.i(8524),f=e.i(3201),m=e.i(9835);let h=[{href:"/",label:"Платежи",icon:u.f.payments},{href:"/recurring",label:"Регулярные",icon:u.f.recurring},{href:"/calendar",label:"Календарь",icon:u.f.calendar},{href:"/team",label:"Команда",icon:u.f.team,admin:!0},{href:"/activity",label:"Журнал",icon:u.f.activity,admin:!0}];function p({dark:e=!1,size:r=36}){let[n,i]=e?["#111214","#fff"]:["#fff","#111214"];return(0,t.jsxs)("svg",{width:r,height:r,viewBox:"0 0 48 48","aria-hidden":"true",children:[(0,t.jsx)("rect",{width:"48",height:"48",rx:"11",fill:n}),(0,t.jsx)("path",{d:"M15 12h18v25l-4-3-5 3-5-3-4 3V12Z",fill:i}),(0,t.jsx)("path",{d:"m20 23 3 3 6-7",fill:"none",stroke:n,strokeWidth:"2.6",strokeLinecap:"round",strokeLinejoin:"round"})]})}let g=l.U.div.withConfig({displayName:"Shell__Layout",componentId:"sc-6e65fbbd-0"})`
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
`,v=l.U.span.withConfig({displayName:"Shell__Today",componentId:"sc-6e65fbbd-6"})`
  font-size: 2.4rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap;
`,w=l.U.nav.withConfig({displayName:"Shell__Nav",componentId:"sc-6e65fbbd-7"})`
  display: grid;
  gap: 0.2rem;
  ${({theme:e})=>e.mobile} { display: flex; overflow-x: auto; padding-bottom: 0.4rem; }
`,$=l.m`
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
`,C=(0,l.U)(n.default).withConfig({displayName:"Shell__NavItem",componentId:"sc-6e65fbbd-8"})`${$}`,M=l.U.button.withConfig({displayName:"Shell__NavButton",componentId:"sc-6e65fbbd-9"})`${$}`,k=l.U.div.withConfig({displayName:"Shell__Bottom",componentId:"sc-6e65fbbd-10"})`
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
`,S=l.U.span.withConfig({displayName:"Shell__Plus",componentId:"sc-6e65fbbd-12"})`
  color: ${({theme:e})=>e.color.accent};
  font-size: 2.2rem;
  line-height: 1;
`,I=(0,l.U)(n.default).withConfig({displayName:"Shell__LogoLink",componentId:"sc-6e65fbbd-13"})`
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
`,O=l.U.header.withConfig({displayName:"Shell__Header",componentId:"sc-6e65fbbd-15"})`
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
`,P=l.U.div.withConfig({displayName:"Shell__Ghost",componentId:"sc-6e65fbbd-16"})`
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
`,R=l.U.div.withConfig({displayName:"Shell__HeaderSide",componentId:"sc-6e65fbbd-18"})`
  display: grid;
  justify-items: end;
  gap: 1.2rem;
  ${({theme:e})=>e.mobile} { justify-items: start; }
`,T=l.U.span.withConfig({displayName:"Shell__Meta",componentId:"sc-6e65fbbd-19"})`
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.3rem;
`,L=l.U.div.withConfig({displayName:"Shell__Content",componentId:"sc-6e65fbbd-20"})`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2.4rem;
  ${({theme:e})=>e.mobile} { gap: 1.6rem; }
`;e.s(["B",0,p,"u",0,function({title:e,heading:n,subtitle:l,action:$,children:D}){let z=(0,i.useRouter)(),{user:B,settings:K,isAdmin:F}=(0,s.U)(),A=(0,c.d)(),[V,H]=(0,o.useState)(!1),{data:q}=(0,s.Z)(()=>(0,a.k)("/payment-occurrences?include_archived=false"),[]),W=q?.filter(e=>"paid"!==e.status&&e.due_date<=K.today).length??0;async function Z(){try{await (0,a.k)("/auth/logout",{method:"POST"}),window.location.assign("/login")}catch(e){A(e.message,!0)}}return(0,t.jsxs)(g,{children:[(0,t.jsx)(r.default,{children:(0,t.jsx)("title",{children:`${e} \xb7 Invoice Keeper`})}),(0,t.jsxs)(b,{children:[(0,t.jsxs)(x,{children:[(0,t.jsxs)(y,{children:[(0,t.jsxs)("span",{title:B.display_name,children:["@",B.username]}),(0,t.jsxs)(j,{href:"/","aria-label":W?`${W} к оплате сегодня или просрочено`:"Нет срочных платежей",children:[u.f.bell,W>0&&(0,t.jsx)(_,{children:W})]})]}),(0,t.jsxs)(y,{children:[(0,t.jsx)(v,{children:(0,d.c)(K.today,{day:"numeric",month:"short"}).replace(".","")}),(0,t.jsx)(m.g,{$tilt:-8,title:K.telegram_enabled?"Напоминания в Telegram включены":"Telegram не подключён",children:K.telegram_enabled?"tg ✓":"tg off"})]})]}),(0,t.jsx)(w,{"aria-label":"Разделы",children:h.filter(e=>!e.admin||F).map(e=>{let r=z.pathname===e.href;return(0,t.jsxs)(C,{href:e.href,$active:r,"aria-current":r?"page":void 0,children:[e.label,e.icon]},e.href)})}),(0,t.jsxs)(k,{children:[F&&(0,t.jsxs)(U,{type:"button",onClick:()=>H(!0),children:["Добавить платёж ",(0,t.jsx)(S,{"aria-hidden":"true",children:"+"})]}),(0,t.jsxs)(C,{href:"/api/v1/docs",target:"_blank",rel:"noopener",$active:!1,children:["Документация API",u.f.docs]}),(0,t.jsxs)(M,{type:"button",onClick:Z,children:["Выйти",u.f.logout]}),(0,t.jsx)(I,{href:"/","aria-label":"Invoice Keeper — на главную",children:(0,t.jsx)(p,{})})]})]}),(0,t.jsxs)(N,{children:[(0,t.jsxs)(O,{children:[(0,t.jsxs)("div",{children:[(0,t.jsx)(P,{"aria-hidden":"true",children:e}),(0,t.jsx)("h1",{children:n}),l&&(0,t.jsx)(E,{children:l})]}),(0,t.jsxs)(R,{children:[(0,t.jsxs)(T,{children:[(0,d.c)(K.today,{day:"numeric",month:"long",year:"numeric"})," · ",K.timezone]}),$]})]}),(0,t.jsx)(L,{children:D})]}),V&&(0,t.jsx)(f.n,{onClose:()=>H(!1)})]})}])},8524,e=>{var t=e.i(1398);function r({children:e}){return(0,t.jsx)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e})}let n={payments:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M3 10.5 12 4l9 6.5"}),(0,t.jsx)("path",{d:"M5 9.5V20h14V9.5"}),(0,t.jsx)("path",{d:"M10 20v-5h4v5"})]}),recurring:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M20 12a8 8 0 0 1-13.7 5.6"}),(0,t.jsx)("path",{d:"M4 12A8 8 0 0 1 17.7 6.4"}),(0,t.jsx)("path",{d:"M18 3v3.5h-3.5"}),(0,t.jsx)("path",{d:"M6 21v-3.5h3.5"})]}),calendar:(0,t.jsxs)(r,{children:[(0,t.jsx)("rect",{x:"3.5",y:"5",width:"17",height:"15",rx:"2.5"}),(0,t.jsx)("path",{d:"M3.5 10h17M8 3v4M16 3v4"})]}),team:(0,t.jsxs)(r,{children:[(0,t.jsx)("circle",{cx:"9",cy:"8.5",r:"3.5"}),(0,t.jsx)("path",{d:"M2.5 20a6.5 6.5 0 0 1 13 0"}),(0,t.jsx)("path",{d:"M16 5.5a3.5 3.5 0 0 1 0 6.5M18.5 20a6.5 6.5 0 0 0-3-5.5"})]}),activity:(0,t.jsxs)(r,{children:[(0,t.jsx)("rect",{x:"4",y:"3.5",width:"16",height:"17",rx:"2.5"}),(0,t.jsx)("path",{d:"M8 8h8M8 12h8M8 16h5"})]}),docs:(0,t.jsx)(r,{children:(0,t.jsx)("path",{d:"M6 3.5h11a1 1 0 0 1 1 1V20l-6-3.5L6 20V4.5a1 1 0 0 1 0-1Z"})}),logout:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"}),(0,t.jsx)("path",{d:"M10 16l-4-4 4-4M6 12h10"})]}),bell:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"}),(0,t.jsx)("path",{d:"M10 20.5a2.2 2.2 0 0 0 4 0"})]})};e.s(["f",0,n])},4545,e=>{let t={RUB:"₽",USD:"$",EUR:"€"};function r(e){let t=Number(e);return new Intl.NumberFormat("ru-RU",{minimumFractionDigits:t%1?2:0,maximumFractionDigits:2}).format(t)}function n(e,t={day:"numeric",month:"short"}){return e?new Intl.DateTimeFormat("ru-RU",t).format(new Date(e.slice(0,10)+"T12:00:00")):"—"}e.s(["E",0,["RUB","USD","EUR"],"c",0,n,"H",0,e=>n(e,{day:"numeric",month:"long",year:"numeric"}),"z",0,r,"e",0,function(e,n){return`${r(e)} ${t[n]}`},"n",0,function(e){let t=n(e+"-01",{month:"long",year:"numeric"}).replace(/ г\.$/,"");return t[0].toUpperCase()+t.slice(1)},"s",0,function(e){let[t,r]=e.split("-").map(Number);return{from_date:`${e}-01`,to_date:`${e}-${new Date(t,r,0).getDate()}`}},"G",0,function(e,t,r,n){return e%10==1&&e%100!=11?t:e%10>=2&&e%10<=4&&(e%100<12||e%100>14)?r:n},"_",0,function(e,t){let[r,n]=e.split("-").map(Number),i=new Date(r,n-1+t,1);return 2e3>i.getFullYear()||i.getFullYear()>2100?e:`${i.getFullYear()}-${String(i.getMonth()+1).padStart(2,"0")}`},"$",0,{paid:"Оплачено",unpaid:"К оплате",overdue:"Просрочено"},"F",0,t])},4471,(e,t,r)=>{function n(e,t,r,n){return!1}e.i(461),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"getDomainLocale",{enumerable:!0,get:function(){return n}}),e.r(90),("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},9149,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return $},useLinkStatus:function(){return w}};for(var i in n)Object.defineProperty(r,i,{enumerable:!0,get:n[i]});let o=e.r(2456),l=e.r(1398),a=o._(e.r(1788)),d=e.r(472),s=e.r(1112),c=e.r(8169),u=e.r(9129),f=e.r(4862),m=e.r(5479),h=e.r(1914),p=e.r(4471),g=e.r(4113),b=e.r(3230),x=new Set;function y(e,t,r,n){if(!("u"<typeof window)&&(0,s.isLocalURL)(t)){if(!n.bypassPrefetchedCheck){let i=t+"%"+r+"%"+(void 0!==n.locale?n.locale:"locale"in e?e.locale:void 0);if(x.has(i))return;x.add(i)}e.prefetch(t,r,n).catch(e=>{})}}function j(e){return"string"==typeof e?e:(0,c.formatUrl)(e)}let _=a.default.forwardRef(function(e,t){let r,n,{href:i,as:o,children:c,prefetch:x=null,passHref:_,replace:v,shallow:w,scroll:$,locale:C,onClick:M,onNavigate:k,onMouseEnter:U,onTouchStart:S,legacyBehavior:I=!1,transitionTypes:N,...O}=e;r=c,I&&("string"==typeof r||"number"==typeof r)&&(r=(0,l.jsx)("a",{children:r}));let P=a.default.useContext(m.RouterContext),E=!1!==x,{href:R,as:T}=a.default.useMemo(()=>{if(!P){let e=j(i);return{href:e,as:o?j(o):e}}let[e,t]=(0,d.resolveHref)(P,i,!0);return{href:e,as:o?(0,d.resolveHref)(P,o):t||e}},[P,i,o]),L=a.default.useRef(R),D=a.default.useRef(T);I&&(n=a.default.Children.only(r));let z=I?n&&"object"==typeof n&&n.ref:t,[B,K,F]=(0,h.useIntersection)({rootMargin:"200px"}),A=a.default.useCallback(e=>{(D.current!==T||L.current!==R)&&(F(),D.current=T,L.current=R),B(e)},[T,R,F,B]),V=(0,b.useMergedRef)(A,z);a.default.useEffect(()=>{!P||K&&E&&y(P,R,T,{bypassPrefetchedCheck:!1,locale:C})},[T,R,K,C,E,P?.locale,P]);let H={ref:V,onClick(e){I||"function"!=typeof M||M(e),I&&n.props&&"function"==typeof n.props.onClick&&n.props.onClick(e),!P||e.defaultPrevented||function(e,t,r,n,i,o,l,a,d){let c,{nodeName:u}=e.currentTarget;if(!("A"===u.toUpperCase()&&((c=e.currentTarget.getAttribute("target"))&&"_self"!==c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,s.isLocalURL)(r)){i&&(e.preventDefault(),location.replace(r));return}e.preventDefault(),(()=>{if(d){let e=!1;if(d({preventDefault:()=>{e=!0}}),e)return}let e=l??!0;"beforePopState"in t?t[i?"replace":"push"](r,n,{shallow:o,locale:a,scroll:e}):t[i?"replace":"push"](n||r,{scroll:e})})()}}(e,P,R,T,v,w,$,C,k)},onMouseEnter(e){I||"function"!=typeof U||U(e),I&&n.props&&"function"==typeof n.props.onMouseEnter&&n.props.onMouseEnter(e),P&&y(P,R,T,{locale:C,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){I||"function"!=typeof S||S(e),I&&n.props&&"function"==typeof n.props.onTouchStart&&n.props.onTouchStart(e),P&&y(P,R,T,{locale:C,priority:!0,bypassPrefetchedCheck:!0})}};if((0,u.isAbsoluteUrl)(T))H.href=T;else if(!I||_||"a"===n.type&&!("href"in n.props)){let e=void 0!==C?C:P?.locale;H.href=P?.isLocaleDomain&&(0,p.getDomainLocale)(T,e,P?.locales,P?.domainLocales)||(0,g.addBasePath)((0,f.addLocale)(T,e,P?.defaultLocale))}return I?a.default.cloneElement(n,H):(0,l.jsx)("a",{...O,...H,children:r})}),v=(0,a.createContext)({pending:!1}),w=()=>(0,a.useContext)(v),$=_;("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1914,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useIntersection",{enumerable:!0,get:function(){return d}});let n=e.r(1788),i=e.r(9604),o="function"==typeof IntersectionObserver,l=new Map,a=[];function d({rootRef:e,rootMargin:t,disabled:r}){let s=r||!o,[c,u]=(0,n.useState)(!1),f=(0,n.useRef)(null),m=(0,n.useCallback)(e=>{f.current=e},[]);return(0,n.useEffect)(()=>{if(o){if(s||c)return;let r=f.current;if(r&&r.tagName)return function(e,t,r){let{id:n,observer:i,elements:o}=function(e){let t,r={root:e.root||null,margin:e.rootMargin||""},n=a.find(e=>e.root===r.root&&e.margin===r.margin);if(n&&(t=l.get(n)))return t;let i=new Map;return t={id:r,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=i.get(e.target),r=e.isIntersecting||e.intersectionRatio>0;t&&r&&t(r)})},e),elements:i},a.push(r),l.set(r,t),t}(r);return o.set(e,t),i.observe(e),function(){if(o.delete(e),i.unobserve(e),0===o.size){i.disconnect(),l.delete(n);let e=a.findIndex(e=>e.root===n.root&&e.margin===n.margin);e>-1&&a.splice(e,1)}}}(r,e=>e&&u(e),{root:e?.current,rootMargin:t})}else if(!c){let e=(0,i.requestIdleCallback)(()=>u(!0));return()=>(0,i.cancelIdleCallback)(e)}},[s,t,e,c,f.current]),[m,c,(0,n.useCallback)(()=>{u(!1)},[])]}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},3230,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return i}});let n=e.r(1788);function i(e,t){let r=(0,n.useRef)(null),i=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=i.current;t&&(i.current=null,t())}else e&&(r.current=o(e,n)),t&&(i.current=o(t,n))},[e,t])}function o(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},5230,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814),i=e.i(3201),o=e.i(9877),l=e.i(9835),a=e.i(7289),d=e.i(4545),s=e.i(4787);let c=n.U.div.withConfig({displayName:"recurring__Grid",componentId:"sc-db3cc6dd-0"})`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(28rem, 1fr));
  gap: 1.6rem;
`,u=n.U.div.withConfig({displayName:"recurring__Line",componentId:"sc-db3cc6dd-1"})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1.4rem;
  min-height: 4.2rem;
  & + & { border-top: 1px solid ${({theme:e})=>e.color.faint}; }
`,f=n.U.div.withConfig({displayName:"recurring__Corner",componentId:"sc-db3cc6dd-2"})`
  position: absolute;
  right: 2rem;
  bottom: 2.4rem;
`;e.s(["default",0,function(){let{isAdmin:e}=(0,s.U)(),[n,m]=(0,r.useState)(null),{data:h,error:p}=(0,s.Z)(()=>(0,a.k)("/recurring-payments"),[]);return(0,t.jsxs)(o.u,{title:"Регулярные",heading:"регулярные платежи",subtitle:"Один раз настройте расход — система сама создаёт следующие периоды.",children:[p&&(0,t.jsx)(l.m,{$tone:"error",role:"alert",children:p}),(0,t.jsx)(l.m,{children:"Каждый месяц — отдельный период со своей отметкой оплаты. Если нужного числа нет, срок переносится на последний день месяца."}),h?0===h.length?(0,t.jsxs)(l.e,{children:[(0,t.jsx)("b",{children:"Начните с регулярного платежа"}),"Добавьте аренду, сервер или подписку кнопкой «Добавить платёж» слева."]}):(0,t.jsx)(c,{children:h.map(r=>(0,t.jsxs)(l.B,{children:[(0,t.jsxs)(l.h,{children:[r.title,(0,t.jsx)(l.T,{"aria-hidden":"true",children:"›"})]}),(0,t.jsxs)(l.k,{children:[d.F[r.currency]," ",(0,d.z)(r.amount)," / месяц · ",r.anchor_day,"-го числа"]}),(0,t.jsxs)(l.i,{height:13.2,children:[(0,t.jsxs)(u,{children:["с ",(0,d.c)(r.first_due_date,{day:"numeric",month:"long",year:"numeric"})]}),(0,t.jsxs)(u,{children:[r.unpaid_count," ",(0,d.G)(r.unpaid_count,"неоплаченный период","неоплаченных периода","неоплаченных периодов")]}),(0,t.jsxs)(u,{children:[(0,t.jsx)(l.a,{$status:r.active?"active":"archived",children:r.active?"активен":"в архиве"}),e&&r.active&&(0,t.jsx)(l.K,{type:"button",$small:!0,$variant:"secondary",onClick:()=>m(r),children:"прекратить"})]})]}),!r.active&&(0,t.jsx)(f,{children:(0,t.jsx)(l.g,{$tilt:-6,children:"архив"})})]},r.id))}):(0,t.jsx)(l.e,{children:"Загружаем…"}),n&&(0,t.jsx)(i.O,{payment:n,onClose:()=>m(null)})]})}])}],1101,(e,t,r)=>{let n="/recurring";(window.__NEXT_P=window.__NEXT_P||[]).push([n,()=>e.r(5230)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([n])})},1158,(e,t,r)=>{t.exports=e.r(9149)}]);