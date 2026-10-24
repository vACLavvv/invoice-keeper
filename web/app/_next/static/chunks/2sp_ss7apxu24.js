(()=>{"use strict";(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,9218,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814),i=e.i(6224),a=e.i(9835);let l=n.U.dialog.withConfig({displayName:"Modal__Dialog",componentId:"sc-e36fe5a1-0"})`
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
`,s=n.U.div.withConfig({displayName:"Modal__Header",componentId:"sc-e36fe5a1-1"})`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.6rem;
  margin-bottom: 2.4rem;
`,o=n.U.div.withConfig({displayName:"Modal__Eyebrow",componentId:"sc-e36fe5a1-2"})`
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
`;e.s(["i",0,c,"W",0,m,"n",0,function({title:e,eyebrow:n="INVOICE KEEPER",wide:d=!1,onClose:c,children:m}){let h=(0,r.useRef)(null);return(0,r.useEffect)(()=>{let e=h.current;return e&&!e.open&&e.showModal(),()=>e?.close()},[]),(0,t.jsxs)(l,{ref:h,$wide:d,"aria-labelledby":"modal-title",onCancel:e=>{e.preventDefault(),c()},onClick:e=>{e.target===h.current&&c()},children:[(0,t.jsxs)(s,{children:[(0,t.jsxs)("div",{children:[(0,t.jsx)(o,{children:n}),(0,t.jsx)("h2",{id:"modal-title",children:e})]}),(0,t.jsx)(a._,{type:"button","aria-label":(0,i.t)("Закрыть"),onClick:c,children:"×"})]}),m]})},"Q",0,function({onSubmit:e,actions:n,children:i}){let[l,s]=(0,r.useState)(!1),[o,c]=(0,r.useState)(null);async function m(t){t.preventDefault();let r=t.nativeEvent.submitter;s(!0),c(null);try{await e(new FormData(t.currentTarget),r)}catch(e){c(e.message),s(!1)}}return(0,t.jsx)(d,{onSubmit:m,children:(0,t.jsxs)("fieldset",{disabled:l,children:[i,o&&(0,t.jsx)(a.m,{$tone:"error",role:"alert",children:o}),(0,t.jsx)(a.z,{$gap:1,$wrap:!0,$between:!0,children:n})]})})}])},3201,e=>{var t=e.i(1398),r=e.i(1788),n=e.i(814),i=e.i(7289),a=e.i(4545),l=e.i(6224),s=e.i(4787),o=e.i(3133),d=e.i(9218),c=e.i(9835);function m(){let{isAdmin:e}=(0,s.U)();return{users:(0,s.Z)(()=>e?(0,i.k)("/users"):Promise.resolve([]),[e]).data??[],categories:[...new Set(((0,s.Z)(()=>(0,i.k)("/recurring-payments"),[]).data??[]).map(e=>e.category).filter(Boolean))].sort()}}function h({value:e,categories:r}){return(0,t.jsxs)(c.O,{children:[(0,l.t)("Категория"),(0,t.jsx)(c.f,{name:"category",defaultValue:e??"",maxLength:40,list:"ik-categories",placeholder:(0,l.t)("Например, IT или Аренда")}),(0,t.jsx)("datalist",{id:"ik-categories",children:r.map(e=>(0,t.jsx)("option",{value:e},e))})]})}function u({value:e,users:r}){return(0,t.jsxs)(c.O,{children:[(0,l.t)("Ответственный"),(0,t.jsxs)(c.d,{name:"assignee_id",defaultValue:e?String(e):"",children:[(0,t.jsx)("option",{value:"",children:(0,l.t)("Не назначен")}),r.map(e=>(0,t.jsxs)("option",{value:e.id,children:[e.display_name," · @",e.username]},e.id))]}),(0,t.jsx)("small",{children:(0,l.t)("Личные напоминания по платежу уходят ответственному, если он привязал Telegram")})]})}function p({payment:e}){return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)(c.O,{children:[(0,l.t)("Ссылка на оплату"),(0,t.jsx)(c.f,{name:"payment_url",type:"url",defaultValue:e?.payment_url??"",maxLength:500,placeholder:"https://"}),(0,t.jsx)("small",{children:(0,l.t)("Кабинет или счёт: в напоминаниях появится кнопка «💳 Оплатить»")})]}),(0,t.jsxs)(c.O,{children:[(0,l.t)("Реквизиты"),(0,t.jsx)(c.f,{name:"payment_details",defaultValue:e?.payment_details??"",maxLength:500,placeholder:(0,l.t)("Например, ИНН, номер договора или счёта")})]})]})}let g=e=>{let t=String(e??"").trim();return""===t?null:t},x=n.U.div.withConfig({displayName:"PaymentModals__List",componentId:"sc-39320e7b-0"})`
  display: grid;
  gap: 0.6rem;
  margin: 1.6rem 0;
`,f=n.U.div.withConfig({displayName:"PaymentModals__Item",componentId:"sc-39320e7b-1"})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.tile};
  a { color: ${({theme:e})=>e.color.accent}; word-break: break-all; }
  small { display: block; color: ${({theme:e})=>e.color.muted}; }
