import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL;

const WELCOME_TEXT = `Здравствуйте, Уважаемые Гости!

Добро пожаловать в ателье ЗАВЯЗЬ.

Трикотаж – моя любовь.

Вязаные вещи отличаются универсальностью, удобством, придают мягкость Вашему образу и особый шарм. Именно поэтому мы специализируемся на изготовлении верхнего трикотажа на заказ.

Работаем как с индивидуальными заказами, дизайнерами одежды, так и с брендами и коммерческими заказами. Можем изготовить реплики известных моделей и брендов.

Приглашаю на наш сайт, чтобы подробно ознакомиться с нашими услугами или перейти по ссылке в наш телеграмм канал, где Трикотажный Гуру поможет Вам с выбором.

Подпишитесь на Телеграмм канал, там будут интересные новости из индустрии трикотажа.

Предлагаем взаимовыгодное сотрудничество. Уверена, наши изделия будут вас радовать.

Ваша трикотажный дизайнер Ирина.

Прямая связь: +7 922 20 19 19 9`;

export default function WelcomePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="h-screen bg-stone-50 flex overflow-hidden">

      {/* Left: portrait, full height */}
      <div className="w-2/5 shrink-0 overflow-hidden">
        <img
          src={`${BASE}welcome/portrait.png`}
          alt="Дизайнер Ирина"
          className="w-full h-full object-cover object-top"
        />
      </div>

      {/* Right: scrollable column, full height */}
      <div className="w-3/5 h-full overflow-y-auto flex flex-col px-10 py-8 md:px-16">

        {/* Logo */}
        <div className="flex justify-end mb-2 -mr-4">
          <img
            src={`${BASE}welcome/logo.png`}
            alt="Завязь"
            style={{ height: '10.5rem' }}
            className="w-auto object-contain"
          />
        </div>

        {/* Welcome text */}
        <div className="max-w-xl mx-auto w-full mb-8">
          {WELCOME_TEXT.split("\n\n").map((para, i) => (
            <p
              key={i}
              className={`mb-4 leading-relaxed ${
                i === 0
                  ? "text-2xl font-semibold text-stone-800"
                  : i === 1
                  ? "text-xl font-medium text-stone-700"
                  : "text-base text-stone-600"
              }`}
            >
              {para}
            </p>
          ))}
        </div>

        {/* Buttons */}
        <div className="max-w-xl mx-auto w-full flex flex-col sm:flex-row gap-4 flex-wrap">
          <Button
            onClick={() => setLocation("/production")}
            className="bg-gradient-to-r from-rose-500 to-purple-600 hover:from-rose-600 hover:to-purple-700 text-white px-10 py-6 text-base rounded-full tracking-wide shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
          >
            Начать консультацию →
          </Button>
          <a
            href="https://t.me/knitwearguru_bot"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              className="bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white border-0 px-10 py-6 text-base rounded-full tracking-wide shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 w-full sm:w-auto"
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z"/>
              </svg>
              Трикотажный Гуру в Telegram
            </Button>
          </a>
          <Button
            onClick={() => setLocation("/knowledge")}
            variant="outline"
            className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white border-0 px-10 py-6 text-base rounded-full tracking-wide shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 w-full sm:w-auto"
          >
            🧶 Энциклопедия трикотажа
          </Button>
          <Button
            onClick={() => setLocation("/news")}
            variant="outline"
            className="bg-gradient-to-r from-stone-600 to-stone-800 hover:from-stone-700 hover:to-stone-900 text-white border-0 px-10 py-6 text-base rounded-full tracking-wide shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 w-full sm:w-auto"
          >
            📰 Новости индустрии
          </Button>
          <Button
            onClick={() => setLocation("/vk")}
            variant="outline"
            className="bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white border-0 px-10 py-6 text-base rounded-full tracking-wide shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 w-full sm:w-auto"
          >
            ВК Публикации
          </Button>
        </div>

      </div>
    </div>
  );
}
