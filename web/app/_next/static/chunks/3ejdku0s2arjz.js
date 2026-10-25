(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[4471,(e,t,r)=>{function n(e,t,r,n){return!1}e.i(461),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"getDomainLocale",{enumerable:!0,get:function(){return n}}),e.r(90),("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},9149,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return C},useLinkStatus:function(){return j}};for(var l in n)Object.defineProperty(r,l,{enumerable:!0,get:n[l]});let i=e.r(2456),a=e.r(1398),o=i._(e.r(1788)),d=e.r(472),s=e.r(1112),c=e.r(8169),u=e.r(9129),f=e.r(4862),p=e.r(5479),h=e.r(1914),m=e.r(4471),g=e.r(4113),x=e.r(3230),b=new Set;function y(e,t,r,n){if(!("u"<typeof window)&&(0,s.isLocalURL)(t)){if(!n.bypassPrefetchedCheck){let l=t+"%"+r+"%"+(void 0!==n.locale?n.locale:"locale"in e?e.locale:void 0);if(b.has(l))return;b.add(l)}e.prefetch(t,r,n).catch(e=>{})}}function v(e){return"string"==typeof e?e:(0,c.formatUrl)(e)}let _=o.default.forwardRef(function(e,t){let r,n,{href:l,as:i,children:c,prefetch:b=null,passHref:_,replace:k,shallow:j,scroll:C,locale:w,onClick:P,onNavigate:T,onMouseEnter:M,onTouchStart:I,legacyBehavior:O=!1,transitionTypes:E,...R}=e;r=c,O&&("string"==typeof r||"number"==typeof r)&&(r=(0,a.jsx)("a",{children:r}));let A=o.default.useContext(p.RouterContext),U=!1!==b,{href:N,as:S}=o.default.useMemo(()=>{if(!A){let e=v(l);return{href:e,as:i?v(i):e}}let[e,t]=(0,d.resolveHref)(A,l,!0);return{href:e,as:i?(0,d.resolveHref)(A,i):t||e}},[A,l,i]),L=o.default.useRef(N),D=o.default.useRef(S);O&&(n=o.default.Children.only(r));let z=O?n&&"object"==typeof n&&n.ref:t,[K,B,$]=(0,h.useIntersection)({rootMargin:"200px"}),X=o.default.useCallback(e=>{(D.current!==S||L.current!==N)&&($(),D.current=S,L.current=N),K(e)},[S,N,$,K]),q=(0,x.useMergedRef)(X,z);o.default.useEffect(()=>{!A||B&&U&&y(A,N,S,{bypassPrefetchedCheck:!1,locale:w})},[S,N,B,w,U,A?.locale,A]);let F={ref:q,onClick(e){O||"function"!=typeof P||P(e),O&&n.props&&"function"==typeof n.props.onClick&&n.props.onClick(e),!A||e.defaultPrevented||function(e,t,r,n,l,i,a,o,d){let c,{nodeName:u}=e.currentTarget;if(!("A"===u.toUpperCase()&&((c=e.currentTarget.getAttribute("target"))&&"_self"!==c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,s.isLocalURL)(r)){l&&(e.preventDefault(),location.replace(r));return}e.preventDefault(),(()=>{if(d){let e=!1;if(d({preventDefault:()=>{e=!0}}),e)return}let e=a??!0;"beforePopState"in t?t[l?"replace":"push"](r,n,{shallow:i,locale:o,scroll:e}):t[l?"replace":"push"](n||r,{scroll:e})})()}}(e,A,N,S,k,j,C,w,T)},onMouseEnter(e){O||"function"!=typeof M||M(e),O&&n.props&&"function"==typeof n.props.onMouseEnter&&n.props.onMouseEnter(e),A&&y(A,N,S,{locale:w,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){O||"function"!=typeof I||I(e),O&&n.props&&"function"==typeof n.props.onTouchStart&&n.props.onTouchStart(e),A&&y(A,N,S,{locale:w,priority:!0,bypassPrefetchedCheck:!0})}};if((0,u.isAbsoluteUrl)(S))F.href=S;else if(!O||_||"a"===n.type&&!("href"in n.props)){let e=void 0!==w?w:A?.locale;F.href=A?.isLocaleDomain&&(0,m.getDomainLocale)(S,e,A?.locales,A?.domainLocales)||(0,g.addBasePath)((0,f.addLocale)(S,e,A?.defaultLocale))}return O?o.default.cloneElement(n,F):(0,a.jsx)("a",{...R,...F,children:r})}),k=(0,o.createContext)({pending:!1}),j=()=>(0,o.useContext)(k),C=_;("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1914,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useIntersection",{enumerable:!0,get:function(){return d}});let n=e.r(1788),l=e.r(9604),i="function"==typeof IntersectionObserver,a=new Map,o=[];function d({rootRef:e,rootMargin:t,disabled:r}){let s=r||!i,[c,u]=(0,n.useState)(!1),f=(0,n.useRef)(null),p=(0,n.useCallback)(e=>{f.current=e},[]);return(0,n.useEffect)(()=>{if(i){if(s||c)return;let r=f.current;if(r&&r.tagName)return function(e,t,r){let{id:n,observer:l,elements:i}=function(e){let t,r={root:e.root||null,margin:e.rootMargin||""},n=o.find(e=>e.root===r.root&&e.margin===r.margin);if(n&&(t=a.get(n)))return t;let l=new Map;return t={id:r,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=l.get(e.target),r=e.isIntersecting||e.intersectionRatio>0;t&&r&&t(r)})},e),elements:l},o.push(r),a.set(r,t),t}(r);return i.set(e,t),l.observe(e),function(){if(i.delete(e),l.unobserve(e),0===i.size){l.disconnect(),a.delete(n);let e=o.findIndex(e=>e.root===n.root&&e.margin===n.margin);e>-1&&o.splice(e,1)}}}(r,e=>e&&u(e),{root:e?.current,rootMargin:t})}else if(!c){let e=(0,l.requestIdleCallback)(()=>u(!0));return()=>(0,l.cancelIdleCallback)(e)}},[s,t,e,c,f.current]),[p,c,(0,n.useCallback)(()=>{u(!1)},[])]}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},3230,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return l}});let n=e.r(1788);function l(e,t){let r=(0,n.useRef)(null),l=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=l.current;t&&(l.current=null,t())}else e&&(r.current=i(e,n)),t&&(l.current=i(t,n))},[e,t])}function i(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1562,e=>{var t=e.i(1398),r=e.i(1158),n=e.i(814),l=e.i(9877),i=e.i(9835),a=e.i(6224),o=e.i(4787);let d=n.U.div.withConfig({displayName:"help__Grid",componentId:"sc-f6b861fc-0"})`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 26rem), 1fr));
  gap: 1.2rem;
`,s=n.m`
  --help-card-background: #ffffff;
  --help-card-ink: #202126;
  --help-card-border: #dfe2e7;
  --help-card-hover: #f3f4f6;
  --ink: var(--help-card-ink);
  --desk-ink: var(--help-card-ink);
  --desk-muted: var(--help-card-ink);
  --apple-secondary: var(--help-card-ink);
  background: var(--help-card-background);
  color: var(--help-card-ink);
  border-color: var(--help-card-border);
  &:nth-child(even) {
    --help-card-background: #202126;
    --help-card-ink: #ffffff;
    --help-card-border: #202126;
    --help-card-hover: #303238;
  }
`,c=(0,n.U)(r.default).withConfig({displayName:"help__Card",componentId:"sc-f6b861fc-1"})`
  display: grid;
  gap: 0.6rem;
  padding: 1.6rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  border: 1px solid;
  ${s}
  font-size: 15px;
  line-height: 1.55;
  transition: background 0.15s;
  &:hover { background: var(--help-card-hover); }
`,u=(0,n.U)(i.B).withConfig({displayName:"help__RuleTile",componentId:"sc-f6b861fc-2"})`
  ${s}
`,f=n.U.div.withConfig({displayName:"help__Rules",componentId:"sc-f6b861fc-3"})`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 1.2rem;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; }
`,p=n.U.div.withConfig({displayName:"help__Big",componentId:"sc-f6b861fc-4"})`
  font-size: 2.6rem;
  font-weight: 500;
  color: inherit;
  word-break: break-word;
`,h=n.U.div.withConfig({displayName:"help__DisclosureList",componentId:"sc-f6b861fc-5"})`
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  background: var(--desk-surface);
  overflow: hidden;
  details + details { border-top: 1px solid var(--desk-border); }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    min-height: 58px;
    padding: 16px 20px;
    cursor: pointer;
    list-style: none;
    color: var(--desk-ink);
    font-size: 16px;
    font-weight: 550;
    line-height: 1.5;
  }
  summary::-webkit-details-marker { display: none; }
  summary::after {
    content: '';
    flex: 0 0 8px;
    width: 8px;
    height: 8px;
    margin: -4px 3px 0;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(45deg);
  }
  details[open] > summary::after { transform: rotate(225deg); margin-top: 4px; }
  summary:hover { background: var(--desk-raised); }
  summary:focus-visible { outline-offset: -3px; }
  p {
    max-width: 78ch;
    margin: 0;
    padding: 0 20px 18px;
    color: var(--desk-ink);
    font-size: 15px;
    line-height: 1.7;
  }
  @media (max-width: 480px) {
    summary { padding: 15px 16px; }
    p { padding: 0 16px 16px; }
  }
`,m=n.U.a.withConfig({displayName:"help__DocsLink",componentId:"sc-f6b861fc-6"})`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px;
  margin-top: 24px;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  background: var(--desk-surface);
  color: var(--desk-ink);
  > span:first-child { display: grid; gap: 4px; }
  b { font-size: 16px; font-weight: 550; }
  > span:first-child > span { font-size: 15px; line-height: 1.5; color: var(--desk-muted); }
  > span:last-child { font-size: 22px; }
  &:hover { border-color: var(--desk-control); background: var(--desk-raised); }
`;e.s(["default",0,function(){let{settings:e,isAdmin:r}=(0,o.U)(),n=[{href:"/payments",title:(0,a.t)("Платежи"),text:(0,a.t)("Периоды месяца, итоги по валютам, отметка оплаты, чеки и выгрузка в CSV.")},{href:"/recurring",title:(0,a.t)("Регулярные"),text:(0,a.t)("Платежи с повтором: месяц, квартал или год. Изменение, пауза, импорт из CSV.")},{href:"/calendar",title:(0,a.t)("Календарь"),text:(0,a.t)("Сроки месяца по дням; клик по платежу открывает отметку оплаты.")},{href:"/budget",title:(0,a.t)("Бюджет"),text:(0,a.t)("План на год по месяцам и категориям, оплачено и остаток в каждой валюте.")},{href:"/extension",title:(0,a.t)("Расширение"),text:(0,a.t)("Подтягивает платежи из кабинетов сервисов в один клик.")},{href:"/account",title:(0,a.t)("Аккаунт"),text:(0,a.t)("Привязка Telegram, пароль или двухфакторный вход, активные сессии и токены API.")},...r?[{href:"/team",title:(0,a.t)("Команда"),text:(0,a.t)("Обычные пользователи: создать, изменить, удалить.")},{href:"/suggestions",title:(0,a.t)("Предложения"),text:(0,a.t)("Платежи, найденные расширением: принять или отклонить.")},{href:"/activity",title:(0,a.t)("Журнал"),text:(0,a.t)("Отправка напоминаний и все действия в системе.")}]:[]],s=[[(0,a.t)("Когда приходит напоминание?"),(0,a.t)("За {days} дня до срока, один раз на каждый период. Если платёж добавлен позже, напоминание уходит сразу. Оплаченные периоды и платежи на паузе не напоминают.",{days:e.reminder_days})],[(0,a.t)("Когда платёж считается просроченным?"),(0,a.t)("Со следующего дня после срока. Оплата в сам день срока — вовремя. Если исправить фактическую дату оплаты, просрочка пересчитается, а срок не изменится.")],[(0,a.t)("Что если в месяце нет нужного числа?"),(0,a.t)("Срок переносится на последний день месяца: 31 января → 28 февраля → 31 марта. Годовой платёж от 29 февраля в обычный год придёт 28 февраля.")],[(0,a.t)("Как отметить оплату из Telegram?"),(0,a.t)("Нажмите «✅ Оплачено» под напоминанием. Период отметится сегодняшней датой, кнопка исчезнет, а в журнале будет видно, кто отметил.")],[(0,a.t)("Что если срок прошёл, а оплату не отметили?"),e.overdue_reminders?(0,a.t)("На следующий день после срока приходит одно повторное напоминание «Платёж просрочен» — в те же каналы, что и обычное."):(0,a.t)("Повторные напоминания о просрочке на этом сервере выключены (OVERDUE_REMINDERS=false). Просроченные платежи видны в панели и по команде /overdue.")],[(0,a.t)("Что значит «санкционный список OFAC» у кошелька?"),(0,a.t)("Если у платежа указан криптокошелёк получателя, он сверяется со списком санкций Минфина США (SDN). При совпадении платёж помечается ⛔, в напоминаниях появляется предупреждение и пропадает кнопка «Оплатить». Это проверка только по опубликованным адресам, а не оценка риска кошелька.")],[(0,a.t)("Где оплатить?"),(0,a.t)("Если у платежа указана ссылка на оплату, в напоминании есть кнопка «💳 Оплатить», а в списке платежей — значок 💳. Реквизиты показываются в напоминании и в окне оплаты.")],[(0,a.t)("Что делает пауза?"),(0,a.t)("С сегодняшнего дня до выбранной даты или до возобновления новых периодов и напоминаний нет. Пропущенные месяцы не становятся долгом, прошлые оплаты остаются.")],[(0,a.t)("Почему суммы не складываются в одну?"),(0,a.t)("Рубли, доллары и евро считаются отдельно: курсы и конвертация не используются, чтобы итоги всегда совпадали со счетами.")]],g=[[(0,a.t)("Доступ и права"),[(0,a.t)("Без входа недоступны ни панель, ни данные API. Права проверяет сервер: пользователь не выполнит действия администратора даже через API."),(0,a.t)("Токены API хранятся как SHA-256 и показываются один раз. По токену нельзя сменить пароль, второй фактор, создать новый токен или завершить сессии.")]],[(0,a.t)("Пароли и защита входа"),[(0,a.t)("Пароли хешируются Argon2id; пароли из списков утечек, с логином внутри и простые последовательности не принимаются."),(0,a.t)("Смена пароля завершает остальные сессии."),(0,a.t)("Администратор может включить вход по коду из приложения-аутентификатора (раздел «Аккаунт»)."),...e.security?.login_alerts?[(0,a.t)("О каждом входе и о подборе пароля приходит сообщение в привязанный Telegram.")]:[]]],[(0,a.t)("Оплата через Telegram"),[(0,a.t)("Кнопку «Оплачено» принимает только чат команды и личные чаты привязанных пользователей."),...e.security?.paid_linked_only?[(0,a.t)("«Оплачено» в Telegram могут нажать только участники, привязавшие аккаунт в панели.")]:[]]],[(0,a.t)("Чеки и хранение данных"),[e.security?.encryption?(0,a.t)("Секрет второго фактора, чеки и реквизиты хранятся зашифрованными (XChaCha20-Poly1305): копия базы без ключа их не раскрывает."):(0,a.t)("Шифрование данных в базе выключено: задайте DATA_ENCRYPTION_KEY (invoice-keeper keygen)."),(0,a.t)("Чеки проверяются по содержимому файла, а не по имени, и скачиваются как вложения.")]],[(0,a.t)("Целостность журнала"),[(0,a.t)("Журнал защищён от подмены: каждая запись подписана вместе с предыдущей, проверка — во вкладке «Журнал».")]]],x=e.timezone,b=["telegram","max","email","webhook"].filter(t=>e.channels?.[t]).map(e=>({telegram:"Telegram",max:"MAX",email:"Email",webhook:"Webhook"})[e]);return(0,t.jsxs)(l.u,{title:(0,a.t)("Помощь"),heading:(0,a.t)("Помощь"),subtitle:(0,a.t)("Как устроен Invoice Keeper и что делать, если что-то не так."),action:(0,t.jsx)(t.Fragment,{}),children:[(0,t.jsx)(i.n,{children:(0,a.t)("разделы")}),(0,t.jsx)(d,{children:n.map(e=>(0,t.jsxs)(c,{href:e.href,children:[(0,t.jsxs)(i.h,{children:[e.title,(0,t.jsx)(i.T,{"aria-hidden":"true",children:"›"})]}),(0,t.jsx)(i.k,{children:e.text})]},e.href))}),(0,t.jsx)(i.n,{children:(0,a.t)("правила этого сервера")}),(0,t.jsxs)(f,{children:[(0,t.jsxs)(u,{children:[(0,t.jsx)(p,{children:e.reminder_days}),(0,t.jsx)(i.k,{children:(0,a.t)("дня до срока — напоминание")})]}),(0,t.jsxs)(u,{children:[(0,t.jsx)(p,{children:x}),(0,t.jsx)(i.k,{children:(0,a.t)("часовой пояс: от него зависит «сегодня»")})]}),(0,t.jsxs)(u,{children:[(0,t.jsx)(p,{children:b.length?b.join(" · "):"—"}),(0,t.jsx)(i.k,{children:b.length?e.telegram_enabled?e.team_chat?(0,a.t)("Telegram: общий чат и личные сообщения"):(0,a.t)("Telegram: личные сообщения привязанным пользователям"):(0,a.t)("каналы напоминаний"):(0,a.t)("напоминания пока не отправляются")}),e.bot_username&&(0,t.jsxs)(i.k,{children:["@",e.bot_username]})]})]}),(0,t.jsxs)(m,{href:"/api/v1/docs",target:"_blank",rel:"noopener noreferrer",children:[(0,t.jsxs)("span",{children:[(0,t.jsx)("b",{children:(0,a.t)("Документация API")}),(0,t.jsx)("span",{children:(0,a.t)("Методы, параметры и примеры запросов для интеграций.")})]}),(0,t.jsx)("span",{"aria-hidden":"true",children:"↗"})]}),(0,t.jsx)(i.n,{id:"help-faq",children:(0,a.t)("частые вопросы")}),(0,t.jsx)(h,{"aria-labelledby":"help-faq",children:s.map(([e,r])=>(0,t.jsxs)("details",{children:[(0,t.jsx)("summary",{children:e}),(0,t.jsx)("p",{children:r})]},e))}),(0,t.jsx)(i.n,{id:"help-security",children:(0,a.t)("безопасность")}),(0,t.jsx)(h,{"aria-labelledby":"help-security",children:g.map(([e,r])=>(0,t.jsxs)("details",{children:[(0,t.jsx)("summary",{children:e}),(0,t.jsx)("div",{children:r.map(e=>(0,t.jsx)("p",{children:e},e))})]},e))}),(e.support_telegram||e.support_email)&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(i.n,{children:(0,a.t)("поддержка")}),(0,t.jsxs)(i.B,{children:[e.support_telegram&&(0,t.jsx)("a",{href:`https://t.me/${e.support_telegram.replace(/^@/,"")}`,target:"_blank",rel:"noopener noreferrer",children:e.support_telegram}),e.support_email&&(0,t.jsx)("a",{href:`mailto:${e.support_email}`,children:e.support_email})]})]})]})}])}],5064,(e,t,r)=>{let n="/help";(window.__NEXT_P=window.__NEXT_P||[]).push([n,()=>e.r(1562)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([n])})},1158,(e,t,r)=>{t.exports=e.r(9149)}]);