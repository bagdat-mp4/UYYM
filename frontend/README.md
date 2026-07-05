# Uyym — веб-платформа (uyym.kz)

Next.js 15 + Supabase. Сейчас в проекте: лендинг с рабочей waitlist-формой.

## Запуск локально (первый раз)

```bash
# 1. Установить зависимости (в папке проекта)
npm install

# 2. Создать файл с ключами
#    Windows:  copy .env.local.example .env.local
#    Mac:      cp .env.local.example .env.local
#    Открой .env.local и вставь свой publishable key из
#    Supabase → Project Settings → API Keys

# 3. Запустить
npm run dev
```

Открой http://localhost:3000 — увидишь лендинг. Введи почту в форму внизу → проверь в Supabase → Table Editor → waitlist, там появится строка.

## Структура

```
app/
  layout.js        — шрифты (Poppins/Inter), метаданные, favicon
  globals.css      — дизайн-токены Uyym (светлая + тёмная тема)
  page.js          — лендинг
components/
  Header.js        — шапка: навигация, темы, языки
  Logo.js          — логотип-созвездие (SVG)
  WaitlistForm.js  — форма → таблица waitlist
lib/
  supabase.js      — клиент Supabase (берёт ключи из .env.local)
```

## Деплой на Vercel

1. Залей проект на GitHub (репозиторий bagdat-mp4/UYYM или новый).
2. vercel.com → Add New Project → импортируй репозиторий.
3. В настройках проекта → Environment Variables добавь обе переменные из `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Deploy. Получишь адрес вида uyym.vercel.app.
5. Домен: Vercel → Settings → Domains → добавь `uyym.kz` →
   у регистратора домена пропиши A-запись `76.76.21.21` и CNAME `www → cname.vercel-dns.com`.

## Важно

- `.env.local` не коммитится в git (уже в .gitignore) — ключи не утекут.
- Secret key из Supabase в этом проекте НЕ используется и не должен появляться нигде во фронтенде.
