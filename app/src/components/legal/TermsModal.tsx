import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function TermsModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Brukervilkår</h2>
            <p className="text-xs text-gray-500 dark:text-zinc-400">Sist oppdatert: april 2026</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-gray-600 dark:text-zinc-300" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-4 space-y-5 text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">1. Aksept av vilkår</h3>
            <p>
              Ved å opprette konto eller bruke KaloriFit aksepterer du disse brukervilkårene.
              Dersom du ikke godtar vilkårene, kan du ikke bruke appen.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">2. Tjenestebeskrivelse</h3>
            <p>
              KaloriFit er en digital ernærings- og aktivitetstracker som gir personaliserte anbefalinger
              basert på informasjonen du oppgir. Appen er et støtteverktøy — ikke medisinsk rådgivning.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">3. Helseansvarsfraskrivelse</h3>
            <p className="font-medium text-orange-600 dark:text-orange-400">
              KaloriFit er ikke en medisinsk tjeneste og erstatter ikke råd fra lege, ernæringsfysiolog
              eller annet helsepersonell. Alle beslutninger om kosthold, trening og helse er ditt eget ansvar.
              Rådfør deg med helsepersonell før du gjør vesentlige endringer i kosthold eller treningsvaner,
              særlig ved sykdom, graviditet eller andre helsetilstander.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">4. Kontoansvar</h3>
            <ul className="list-disc pl-4 space-y-1">
              <li>Du er ansvarlig for å holde innloggingsinformasjonen din konfidensiell.</li>
              <li>Du må være minst 16 år for å opprette konto.</li>
              <li>Én konto per person — deling av konto er ikke tillatt.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">5. Akseptabel bruk</h3>
            <p>Det er ikke tillatt å:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Misbruke, hacke eller belaste tjenesten unødig.</li>
              <li>Laste opp eller sende innhold som er ulovlig, støtende eller skadelig.</li>
              <li>Forsøke å omgå sikkerhetsmekanismer.</li>
              <li>Bruke automatiserte verktøy (bots, scrapers) mot tjenesten.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">6. Immaterielle rettigheter</h3>
            <p>
              Alt innhold i KaloriFit — design, tekst, kode og algoritmer — tilhører KaloriFit og er
              beskyttet av opphavsrett. Du får en begrenset, ikke-eksklusiv rett til å bruke appen til
              personlig bruk.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">7. Ansvarsbegrensning</h3>
            <p>
              KaloriFit kan ikke holdes ansvarlig for helsemessige konsekvenser av anbefalinger gitt i appen,
              tap av data, eller midlertidig utilgjengelighet av tjenesten. Appen leveres «som den er».
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">8. Oppsigelse</h3>
            <p>
              Vi forbeholder oss retten til å stenge kontoer som bryter disse vilkårene. Du kan når som helst
              slette kontoen din via Profil → Slett konto.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">9. Endringer i vilkårene</h3>
            <p>
              Vi varsler om vesentlige endringer via e-post eller i appen. Fortsatt bruk etter varsling
              anses som aksept av de nye vilkårene.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">10. Gjeldende lov</h3>
            <p>
              Disse vilkårene er underlagt norsk rett. Eventuelle tvister løses ved Oslo tingrett.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
}
