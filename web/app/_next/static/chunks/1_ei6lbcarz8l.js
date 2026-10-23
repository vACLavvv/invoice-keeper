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
`,a=n.U.div.withConfig({displayName:"Modal__Header",componentId:"sc-e36fe5a1-1"})`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.6rem;
  margin-bottom: 2.4rem;
`,l=n.U.div.withConfig({displayName:"Modal__Eyebrow",componentId:"sc-e36fe5a1-2"})`
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
`;e.s(["i",0,s,"W",0,c,"n",0,function({title:e,eyebrow:n="INVOICE KEEPER",onClose:d,children:s}){let c=(0,r.useRef)(null);return(0,r.useEffect)(()=>{let e=c.current;return e&&!e.open&&e.showModal(),()=>e?.close()},[]),(0,t.jsxs)(o,{ref:c,"aria-labelledby":"modal-title",onCancel:e=>{e.preventDefault(),d()},onClick:e=>{e.target===c.current&&d()},children:[(0,t.jsxs)(a,{children:[(0,t.jsxs)("div",{children:[(0,t.jsx)(l,{children:n}),(0,t.jsx)("h2",{id:"modal-title",children:e})]}),(0,t.jsx)(i._,{type:"button","aria-label":"Закрыть",onClick:d,children:"×"})]}),s]})},"Q",0,function({onSubmit:e,actions:n,children:o}){let[a,l]=(0,r.useState)(!1),[s,c]=(0,r.useState)(null);async function m(t){t.preventDefault();let r=t.nativeEvent.submitter;l(!0),c(null);try{await e(new FormData(t.currentTarget),r)}catch(e){c(e.message),l(!1)}}return(0,t.jsx)(d,{onSubmit:m,children:(0,t.jsxs)("fieldset",{disabled:a,children:[o,s&&(0,t.jsx)(i.m,{$tone:"error",role:"alert",children:s}),(0,t.jsx)(i.z,{$gap:1,$wrap:!0,$between:!0,children:n})]})})}])},3201,e=>{var t=e.i(1398),r=e.i(7289),n=e.i(4545),i=e.i(4787),o=e.i(3133),a=e.i(9218),l=e.i(9835);e.s(["O",0,function({payment:e,onClose:n}){let{refresh:d}=(0,i.U)(),s=(0,o.d)();return(0,t.jsx)(a.n,{title:"Прекратить повторение?",onClose:n,children:(0,t.jsx)(a.Q,{onSubmit:async()=>{await (0,r.k)(`/recurring-payments/${e.id}`,{method:"DELETE"}),n(),d(),s("Платёж перенесён в архив. История сохранена.")},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(l.K,{type:"button",$variant:"secondary",onClick:n,children:"Оставить"}),(0,t.jsx)(l.K,{type:"submit",$variant:"danger",children:"Прекратить платёж"})]}),children:(0,t.jsxs)(a.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),"Новые периоды и напоминания создаваться не будут. Уже созданные периоды, даты и история оплат сохранятся в архиве."]})})})},"n",0,function({onClose:e}){let{settings:d,setMonth:s,refresh:c}=(0,i.U)(),m=(0,o.d)();return(0,t.jsx)(a.n,{title:"Новый регулярный платёж",onClose:e,children:(0,t.jsxs)(a.Q,{onSubmit:async t=>{let n=await (0,r.k)("/recurring-payments",{method:"POST",body:{title:t.get("title"),amount:t.get("amount"),currency:t.get("currency"),first_due_date:t.get("first_due_date"),frequency:"monthly"}});e(),s(n.first_due_date.slice(0,7)),c(),m("Регулярный платёж добавлен")},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(l.K,{type:"button",$variant:"secondary",onClick:e,children:"Отмена"}),(0,t.jsx)(l.K,{type:"submit",children:"Добавить платёж"})]}),children:[(0,t.jsxs)(l.O,{children:["Название платежа",(0,t.jsx)(l.f,{name:"title",maxLength:120,required:!0,placeholder:"Например, аренда офиса",autoFocus:!0})]}),(0,t.jsxs)(a.i,{children:[(0,t.jsxs)(l.O,{children:["Сумма",(0,t.jsx)(l.f,{name:"amount",type:"number",step:"0.01",min:"0.01",max:"9999999999.99",required:!0,placeholder:"0,00",inputMode:"decimal"})]}),(0,t.jsxs)(l.O,{children:["Валюта",(0,t.jsx)(l.d,{name:"currency",defaultValue:"RUB",children:n.E.map(e=>(0,t.jsx)("option",{children:e},e))})]})]}),(0,t.jsxs)(l.O,{children:["Первая дата оплаты",(0,t.jsx)(l.f,{name:"first_due_date",type:"date",min:"2000-01-01",max:"2100-12-31",defaultValue:d.today,required:!0}),(0,t.jsxs)("small",{children:["Часовой пояс: ",d.timezone]})]}),(0,t.jsxs)(a.W,{children:[(0,t.jsx)("b",{children:"Повторяется каждый месяц."})," Если такого числа нет, срок — последний день месяца. Для каждого периода будет своя отметка оплаты. Если до срока меньше 3 дней, напоминание уйдёт сразу."]})]})})},"p",0,function({occurrence:e,onClose:d}){let{settings:s,refresh:c}=(0,i.U)(),m=(0,o.d)(),u=null!==e.paid_at;return(0,t.jsx)(a.n,{title:u?"Изменить оплату":"Отметить оплату",onClose:d,children:(0,t.jsxs)(a.Q,{onSubmit:async(t,n)=>{let i=n?.value==="undo";await (0,r.k)(`/payment-occurrences/${e.id}`,{method:"PATCH",body:i?{paid:!1}:{paid:!0,paid_at:t.get("paid_at")}}),d(),c(),m(i?"Оплата отменена. Дата очищена.":"Оплата сохранена")},actions:(0,t.jsxs)(t.Fragment,{children:[u?(0,t.jsx)(l.K,{type:"submit",name:"action",value:"undo",formNoValidate:!0,$variant:"secondary",children:"Отменить оплату"}):(0,t.jsx)(l.K,{type:"button",$variant:"secondary",onClick:d,children:"Назад"}),(0,t.jsx)(l.K,{type:"submit",name:"action",value:"save",children:u?"Сохранить дату":"Подтвердить оплату"})]}),children:[(0,t.jsxs)(a.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,n.e)(e.amount,e.currency)," · срок ",(0,n.H)(e.due_date),(0,t.jsx)("br",{}),"Изменение затронет только этот период."]}),(0,t.jsxs)(l.O,{children:["Фактическая дата оплаты",(0,t.jsx)(l.f,{name:"paid_at",type:"date",defaultValue:e.paid_at??s.today,max:s.today,required:!0}),(0,t.jsx)("small",{children:"Оплата в день срока — вовремя. Исправление даты пересчитает просрочку, срок не изменится."})]})]})})}])},9877,e=>{var t=e.i(1398),r=e.i(8678),n=e.i(1158),i=e.i(3828),o=e.i(1788),a=e.i(814),l=e.i(7289),d=e.i(4545),s=e.i(4787),c=e.i(3133),m=e.i(8524),u=e.i(3201),p=e.i(9835);let f=[{href:"/",label:"Платежи",icon:m.f.payments},{href:"/recurring",label:"Регулярные",icon:m.f.recurring},{href:"/calendar",label:"Календарь",icon:m.f.calendar},{href:"/team",label:"Команда",icon:m.f.team,admin:!0},{href:"/activity",label:"Журнал",icon:m.f.activity,admin:!0}];function h({dark:e=!1,size:r=36}){let[n,i]=e?["#111214","#fff"]:["#fff","#111214"];return(0,t.jsxs)("svg",{width:r,height:r,viewBox:"0 0 48 48","aria-hidden":"true",children:[(0,t.jsx)("rect",{width:"48",height:"48",rx:"11",fill:n}),(0,t.jsx)("path",{d:"M15 12h18v25l-4-3-5 3-5-3-4 3V12Z",fill:i}),(0,t.jsx)("path",{d:"m20 23 3 3 6-7",fill:"none",stroke:n,strokeWidth:"2.6",strokeLinecap:"round",strokeLinejoin:"round"})]})}let g=a.U.div.withConfig({displayName:"Shell__Layout",componentId:"sc-6e65fbbd-0"})`
  min-height: 100vh;
  display: grid;
  grid-template-columns: ${"23.6rem"} minmax(0, 1fr);
  ${({theme:e})=>e.mobile} { grid-template-columns: minmax(0, 1fr); }
