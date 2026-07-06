import Header from '@/components/Header';
import Logo from '@/components/Logo';
import WaitlistForm from '@/components/WaitlistForm';
import { ShieldCheck, Star, Layers, Users, CalendarDays, Target } from 'lucide-react';

const FEATURES = [
  {
    title: 'Верификация',
    text: 'Тек шын студенттер: студенттік билет немесе ЖОО почтасы арқылы расталған профильдер.',
    Icon: ShieldCheck,
  },
  {
    title: 'Оқытушылар рейтингі',
    text: 'Пәнді таңдамас бұрын нақты бағаларды көр: түсіндіру, әділдік, пайдалылық.',
    Icon: Star,
  },
  {
    title: 'Материалдар банкі',
    text: 'Конспект, өткен емтихан, разбор — нақты универдің нақты курсы бойынша.',
    Icon: Layers,
  },
  {
    title: 'Универаралық танысу',
    text: 'Өз тобыңнан шық: бүкіл Қазақстанның студенттерімен байланыс құр.',
    Icon: Users,
  },
  {
    title: 'Ивенттер мен кездесулер',
    text: 'Қала деңгейіндегі клубтар, лекциялар, спорт — бір күнтізбеде, RSVP-мен.',
    Icon: CalendarDays,
  },
  {
    title: 'Тиммейт іздеу',
    text: 'Хакатонға, курстыққа, стартапқа команда жина — «дизайнер іздеймін» бір посты жеткілікті.',
    Icon: Target,
  },
];

const UNIS = [
  { short: 'КБТУ', color: '#1B3A6B', name: 'Қазақстан-Британ ТУ', meta: 'Алматы · техникалық', cnt: '● 340 студент Uyym-да' },
  { short: 'ҚазҰУ', color: '#0F7B4D', name: 'әл-Фараби ҚазҰУ', meta: 'Алматы · классикалық', cnt: '● жақында' },
  { short: 'SU', color: '#B7791F', name: 'Satbayev University', meta: 'Алматы · инженерия', cnt: '● жақында' },
  { short: 'AITU', color: '#5F3DC4', name: 'Astana IT University', meta: 'Астана · IT', cnt: '● жақында' },
  { short: 'NU', color: '#0B7285', name: 'Nazarbayev University', meta: 'Астана · зерттеу', cnt: '● жақында' },
  { short: 'KIMEP', color: '#C2255C', name: 'KIMEP University', meta: 'Алматы · бизнес', cnt: '● жақында' },
];

const STEPS = [
  { n: 1, title: 'Тіркел', text: 'Атың, универің, мамандығың — 2 минут.' },
  { n: 2, title: 'Расталу', text: 'Студенттік билет фотосы немесе ЖОО почтасы — 24 сағат ішінде тексеріледі.' },
  { n: 3, title: 'Қосыл', text: 'Лента, материалдар, рейтинг, ивенттер — бәрі ашық.' },
];

function Constellation() {
  return (
    <svg className="constel" viewBox="0 0 1440 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
        <line x1="140" y1="120" x2="330" y2="70" />
        <line x1="330" y1="70" x2="410" y2="240" />
        <line x1="140" y1="120" x2="250" y2="330" />
        <line x1="250" y1="330" x2="410" y2="240" />
        <line x1="1120" y1="90" x2="1300" y2="170" />
        <line x1="1300" y1="170" x2="1210" y2="360" />
        <line x1="1120" y1="90" x2="1210" y2="360" />
        <line x1="980" y1="420" x2="1210" y2="360" />
        <line x1="620" y1="480" x2="820" y2="520" />
      </g>
      <g fill="#fff">
        <circle cx="140" cy="120" r="9" />
        <circle cx="330" cy="70" r="7" />
        <circle cx="410" cy="240" r="8" />
        <circle cx="250" cy="330" r="7" />
        <circle cx="1120" cy="90" r="8" />
        <circle cx="1300" cy="170" r="7" />
        <circle cx="1210" cy="360" r="9" />
        <circle cx="980" cy="420" r="7" />
        <circle cx="620" cy="480" r="7" />
        <circle cx="820" cy="520" r="8" />
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <Header />

      <section className="hero">
        <Constellation />
        <span className="chip chip-hero">Қазақстанның студенттік желісі</span>
        <h1>Қазақстан студенттері — бір жерде</h1>
        <p>
          Uyym — верификацияланған студенттік платформа: басқа универдің студенттерімен таныс,
          материал бөліс, оқытушыларды бағала, ивенттерге қатыс.
        </p>
        <div className="cta">
          <a className="btn btn-white" href="#wait">Күту тізіміне жазылу</a>
          <a className="btn btn-line" href="#how">Қалай жұмыс істейді</a>
        </div>
      </section>

      <div className="stats">
        <div className="stat"><b>600 000+</b><span>ҚР студенттері — біздің аудитория</span></div>
        <div className="stat"><b>1-ші</b><span>универ: КБТУ, Алматы</span></div>
        <div className="stat"><b>100%</b><span>верификацияланған профильдер</span></div>
      </div>

      <section className="feat" id="feat">
        <h2>Telegram бере алмайтын нәрселер</h2>
        <p className="sub">Бір платформа — оқу, байланыс және мүмкіндіктер үшін</p>
        <div className="grid3">
          {FEATURES.map((f) => (
            <div className="fcard" key={f.title}>
              <div className="fi">
                <f.Icon size={24} strokeWidth={2} color="#DC2626" />
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="how" id="how">
        <h2>Қалай жұмыс істейді</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="unis" id="unis">
        <h2>Университеттер — Uyym-да</h2>
        <p className="sub">Әр универдің өз кеңістігі: студенттер, оқытушылар рейтингі, материалдар, ивенттер</p>
        <div className="ugrid">
          {UNIS.map((u) => (
            <div className="ucard" key={u.short}>
              <div className="ulogo" style={{ background: u.color }}>{u.short}</div>
              <div>
                <h3>{u.name}</h3>
                <div className="m">{u.meta}</div>
                <div className="cnt">{u.cnt}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="wait" id="wait">
        <h2>Алғашқылардың бірі бол</h2>
        <p className="mut" style={{ marginTop: 10 }}>Лаунчты жіберіп алма — почтаңды қалдыр</p>
        <WaitlistForm />
      </section>

      <footer className="foot">
        <Logo size={26} wordSize={16} />
        <span>uyym.app · студенттер бір жерде · © 2026</span>
      </footer>
    </>
  );
}
