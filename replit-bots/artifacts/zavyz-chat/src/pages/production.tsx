import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL;

const DESCRIPTION = `Каждый этап производства тщательно контролируется: от разработки дизайна до выбора материалов и финальной проверки качества. Мастера с многолетним опытом создают уникальные изделия, учитывая все пожелания клиентов.`;

export default function ProductionPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="h-screen bg-stone-50 flex items-center overflow-hidden relative">

      {/* Logo top-right */}
      <div className="absolute top-0 right-0 z-10">
        <img
          src={`${BASE}welcome/logo.png`}
          alt="Завязь"
          style={{ height: '10.5rem' }}
          className="w-auto object-contain"
        />
      </div>

      {/* Left: knitting machine photo, vertically centered */}
      <div className="w-1/2 shrink-0 flex items-center justify-center p-8">
        <img
          src={`${BASE}production/machine.png`}
          alt="Вязальная машина Cixing"
          className="max-h-[80vh] w-full object-contain"
        />
      </div>

      {/* Right: description + navigation, vertically centered */}
      <div className="w-1/2 flex flex-col justify-center gap-8 px-10 py-8 md:px-16 overflow-y-auto max-h-screen">

        <div className="max-w-lg mx-auto w-full">
          <h2 className="text-3xl font-semibold text-stone-800 mb-6">Наше производство</h2>
          <p className="text-lg leading-relaxed text-stone-600 mb-8">
            {DESCRIPTION}
          </p>

          {/* Feature list */}
          <ul className="space-y-4 text-stone-600">
            {[
              "Вязальная машина Cixing — высокоточное компьютерное оборудование",
              "Широкий выбор пряжи: шерсть, мериносовая шерсть, кашемир, хлопок, акрил",
              "Индивидуальный подход к каждому заказу",
              "Контроль качества на каждом этапе производства",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-1 w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Navigation */}
        <div className="max-w-lg mx-auto w-full flex gap-4">
          <Button
            onClick={() => setLocation("/")}
            variant="outline"
            className="flex-1 py-6 text-base rounded-full border-stone-300 text-stone-700 hover:bg-stone-100 transition-all duration-300"
          >
            ← Назад
          </Button>
          <Button
            onClick={() => setLocation("/knowledge")}
            variant="outline"
            className="flex-1 py-6 text-base rounded-full border-stone-300 text-stone-700 hover:bg-stone-100 transition-all duration-300"
          >
            📚 Энциклопедия
          </Button>
          <Button
            onClick={() => setLocation("/chat")}
            className="flex-1 py-6 text-base rounded-full bg-gradient-to-r from-rose-500 to-purple-600 hover:from-rose-600 hover:to-purple-700 text-white shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
          >
            Консультация →
          </Button>
          <Button
            onClick={() => setLocation("/vk")}
            variant="outline"
            className="flex-1 py-6 text-base rounded-full border-stone-300 text-stone-700 hover:bg-stone-100 transition-all duration-300"
          >
            ВК
          </Button>
        </div>

      </div>
    </div>
  );
}
