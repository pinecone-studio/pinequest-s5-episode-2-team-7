import Link from "next/link";
import { getPageSession } from "@/lib/auth/server";
import { buttonClass } from "@/components/ui";

const STEPS = [
  { title: "Кейс сонгох", body: "Зүрх судас, мэс засал, уушгины зэрэг сэдвээс зохиомол өвчтөн сонгоно. Онош нь нууц хэвээр байна." },
  { title: "Асуумж авах", body: "Өвчтөнтэй монгол хэлээр чөлөөтэй ярилцана. Өвчтөн зөвхөн асуусан зүйлд л хариулна." },
  { title: "Онош илгээх", body: "Хангалттай мэдээлэл цуглуулсан гэж үзвэл сэжигтэй онош, үндэслэлээ бичнэ." },
  { title: "Санал хүсэлт авах", body: "Онош, асуумжийн чанар, асуусан болон орхисон чухал асуултын дэлгэрэнгүй үнэлгээ." },
];

const BENEFITS = [
  { title: "Бодит асуумжийн дадлага", body: "Өвчтөн бүх зовиураа эхэндээ хэлдэггүй — зөв асуултаар л нуугдмал шинж, эрсдэлт хүчин зүйлс илэрнэ." },
  { title: "Ил тод үнэлгээ", body: "Кейс бүрийн рубрикээр тооцоолсон оноо. Зөв онош асуумжийн оноог орлохгүй, буруу онош зөв асуултын оноог устгахгүй." },
  { title: "Аюулын шинжийг таних", body: "Яаралтай тохиолдолд аюулын шинж, ялган оношийг цаг алдалгүй тодруулах дадал суулгана." },
  { title: "Монгол хэлэнд зориулсан", body: "Монгол ярианы хэлээр харилцах өвчтөн, монгол хэлний fine-tuning-д зориулсан өгөгдлийн шугам." },
];

export default async function LandingPage() {
  const session = await getPageSession();
  const startHref = session ? "/dashboard" : "/register";

  return (
    <main>
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
              Анагаахын оюутнуудад зориулсан сургалтын симулятор
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink md:text-5xl">
              AI өвчтөнтэй ярилцаж, <span className="text-brand-600">асуумж авах</span> чадвараа хөгжүүл
            </h1>
            <p className="prose-mn mt-5 max-w-xl text-lg text-slate-600">
              PineQuest AI Patient нь жинхэнэ өвчтөн шиг биеэ авч явдаг AI-тай монгол хэлээр ярилцаж, эмнэлзүйн асуумж цуглуулах, оношийн сэтгэлгээгээ
              дадлагажуулах боломж олгоно.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={startHref} className={buttonClass("primary", "lg")}>
                Ярилцлага эхлэх
              </Link>
              <a href="#how" className={buttonClass("secondary", "lg")}>
                Хэрхэн ажилладаг вэ?
              </a>
            </div>
          </div>

          <div aria-label="Жишээ ярилцлага" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-brand-900/5">
            <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-lg" aria-hidden>
                👨🏻
              </div>
              <div>
                <p className="text-sm font-semibold">Батбаяр, 58 нас</p>
                <p className="text-xs text-slate-500">Үндсэн зовиур: цээж өвдөх</p>
              </div>
              <span className="ml-auto text-xs text-slate-400">Жишээ</span>
            </div>
            <ul className="space-y-3 text-sm">
              <Bubble who="patient">Эмч ээ, цээж өвдөөд байна.</Bubble>
              <Bubble who="student">Хэзээнээс өвдөж эхэлсэн бэ?</Bubble>
              <Bubble who="patient">Өнөө өглөө, машинаа халааж байхад гэнэт эхэлсэн.</Bubble>
              <Bubble who="student">Өвдөлт өөр газар руу дамжиж байна уу?</Bubble>
              <Bubble who="patient">Тийм ээ, зүүн гар руу дамжаад байх шиг байна.</Bubble>
              <Bubble who="student">Тамхи татдаг уу?</Bubble>
              <Bubble who="patient">Тийм ээ, гучаад жил татаж байна.</Bubble>
            </ul>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Симуляц хэрхэн явагддаг вэ</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">{i + 1}</span>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="prose-mn mt-1 text-sm text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Сургалтын ач холбогдол</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex gap-4">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                <div>
                  <h3 className="font-semibold">{b.title}</h3>
                  <p className="prose-mn mt-1 text-sm text-slate-600">{b.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="rounded-3xl bg-brand-700 px-6 py-10 text-white md:px-12">
          <h2 className="text-2xl font-semibold">Нууц мэдээлэл хамгаалагдсан</h2>
          <p className="prose-mn mt-3 max-w-3xl text-brand-50">
            Өвчтөний онош, далд шинж тэмдэг, үнэлгээний рубрик нь серверт хадгалагдах бөгөөд ярилцлагын явцад хөтөч рүү илгээгддэггүй. Юуг хэлж болохыг
            систем шийдэж, AI зөвхөн зөвшөөрсөн мэдээллийг байгалийн хэлээр илэрхийлнэ.
          </p>
          <Link href={startHref} className={buttonClass("secondary", "lg", "mt-6 border-0")}>
            Эхлэх
          </Link>
        </div>
      </section>
    </main>
  );
}

function Bubble({ who, children }: { who: "patient" | "student"; children: string }) {
  return (
    <li className={who === "student" ? "flex justify-end" : "flex"}>
      <span className={who === "student" ? "max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-white" : "max-w-[80%] rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-slate-800"}>
        {children}
      </span>
    </li>
  );
}