`,b=a.U.aside.withConfig({displayName:"Shell__Sidebar",componentId:"sc-6e65fbbd-1"})`
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
`,x=a.U.div.withConfig({displayName:"Shell__Account",componentId:"sc-6e65fbbd-2"})`
  border: 1px solid ${({theme:e})=>e.color.line};
  border-radius: ${({theme:e})=>e.radius.lg};
`,y=a.U.div.withConfig({displayName:"Shell__AccountRow",componentId:"sc-6e65fbbd-3"})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  color: ${({theme:e})=>e.color.strong};
  & + & { border-top: 1px solid ${({theme:e})=>e.color.line}; }
  > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1.6rem; }
`,j=(0,a.U)(n.default).withConfig({displayName:"Shell__Bell",componentId:"sc-6e65fbbd-4"})`
  position: relative;
  display: inline-grid;
  color: ${({theme:e})=>e.color.strong};
`,_=a.U.span.withConfig({displayName:"Shell__BellBadge",componentId:"sc-6e65fbbd-5"})`
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
`,w=a.U.span.withConfig({displayName:"Shell__Today",componentId:"sc-6e65fbbd-6"})`
  font-size: 2.4rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap;
`,v=a.U.nav.withConfig({displayName:"Shell__Nav",componentId:"sc-6e65fbbd-7"})`
  display: grid;
  gap: 0.2rem;
  ${({theme:e})=>e.mobile} { display: flex; overflow-x: auto; padding-bottom: 0.4rem; }
`,$=a.m`
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
  ${({$active:e,theme:t})=>e&&a.m`
    background: ${t.color.tile};
    color: ${t.color.strong};
    svg { color: ${t.color.accent}; }
    &:hover { background: ${t.color.tile}; }
  `}
  ${({theme:e})=>e.mobile} { width: auto; svg { display: none; } }
`,C=(0,a.U)(n.default).withConfig({displayName:"Shell__NavItem",componentId:"sc-6e65fbbd-8"})`${$}`,k=a.U.button.withConfig({displayName:"Shell__NavButton",componentId:"sc-6e65fbbd-9"})`${$}`,U=a.U.div.withConfig({displayName:"Shell__Bottom",componentId:"sc-6e65fbbd-10"})`
  margin-top: auto;
  display: grid;
  gap: 0.2rem;
  ${({theme:e})=>e.mobile} { display: flex; overflow-x: auto; margin-top: 0; > * { margin: 0; } }
`,I=a.U.button.withConfig({displayName:"Shell__AddButton",componentId:"sc-6e65fbbd-11"})`
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
`,N=a.U.span.withConfig({displayName:"Shell__Plus",componentId:"sc-6e65fbbd-12"})`
  color: ${({theme:e})=>e.color.accent};
  font-size: 2.2rem;
  line-height: 1;
`,M=(0,a.U)(n.default).withConfig({displayName:"Shell__LogoLink",componentId:"sc-6e65fbbd-13"})`
  margin: 2rem 0 0 1rem;
  justify-self: start;
  ${({theme:e})=>e.mobile} { display: none; }
`,S=a.U.main.withConfig({displayName:"Shell__Surface",componentId:"sc-6e65fbbd-14"})`
  min-width: 0;
  margin: 4.8rem 1.2rem 1.2rem 0;
  padding: 6.4rem 4.8rem 4.8rem;
  border-radius: ${({theme:e})=>e.radius.xl};
  background: ${({theme:e})=>e.color.surface};
  ${({theme:e})=>e.mobile} { margin: 1.6rem 0 0; padding: 3.2rem 1.6rem; border-radius: ${({theme:e})=>e.radius.xl} ${({theme:e})=>e.radius.xl} 0 0; }
`,P=a.U.header.withConfig({displayName:"Shell__Header",componentId:"sc-6e65fbbd-15"})`
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
`,O=a.U.div.withConfig({displayName:"Shell__Ghost",componentId:"sc-6e65fbbd-16"})`
  font-size: 5.6rem;
  line-height: 0.9;
  font-weight: 900;
  font-style: italic;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  color: ${({theme:e})=>e.color.ghost};
  user-select: none;
  ${({theme:e})=>e.mobile} { font-size: 4rem; }
`,z=a.U.p.withConfig({displayName:"Shell__Subtitle",componentId:"sc-6e65fbbd-17"})`
  margin-top: 0.6rem;
  color: ${({theme:e})=>e.color.muted};
`,T=a.U.div.withConfig({displayName:"Shell__HeaderSide",componentId:"sc-6e65fbbd-18"})`
  display: grid;
  justify-items: end;
  gap: 1.2rem;
  ${({theme:e})=>e.mobile} { justify-items: start; }
`,E=a.U.span.withConfig({displayName:"Shell__Meta",componentId:"sc-6e65fbbd-19"})`
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.3rem;
`,R=a.U.div.withConfig({displayName:"Shell__Content",componentId:"sc-6e65fbbd-20"})`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2.4rem;
  ${({theme:e})=>e.mobile} { gap: 1.6rem; }
`;e.s(["B",0,h,"u",0,function({title:e,heading:n,subtitle:a,action:$,children:L}){let D=(0,i.useRouter)(),{user:F,settings:K,isAdmin:B}=(0,s.U)(),A=(0,c.d)(),[H,V]=(0,o.useState)(!1),{data:q}=(0,s.Z)(()=>(0,l.k)("/payment-occurrences?include_archived=false"),[]),W=q?.filter(e=>"paid"!==e.status&&e.due_date<=K.today).length??0;async function Y(){try{await (0,l.k)("/auth/logout",{method:"POST"}),window.location.assign("/login")}catch(e){A(e.message,!0)}}return(0,t.jsxs)(g,{children:[(0,t.jsx)(r.default,{children:(0,t.jsx)("title",{children:`${e} \xb7 Invoice Keeper`})}),(0,t.jsxs)(b,{children:[(0,t.jsxs)(x,{children:[(0,t.jsxs)(y,{children:[(0,t.jsxs)("span",{title:F.display_name,children:["@",F.username]}),(0,t.jsxs)(j,{href:"/","aria-label":W?`${W} к оплате сегодня или просрочено`:"Нет срочных платежей",children:[m.f.bell,W>0&&(0,t.jsx)(_,{children:W})]})]}),(0,t.jsxs)(y,{children:[(0,t.jsx)(w,{children:(0,d.c)(K.today,{day:"numeric",month:"short"}).replace(".","")}),(0,t.jsx)(p.g,{$tilt:-8,title:K.telegram_enabled?"Напоминания в Telegram включены":"Telegram не подключён",children:K.telegram_enabled?"tg ✓":"tg off"})]})]}),(0,t.jsx)(v,{"aria-label":"Разделы",children:f.filter(e=>!e.admin||B).map(e=>{let r=D.pathname===e.href;return(0,t.jsxs)(C,{href:e.href,$active:r,"aria-current":r?"page":void 0,children:[e.label,e.icon]},e.href)})}),(0,t.jsxs)(U,{children:[B&&(0,t.jsxs)(I,{type:"button",onClick:()=>V(!0),children:["Добавить платёж ",(0,t.jsx)(N,{"aria-hidden":"true",children:"+"})]}),(0,t.jsxs)(C,{href:"/api/v1/docs",target:"_blank",rel:"noopener",$active:!1,children:["Документация API",m.f.docs]}),(0,t.jsxs)(k,{type:"button",onClick:Y,children:["Выйти",m.f.logout]}),(0,t.jsx)(M,{href:"/","aria-label":"Invoice Keeper — на главную",children:(0,t.jsx)(h,{})})]})]}),(0,t.jsxs)(S,{children:[(0,t.jsxs)(P,{children:[(0,t.jsxs)("div",{children:[(0,t.jsx)(O,{"aria-hidden":"true",children:e}),(0,t.jsx)("h1",{children:n}),a&&(0,t.jsx)(z,{children:a})]}),(0,t.jsxs)(T,{children:[(0,t.jsxs)(E,{children:[(0,d.c)(K.today,{day:"numeric",month:"long",year:"numeric"})," · ",K.timezone]}),$]})]}),(0,t.jsx)(R,{children:L})]}),H&&(0,t.jsx)(u.n,{onClose:()=>V(!1)})]})}])},8524,e=>{var t=e.i(1398);function r({children:e}){return(0,t.jsx)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e})}let n={payments:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M3 10.5 12 4l9 6.5"}),(0,t.jsx)("path",{d:"M5 9.5V20h14V9.5"}),(0,t.jsx)("path",{d:"M10 20v-5h4v5"})]}),recurring:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M20 12a8 8 0 0 1-13.7 5.6"}),(0,t.jsx)("path",{d:"M4 12A8 8 0 0 1 17.7 6.4"}),(0,t.jsx)("path",{d:"M18 3v3.5h-3.5"}),(0,t.jsx)("path",{d:"M6 21v-3.5h3.5"})]}),calendar:(0,t.jsxs)(r,{children:[(0,t.jsx)("rect",{x:"3.5",y:"5",width:"17",height:"15",rx:"2.5"}),(0,t.jsx)("path",{d:"M3.5 10h17M8 3v4M16 3v4"})]}),team:(0,t.jsxs)(r,{children:[(0,t.jsx)("circle",{cx:"9",cy:"8.5",r:"3.5"}),(0,t.jsx)("path",{d:"M2.5 20a6.5 6.5 0 0 1 13 0"}),(0,t.jsx)("path",{d:"M16 5.5a3.5 3.5 0 0 1 0 6.5M18.5 20a6.5 6.5 0 0 0-3-5.5"})]}),activity:(0,t.jsxs)(r,{children:[(0,t.jsx)("rect",{x:"4",y:"3.5",width:"16",height:"17",rx:"2.5"}),(0,t.jsx)("path",{d:"M8 8h8M8 12h8M8 16h5"})]}),docs:(0,t.jsx)(r,{children:(0,t.jsx)("path",{d:"M6 3.5h11a1 1 0 0 1 1 1V20l-6-3.5L6 20V4.5a1 1 0 0 1 0-1Z"})}),logout:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"}),(0,t.jsx)("path",{d:"M10 16l-4-4 4-4M6 12h10"})]}),bell:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"}),(0,t.jsx)("path",{d:"M10 20.5a2.2 2.2 0 0 0 4 0"})]})};e.s(["f",0,n])},4545,e=>{let t={RUB:"₽",USD:"$",EUR:"€"};function r(e){let t=Number(e);return new Intl.NumberFormat("ru-RU",{minimumFractionDigits:t%1?2:0,maximumFractionDigits:2}).format(t)}function n(e,t={day:"numeric",month:"short"}){return e?new Intl.DateTimeFormat("ru-RU",t).format(new Date(e.slice(0,10)+"T12:00:00")):"—"}e.s(["E",0,["RUB","USD","EUR"],"c",0,n,"H",0,e=>n(e,{day:"numeric",month:"long",year:"numeric"}),"z",0,r,"e",0,function(e,n){return`${r(e)} ${t[n]}`},"n",0,function(e){let t=n(e+"-01",{month:"long",year:"numeric"}).replace(/ г\.$/,"");return t[0].toUpperCase()+t.slice(1)},"s",0,function(e){let[t,r]=e.split("-").map(Number);return{from_date:`${e}-01`,to_date:`${e}-${new Date(t,r,0).getDate()}`}},"G",0,function(e,t,r,n){return e%10==1&&e%100!=11?t:e%10>=2&&e%10<=4&&(e%100<12||e%100>14)?r:n},"_",0,function(e,t){let[r,n]=e.split("-").map(Number),i=new Date(r,n-1+t,1);return 2e3>i.getFullYear()||i.getFullYear()>2100?e:`${i.getFullYear()}-${String(i.getMonth()+1).padStart(2,"0")}`},"$",0,{paid:"Оплачено",unpaid:"К оплате",overdue:"Просрочено"},"F",0,t])},4471,(e,t,r)=>{function n(e,t,r,n){return!1}e.i(461),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"getDomainLocale",{enumerable:!0,get:function(){return n}}),e.r(90),("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},9149,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return $},useLinkStatus:function(){return v}};for(var i in n)Object.defineProperty(r,i,{enumerable:!0,get:n[i]});let o=e.r(2456),a=e.r(1398),l=o._(e.r(1788)),d=e.r(472),s=e.r(1112),c=e.r(8169),m=e.r(9129),u=e.r(4862),p=e.r(5479),f=e.r(1914),h=e.r(4471),g=e.r(4113),b=e.r(3230),x=new Set;function y(e,t,r,n){if(!("u"<typeof window)&&(0,s.isLocalURL)(t)){if(!n.bypassPrefetchedCheck){let i=t+"%"+r+"%"+(void 0!==n.locale?n.locale:"locale"in e?e.locale:void 0);if(x.has(i))return;x.add(i)}e.prefetch(t,r,n).catch(e=>{})}}function j(e){return"string"==typeof e?e:(0,c.formatUrl)(e)}let _=l.default.forwardRef(function(e,t){let r,n,{href:i,as:o,children:c,prefetch:x=null,passHref:_,replace:w,shallow:v,scroll:$,locale:C,onClick:k,onNavigate:U,onMouseEnter:I,onTouchStart:N,legacyBehavior:M=!1,transitionTypes:S,...P}=e;r=c,M&&("string"==typeof r||"number"==typeof r)&&(r=(0,a.jsx)("a",{children:r}));let O=l.default.useContext(p.RouterContext),z=!1!==x,{href:T,as:E}=l.default.useMemo(()=>{if(!O){let e=j(i);return{href:e,as:o?j(o):e}}let[e,t]=(0,d.resolveHref)(O,i,!0);return{href:e,as:o?(0,d.resolveHref)(O,o):t||e}},[O,i,o]),R=l.default.useRef(T),L=l.default.useRef(E);M&&(n=l.default.Children.only(r));let D=M?n&&"object"==typeof n&&n.ref:t,[F,K,B]=(0,f.useIntersection)({rootMargin:"200px"}),A=l.default.useCallback(e=>{(L.current!==E||R.current!==T)&&(B(),L.current=E,R.current=T),F(e)},[E,T,B,F]),H=(0,b.useMergedRef)(A,D);l.default.useEffect(()=>{!O||K&&z&&y(O,T,E,{bypassPrefetchedCheck:!1,locale:C})},[E,T,K,C,z,O?.locale,O]);let V={ref:H,onClick(e){M||"function"!=typeof k||k(e),M&&n.props&&"function"==typeof n.props.onClick&&n.props.onClick(e),!O||e.defaultPrevented||function(e,t,r,n,i,o,a,l,d){let c,{nodeName:m}=e.currentTarget;if(!("A"===m.toUpperCase()&&((c=e.currentTarget.getAttribute("target"))&&"_self"!==c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,s.isLocalURL)(r)){i&&(e.preventDefault(),location.replace(r));return}e.preventDefault(),(()=>{if(d){let e=!1;if(d({preventDefault:()=>{e=!0}}),e)return}let e=a??!0;"beforePopState"in t?t[i?"replace":"push"](r,n,{shallow:o,locale:l,scroll:e}):t[i?"replace":"push"](n||r,{scroll:e})})()}}(e,O,T,E,w,v,$,C,U)},onMouseEnter(e){M||"function"!=typeof I||I(e),M&&n.props&&"function"==typeof n.props.onMouseEnter&&n.props.onMouseEnter(e),O&&y(O,T,E,{locale:C,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){M||"function"!=typeof N||N(e),M&&n.props&&"function"==typeof n.props.onTouchStart&&n.props.onTouchStart(e),O&&y(O,T,E,{locale:C,priority:!0,bypassPrefetchedCheck:!0})}};if((0,m.isAbsoluteUrl)(E))V.href=E;else if(!M||_||"a"===n.type&&!("href"in n.props)){let e=void 0!==C?C:O?.locale;V.href=O?.isLocaleDomain&&(0,h.getDomainLocale)(E,e,O?.locales,O?.domainLocales)||(0,g.addBasePath)((0,u.addLocale)(E,e,O?.defaultLocale))}return M?l.default.cloneElement(n,V):(0,a.jsx)("a",{...P,...V,children:r})}),w=(0,l.createContext)({pending:!1}),v=()=>(0,l.useContext)(w),$=_;("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1914,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useIntersection",{enumerable:!0,get:function(){return d}});let n=e.r(1788),i=e.r(9604),o="function"==typeof IntersectionObserver,a=new Map,l=[];function d({rootRef:e,rootMargin:t,disabled:r}){let s=r||!o,[c,m]=(0,n.useState)(!1),u=(0,n.useRef)(null),p=(0,n.useCallback)(e=>{u.current=e},[]);return(0,n.useEffect)(()=>{if(o){if(s||c)return;let r=u.current;if(r&&r.tagName)return function(e,t,r){let{id:n,observer:i,elements:o}=function(e){let t,r={root:e.root||null,margin:e.rootMargin||""},n=l.find(e=>e.root===r.root&&e.margin===r.margin);if(n&&(t=a.get(n)))return t;let i=new Map;return t={id:r,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=i.get(e.target),r=e.isIntersecting||e.intersectionRatio>0;t&&r&&t(r)})},e),elements:i},l.push(r),a.set(r,t),t}(r);return o.set(e,t),i.observe(e),function(){if(o.delete(e),i.unobserve(e),0===o.size){i.disconnect(),a.delete(n);let e=l.findIndex(e=>e.root===n.root&&e.margin===n.margin);e>-1&&l.splice(e,1)}}}(r,e=>e&&m(e),{root:e?.current,rootMargin:t})}else if(!c){let e=(0,i.requestIdleCallback)(()=>m(!0));return()=>(0,i.cancelIdleCallback)(e)}},[s,t,e,c,u.current]),[p,c,(0,n.useCallback)(()=>{m(!1)},[])]}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},3230,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return i}});let n=e.r(1788);function i(e,t){let r=(0,n.useRef)(null),i=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=i.current;t&&(i.current=null,t())}else e&&(r.current=o(e,n)),t&&(i.current=o(t,n))},[e,t])}function o(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},8976,e=>{var t=e.i(1398),r=e.i(8678),n=e.i(1788),i=e.i(814),o=e.i(9877),a=e.i(9835),l=e.i(7289),d=e.i(4410);let s=i.m`color: ${({theme:e})=>e.light.ink};`,c=i.U.main.withConfig({displayName:"login__Page",componentId:"sc-ada9d95c-0"})`
  min-height: 100vh;
  background: ${({theme:e})=>e.light.page};
  ${s}
  color-scheme: light;
`,m=i.U.section.withConfig({displayName:"login__Hero",componentId:"sc-ada9d95c-1"})`
  position: relative;
  overflow: hidden;
  min-height: 72rem;
  padding: 2.4rem 2.6rem 14rem;
  ${d.N}
  ${({theme:e})=>e.mobile} { min-height: 56rem; padding: 1.6rem 1.6rem 10rem; }
`,u=i.U.header.withConfig({displayName:"login__Top",componentId:"sc-ada9d95c-2"})`
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
`,p=i.U.span.withConfig({displayName:"login__Brand",componentId:"sc-ada9d95c-3"})`
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  font-size: 1.6rem;
  font-weight: 500;
`,f=i.U.a.withConfig({displayName:"login__Pill",componentId:"sc-ada9d95c-4"})`
  padding: 0.9rem 1.6rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.light.ink};
  color: #fff;
  font-weight: 600;
  &:hover { background: #2a2c30; }
`,h=i.U.div.withConfig({displayName:"login__HeroText",componentId:"sc-ada9d95c-5"})`
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 2.4rem;
  margin-top: 20rem;
  text-align: center;
  ${({theme:e})=>e.mobile} { margin-top: 14rem; gap: 1.6rem; }
`,g=i.U.div.withConfig({displayName:"login__Wordmark",componentId:"sc-ada9d95c-6"})`
  font-size: 10rem;
  line-height: 0.9;
  font-weight: 800;
  letter-spacing: -0.06em;
  ${({theme:e})=>e.mobile} { font-size: 5.2rem; }
`,b=i.U.p.withConfig({displayName:"login__Tagline",componentId:"sc-ada9d95c-7"})`
  font-size: 3.8rem;
  font-weight: 400;
  letter-spacing: 0.01em;
  ${({theme:e})=>e.mobile} { font-size: 2.2rem; }
`,x=i.U.section.withConfig({displayName:"login__Sheet",componentId:"sc-ada9d95c-8"})`
  position: relative;
  z-index: 1;
  margin-top: -8rem;
  padding: 7.2rem 2.4rem 9.6rem;
  border-radius: ${({theme:e})=>e.radius.sheet} ${({theme:e})=>e.radius.sheet} 0 0;
  background: ${({theme:e})=>e.light.panel};
  ${({theme:e})=>e.mobile} { padding: 4.8rem 1.6rem 6.4rem; border-radius: 3.2rem 3.2rem 0 0; }
`,y=i.U.div.withConfig({displayName:"login__Stats",componentId:"sc-ada9d95c-9"})`
  max-width: 96rem;
  margin: 0 auto 6.4rem;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2.4rem;
  text-align: center;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; margin-bottom: 4rem; }
