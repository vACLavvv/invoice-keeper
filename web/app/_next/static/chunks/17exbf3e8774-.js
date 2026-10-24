(()=>{"use strict";(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,9218,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814),i=e.i(6224),l=e.i(9835);let a=n.U.dialog.withConfig({displayName:"Modal__Dialog",componentId:"sc-e36fe5a1-0"})`
  width: min(${({$wide:e})=>e?"88rem":"52rem"}, calc(100vw - 3.2rem));
  max-height: calc(100dvh - 3.2rem);
  overflow-y: auto;
  padding: 2.8rem;
  border: 1px solid ${({theme:e})=>e.color.line};
  border-radius: ${({theme:e})=>e.radius.xl};
  background: ${({theme:e})=>e.color.surface};
  color: ${({theme:e})=>e.color.text};
  box-shadow: 0 2.4rem 6.4rem ${({theme:e})=>e.color.shadow};
  &::backdrop { background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(0.3rem); }
  h2 { font-size: 2.4rem; font-weight: 600; text-transform: lowercase; color: ${({theme:e})=>e.color.strong}; }
  ${({theme:e})=>e.mobile} { padding: 2rem; }
`,o=n.U.div.withConfig({displayName:"Modal__Header",componentId:"sc-e36fe5a1-1"})`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.6rem;
  margin-bottom: 2.4rem;
`,s=n.U.div.withConfig({displayName:"Modal__Eyebrow",componentId:"sc-e36fe5a1-2"})`
  font-size: 1.6rem;
  font-weight: 900;
  font-style: italic;
  text-transform: uppercase;
  color: ${({theme:e})=>e.color.ghost};
  margin-bottom: 0.2rem;
`,d=n.U.form.withConfig({displayName:"Modal__Form",componentId:"sc-e36fe5a1-3"})`
  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 1.8rem; }
`,c=n.U.div.withConfig({displayName:"Modal__FormRow",componentId:"sc-e36fe5a1-4"})`
  display: grid;
  grid-template-columns: 1fr 14rem;
  gap: 1.2rem;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; }
`,m=n.U.div.withConfig({displayName:"Modal__InfoBox",componentId:"sc-e36fe5a1-5"})`
  padding: 1.4rem 1.6rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.tile};
  color: ${({theme:e})=>e.color.muted};
  line-height: 1.6;
  b { color: ${({theme:e})=>e.color.strong}; font-weight: 500; }
  a { color: ${({theme:e})=>e.color.accent}; word-break: break-all; }
`;e.s(["i",0,c,"W",0,m,"n",0,function({title:e,eyebrow:n="INVOICE KEEPER",wide:d=!1,onClose:c,children:m}){let h=(0,r.useRef)(null);return(0,r.useEffect)(()=>{let e=h.current;return e&&!e.open&&e.showModal(),()=>e?.close()},[]),(0,t.jsxs)(a,{ref:h,$wide:d,"aria-labelledby":"modal-title",onCancel:e=>{e.preventDefault(),c()},onClick:e=>{e.target===h.current&&c()},children:[(0,t.jsxs)(o,{children:[(0,t.jsxs)("div",{children:[(0,t.jsx)(s,{children:n}),(0,t.jsx)("h2",{id:"modal-title",children:e})]}),(0,t.jsx)(l._,{type:"button","aria-label":(0,i.t)("Закрыть"),onClick:c,children:"×"})]}),m]})},"Q",0,function({onSubmit:e,actions:n,children:i}){let[a,o]=(0,r.useState)(!1),[s,c]=(0,r.useState)(null);async function m(t){t.preventDefault();let r=t.nativeEvent.submitter;o(!0),c(null);try{await e(new FormData(t.currentTarget),r)}catch(e){c(e.message),o(!1)}}return(0,t.jsx)(d,{onSubmit:m,children:(0,t.jsxs)("fieldset",{disabled:a,children:[i,s&&(0,t.jsx)(l.m,{$tone:"error",role:"alert",children:s}),(0,t.jsx)(l.z,{$gap:1,$wrap:!0,$between:!0,children:n})]})})}])},3201,3464,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814),i=e.i(7289),l=e.i(4545),a=e.i(6224),o=e.i(4787),s=e.i(3133),d=e.i(9218),c=e.i(9835);let m=["BTC","ETH","TRON"],h=e=>e.length>14?`${e.slice(0,6)}…${e.slice(-4)}`:e;function u({wallet:e}){return e?.sanctioned?(0,t.jsxs)(f,{role:"alert",children:[(0,t.jsx)("b",{children:(0,a.t)("Кошелёк получателя в санкционном списке OFAC")}),(0,a.t)("Совпадение: {name}. Не оплачивайте, пока не разберётесь: кнопки «Оплатить» в напоминаниях для этого платежа нет.",{name:e.match_name??"—"})]}):null}function p({wallet:e,required:r=!1}){return(0,t.jsxs)(x,{children:[(0,t.jsxs)(c.O,{children:[(0,a.t)("Сеть кошелька"),(0,t.jsxs)(c.d,{name:"wallet_network",defaultValue:e?.network??(r?"TRON":""),required:r,children:[!r&&(0,t.jsx)("option",{value:"",children:(0,a.t)("Без кошелька")}),m.map(e=>(0,t.jsx)("option",{value:e,title:{BTC:(0,a.t)("Bitcoin: адреса 1…, 3… и bc1…"),ETH:(0,a.t)("Ethereum и совместимые сети, в том числе USDT и USDC (ERC-20): 0x…"),TRON:(0,a.t)("TRON, в том числе USDT (TRC-20): T…")}[e],children:e},e))]})]}),(0,t.jsxs)(c.O,{children:[(0,a.t)("Криптокошелёк получателя"),(0,t.jsx)(c.f,{name:"wallet_address",defaultValue:e?.address??"",maxLength:100,spellCheck:!1,autoComplete:"off",placeholder:(0,a.t)("Адрес для оплаты в криптовалюте"),required:r}),(0,t.jsx)("small",{children:(0,a.t)("Сверяется со списком санкций OFAC при каждом показе и в напоминаниях")})]})]})}function g(e){return{wallet_network:String(e.get("wallet_network")??"").trim()||null,wallet_address:String(e.get("wallet_address")??"").trim()||null}}let x=n.U.div.withConfig({displayName:"Wallet__WalletRow",componentId:"sc-a4460a4b-0"})`
  display: grid;
  grid-template-columns: 12rem 1fr;
  align-items: start;
  gap: 1.2rem;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; }
`,f=n.U.div.withConfig({displayName:"Wallet__Warning",componentId:"sc-a4460a4b-1"})`
  display: grid;
  gap: 0.4rem;
  padding: 1.2rem 1.4rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.overdueSoft};
  color: ${({theme:e})=>e.color.text};
  line-height: 1.5;
  b { color: ${({theme:e})=>e.color.overdue}; font-weight: 600; }
`;function j(){let{isAdmin:e}=(0,o.U)();return{users:(0,o.Z)(()=>e?(0,i.k)("/users"):Promise.resolve([]),[e]).data??[],categories:[...new Set(((0,o.Z)(()=>(0,i.k)("/recurring-payments"),[]).data??[]).map(e=>e.category).filter(Boolean))].sort()}}function y({value:e,categories:r}){return(0,t.jsxs)(c.O,{children:[(0,a.t)("Категория"),(0,t.jsx)(c.f,{name:"category",defaultValue:e??"",maxLength:40,list:"ik-categories",placeholder:(0,a.t)("Например, IT или Аренда")}),(0,t.jsx)("datalist",{id:"ik-categories",children:r.map(e=>(0,t.jsx)("option",{value:e},e))})]})}function b({value:e,users:r}){return(0,t.jsxs)(c.O,{children:[(0,a.t)("Ответственный"),(0,t.jsxs)(c.d,{name:"assignee_id",defaultValue:e?String(e):"",children:[(0,t.jsx)("option",{value:"",children:(0,a.t)("Не назначен")}),r.map(e=>(0,t.jsxs)("option",{value:e.id,children:[e.display_name," · @",e.username]},e.id))]}),(0,t.jsx)("small",{children:(0,a.t)("Личные напоминания по платежу уходят ответственному, если он привязал Telegram")})]})}function w({payment:e}){return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)(c.O,{children:[(0,a.t)("Ссылка на оплату"),(0,t.jsx)(c.f,{name:"payment_url",type:"url",defaultValue:e?.payment_url??"",maxLength:500,placeholder:"https://"}),(0,t.jsx)("small",{children:(0,a.t)("Кабинет или счёт: в напоминаниях появится кнопка «💳 Оплатить»")})]}),(0,t.jsxs)(c.O,{children:[(0,a.t)("Реквизиты"),(0,t.jsx)(c.f,{name:"payment_details",defaultValue:e?.payment_details??"",maxLength:500,placeholder:(0,a.t)("Например, ИНН, номер договора или счёта")})]})]})}function _({label:e,value:r,options:n,onChange:i}){return(0,t.jsxs)(c.O,{as:"div",children:[e,(0,t.jsx)(U,{role:"radiogroup","aria-label":e,children:n.map(([e,n,l])=>(0,t.jsxs)(N,{type:"button",role:"radio","aria-checked":r===e,$selected:r===e,onClick:()=>i(e),children:[(0,t.jsx)("b",{children:n}),(0,t.jsx)("small",{children:l})]},e))})]})}function $({method:e,onChange:r}){return(0,t.jsx)(_,{label:(0,a.t)("Как платим"),value:e,onChange:r,options:[["fiat",(0,a.t)("💳 Банк или карта"),(0,a.t)("Ссылка на счёт и реквизиты")],["crypto",(0,a.t)("₿ Криптовалюта"),(0,a.t)("Кошелёк получателя, проверка по санкциям OFAC")]]})}function v({value:e}){return(0,t.jsxs)(c.O,{children:[(0,a.t)("За что платим")," ",(0,t.jsx)(c.k,{children:(0,a.t)("необязательно")}),(0,t.jsx)(c.o,{name:"description",defaultValue:e??"",maxLength:500,rows:2,placeholder:(0,a.t)("Например: за принятую разработку новой функции")})]})}function k({method:e,payment:r}){return"fiat"===e?(0,t.jsx)(w,{payment:r}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(p,{wallet:r?.wallet,required:!0}),(0,t.jsx)(u,{wallet:r?.wallet??null})]})}function C(e,t){return"crypto"===e?{payment_url:null,payment_details:null,...g(t)}:{payment_url:S(t.get("payment_url")),payment_details:S(t.get("payment_details")),wallet_network:null,wallet_address:null}}e.s(["B",0,u,"N",0,function({wallet:e,compact:r=!1}){return null===e.sanctioned?(0,t.jsx)(c.a,{$status:"archived",title:(0,a.t)("Список OFAC ещё не загружен"),children:(0,a.t)("не проверен")}):e.sanctioned?(0,t.jsx)(c.a,{$status:"overdue",title:e.match_name??void 0,children:r?(0,a.t)("⛔ санкции OFAC"):(0,a.t)("⛔ санкционный список OFAC")}):(0,t.jsx)(c.a,{$status:"paid",children:r?(0,a.t)("OFAC: чисто"):(0,a.t)("нет в списке OFAC")})},"u",0,p,"l",0,h,"H",0,g,"O",0,m],3464);let S=e=>{let t=String(e??"").trim();return""===t?null:t},U=n.U.div.withConfig({displayName:"PaymentModals__Segmented",componentId:"sc-39320e7b-0"})`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; }
`,N=n.U.button.withConfig({displayName:"PaymentModals__Segment",componentId:"sc-39320e7b-1"})`
  display: grid;
  gap: 0.2rem;
  padding: 1.2rem 1.4rem;
  text-align: left;
  border-radius: ${({theme:e})=>e.radius.md};
  border: 1px solid ${({theme:e})=>e.color.line};
  background: ${({theme:e})=>e.color.tile};
  color: ${({theme:e})=>e.color.muted};
  b { color: ${({theme:e})=>e.color.text}; font-weight: 500; }
  small { font-size: 1.3rem; }
  &:hover { border-color: ${({theme:e})=>e.color.faint}; }
  ${({$selected:e,theme:t})=>e&&n.m`
    border-color: ${t.color.accent};
    background: ${t.color.accentSoft};
    b { color: ${t.color.strong}; }
  `}
`,M=n.U.div.withConfig({displayName:"PaymentModals__Group",componentId:"sc-39320e7b-2"})`
  margin-top: 0.4rem;
  padding-top: 1.4rem;
  border-top: 1px solid ${({theme:e})=>e.color.line};
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.3rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`,I=n.U.div.withConfig({displayName:"PaymentModals__List",componentId:"sc-39320e7b-3"})`
  display: grid;
  gap: 0.6rem;
  margin: 1.6rem 0;
`,O=n.U.div.withConfig({displayName:"PaymentModals__Item",componentId:"sc-39320e7b-4"})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.tile};
  a { color: ${({theme:e})=>e.color.accent}; word-break: break-all; }
  small { display: block; color: ${({theme:e})=>e.color.muted}; }