`,j=n.U.form.withConfig({displayName:"PaymentModals__AddForm",componentId:"sc-39320e7b-2"})`
  display: flex;
  gap: 0.8rem;
  margin-bottom: 1.2rem;
`,y=(0,n.U)(c.a).withConfig({displayName:"PaymentModals__Check",componentId:"sc-39320e7b-3"})`
  white-space: normal;
  align-items: flex-start;
  &::before { margin-top: 0.5rem; }
`,b=n.U.div.withConfig({displayName:"PaymentModals__Preview",componentId:"sc-39320e7b-4"})`
  max-height: 36rem;
  overflow: auto;
  margin: 1.2rem 0;
  table { min-width: 72rem; }
`;e.s(["O",0,function({payment:e,onClose:r}){let{refresh:n}=(0,s.U)(),a=(0,o.d)();return(0,t.jsx)(d.n,{title:(0,l.t)("Прекратить повторение?"),onClose:r,children:(0,t.jsx)(d.Q,{onSubmit:async()=>{await (0,i.k)(`/recurring-payments/${e.id}`,{method:"DELETE"}),r(),n(),a((0,l.t)("Платёж перенесён в архив. История сохранена."))},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:r,children:(0,l.t)("Оставить")}),(0,t.jsx)(c.K,{type:"submit",$variant:"danger",children:(0,l.t)("Прекратить платёж")})]}),children:(0,t.jsxs)(d.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,l.t)("Новые периоды и напоминания создаваться не будут. Уже созданные периоды, даты и история оплат сохранятся в архиве.")]})})})},"n",0,function({onClose:e}){let{settings:r,setMonth:n,refresh:x}=(0,s.U)(),f=(0,o.d)(),{users:j,categories:y}=m();return(0,t.jsx)(d.n,{title:(0,l.t)("Новый регулярный платёж"),onClose:e,children:(0,t.jsxs)(d.Q,{onSubmit:async t=>{let r=g(t.get("assignee_id")),a=await (0,i.k)("/recurring-payments",{method:"POST",body:{title:t.get("title"),amount:t.get("amount"),currency:t.get("currency"),first_due_date:t.get("first_due_date"),frequency:t.get("frequency"),category:g(t.get("category")),assignee_id:r?Number(r):null,payment_url:g(t.get("payment_url")),payment_details:g(t.get("payment_details"))}});e(),n(a.first_due_date.slice(0,7)),x(),f((0,l.t)("Регулярный платёж добавлен"))},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:e,children:(0,l.t)("Отмена")}),(0,t.jsx)(c.K,{type:"submit",children:(0,l.t)("Добавить платёж")})]}),children:[(0,t.jsxs)(c.O,{children:[(0,l.t)("Название платежа"),(0,t.jsx)(c.f,{name:"title",maxLength:120,required:!0,placeholder:(0,l.t)("Например, аренда офиса"),autoFocus:!0})]}),(0,t.jsxs)(d.i,{children:[(0,t.jsxs)(c.O,{children:[(0,l.t)("Сумма"),(0,t.jsx)(c.f,{name:"amount",type:"number",step:"0.01",min:"0.01",max:"9999999999.99",required:!0,placeholder:"0,00",inputMode:"decimal"})]}),(0,t.jsxs)(c.O,{children:[(0,l.t)("Валюта"),(0,t.jsx)(c.d,{name:"currency",defaultValue:"RUB",children:a.E.map(e=>(0,t.jsx)("option",{children:e},e))})]})]}),(0,t.jsxs)(d.i,{children:[(0,t.jsxs)(c.O,{children:[(0,l.t)("Первая дата оплаты"),(0,t.jsx)(c.f,{name:"first_due_date",type:"date",min:"2000-01-01",max:"2100-12-31",defaultValue:r.today,required:!0})]}),(0,t.jsxs)(c.O,{children:[(0,l.t)("Повтор"),(0,t.jsx)(c.d,{name:"frequency",defaultValue:"monthly",children:a.S.map(e=>(0,t.jsx)("option",{value:e,children:(0,a.l)(e)},e))})]})]}),(0,t.jsx)(h,{categories:y}),j.length>0&&(0,t.jsx)(u,{users:j}),(0,t.jsx)(p,{}),(0,t.jsxs)(d.W,{children:[(0,l.t)("Каждый период — своя отметка оплаты. Если в месяце нет нужного числа, срок — последний день месяца. Если до срока меньше 3 дней, напоминание уйдёт сразу."),(0,t.jsx)("br",{}),(0,t.jsx)(c.k,{children:(0,l.t)("Часовой пояс: {tz}",{tz:r.timezone})})]})]})})},"t",0,function({payment:e,onClose:r}){let{refresh:n}=(0,s.U)(),a=(0,o.d)(),{users:x,categories:f}=m();return(0,t.jsx)(d.n,{title:(0,l.t)("Изменить платёж"),onClose:r,children:(0,t.jsxs)(d.Q,{onSubmit:async t=>{let s=g(t.get("assignee_id"));await (0,i.k)(`/recurring-payments/${e.id}`,{method:"PATCH",body:{title:t.get("title"),amount:t.get("amount"),category:g(t.get("category")),assignee_id:s?Number(s):null,payment_url:g(t.get("payment_url")),payment_details:g(t.get("payment_details"))}}),r(),n(),a((0,l.t)("Платёж изменён"))},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:r,children:(0,l.t)("Отмена")}),(0,t.jsx)(c.K,{type:"submit",children:(0,l.t)("Сохранить")})]}),children:[(0,t.jsxs)(c.O,{children:[(0,l.t)("Название платежа"),(0,t.jsx)(c.f,{name:"title",defaultValue:e.title,maxLength:120,required:!0,autoFocus:!0})]}),(0,t.jsxs)(c.O,{children:[(0,l.t)("Сумма, {currency}",{currency:e.currency}),(0,t.jsx)(c.f,{name:"amount",type:"number",step:"0.01",min:"0.01",defaultValue:e.amount,required:!0}),(0,t.jsx)("small",{children:(0,l.t)("Новая сумма применится к неоплаченным периодам с сегодняшнего дня; оплаченные останутся как были.")})]}),(0,t.jsx)(h,{value:e.category,categories:f}),(0,t.jsx)(u,{value:e.assignee?.id,users:x}),(0,t.jsx)(p,{payment:e})]})})},"l",0,function({onClose:e}){let{refresh:n}=(0,s.U)(),m=(0,o.d)(),[h,u]=(0,r.useState)(null),[p,g]=(0,r.useState)(null),[x,f]=(0,r.useState)(!1),[j,w]=(0,r.useState)(null);async function _(t,r=h){if(!r)return;let a=new FormData;a.append("file",r),f(!0),w(null);try{let r=await (0,i.k)(`/recurring-payments/import?dry_run=${t}`,{method:"POST",body:a});t?g(r):(e(),n(),m((0,l.t)("Импортировано платежей: {n}",{n:r.created})))}catch(e){w(e.message)}finally{f(!1)}}return(0,t.jsxs)(d.n,{title:(0,l.t)("Импорт из CSV"),wide:!0,onClose:e,children:[(0,t.jsxs)(d.W,{children:[(0,l.t)("Столбцы: название, сумма, валюта, первая оплата, периодичность, категория. Разделитель «;», «,» или табуляция; UTF-8 или Windows-1251; даты ДД.ММ.ГГГГ.")," ",(0,t.jsx)("a",{href:"/api/v1/recurring-payments/import/template",children:(0,l.t)("Скачать шаблон ↓")})]}),(0,t.jsx)(c.z,{$gap:1,$wrap:!0,children:(0,t.jsx)(c.f,{type:"file",accept:".csv,text/csv",onChange:e=>{let t=e.target.files?.[0]??null;u(t),g(null),t&&_(!0,t)}})}),p&&(0===p.rows.length?(0,t.jsx)(c.e,{children:(0,l.t)("В файле нет строк с данными")}):(0,t.jsx)(b,{children:(0,t.jsx)(c.F,{children:(0,t.jsxs)("table",{children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{children:[(0,t.jsx)("th",{children:"#"}),(0,t.jsx)("th",{children:(0,l.t)("Название")}),(0,t.jsx)("th",{children:(0,l.t)("Сумма")}),(0,t.jsx)("th",{children:(0,l.t)("Первая оплата")}),(0,t.jsx)("th",{children:(0,l.t)("Повтор")}),(0,t.jsx)("th",{children:(0,l.t)("Проверка")})]})}),(0,t.jsx)("tbody",{children:p.rows.map(e=>(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{children:(0,t.jsx)(c.k,{children:e.line})}),(0,t.jsxs)("td",{children:[e.title,e.category&&(0,t.jsxs)(c.k,{children:[" · ",e.category]})]}),(0,t.jsxs)("td",{children:[e.amount," ",e.currency]}),(0,t.jsx)("td",{children:e.first_due_date}),(0,t.jsx)("td",{children:e.frequency&&(0,a.l)(e.frequency)}),(0,t.jsx)("td",{children:e.errors.length>0?(0,t.jsx)(y,{$status:"overdue",children:e.errors.join("; ")}):e.warnings.length>0?(0,t.jsx)(y,{$status:"unpaid",children:e.warnings.join("; ")}):(0,t.jsx)(y,{$status:"paid",children:(0,l.t)("ок")})})]},e.line))})]})})})),j&&(0,t.jsx)(c.m,{$tone:"error",role:"alert",children:j}),(0,t.jsxs)(c.z,{$between:!0,$wrap:!0,children:[(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:e,children:(0,l.t)("Отмена")}),(0,t.jsx)(c.K,{type:"button",disabled:x||!p||p.errors>0||0===p.rows.length,onClick:()=>_(!1),children:p&&p.errors>0?(0,l.t)("Исправьте ошибки: {n}",{n:p.errors}):(0,l.t)("Импортировать")})]})]})},"_",0,function({payment:e,onClose:r}){let{settings:n,refresh:m}=(0,s.U)(),h=(0,o.d)();return(0,t.jsx)(d.n,{title:(0,l.t)("Пауза платежа"),onClose:r,children:(0,t.jsxs)(d.Q,{onSubmit:async t=>{let n=g(t.get("until"));await (0,i.k)(`/recurring-payments/${e.id}/pause`,{method:"POST",body:n?{until:n}:{}}),r(),m(),h(n?(0,l.t)("На паузе до {date}",{date:(0,a.H)(n)}):(0,l.t)("На паузе до возобновления"))},actions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:r,children:(0,l.t)("Отмена")}),(0,t.jsx)(c.K,{type:"submit",children:(0,l.t)("Поставить на паузу")})]}),children:[(0,t.jsxs)(d.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,l.t)("С сегодняшнего дня новых периодов и напоминаний не будет. Пропущенные месяцы потом не станут просрочкой, история оплат сохранится.")]}),(0,t.jsxs)(c.O,{children:[(0,l.t)("До какого дня (включительно)"),(0,t.jsx)(c.f,{name:"until",type:"date",min:n.today,max:"2100-12-31"}),(0,t.jsx)("small",{children:(0,l.t)("Оставьте пустым, чтобы пауза длилась до возобновления")})]})]})})},"p",0,function({occurrence:e,onClose:r}){let{settings:n,refresh:m}=(0,s.U)(),h=(0,o.d)(),u=null!==e.paid_at;return(0,t.jsx)(d.n,{title:u?(0,l.t)("Изменить оплату"):(0,l.t)("Отметить оплату"),onClose:r,children:(0,t.jsxs)(d.Q,{onSubmit:async(t,n)=>{let a=n?.value==="undo";await (0,i.k)(`/payment-occurrences/${e.id}`,{method:"PATCH",body:a?{paid:!1}:{paid:!0,paid_at:t.get("paid_at")}}),r(),m(),h(a?(0,l.t)("Оплата отменена. Дата очищена."):(0,l.t)("Оплата сохранена"))},actions:(0,t.jsxs)(t.Fragment,{children:[u?(0,t.jsx)(c.K,{type:"submit",name:"action",value:"undo",formNoValidate:!0,$variant:"secondary",children:(0,l.t)("Отменить оплату")}):(0,t.jsx)(c.K,{type:"button",$variant:"secondary",onClick:r,children:(0,l.t)("Назад")}),(0,t.jsx)(c.K,{type:"submit",name:"action",value:"save",children:u?(0,l.t)("Сохранить дату"):(0,l.t)("Подтвердить оплату")})]}),children:[(0,t.jsxs)(d.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,a.e)(e.amount,e.currency)," · ",(0,l.t)("срок {date}",{date:(0,a.H)(e.due_date)}),(0,t.jsx)("br",{}),e.payment_details&&(0,t.jsxs)(t.Fragment,{children:[(0,l.t)("Реквизиты: {details}",{details:e.payment_details}),(0,t.jsx)("br",{})]}),e.payment_url&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("a",{href:e.payment_url,target:"_blank",rel:"noopener noreferrer",children:(0,l.t)("Открыть ссылку на оплату ↗")}),(0,t.jsx)("br",{})]}),(0,l.t)("Изменение затронет только этот период.")]}),(0,t.jsxs)(c.O,{children:[(0,l.t)("Фактическая дата оплаты"),(0,t.jsx)(c.f,{name:"paid_at",type:"date",defaultValue:e.paid_at??n.today,max:n.today,required:!0}),(0,t.jsx)("small",{children:(0,l.t)("Оплата в день срока — вовремя. Исправление даты пересчитает просрочку, срок не изменится.")})]})]})})},"j",0,function({occurrence:e,onClose:n}){let{user:m,isAdmin:h,refresh:u}=(0,s.U)(),p=(0,o.d)(),[g,y]=(0,r.useState)(0),[b,w]=(0,r.useState)(!1),[_,$]=(0,r.useState)(null),v=(0,r.useRef)(null),{data:k}=(0,s.Z)(()=>(0,i.k)(`/payment-occurrences/${e.id}/receipts`),[g]);async function C(e,t){w(!0),$(null);try{await e(),y(e=>e+1),u(),p(t)}catch(e){$(e.message)}finally{w(!1)}}return(0,t.jsxs)(d.n,{title:(0,l.t)("Чеки и ссылки"),onClose:n,children:[(0,t.jsxs)(d.W,{children:[(0,t.jsx)("b",{children:e.title}),(0,t.jsx)("br",{}),(0,a.e)(e.amount,e.currency)," · ",(0,l.t)("срок {date}",{date:(0,a.H)(e.due_date)})]}),(0,t.jsx)(x,{children:k?0===k.length?(0,t.jsx)(c.k,{children:(0,l.t)("Пока ничего не прикреплено")}):k.map(e=>{var r;return(0,t.jsxs)(f,{children:[(0,t.jsxs)("span",{children:["link"===e.kind?(0,t.jsx)("a",{href:e.url??"#",target:"_blank",rel:"noopener noreferrer",children:e.url}):(0,t.jsx)("a",{href:e.download_url??"#",children:e.file_name}),(0,t.jsxs)("small",{children:["file"===e.kind?`${!(r=e.size)?"":r>1048576?`${(r/1048576).toFixed(1)} MB`:`${Math.ceil(r/1024)} KB`} \xb7 `:"","@",e.created_by," · ",(0,a.c)(e.created_at)]})]}),(h||e.created_by===m.username)&&(0,t.jsx)(c.K,{type:"button",$small:!0,$variant:"ghost",disabled:b,onClick:()=>C(()=>(0,i.k)(`/receipts/${e.id}`,{method:"DELETE"}),(0,l.t)("Чек удалён")),children:(0,l.t)("удалить")})]},e.id)}):(0,t.jsx)(c.k,{children:(0,l.t)("Загружаем…")})}),(0,t.jsxs)(j,{onSubmit:t=>{t.preventDefault();let r=t.currentTarget,n=String(new FormData(r).get("url")??"").trim();n&&C(()=>(0,i.k)(`/payment-occurrences/${e.id}/receipts`,{method:"POST",body:{url:n}}).then(()=>r.reset()),(0,l.t)("Ссылка прикреплена"))},children:[(0,t.jsx)(c.f,{name:"url",type:"url",placeholder:(0,l.t)("Ссылка на чек или счёт"),maxLength:500}),(0,t.jsx)(c.K,{type:"submit",$variant:"secondary",disabled:b,children:(0,l.t)("Добавить")})]}),(0,t.jsxs)(c.z,{$between:!0,$wrap:!0,children:[(0,t.jsx)(c.k,{children:(0,l.t)("Файл: PDF, PNG, JPEG или WebP до 5 МБ")}),(0,t.jsx)(c.K,{type:"button",disabled:b,onClick:()=>v.current?.click(),children:(0,l.t)("Загрузить файл")}),(0,t.jsx)("input",{ref:v,type:"file",accept:"application/pdf,image/png,image/jpeg,image/webp",hidden:!0,onChange:t=>{let r=t.target.files?.[0];if(t.target.value="",!r)return;let n=new FormData;n.append("file",r),C(()=>(0,i.k)(`/payment-occurrences/${e.id}/receipts`,{method:"POST",body:n}),(0,l.t)("Файл прикреплён"))}})]}),_&&(0,t.jsx)(c.m,{$tone:"error",role:"alert",children:_})]})}])},9877,e=>{var t=e.i(1398),r=e.i(8678),n=e.i(1158),i=e.i(3828),a=e.i(1788),l=e.i(814),s=e.i(7289),o=e.i(4545),d=e.i(6224),c=e.i(813),m=e.i(4787),h=e.i(3133),u=e.i(8524),p=e.i(3201),g=e.i(9835);function x({compact:e=!1}){let{mode:r,setMode:n,language:i,setLanguage:a}=(0,c.T)(),l=[["system","◐",(0,d.t)("Как в системе")],["light","☀",(0,d.t)("Светлая тема")],["dark","☾",(0,d.t)("Тёмная тема")]];return(0,t.jsxs)(f,{$compact:e,children:[!e&&(0,t.jsx)(j,{role:"group","aria-label":(0,d.t)("Тема"),children:l.map(([e,i,a])=>(0,t.jsx)(y,{type:"button",$on:r===e,"aria-pressed":r===e,title:a,"aria-label":a,onClick:()=>n(e),children:i},e))}),(0,t.jsx)(j,{role:"group","aria-label":(0,d.t)("Язык"),children:["ru","en"].map(e=>(0,t.jsx)(y,{type:"button",$on:i===e,"aria-pressed":i===e,onClick:()=>a(e),children:e.toUpperCase()},e))})]})}let f=l.U.div.withConfig({displayName:"Shell__SwitchRow",componentId:"sc-6e65fbbd-0"})`
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  margin: 0 0 1.2rem;
  ${({$compact:e})=>e&&l.m`margin: 0; justify-content: flex-end;`}