`,j=i.U.div.withConfig({displayName:"login__Stat",componentId:"sc-ada9d95c-10"})`
  display: grid;
  gap: 0.4rem;
  b { font-size: 2.4rem; font-weight: 500; }
  span { color: ${({theme:e})=>e.light.muted}; }
`,_=i.U.div.withConfig({displayName:"login__Frame",componentId:"sc-ada9d95c-11"})`
  max-width: 52rem;
  margin: 0 auto;
  padding: 1.2rem;
  border-radius: 3.2rem;
  background: ${({theme:e})=>e.light.tile};
  scroll-margin-top: 4rem;
`,w=i.U.div.withConfig({displayName:"login__Card",componentId:"sc-ada9d95c-12"})`
  padding: 4rem;
  border-radius: 2.4rem;
  background: ${({theme:e})=>e.light.panel};
  h1 { font-size: 3.2rem; font-weight: 600; letter-spacing: -0.02em; }
  fieldset { border: 0; margin: 2.8rem 0 0; padding: 0; display: grid; gap: 1.6rem; }
  ${({theme:e})=>e.mobile} { padding: 2.4rem; }
`,v=i.U.p.withConfig({displayName:"login__Lead",componentId:"sc-ada9d95c-13"})`
  margin-top: 0.8rem;
  color: ${({theme:e})=>e.light.muted};