`,F=n.U.form.withConfig({displayName:"PaymentModals__AddForm",componentId:"sc-39320e7b-5"})`
  display: flex;
  gap: 0.8rem;
  margin-bottom: 1.2rem;
`,T=(0,n.U)(c.a).withConfig({displayName:"PaymentModals__Check",componentId:"sc-39320e7b-6"})`
  white-space: normal;
  align-items: flex-start;
  &::before { margin-top: 0.5rem; }
`,D=n.U.div.withConfig({displayName:"PaymentModals__Preview",componentId:"sc-39320e7b-7"})`
  max-height: 36rem;
  overflow: auto;
  margin: 1.2rem 0;
  table { min-width: 72rem; }
`;e.s(["O",0,function({payment:e,onClose:r}){let{refresh:n}=(0,o.U)(),l=(0,s.d)();return(0,t.jsx)(d.n,{title:(0,a.t)("Прекратить повторение?"),onClose:r,children:(0,t.jsx)(d.Q,{onSubmit:async()=>{await (0,i.k)(`/recurring-payments/${e.id}`,{method:"DELETE"}),r(),n(),l((0,a.t)("Платёж перенесён в архив. История сохранена."))},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:r,children:(0,a.t)("Оставить")}),(0,t.jsx)(c.K,{type:"submit",$variant:"danger",children:(0,a.t)("Прекратить платёж")})]}),children:(0,t.jsxs)(d.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,a.t)("Новые периоды и напоминания создаваться не будут. Уже созданные периоды, даты и история оплат сохранятся в архиве.")]})})})},"n",0,function({onClose:e,kind:n="regular"}){let{settings:m,setMonth:h,refresh:u}=(0,o.U)(),p=(0,s.d)(),{users:g,categories:x}=j(),[f,w]=(0,r.useState)("fiat"),[U,N]=(0,r.useState)(n);return(0,t.jsx)(d.n,{title:(0,a.t)("Новый платёж"),onClose:e,children:(0,t.jsxs)(d.Q,{onSubmit:async t=>{let r=S(t.get("assignee_id")),n=await (0,i.k)("/recurring-payments",{method:"POST",body:{title:t.get("title"),amount:t.get("amount"),currency:t.get("currency"),first_due_date:t.get("first_due_date"),frequency:"once"===U?"once":t.get("frequency"),description:S(t.get("description")),category:S(t.get("category")),assignee_id:r?Number(r):null,...C(f,t)}});e(),h(n.first_due_date.slice(0,7)),u(),n.wallet?.sanctioned?p((0,a.t)("Платёж добавлен, но кошелёк получателя в санкционном списке OFAC"),!0):p("once"===U?(0,a.t)("Разовый платёж добавлен"):(0,a.t)("Регулярный платёж добавлен"))},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:e,children:(0,a.t)("Отмена")}),(0,t.jsx)(c.K,{type:"submit",children:(0,a.t)("Добавить платёж")})]}),children:[(0,t.jsx)(_,{label:(0,a.t)("Как часто"),value:U,onChange:N,options:[["once",(0,a.t)("Один раз"),(0,a.t)("За работу, услугу или покупку")],["regular",(0,a.t)("Регулярно"),(0,a.t)("Аренда, подписки, серверы")]]}),(0,t.jsxs)(c.O,{children:[(0,a.t)("Название платежа"),(0,t.jsx)(c.f,{name:"title",maxLength:120,required:!0,autoFocus:!0,placeholder:"once"===U?(0,a.t)("Например, макеты страницы продукта"):(0,a.t)("Например, аренда офиса")})]}),"once"===U&&(0,t.jsx)(v,{}),(0,t.jsx)($,{method:f,onChange:w}),(0,t.jsxs)(d.i,{children:[(0,t.jsxs)(c.O,{children:[(0,a.t)("Сумма"),(0,t.jsx)(c.f,{name:"amount",type:"number",step:"0.01",min:"0.01",max:"9999999999.99",required:!0,placeholder:"0,00",inputMode:"decimal"})]}),(0,t.jsxs)(c.O,{children:["crypto"===f?(0,a.t)("Учитывать в"):(0,a.t)("Валюта"),(0,t.jsx)(c.d,{name:"currency",defaultValue:"crypto"===f?"USD":"RUB",children:l.E.map(e=>(0,t.jsx)("option",{children:e},e))},f)]})]}),"crypto"===f&&(0,t.jsx)(c.k,{children:(0,a.t)("Итоги и бюджет считаются в RUB, USD или EUR: стейблкоины USDT и USDC обычно учитывают как USD.")}),"once"===U?(0,t.jsxs)(c.O,{children:[(0,a.t)("Срок оплаты"),(0,t.jsx)(c.f,{name:"first_due_date",type:"date",min:"2000-01-01",max:"2100-12-31",defaultValue:m.today,required:!0})]}):(0,t.jsxs)(d.i,{children:[(0,t.jsxs)(c.O,{children:[(0,a.t)("Первая дата оплаты"),(0,t.jsx)(c.f,{name:"first_due_date",type:"date",min:"2000-01-01",max:"2100-12-31",defaultValue:m.today,required:!0})]}),(0,t.jsxs)(c.O,{children:[(0,a.t)("Повтор"),(0,t.jsx)(c.d,{name:"frequency",defaultValue:"monthly",children:l.S.map(e=>(0,t.jsx)("option",{value:e,children:(0,l.l)(e)},e))})]})]}),(0,t.jsx)(k,{method:f}),(0,t.jsx)(M,{children:(0,a.t)("дополнительно")}),(0,t.jsx)(y,{categories:x}),g.length>0&&(0,t.jsx)(b,{users:g}),(0,t.jsxs)(d.W,{children:["once"===U?(0,a.t)("Разовый платёж — одна запись с одним сроком, в следующем месяце он не повторится. Напоминание придёт за 3 дня, оплата, чеки и журнал — как у обычного периода."):(0,a.t)("Каждый период — своя отметка оплаты. Если в месяце нет нужного числа, срок — последний день месяца. Если до срока меньше 3 дней, напоминание уйдёт сразу."),(0,t.jsx)("br",{}),(0,t.jsx)(c.k,{children:(0,a.t)("Часовой пояс: {tz}",{tz:m.timezone})})]})]})})},"t",0,function({payment:e,onClose:n}){let{refresh:l}=(0,o.U)(),m=(0,s.d)(),{users:h,categories:u}=j(),[p,g]=(0,r.useState)(e.wallet?"crypto":"fiat");return(0,t.jsx)(d.n,{title:(0,a.t)("Изменить платёж"),onClose:n,children:(0,t.jsxs)(d.Q,{onSubmit:async t=>{let r=S(t.get("assignee_id")),o=await (0,i.k)(`/recurring-payments/${e.id}`,{method:"PATCH",body:{title:t.get("title"),amount:t.get("amount"),category:S(t.get("category")),assignee_id:r?Number(r):null,description:S(t.get("description")),...C(p,t)}});n(),l(),o.wallet?.sanctioned?m((0,a.t)("Сохранено, но кошелёк получателя в санкционном списке OFAC"),!0):m((0,a.t)("Платёж изменён"))},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:n,children:(0,a.t)("Отмена")}),(0,t.jsx)(c.K,{type:"submit",children:(0,a.t)("Сохранить")})]}),children:[(0,t.jsxs)(c.O,{children:[(0,a.t)("Название платежа"),(0,t.jsx)(c.f,{name:"title",defaultValue:e.title,maxLength:120,required:!0,autoFocus:!0})]}),(0,t.jsxs)(c.O,{children:[(0,a.t)("Сумма, {currency}",{currency:e.currency}),(0,t.jsx)(c.f,{name:"amount",type:"number",step:"0.01",min:"0.01",defaultValue:e.amount,required:!0}),(0,t.jsx)("small",{children:"once"===e.frequency?(0,a.t)("Если срок ещё не наступил, новая сумма применится к платежу."):(0,a.t)("Новая сумма применится к неоплаченным периодам с сегодняшнего дня; оплаченные останутся как были.")})]}),(0,t.jsx)(v,{value:e.description}),(0,t.jsx)($,{method:p,onChange:g}),(0,t.jsx)(k,{method:p,payment:e}),"fiat"===p&&e.wallet&&(0,t.jsx)(c.k,{children:(0,a.t)("При сохранении кошелёк будет удалён.")}),"crypto"===p&&(e.payment_url||e.payment_details)&&(0,t.jsx)(c.k,{children:(0,a.t)("При сохранении ссылка на оплату и реквизиты будут удалены.")}),(0,t.jsx)(M,{children:(0,a.t)("дополнительно")}),(0,t.jsx)(y,{value:e.category,categories:u}),(0,t.jsx)(b,{value:e.assignee?.id,users:h})]})})},"l",0,function({onClose:e}){let{refresh:n}=(0,o.U)(),m=(0,s.d)(),[h,u]=(0,r.useState)(null),[p,g]=(0,r.useState)(null),[x,f]=(0,r.useState)(!1),[j,y]=(0,r.useState)(null);async function b(t,r=h){if(!r)return;let l=new FormData;l.append("file",r),f(!0),y(null);try{let r=await (0,i.k)(`/recurring-payments/import?dry_run=${t}`,{method:"POST",body:l});t?g(r):(e(),n(),m((0,a.t)("Импортировано платежей: {n}",{n:r.created})))}catch(e){y(e.message)}finally{f(!1)}}return(0,t.jsxs)(d.n,{title:(0,a.t)("Импорт из CSV"),wide:!0,onClose:e,children:[(0,t.jsxs)(d.W,{children:[(0,a.t)("Столбцы: название, сумма, валюта, первая оплата, периодичность (в том числе «разово»), категория. Разделитель «;», «,» или табуляция; UTF-8 или Windows-1251; даты ДД.ММ.ГГГГ.")," ",(0,t.jsx)("a",{href:"/api/v1/recurring-payments/import/template",children:(0,a.t)("Скачать шаблон ↓")})]}),(0,t.jsx)(c.z,{$gap:1,$wrap:!0,children:(0,t.jsx)(c.f,{type:"file",accept:".csv,text/csv",onChange:e=>{let t=e.target.files?.[0]??null;u(t),g(null),t&&b(!0,t)}})}),p&&(0===p.rows.length?(0,t.jsx)(c.e,{children:(0,a.t)("В файле нет строк с данными")}):(0,t.jsx)(D,{children:(0,t.jsx)(c.F,{children:(0,t.jsxs)("table",{children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{children:[(0,t.jsx)("th",{children:"#"}),(0,t.jsx)("th",{children:(0,a.t)("Название")}),(0,t.jsx)("th",{children:(0,a.t)("Сумма")}),(0,t.jsx)("th",{children:(0,a.t)("Первая оплата")}),(0,t.jsx)("th",{children:(0,a.t)("Повтор")}),(0,t.jsx)("th",{children:(0,a.t)("Проверка")})]})}),(0,t.jsx)("tbody",{children:p.rows.map(e=>(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{children:(0,t.jsx)(c.k,{children:e.line})}),(0,t.jsxs)("td",{children:[e.title,e.category&&(0,t.jsxs)(c.k,{children:[" · ",e.category]})]}),(0,t.jsxs)("td",{children:[e.amount," ",e.currency]}),(0,t.jsx)("td",{children:e.first_due_date}),(0,t.jsx)("td",{children:e.frequency&&(0,l.l)(e.frequency)}),(0,t.jsx)("td",{children:e.errors.length>0?(0,t.jsx)(T,{$status:"overdue",children:e.errors.join("; ")}):e.warnings.length>0?(0,t.jsx)(T,{$status:"unpaid",children:e.warnings.join("; ")}):(0,t.jsx)(T,{$status:"paid",children:(0,a.t)("ок")})})]},e.line))})]})})})),j&&(0,t.jsx)(c.m,{$tone:"error",role:"alert",children:j}),(0,t.jsxs)(c.z,{$between:!0,$wrap:!0,children:[(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:e,children:(0,a.t)("Отмена")}),(0,t.jsx)(c.K,{type:"button",disabled:x||!p||p.errors>0||0===p.rows.length,onClick:()=>b(!1),children:p&&p.errors>0?(0,a.t)("Исправьте ошибки: {n}",{n:p.errors}):(0,a.t)("Импортировать")})]})]})},"_",0,function({payment:e,onClose:r}){let{settings:n,refresh:m}=(0,o.U)(),h=(0,s.d)();return(0,t.jsx)(d.n,{title:(0,a.t)("Пауза платежа"),onClose:r,children:(0,t.jsxs)(d.Q,{onSubmit:async t=>{let n=S(t.get("until"));await (0,i.k)(`/recurring-payments/${e.id}/pause`,{method:"POST",body:n?{until:n}:{}}),r(),m(),h(n?(0,a.t)("На паузе до {date}",{date:(0,l.H)(n)}):(0,a.t)("На паузе до возобновления"))},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:r,children:(0,a.t)("Отмена")}),(0,t.jsx)(c.K,{type:"submit",children:(0,a.t)("Поставить на паузу")})]}),children:[(0,t.jsxs)(d.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,a.t)("С сегодняшнего дня новых периодов и напоминаний не будет. Пропущенные месяцы потом не станут просрочкой, история оплат сохранится.")]}),(0,t.jsxs)(c.O,{children:[(0,a.t)("До какого дня (включительно)"),(0,t.jsx)(c.f,{name:"until",type:"date",min:n.today,max:"2100-12-31"}),(0,t.jsx)("small",{children:(0,a.t)("Оставьте пустым, чтобы пауза длилась до возобновления")})]})]})})},"p",0,function({occurrence:e,onClose:r}){let{settings:n,refresh:m}=(0,o.U)(),p=(0,s.d)(),g=!("id"in e),x=!g&&null!==e.paid_at;return(0,t.jsx)(d.n,{title:g?(0,a.t)("Оплатить заранее"):x?(0,a.t)("Изменить оплату"):(0,a.t)("Отметить оплату"),onClose:r,children:(0,t.jsxs)(d.Q,{onSubmit:async(t,n)=>{let l=n?.value==="undo";g?await (0,i.k)(`/recurring-payments/${e.recurring_payment_id}/periods`,{method:"POST",body:{due_date:e.due_date,paid_at:t.get("paid_at")}}):await (0,i.k)(`/payment-occurrences/${e.id}`,{method:"PATCH",body:l?{paid:!1}:{paid:!0,paid_at:t.get("paid_at")}}),r(),m(),p(l?(0,a.t)("Оплата отменена. Дата очищена."):g?(0,a.t)("Оплачено заранее"):(0,a.t)("Оплата сохранена"))},actions:(0,t.jsxs)(t.Fragment,{children:[x?(0,t.jsx)(c.K,{type:"submit",name:"action",value:"undo",formNoValidate:!0,$variant:"secondary",children:(0,a.t)("Отменить оплату")}):(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:r,children:(0,a.t)("Назад")}),(0,t.jsx)(c.K,{type:"submit",name:"action",value:"save",children:x?(0,a.t)("Сохранить дату"):(0,a.t)("Подтвердить оплату")})]}),children:[(0,t.jsxs)(d.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,l.e)(e.amount,e.currency)," · ",(0,a.t)("срок {date}",{date:(0,l.H)(e.due_date)}),(0,t.jsx)("br",{}),e.description&&(0,t.jsxs)(t.Fragment,{children:[e.description,(0,t.jsx)("br",{})]}),e.payment_details&&(0,t.jsxs)(t.Fragment,{children:[(0,a.t)("Реквизиты: {details}",{details:e.payment_details}),(0,t.jsx)("br",{})]}),e.wallet&&(0,t.jsxs)(t.Fragment,{children:[(0,a.t)("Кошелёк ({network}): {address}",{network:e.wallet.network,address:h(e.wallet.address)}),(0,t.jsx)("br",{})]}),e.payment_url&&!e.wallet?.sanctioned&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("a",{href:e.payment_url,target:"_blank",rel:"noopener noreferrer",children:(0,a.t)("Открыть ссылку на оплату ↗")}),(0,t.jsx)("br",{})]}),g?(0,a.t)("Период появится в календаре уже оплаченным, напоминания по нему не будет."):(0,a.t)("Изменение затронет только этот период.")]}),(0,t.jsx)(u,{wallet:e.wallet}),(0,t.jsxs)(c.O,{children:[(0,a.t)("Фактическая дата оплаты"),(0,t.jsx)(c.f,{name:"paid_at",type:"date",defaultValue:!g&&e.paid_at||n.today,max:n.today,required:!0}),(0,t.jsx)("small",{children:(0,a.t)("Оплата в день срока — вовремя. Исправление даты пересчитает просрочку, срок не изменится.")})]})]})})},"j",0,function({occurrence:e,onClose:n}){let{user:m,isAdmin:h,refresh:u}=(0,o.U)(),p=(0,s.d)(),[g,x]=(0,r.useState)(0),[f,j]=(0,r.useState)(!1),[y,b]=(0,r.useState)(null),w=(0,r.useRef)(null),{data:_}=(0,o.Z)(()=>(0,i.k)(`/payment-occurrences/${e.id}/receipts`),[g]);async function $(e,t){j(!0),b(null);try{await e(),x(e=>e+1),u(),p(t)}catch(e){b(e.message)}finally{j(!1)}}return(0,t.jsxs)(d.n,{title:(0,a.t)("Чеки и ссылки"),onClose:n,children:[(0,t.jsxs)(d.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,l.e)(e.amount,e.currency)," · ",(0,a.t)("срок {date}",{date:(0,l.H)(e.due_date)})]}),(0,t.jsx)(I,{children:_?0===_.length?(0,t.jsx)(c.k,{children:(0,a.t)("Пока ничего не прикреплено")}):_.map(e=>{var r;return(0,t.jsxs)(O,{children:[(0,t.jsxs)("span",{children:["link"===e.kind?(0,t.jsx)("a",{href:e.url??"#",target:"_blank",rel:"noopener noreferrer",children:e.url}):(0,t.jsx)("a",{href:e.download_url??"#",children:e.file_name}),(0,t.jsxs)("small",{children:["file"===e.kind?`${!(r=e.size)?"":r>1048576?`${(r/1048576).toFixed(1)} MB`:`${Math.ceil(r/1024)} KB`} \xb7 `:"","@",e.created_by," · ",(0,l.c)(e.created_at)]})]}),(h||e.created_by===m.username)&&(0,t.jsx)(c.K,{type:"button",$small:!0,$variant:"ghost",disabled:f,onClick:()=>$(()=>(0,i.k)(`/receipts/${e.id}`,{method:"DELETE"}),(0,a.t)("Чек удалён")),children:(0,a.t)("удалить")})]},e.id)}):(0,t.jsx)(c.k,{children:(0,a.t)("Загружаем…")})}),(0,t.jsxs)(F,{onSubmit:t=>{t.preventDefault();let r=t.currentTarget,n=String(new FormData(r).get("url")??"").trim();n&&$(()=>(0,i.k)(`/payment-occurrences/${e.id}/receipts`,{method:"POST",body:{url:n}}).then(()=>r.reset()),(0,a.t)("Ссылка прикреплена"))},children:[(0,t.jsx)(c.f,{name:"url",type:"url",placeholder:(0,a.t)("Ссылка на чек или счёт"),maxLength:500}),(0,t.jsx)(c.K,{type:"submit",$variant:"secondary",disabled:f,children:(0,a.t)("Добавить")})]}),(0,t.jsxs)(c.z,{$between:!0,$wrap:!0,children:[(0,t.jsx)(c.k,{children:(0,a.t)("Файл: PDF, PNG, JPEG или WebP до 5 МБ")}),(0,t.jsx)(c.K,{type:"button",disabled:f,onClick:()=>w.current?.click(),children:(0,a.t)("Загрузить файл")}),(0,t.jsx)("input",{ref:w,type:"file",accept:"application/pdf,image/png,image/jpeg,image/webp",hidden:!0,onChange:t=>{let r=t.target.files?.[0];if(t.target.value="",!r)return;let n=new FormData;n.append("file",r),$(()=>(0,i.k)(`/payment-occurrences/${e.id}/receipts`,{method:"POST",body:n}),(0,a.t)("Файл прикреплён"))}})]}),y&&(0,t.jsx)(c.m,{$tone:"error",role:"alert",children:y})]})}],3201)},9877,e=>{var t=e.i(1398),r=e.i(8678),n=e.i(1158),i=e.i(3828),l=e.i(1788),a=e.i(814),o=e.i(7289),s=e.i(4545),d=e.i(6224),c=e.i(813),m=e.i(4787),h=e.i(3133),u=e.i(8524),p=e.i(3201),g=e.i(9835);function x({compact:e=!1}){let{mode:r,setMode:n,language:i,setLanguage:l}=(0,c.T)(),a=[["system","◐",(0,d.t)("Как в системе")],["light","☀",(0,d.t)("Светлая тема")],["dark","☾",(0,d.t)("Тёмная тема")]];return(0,t.jsxs)(f,{$compact:e,children:[!e&&(0,t.jsx)(j,{role:"group","aria-label":(0,d.t)("Тема"),children:a.map(([e,i,l])=>(0,t.jsx)(y,{type:"button",$on:r===e,"aria-pressed":r===e,title:l,"aria-label":l,onClick:()=>n(e),children:i},e))}),(0,t.jsx)(j,{role:"group","aria-label":(0,d.t)("Язык"),children:["ru","en"].map(e=>(0,t.jsx)(y,{type:"button",$on:i===e,"aria-pressed":i===e,onClick:()=>l(e),children:e.toUpperCase()},e))})]})}let f=a.U.div.withConfig({displayName:"Shell__SwitchRow",componentId:"sc-6e65fbbd-0"})`
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  margin: 0 0 1.2rem;
  ${({$compact:e})=>e&&a.m`margin: 0; justify-content: flex-end;`}