`,j=l.U.div.withConfig({displayName:"Shell__Segment",componentId:"sc-6e65fbbd-1"})`
  display: inline-flex;
  padding: 0.3rem;
  border-radius: ${({theme:e})=>e.radius.md};
  background: ${({theme:e})=>e.color.surface};
  border: 1px solid ${({theme:e})=>e.color.line};
`,y=l.U.button.withConfig({displayName:"Shell__SegmentButton",componentId:"sc-6e65fbbd-2"})`
  min-width: 3.2rem;
  height: 2.8rem;
  padding: 0 0.8rem;
  border-radius: ${({theme:e})=>e.radius.sm};
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.3rem;
  font-weight: 600;
  &:hover { color: ${({theme:e})=>e.color.strong}; }
  ${({$on:e,theme:t})=>e&&l.m`background: ${t.color.tile}; color: ${t.color.strong};`}
`;function b({dark:e=!1,size:r=36}){let[n,i]=e?["#111214","#fff"]:["#fff","#111214"];return(0,t.jsxs)("svg",{width:r,height:r,viewBox:"0 0 48 48","aria-hidden":"true",children:[(0,t.jsx)("rect",{width:"48",height:"48",rx:"11",fill:n}),(0,t.jsx)("path",{d:"M15 12h18v25l-4-3-5 3-5-3-4 3V12Z",fill:i}),(0,t.jsx)("path",{d:"m20 23 3 3 6-7",fill:"none",stroke:n,strokeWidth:"2.6",strokeLinecap:"round",strokeLinejoin:"round"})]})}let w=l.U.div.withConfig({displayName:"Shell__Layout",componentId:"sc-6e65fbbd-3"})`
  min-height: 100vh;
  display: grid;
  grid-template-columns: ${"23.6rem"} minmax(0, 1fr);
  ${({theme:e})=>e.mobile} { grid-template-columns: minmax(0, 1fr); }