`,$=(0,i.U)(a.O).withConfig({displayName:"login__LightField",componentId:"sc-ada9d95c-14"})`${s}`,C=(0,i.U)(a.f).withConfig({displayName:"login__LightInput",componentId:"sc-ada9d95c-15"})`
  background: ${({theme:e})=>e.light.tile};
  border-color: transparent;
  ${s}
  &::placeholder { color: #a9adb3; }
  &:focus { background: #fff; }
`,k=i.U.div.withConfig({displayName:"login__Password",componentId:"sc-ada9d95c-16"})`
  position: relative;
  input { padding-right: 10rem; }
  button { position: absolute; right: 1.4rem; top: 50%; transform: translateY(-50%); }
`,U=(0,i.U)(a.K).withConfig({displayName:"login__Dark",componentId:"sc-ada9d95c-17"})`
  margin-top: 0.4rem;
  background: ${({theme:e})=>e.light.ink};
  &:hover:not(:disabled) { background: #2a2c30; }
`,I=i.U.p.withConfig({displayName:"login__Help",componentId:"sc-ada9d95c-18"})`
  margin-top: 2rem;
  font-size: 1.3rem;
  color: ${({theme:e})=>e.light.muted};
`,N=i.U.footer.withConfig({displayName:"login__Footer",componentId:"sc-ada9d95c-19"})`
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1.2rem;
  padding: 1.8rem 2.6rem;
  background: ${({theme:e})=>e.light.ink};
  color: #9a9ea6;
  font-size: 1.3rem;
`;e.s(["default",0,function(){let[e,i]=(0,n.useState)(!1),[d,s]=(0,n.useState)(null),[M,S]=(0,n.useState)(!1);async function P(e){e.preventDefault();let t=new FormData(e.currentTarget);i(!0),s(null);try{await (0,l.k)("/auth/login",{method:"POST",body:{username:t.get("username"),password:t.get("password")}}),window.location.assign("/")}catch(e){s("Неверный логин или пароль"===e.message?"Проверьте логин и пароль":e.message),i(!1)}}return(0,t.jsxs)(c,{children:[(0,t.jsx)(r.default,{children:(0,t.jsx)("title",{children:"Вход · Invoice Keeper"})}),(0,t.jsxs)(m,{children:[(0,t.jsxs)(u,{children:[(0,t.jsxs)(p,{children:[(0,t.jsx)(o.B,{dark:!0,size:32})," invoice keeper"]}),(0,t.jsx)(f,{href:"#login",children:"Войти"})]}),(0,t.jsxs)(h,{children:[(0,t.jsx)(g,{children:"invoice keeper"}),(0,t.jsx)(b,{children:"Платежи нового поколения"}),(0,t.jsxs)(a.K,{as:"a",href:"#login",children:["Попробовать ",(0,t.jsx)("span",{"aria-hidden":"true",children:"→"})]})]})]}),(0,t.jsxs)(x,{children:[(0,t.jsxs)(y,{children:[(0,t.jsxs)(j,{children:[(0,t.jsx)("b",{children:"3 дня"}),(0,t.jsx)("span",{children:"напоминание в Telegram до срока"})]}),(0,t.jsxs)(j,{children:[(0,t.jsx)("b",{children:"2 роли"}),(0,t.jsx)("span",{children:"администратор и команда"})]}),(0,t.jsxs)(j,{children:[(0,t.jsx)("b",{children:"3 валюты"}),(0,t.jsx)("span",{children:"RUB · USD · EUR, без конвертации"})]})]}),(0,t.jsx)(_,{id:"login",children:(0,t.jsxs)(w,{children:[(0,t.jsx)("h1",{children:"Вход в панель"}),(0,t.jsx)(v,{children:"Все регулярные платежи команды — в одном месте."}),(0,t.jsx)("form",{onSubmit:P,children:(0,t.jsxs)("fieldset",{disabled:e,children:[(0,t.jsxs)($,{children:["Логин",(0,t.jsx)(C,{name:"username",autoComplete:"username",required:!0,maxLength:64,placeholder:"Ваш логин",autoFocus:!0})]}),(0,t.jsxs)($,{children:["Пароль",(0,t.jsxs)(k,{children:[(0,t.jsx)(C,{name:"password",type:M?"text":"password",autoComplete:"current-password",required:!0,maxLength:128,placeholder:"Введите пароль"}),(0,t.jsx)(a.K,{type:"button",$variant:"ghost",onClick:()=>S(e=>!e),"aria-label":M?"Скрыть пароль":"Показать пароль",children:M?"скрыть":"показать"})]})]}),d&&(0,t.jsx)(a.m,{$tone:"error",role:"alert",children:d}),(0,t.jsx)(U,{type:"submit",children:e?"Входим…":"Войти"})]})}),(0,t.jsx)(I,{children:"Нет доступа? Попросите администратора создать для вас учётную запись."})]})})]}),(0,t.jsxs)(N,{children:[(0,t.jsxs)("span",{children:["© ",new Date().getFullYear()," Invoice Keeper"]}),(0,t.jsx)("span",{children:"Меньше рутины — больше спокойствия"})]})]})}])}],7466,(e,t,r)=>{let n="/login";(window.__NEXT_P=window.__NEXT_P||[]).push([n,()=>e.r(8976)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([n])})},1158,(e,t,r)=>{t.exports=e.r(9149)}]);