`,j=a.U.div.withConfig({displayName:"Shell__Segment",componentId:"sc-6e65fbbd-1"})`
  display: inline-flex;
  padding: 0.3rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.surface};
  border: 1px solid ${({theme:e})=>e.color.line};
`,y=a.U.button.withConfig({displayName:"Shell__SegmentButton",componentId:"sc-6e65fbbd-2"})`
  min-width: 3.2rem;
  height: 2.8rem;
  padding: 0 0.8rem;
  border-radius: ${({theme:e})=>e.radius.sm};
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.3rem;
  font-weight: 600;
  &:hover { color: ${({theme:e})=>e.color.strong}; }
  ${({$on:e,theme:t})=>e&&a.m`background: ${t.color.tile}; color: ${t.color.strong};`}
`;function b({dark:e=!1,size:r=36}){let[n,i]=e?["#111214","#fff"]:["#fff","#111214"];return(0,t.jsxs)("svg",{width:r,height:r,viewBox:"0 0 48 48","aria-hidden":"true",children:[(0,t.jsx)("rect",{width:"48",height:"48",rx:"11",fill:n}),(0,t.jsx)("path",{d:"M15 12h18v25l-4-3-5 3-5-3-4 3V12Z",fill:i}),(0,t.jsx)("path",{d:"m20 23 3 3 6-7",fill:"none",stroke:n,strokeWidth:"2.6",strokeLinecap:"round",strokeLinejoin:"round"})]})}let w=a.U.div.withConfig({displayName:"Shell__Layout",componentId:"sc-6e65fbbd-3"})`
  min-height: 100vh;
  display: grid;
  grid-template-columns: ${"23.6rem"} minmax(0, 1fr);
  ${({theme:e})=>e.mobile} { grid-template-columns: minmax(0, 1fr); }