`,_=l.U.aside.withConfig({displayName:"Shell__Sidebar",componentId:"sc-6e65fbbd-4"})`
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
`,$=l.U.div.withConfig({displayName:"Shell__Account",componentId:"sc-6e65fbbd-5"})`
  border: 1px solid ${({theme:e})=>e.color.line};
  border-radius: ${({theme:e})=>e.radius.lg};
`,v=l.U.div.withConfig({displayName:"Shell__AccountRow",componentId:"sc-6e65fbbd-6"})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  color: ${({theme:e})=>e.color.strong};
  & + & { border-top: 1px solid ${({theme:e})=>e.color.line}; }
  > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1.6rem; }
`,k=(0,l.U)(n.default).withConfig({displayName:"Shell__Bell",componentId:"sc-6e65fbbd-7"})`
  position: relative;
  display: inline-grid;
  color: ${({theme:e})=>e.color.strong};
`,C=l.U.span.withConfig({displayName:"Shell__BellBadge",componentId:"sc-6e65fbbd-8"})`
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
`,S=l.U.span.withConfig({displayName:"Shell__Count",componentId:"sc-6e65fbbd-9"})`
  display: inline-block;
  margin-left: 0.8rem;
  padding: 0 0.6rem;
  border-radius: 0.4rem;
  background: ${({theme:e})=>e.color.accent};
  color: #fff;
  font-size: 1.1rem;
  font-weight: 700;
  transform: rotate(-6deg);
`,U=l.U.span.withConfig({displayName:"Shell__Today",componentId:"sc-6e65fbbd-10"})`
  font-size: 2.4rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap;
`,M=l.U.nav.withConfig({displayName:"Shell__Nav",componentId:"sc-6e65fbbd-11"})`
  display: grid;
  gap: 0.2rem;
  ${({theme:e})=>e.mobile} { display: flex; overflow-x: auto; padding-bottom: 0.4rem; }
`,N=l.m`
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
`,I=(0,l.U)(n.default).withConfig({displayName:"Shell__NavItem",componentId:"sc-6e65fbbd-12"})`${N}`,F=l.U.button.withConfig({displayName:"Shell__NavButton",componentId:"sc-6e65fbbd-13"})`${N}`,T=l.U.div.withConfig({displayName:"Shell__Bottom",componentId:"sc-6e65fbbd-14"})`
  margin-top: auto;
  display: grid;
  gap: 0.2rem;
  ${({theme:e})=>e.mobile} { display: flex; overflow-x: auto; margin-top: 0; > * { margin: 0; } }
`,P=l.U.button.withConfig({displayName:"Shell__AddButton",componentId:"sc-6e65fbbd-15"})`
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
`,V=l.U.span.withConfig({displayName:"Shell__Plus",componentId:"sc-6e65fbbd-16"})`
  color: ${({theme:e})=>e.color.accent};
  font-size: 2.2rem;
  line-height: 1;
`,z=(0,l.U)(n.default).withConfig({displayName:"Shell__LogoLink",componentId:"sc-6e65fbbd-17"})`
  margin: 2rem 0 0 1rem;
  justify-self: start;
  ${({theme:e})=>e.mobile} { display: none; }
`,O=l.U.main.withConfig({displayName:"Shell__Surface",componentId:"sc-6e65fbbd-18"})`
  min-width: 0;
  margin: 4.8rem 1.2rem 1.2rem 0;
  padding: 6.4rem 4.8rem 4.8rem;
  border-radius: ${({theme:e})=>e.radius.xl};
  background: ${({theme:e})=>e.color.surface};
  ${({theme:e})=>e.mobile} { margin: 1.6rem 0 0; padding: 3.2rem 1.6rem; border-radius: ${({theme:e})=>e.radius.xl} ${({theme:e})=>e.radius.xl} 0 0; }
`,K=l.U.header.withConfig({displayName:"Shell__Header",componentId:"sc-6e65fbbd-19"})`
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
`,D=l.U.div.withConfig({displayName:"Shell__Ghost",componentId:"sc-6e65fbbd-20"})`
  font-size: 5.6rem;
  line-height: 0.9;
  font-weight: 900;
  font-style: italic;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  color: ${({theme:e})=>e.color.ghost};
  user-select: none;
  ${({theme:e})=>e.mobile} { font-size: 4rem; }
`,B=l.U.p.withConfig({displayName:"Shell__Subtitle",componentId:"sc-6e65fbbd-21"})`
  margin-top: 0.6rem;
  color: ${({theme:e})=>e.color.muted};
`,E=l.U.div.withConfig({displayName:"Shell__HeaderSide",componentId:"sc-6e65fbbd-22"})`
  display: grid;
  justify-items: end;
  gap: 1.2rem;
  ${({theme:e})=>e.mobile} { justify-items: start; }
`,L=l.U.span.withConfig({displayName:"Shell__Meta",componentId:"sc-6e65fbbd-23"})`
  color: ${({theme:e})=>e.color.muted};
  font-size: 1.3rem;
`,R=l.U.div.withConfig({displayName:"Shell__Content",componentId:"sc-6e65fbbd-24"})`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2.4rem;
  ${({theme:e})=>e.mobile} { gap: 1.6rem; }
`;e.s(["B",0,b,"u",0,function({title:e,heading:n,subtitle:c,action:f,children:j}){let y=(0,i.useRouter)(),N=(0,l.i)(),{user:q,settings:H,isAdmin:W}=(0,m.U)(),A=(0,h.d)(),[Z,Q]=(0,a.useState)(!1),{data:G}=(0,m.Z)(()=>(0,s.k)("/payment-occurrences?include_archived=false"),[]),Y=G?.filter(e=>"paid"!==e.status&&e.due_date<=H.today).length??0,{data:J}=(0,m.Z)(()=>W?(0,s.k)("/payment-suggestions?status=pending"):Promise.resolve([]),[W]),X={"/suggestions":J?.length??0};async function ee(){try{await (0,s.k)("/auth/logout",{method:"POST"}),window.location.assign("/login")}catch(e){A(e.message,!0)}}return(0,t.jsxs)(w,{children:[(0,t.jsx)(r.default,{children:(0,t.jsx)("title",{children:`${e} \xb7 Invoice Keeper`})}),(0,t.jsxs)(_,{children:[(0,t.jsxs)($,{children:[(0,t.jsxs)(v,{children:[(0,t.jsxs)("span",{title:q.display_name,children:["@",q.username]}),(0,t.jsxs)(k,{href:"/","aria-label":Y?(0,d.t)("{n} к оплате сегодня или просрочено",{n:Y}):(0,d.t)("Нет срочных платежей"),children:[u.f.bell,Y>0&&(0,t.jsx)(C,{children:Y})]})]}),(0,t.jsxs)(v,{children:[(0,t.jsx)(U,{children:(0,o.c)(H.today,{day:"numeric",month:"short"}).replace(".","")}),(0,t.jsx)(g.g,{$tilt:-8,title:H.telegram_enabled?(0,d.t)("Напоминания в Telegram включены"):(0,d.t)("Telegram не подключён"),children:H.telegram_enabled?"tg ✓":"tg off"})]})]}),(0,t.jsx)(M,{"aria-label":(0,d.t)("Разделы"),children:[{href:"/",label:(0,d.t)("Платежи"),icon:u.f.payments},{href:"/recurring",label:(0,d.t)("Регулярные"),icon:u.f.recurring},{href:"/calendar",label:(0,d.t)("Календарь"),icon:u.f.calendar},{href:"/budget",label:(0,d.t)("Бюджет"),icon:u.f.budget},{href:"/team",label:(0,d.t)("Команда"),icon:u.f.team,admin:!0},{href:"/suggestions",label:(0,d.t)("Предложения"),icon:u.f.inbox,admin:!0},{href:"/activity",label:(0,d.t)("Журнал"),icon:u.f.activity,admin:!0},{href:"/extension",label:(0,d.t)("Расширение"),icon:u.f.extension},{href:"/account",label:(0,d.t)("Аккаунт"),icon:u.f.account},{href:"/help",label:(0,d.t)("Помощь"),icon:u.f.help}].filter(e=>!e.admin||W).map(e=>{let r=y.pathname===e.href;return(0,t.jsxs)(I,{href:e.href,$active:r,"aria-current":r?"page":void 0,children:[(0,t.jsxs)("span",{children:[e.label,X[e.href]?(0,t.jsx)(S,{children:X[e.href]}):null]}),e.icon]},e.href)})}),(0,t.jsxs)(T,{children:[W&&(0,t.jsxs)(P,{type:"button",onClick:()=>Q(!0),children:[(0,d.t)("Добавить платёж")," ",(0,t.jsx)(V,{"aria-hidden":"true",children:"+"})]}),(0,t.jsx)(x,{}),(0,t.jsxs)(I,{href:"/api/v1/docs",target:"_blank",rel:"noopener",$active:!1,children:[(0,d.t)("Документация API"),u.f.docs]}),(0,t.jsxs)(F,{type:"button",onClick:ee,children:[(0,d.t)("Выйти"),u.f.logout]}),(0,t.jsx)(z,{href:"/","aria-label":(0,d.t)("Invoice Keeper — на главную"),children:(0,t.jsx)(b,{dark:"light"===N.name})})]})]}),(0,t.jsxs)(O,{children:[(0,t.jsxs)(K,{children:[(0,t.jsxs)("div",{children:[(0,t.jsx)(D,{"aria-hidden":"true",children:e}),(0,t.jsx)("h1",{children:n}),c&&(0,t.jsx)(B,{children:c})]}),(0,t.jsxs)(E,{children:[(0,t.jsxs)(L,{children:[(0,o.c)(H.today,{day:"numeric",month:"long",year:"numeric"})," · ",H.timezone]}),f]})]}),(0,t.jsx)(R,{children:j})]}),Z&&(0,t.jsx)(p.n,{onClose:()=>Q(!1)})]})},"T",0,x])},8524,e=>{var t=e.i(1398);function r({children:e}){return(0,t.jsx)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e})}let n={payments:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M3 10.5 12 4l9 6.5"}),(0,t.jsx)("path",{d:"M5 9.5V20h14V9.5"}),(0,t.jsx)("path",{d:"M10 20v-5h4v5"})]}),recurring:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M20 12a8 8 0 0 1-13.7 5.6"}),(0,t.jsx)("path",{d:"M4 12A8 8 0 0 1 17.7 6.4"}),(0,t.jsx)("path",{d:"M18 3v3.5h-3.5"}),(0,t.jsx)("path",{d:"M6 21v-3.5h3.5"})]}),calendar:(0,t.jsxs)(r,{children:[(0,t.jsx)("rect",{x:"3.5",y:"5",width:"17",height:"15",rx:"2.5"}),(0,t.jsx)("path",{d:"M3.5 10h17M8 3v4M16 3v4"})]}),team:(0,t.jsxs)(r,{children:[(0,t.jsx)("circle",{cx:"9",cy:"8.5",r:"3.5"}),(0,t.jsx)("path",{d:"M2.5 20a6.5 6.5 0 0 1 13 0"}),(0,t.jsx)("path",{d:"M16 5.5a3.5 3.5 0 0 1 0 6.5M18.5 20a6.5 6.5 0 0 0-3-5.5"})]}),activity:(0,t.jsxs)(r,{children:[(0,t.jsx)("rect",{x:"4",y:"3.5",width:"16",height:"17",rx:"2.5"}),(0,t.jsx)("path",{d:"M8 8h8M8 12h8M8 16h5"})]}),docs:(0,t.jsx)(r,{children:(0,t.jsx)("path",{d:"M6 3.5h11a1 1 0 0 1 1 1V20l-6-3.5L6 20V4.5a1 1 0 0 1 0-1Z"})}),logout:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"}),(0,t.jsx)("path",{d:"M10 16l-4-4 4-4M6 12h10"})]}),inbox:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z"}),(0,t.jsx)("path",{d:"M3.5 13.5h5l1 2h5l1-2h5"})]}),extension:(0,t.jsx)(r,{children:(0,t.jsx)("path",{d:"M9 4.5a2 2 0 0 1 4 0V6h4a1 1 0 0 1 1 1v4h-1.5a2 2 0 0 0 0 4H18v4a1 1 0 0 1-1 1h-4v-1.5a2 2 0 0 0-4 0V20H5a1 1 0 0 1-1-1v-4h1.5a2 2 0 0 0 0-4H4V7a1 1 0 0 1 1-1h4Z"})}),budget:(0,t.jsx)(r,{children:(0,t.jsx)("path",{d:"M4 20V10M10 20V4M16 20v-7M22 20H2"})}),help:(0,t.jsxs)(r,{children:[(0,t.jsx)("circle",{cx:"12",cy:"12",r:"8.5"}),(0,t.jsx)("path",{d:"M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 17h.01"})]}),account:(0,t.jsxs)(r,{children:[(0,t.jsx)("circle",{cx:"12",cy:"8",r:"3.8"}),(0,t.jsx)("path",{d:"M4.5 20.5a7.5 7.5 0 0 1 15 0"})]}),bell:(0,t.jsxs)(r,{children:[(0,t.jsx)("path",{d:"M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"}),(0,t.jsx)("path",{d:"M10 20.5a2.2 2.2 0 0 0 4 0"})]})};e.s(["f",0,n])},4545,e=>{var t=e.i(6224);let r={RUB:"₽",USD:"$",EUR:"€"};function n(e){let r=Number(e);return new Intl.NumberFormat((0,t.u)(),{minimumFractionDigits:r%1?2:0,maximumFractionDigits:2}).format(r)}function i(e,r={day:"numeric",month:"short"}){return e?new Intl.DateTimeFormat((0,t.u)(),r).format(new Date(e.slice(0,10)+"T12:00:00")):"—"}e.s(["E",0,["RUB","USD","EUR"],"i",0,e=>({RUB:(0,t.t)("рубли"),USD:(0,t.t)("доллары"),EUR:(0,t.t)("евро")})[e],"c",0,i,"S",0,["monthly","quarterly","yearly"],"l",0,e=>({monthly:(0,t.t)("ежемесячно"),quarterly:(0,t.t)("ежеквартально"),yearly:(0,t.t)("ежегодно")})[e],"H",0,e=>i(e,{day:"numeric",month:"long",year:"numeric"}),"z",0,n,"e",0,function(e,t){return`${n(e)} ${r[t]}`},"n",0,function(e){let t=i(e+"-01",{month:"long",year:"numeric"}).replace(/ г\.$/,"");return t[0].toUpperCase()+t.slice(1)},"s",0,function(e){let[t,r]=e.split("-").map(Number);return{from_date:`${e}-01`,to_date:`${e}-${new Date(t,r,0).getDate()}`}},"d",0,e=>i(e,{day:"2-digit",month:"2-digit",year:"numeric"}),"W",0,e=>({monthly:(0,t.t)("/ месяц"),quarterly:(0,t.t)("/ квартал"),yearly:(0,t.t)("/ год")})[e],"_",0,function(e,t){let[r,n]=e.split("-").map(Number),i=new Date(r,n-1+t,1);return 2e3>i.getFullYear()||i.getFullYear()>2100?e:`${i.getFullYear()}-${String(i.getMonth()+1).padStart(2,"0")}`},"U",0,e=>({paid:(0,t.t)("оплачено"),unpaid:(0,t.t)("к оплате"),overdue:(0,t.t)("просрочено")})[e],"F",0,r])}])})();