`,_=a.U.aside.withConfig({displayName:"Shell__Sidebar",componentId:"sc-6e65fbbd-4"})`
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
`,$=a.U.div.withConfig({displayName:"Shell__Account",componentId:"sc-6e65fbbd-5"})`
  border: 1px solid ${({theme:e})=>e.color.line};
  border-radius: ${({theme:e})=>e.radius.lg};
`,v=a.U.div.withConfig({displayName:"Shell__AccountRow",componentId:"sc-6e65fbbd-6"})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  color: ${({theme:e})=>e.color.strong};
  & + & { border-top: 1px solid ${({theme:e})=>e.color.line}; }
  > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1.6rem; }
`,k=(0,a.U)(n.default).withConfig({displayName:"Shell__Bell",componentId:"sc-6e65fbbd-7"})`
  position: relative;
  display: inline-grid;
  color: ${({theme:e})=>e.color.strong};
`,C=a.U.span.withConfig({displayName:"Shell__BellBadge",componentId:"sc-6e65fbbd-8"})`
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
`,S=a.U.span.withConfig({displayName:"Shell__Count",componentId:"sc-6e65fbbd-9"})`
  display: inline-block;
  margin-left: 0.8rem;
  padding: 0 0.6rem;
  border-radius: 0.4rem;
  background: ${({theme:e})=>e.color.accent};
  color: #fff;
  font-size: 1.1rem;
  font-weight: 700;
  transform: rotate(-6deg);
`,U=a.U.span.withConfig({displayName:"Shell__Today",componentId:"sc-6e65fbbd-10"})`
  font-size: 2.4rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap;
`,N=a.U.nav.withConfig({displayName:"Shell__Nav",componentId:"sc-6e65fbbd-11"})`
  display: grid;
  gap: 0.2rem;
  ${({theme:e})=>e.mobile} { display: flex; overflow-x: auto; padding-bottom: 0.4rem; }
`,M=a.m`
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
`,I=(0,a.U)(n.default).withConfig({displayName:"Shell__NavItem",componentId:"sc-6e65fbbd-12"})`${M}`,O=a.U.button.withConfig({displayName:"Shell__NavButton",componentId:"sc-6e65fbbd-13"})`${M}`,F=a.U.div.withConfig({displayName:"Shell__Bottom",componentId:"sc-6e65fbbd-14"})`
  margin-top: auto;
  display: grid;
  gap: 0.2rem;
  ${({theme:e})=>e.mobile} { display: flex; overflow-x: auto; margin-top: 0; > * { margin: 0; } }
`,T=a.U.button.withConfig({displayName:"Shell__AddButton",componentId:"sc-6e65fbbd-15"})`
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
`,D=a.U.span.withConfig({displayName:"Shell__Plus",componentId:"sc-6e65fbbd-16"})`
  color: ${({theme:e})=>e.color.accent};
  font-size: 2.2rem;
  line-height: 1;
`,P=(0,a.U)(n.default).withConfig({displayName:"Shell__LogoLink",componentId:"sc-6e65fbbd-17"})`
  margin: 2rem 0 0 1rem;
  justify-self: start;
  ${({theme:e})=>e.mobile} { display: none; }
`,V=a.U.main.withConfig({displayName:"Shell__Surface",componentId:"sc-6e65fbbd-18"})`
  min-width: 0;
  margin: 4.8rem 1.2rem 1.2rem 0;
  padding: 6.4rem 4.8rem 4.8rem;
  border-radius: ${({theme:e})=>e.radius.xl};
  background: ${({theme:e})=>e.color.surface};
  ${({theme:e})=>e.mobile} { margin: 1.6rem 0 0; padding: 3.2rem 1.6rem; border-radius: ${({theme:e})=>e.radius.xl} ${({theme:e})=>e.radius.xl} 0 0; }
`,z=a.U.header.withConfig({displayName:"Shell__Header",componentId:"sc-6e65fbbd-19"})`
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
`,B=a.U.div.withConfig({displayName:"Shell__Ghost",componentId:"sc-6e65fbbd-20"})`
  font-size: 5.6rem;
  line-height: 0.9;
  font-weight: 900;
  font-style: italic;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  color: ${({theme:e})=>e.color.ghost};
  user-select: none;
  ${({theme:e})=>e.mobile} { font-size: 4rem; }
`,R=a.U.p.withConfig({displayName:"Shell__Subtitle",componentId:"sc-6e65fbbd-21"})`
  margin-top: 0.6rem;
  color: ${({theme:e})=>e.color.muted};
`,E=a.U.div.withConfig({displayName:"Shell__HeaderSide",componentId:"sc-6e65fbbd-22"})`
  display: grid;
  justify-items: end;
  gap: 1.2rem;
  ${({theme:e})=>e.mobile} { justify-items: start; }
`,K=a.U.span.withConfig({displayName:"Shell__Meta",componentId:"sc-6e65fbbd-23"})`
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.3rem;
`,A=a.U.div.withConfig({displayName:"Shell__Content",componentId:"sc-6e65fbbd-24"})`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2.4rem;
  ${({theme:e})=>e.mobile} { gap: 1.6rem; }
`;e.s(["B",0,b,"u",0,function({title:e,heading:n,subtitle:c,action:f,children:j}){let y=(0,i.useRouter)(),M=(0,a.i)(),{user:q,settings:L,isAdmin:H}=(0,m.U)(),W=(0,h.d)(),[Z,Q]=(0,l.useState)(!1),{data:G}=(0,m.Z)(()=>(0,o.k)("/payment-occurrences?include_archived=false"),[]),Y=G?.filter(e=>"paid"!==e.status&&e.due_date<=L.today).length??0,{data:J}=(0,m.Z)(()=>H?(0,o.k)("/payment-suggestions?status=pending"):Promise.resolve([]),[H]),X={"/suggestions":J?.length??0};async function ee(){try{await (0,o.k)("/auth/logout",{method:"POST"}),window.location.assign("/login")}catch(e){W(e.message,!0)}}return(0,t.jsxs)(w,{children:[(0,t.jsx)(r.default,{children:(0,t.jsx)("title",{children:`${e} \xb7 Invoice Keeper`})}),(0,t.jsxs)(_,{children:[(0,t.jsxs)($,{children:[(0,t.jsxs)(v,{children:[(0,t.jsxs)("span",{title:q.display_name,children:["@",q.username]}),(0,t.jsxs)(k,{href:"/","aria-label":Y?(0,d.t)("{n} к оплате сегодня или просрочено",{n:Y}):(0,d.t)("Нет срочных платежей"),children:[u.f.bell,Y>0&&(0,t.jsx)(C,{children:Y})]})]}),(0,t.jsxs)(v,{children:[(0,t.jsx)(U,{children:(0,s.c)(L.today,{day:"numeric",month:"short"}).replace(".","")}),(0,t.jsx)(g.g,{$tilt:-8,title:L.telegram_enabled?(0,d.t)("Напоминания в Telegram включены"):(0,d.t)("Telegram не подключён"),children:L.telegram_enabled?"tg ✓":"tg off"})]})]}),(0,t.jsx)(N,{"aria-label":(0,d.t)("Разделы"),children:[{href:"/",label:(0,d.t)("Платежи"),icon:u.f.payments},{href:"/recurring",label:(0,d.t)("Регулярные"),icon:u.f.recurring},{href:"/calendar",label:(0,d.t)("Календарь"),icon:u.f.calendar},{href:"/budget",label:(0,d.t)("Бюджет"),icon:u.f.budget},{href:"/team",label:(0,d.t)("Команда"),icon:u.f.team,admin:!0},{href:"/suggestions",label:(0,d.t)("Предложения"),icon:u.f.inbox,admin:!0},{href:"/activity",label:(0,d.t)("Журнал"),icon:u.f.activity,admin:!0},{href:"/extension",label:(0,d.t)("Расширение"),icon:u.f.extension},{href:"/account",label:(0,d.t)("Аккаунт"),icon:u.f.account},{href:"/help",label:(0,d.t)("Помощь"),icon:u.f.help}].filter(e=>!e.admin||H).map(e=>{let r=y.pathname===e.href;return(0,t.jsxs)(I,{href:e.href,$active:r,"aria-current":r?"page":void 0,children:[(0,t.jsxs)("span",{children:[e.label,X[e.href]?(0,t.jsx)(S,{children:X[e.href]}):null]}),e.icon]},e.href)})}),(0,t.jsxs)(F,{children:[H&&(0,t.jsxs)(T,{type:"button",onClick:()=>Q(!0),children:[(0,d.t)("Добавить платёж")," ",(0,t.jsx)(D,{"aria-hidden":"true",children:"+"})]}),(0,t.jsx)(x,{}),(0,t.jsxs)(I,{href:"/api/v1/docs",target:"_blank",rel:"noopener",$active:!1,children:[(0,d.t)("Документация API"),u.f.docs]}),(0,t.jsxs)(O,{type:"button",onClick:ee,children:[(0,d.t)("Выйти"),u.f.logout]}),(0,t.jsx)(P,{href:"/","aria-label":(0,d.t)("Invoice Keeper — на главную"),children:(0,t.jsx)(b,{dark:"light"===M.name})})]})]}),(0,t.jsxs)(V,{children:[(0,t.jsxs)(z,{children:[(0,t.jsxs)("div",{children:[(0,t.jsx)(B,{"aria-hidden":"true",children:e}),(0,t.jsx)("h1",{children:n}),c&&(0,t.jsx)(R,{children:c})]}),(0,t.jsxs)(E,{children:[(0,t.jsxs)(K,{children:[(0,s.c)(L.today,{day:"numeric",month:"long",year:"numeric"})," · ",L.timezone]}),f]})]}),(0,t.jsx)(A,{children:j})]}),Z&&(0,t.jsx)(p.n,{onClose:()=>Q(!1)})]})},"T",0,x])},8524,e=>{var t=e.i(1398);function r({children:e}){return(0,t.jsx)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e})}let n={payments:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M3 10.5 12 4l9 6.5"}),(0,t.jsx)("path",{d:"M5 9.5V20h14V9.5"}),(0,t.jsx)("path",{d:"M10 20v-5h4v5"})]}),recurring:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M20 12a8 8 0 0 1-13.7 5.6"}),(0,t.jsx)("path",{d:"M4 12A8 8 0 0 1 17.7 6.4"}),(0,t.jsx)("path",{d:"M18 3v3.5h-3.5"}),(0,t.jsx)("path",{d:"M6 21v-3.5h3.5"})]}),calendar:(0,t.jsxs)(r,{children:[(0,t.jsx)("rect",{x:"3.5",y:"5",width:"17",height:"15",rx:"2.5"}),(0,t.jsx)("path",{d:"M3.5 10h17M8 3v4M16 3v4"})]}),team:(0,t.jsxs)(r,{children:[(0,t.jsx)("circle",{cx:"9",cy:"8.5",r:"3.5"}),(0,t.jsx)("path",{d:"M2.5 20a6.5 6.5 0 0 1 13 0"}),(0,t.jsx)("path",{d:"M16 5.5a3.5 3.5 0 0 1 0 6.5M18.5 20a6.5 6.5 0 0 0-3-5.5"})]}),activity:(0,t.jsxs)(r,{children:[(0,t.jsx)("rect",{x:"4",y:"3.5",width:"16",height:"17",rx:"2.5"}),(0,t.jsx)("path",{d:"M8 8h8M8 12h8M8 16h5"})]}),docs:(0,t.jsx)(r,{children:(0,t.jsx)("path",{d:"M6 3.5h11a1 1 0 0 1 1 1V20l-6-3.5L6 20V4.5a1 1 0 0 1 0-1Z"})}),logout:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"}),(0,t.jsx)("path",{d:"M10 16l-4-4 4-4M6 12h10"})]}),inbox:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z"}),(0,t.jsx)("path",{d:"M3.5 13.5h5l1 2h5l1-2h5"})]}),extension:(0,t.jsx)(r,{children:(0,t.jsx)("path",{d:"M9 4.5a2 2 0 0 1 4 0V6h4a1 1 0 0 1 1 1v4h-1.5a2 2 0 0 0 0 4H18v4a1 1 0 0 1-1 1h-4v-1.5a2 2 0 0 0-4 0V20H5a1 1 0 0 1-1-1v-4h1.5a2 2 0 0 0 0-4H4V7a1 1 0 0 1 1-1h4Z"})}),budget:(0,t.jsx)(r,{children:(0,t.jsx)("path",{d:"M4 20V10M10 20V4M16 20v-7M22 20H2"})}),help:(0,t.jsxs)(r,{children:[(0,t.jsx)("circle",{cx:"12",cy:"12",r:"8.5"}),(0,t.jsx)("path",{d:"M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 17h.01"})]}),account:(0,t.jsxs)(r,{children:[(0,t.jsx)("circle",{cx:"12",cy:"8",r:"3.8"}),(0,t.jsx)("path",{d:"M4.5 20.5a7.5 7.5 0 0 1 15 0"})]}),bell:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"}),(0,t.jsx)("path",{d:"M10 20.5a2.2 2.2 0 0 0 4 0"})]})};e.s(["f",0,n])},4545,e=>{var t=e.i(6224);let r={RUB:"₽",USD:"$",EUR:"€"};function n(e){let r=Number(e);return new Intl.NumberFormat((0,t.u)(),{minimumFractionDigits:r%1?2:0,maximumFractionDigits:2}).format(r)}function i(e,r={day:"numeric",month:"short"}){return e?new Intl.DateTimeFormat((0,t.u)(),r).format(new Date(e.slice(0,10)+"T12:00:00")):"—"}e.s(["E",0,["RUB","USD","EUR"],"i",0,e=>({RUB:(0,t.t)("рубли"),USD:(0,t.t)("доллары"),EUR:(0,t.t)("евро")})[e],"c",0,i,"S",0,["monthly","quarterly","yearly"],"l",0,e=>({monthly:(0,t.t)("ежемесячно"),quarterly:(0,t.t)("ежеквартально"),yearly:(0,t.t)("ежегодно"),once:(0,t.t)("разово")})[e],"H",0,e=>i(e,{day:"numeric",month:"long",year:"numeric"}),"z",0,n,"e",0,function(e,t){return`${n(e)} ${r[t]}`},"n",0,function(e){let t=i(e+"-01",{month:"long",year:"numeric"}).replace(/ г\.$/,"");return t[0].toUpperCase()+t.slice(1)},"s",0,function(e){let[t,r]=e.split("-").map(Number);return{from_date:`${e}-01`,to_date:`${e}-${new Date(t,r,0).getDate()}`}},"d",0,e=>i(e,{day:"2-digit",month:"2-digit",year:"numeric"}),"W",0,e=>({monthly:(0,t.t)("/ месяц"),quarterly:(0,t.t)("/ квартал"),yearly:(0,t.t)("/ год"),once:""})[e],"_",0,function(e,t){let[r,n]=e.split("-").map(Number),i=new Date(r,n-1+t,1);return 2e3>i.getFullYear()||i.getFullYear()>2100?e:`${i.getFullYear()}-${String(i.getMonth()+1).padStart(2,"0")}`},"U",0,e=>({paid:(0,t.t)("оплачено"),unpaid:(0,t.t)("к оплате"),overdue:(0,t.t)("просрочено")})[e],"F",0,r])}])})();